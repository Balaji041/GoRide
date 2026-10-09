import {internationalPhone} from './messaging.mjs';
export const SESSION_COOKIE='__Host-goride_customer';
const SESSION_SECONDS=7*24*60*60;
const now=()=>Math.floor(Date.now()/1000);
export async function digest(value){const data=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(data)].map(n=>n.toString(16).padStart(2,'0')).join('');}
function randomToken(){const bytes=crypto.getRandomValues(new Uint8Array(32));return [...bytes].map(n=>n.toString(16).padStart(2,'0')).join('');}
export function otpReady(env){return !!(env.TWILIO_ACCOUNT_SID&&env.TWILIO_AUTH_TOKEN&&env.TWILIO_VERIFY_SERVICE_SID);}
function sessionToken(request){const value=(request.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(SESSION_COOKIE+'='))?.slice(SESSION_COOKIE.length+1);return /^[a-f0-9]{64}$/.test(value||'')?value:null;}
function sessionCookie(token,seconds=SESSION_SECONDS){return `${SESSION_COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${seconds}`;}
export async function customerIdentity(request,env){
const token=sessionToken(request);
if(token&&env.DB){const row=await env.DB.prepare('SELECT c.id,c.phone FROM customer_sessions s JOIN customers c ON c.id=s.customer_id WHERE s.token_hash=? AND s.expires_at>?').bind(await digest(token),now()).first();if(row)return {id:row.id,phone:row.phone,email:'',verifiedPhone:true,preview:false};}
// Preserve existing authenticated private test accounts until SMS Verify is configured.
if(!otpReady(env)){const id=request.headers.get('oai-authenticated-user-id');if(id)return {id,email:request.headers.get('oai-authenticated-user-email')||'',phone:null,verifiedPhone:false,preview:true};}
return null;
}
export async function verifyProvider(env,operation,phoneOrSid,code,fetcher=fetch){
const form=new URLSearchParams(operation==='start'?{To:phoneOrSid,Channel:'sms'}:{VerificationSid:phoneOrSid,Code:code});
let response,data;try{response=await fetcher('https://verify.twilio.com/v2/Services/'+encodeURIComponent(env.TWILIO_VERIFY_SERVICE_SID)+'/'+(operation==='start'?'Verifications':'VerificationCheck'),{method:'POST',headers:{Authorization:'Basic '+btoa(env.TWILIO_ACCOUNT_SID+':'+env.TWILIO_AUTH_TOKEN),'Content-Type':'application/x-www-form-urlencoded'},body:form,signal:AbortSignal.timeout(8000)});data=await response.json();}catch{return {status:'unavailable'};}
if(!response.ok)return {status:response.status===429?'limited':operation==='check'&&[400,404].includes(response.status)?'invalid':'unavailable'};
if(operation==='start'&&data.status==='pending'&&/^VE[a-fA-F0-9]{32}$/.test(data.sid||''))return {status:'pending',id:data.sid};
if(operation==='check'&&data.status==='approved'&&data.sid===phoneOrSid&&typeof data.to==='string')return {status:'approved',phone:internationalPhone(data.to)};
return {status:'invalid'};
}
export async function customerAuthRoute(request,env,h){
const path=new URL(request.url).pathname;if(!path.startsWith('/api/customer-auth/'))return null;
const {json,body,ApiError}=h;
if(path==='/api/customer-auth/config'&&request.method==='GET')return json({smsEnabled:otpReady(env),privatePreview:!!request.headers.get('oai-authenticated-user-id')&&!otpReady(env)});
if(request.method!=='POST')throw new ApiError(404,'This action is not available.');
if(request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('sec-fetch-site')==='cross-site')throw new ApiError(403,'Please sign in from GoRide.');
if(!env.DB)throw new ApiError(503,'Customer sign-in is temporarily unavailable.');const db=env.DB;
if(path==='/api/customer-auth/logout'){const token=sessionToken(request);if(token)await db.prepare('DELETE FROM customer_sessions WHERE token_hash=?').bind(await digest(token)).run();return json({signedOut:true},200,{'Set-Cookie':sessionCookie('',0)});}
if(!otpReady(env))throw new ApiError(503,'SMS sign-in is not active yet. GoRide must connect its OTP service before codes can be sent.');
const input=await body(request),currentTime=now();
async function limit(key,windowSeconds,max){const bucket=Math.floor(currentTime/windowSeconds),hash=await digest(key+':'+bucket);const result=await db.prepare('INSERT INTO auth_limits (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count<? RETURNING count').bind(hash,(bucket+1)*windowSeconds,max).first();if(!result)throw new ApiError(429,'Too many attempts. Wait a few minutes before trying again.');}
const ip=request.headers.get('cf-connecting-ip')||'unknown';
await db.prepare('DELETE FROM auth_limits WHERE key IN (SELECT key FROM auth_limits WHERE expires_at<? LIMIT 500)').bind(currentTime).run();
if(path==='/api/customer-auth/start'){
const phone=internationalPhone(input.phone);if(!phone||!/^\+91[6-9]\d{9}$/.test(phone))throw new ApiError(400,'Enter a valid Indian mobile number.');if(input.consent!==true)throw new ApiError(400,'Please agree to receive a sign-in code.');
await limit('start-ip:'+ip,900,15);await limit('start-phone:'+phone,900,3);
// A rolling resend cooldown avoids sends immediately across a time-bucket boundary.
const cooldown=await db.prepare('INSERT INTO auth_limits (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET expires_at=excluded.expires_at WHERE auth_limits.expires_at<=? RETURNING key').bind(await digest('cooldown:'+phone),currentTime+60,currentTime).first();if(!cooldown)throw new ApiError(429,'Wait 60 seconds before requesting another code.');
const result=await verifyProvider(env,'start',phone,undefined,h.authFetch||fetch);if(result.status!=='pending')throw new ApiError(result.status==='limited'?429:503,'A sign-in code could not be requested. Wait a minute and try again.');
const id=crypto.randomUUID();await db.batch([db.prepare('DELETE FROM login_challenges WHERE id IN (SELECT id FROM login_challenges WHERE expires_at<? LIMIT 500)').bind(currentTime),db.prepare('INSERT INTO login_challenges (id,phone,provider_id,attempts,consumed,expires_at) VALUES (?,?,?,0,0,?)').bind(id,phone,result.id,currentTime+600)]);
return json({challengeId:id,maskedPhone:'••••••'+phone.slice(-4),retryAfter:60},201);
}
if(path==='/api/customer-auth/check'){
if(typeof input.challengeId!=='string'||!/^\d{6}$/.test(input.code||''))throw new ApiError(400,'Enter the six-digit code sent to your phone.');
const challenge=await db.prepare('SELECT * FROM login_challenges WHERE id=? AND consumed=0 AND expires_at>?').bind(input.challengeId,currentTime).first();if(!challenge)throw new ApiError(400,'This sign-in request expired. Request another code.');
await limit('check-ip:'+ip,900,30);await limit('check-phone:'+challenge.phone,900,10);
const attempt=await db.prepare('UPDATE login_challenges SET attempts=attempts+1 WHERE id=? AND consumed=0 AND attempts<5 AND expires_at>?').bind(challenge.id,currentTime).run();if(!attempt.meta.changes)throw new ApiError(429,'Too many code attempts. Request a new code later.');
const result=await verifyProvider(env,'check',challenge.provider_id,input.code,h.authFetch||fetch);if(result.status!=='approved'||result.phone!==challenge.phone)throw new ApiError(result.status==='unavailable'?503:400,'The code could not be verified. Check it or request a new code.');
const consumed=await db.prepare('UPDATE login_challenges SET consumed=1 WHERE id=? AND consumed=0 AND expires_at>?').bind(challenge.id,currentTime).run();if(!consumed.meta.changes)throw new ApiError(409,'This code has already been used. Request a new code.');
const token=randomToken(),hash=await digest(token),customerId='phone:'+crypto.randomUUID();
const old=sessionToken(request);const operations=[db.prepare('INSERT OR IGNORE INTO customers (id,phone,created_at) VALUES (?,?,?)').bind(customerId,challenge.phone,currentTime),db.prepare('INSERT INTO customer_sessions (token_hash,customer_id,expires_at) SELECT ?,id,? FROM customers WHERE phone=?').bind(hash,currentTime+SESSION_SECONDS,challenge.phone),db.prepare('DELETE FROM customer_sessions WHERE token_hash IN (SELECT token_hash FROM customer_sessions WHERE expires_at<=? LIMIT 500)').bind(currentTime)];if(old)operations.push(db.prepare('DELETE FROM customer_sessions WHERE token_hash=?').bind(await digest(old)));await db.batch(operations);
return json({signedIn:true,phone:challenge.phone},200,{'Set-Cookie':sessionCookie(token)});
}
throw new ApiError(404,'This action is not available.');
}
