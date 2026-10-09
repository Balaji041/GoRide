import {digest,randomToken,sessionToken,sessionCookie} from './customer-auth.mjs';
const encoder=new TextEncoder();
const hex=bytes=>[...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('');
// Workers WebCrypto supports at most 100,000 PBKDF2 iterations. Long passwords,
// independent random salts and server-side attempt limits accompany this version.
export async function passwordHash(password,salt=hex(crypto.getRandomValues(new Uint8Array(16)))){
const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:encoder.encode(salt),iterations:100000,hash:'SHA-256'},key,256);
return 'pbkdf2-sha256:100000:'+salt+':'+hex(bits);
}
function equal(a,b){if(a.length!==b.length)return false;let difference=0;for(let i=0;i<a.length;i++)difference|=a.charCodeAt(i)^b.charCodeAt(i);return difference===0;}
async function matches(password,stored){const parts=(stored||'').split(':');const valid=parts.length===4&&parts[0]==='pbkdf2-sha256'&&parts[1]==='100000'&&/^[a-f0-9]{32}$/.test(parts[2]);const calculated=await passwordHash(password,valid?parts[2]:'0'.repeat(32));return valid&&equal(calculated,stored);}
export async function emailAuthRoute(request,env,h){
const path=new URL(request.url).pathname,action=path.split('/').pop();
if(!['register','password-login','recover'].includes(action))return null;
const {json,body,ApiError}=h,db=env.DB;
if(env.GORIDE_EMAIL_LOGIN!=='enabled')throw new ApiError(503,'Email sign-in is not available yet.');
const input=await body(request);if(!input||typeof input!=='object')throw new ApiError(400,'Enter your account details.');
const email=typeof input.email==='string'?input.email.trim().toLowerCase():'';
if(email.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(email))throw new ApiError(400,'Enter a valid email address.');
if(typeof input.password!=='string'||input.password.length>128||input.password.length<(action==='password-login'?1:15))throw new ApiError(400,'Use a password with 15 to 128 characters. Spaces are welcome.');
const time=Math.floor(Date.now()/1000),ip=request.headers.get('cf-connecting-ip')||'unknown';
async function limit(key,max){const bucket=Math.floor(time/900),hash=await digest(key+':'+bucket);const row=await db.prepare('INSERT INTO auth_limits (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count<? RETURNING count').bind(hash,(bucket+1)*900,max).first();if(!row)throw new ApiError(429,'Too many attempts. Wait 15 minutes before trying again.');}
await limit('email-auth-ip:'+ip,30);await limit('email-auth:'+action+':'+email,action==='register'?5:10);
await db.prepare('DELETE FROM auth_limits WHERE key IN (SELECT key FROM auth_limits WHERE expires_at<? LIMIT 500)').bind(time).run();
const account=await db.prepare('SELECT * FROM email_accounts WHERE email=?').bind(email).first();
if(action==='register'){
if(input.consent!==true)throw new ApiError(400,'Please agree to create your GoRide account.');
// Never attach existing records by a typed email or phone number.
const id='email:'+crypto.randomUUID(),recoveryCode=randomToken(),hash=await passwordHash(input.password);
const created=await db.prepare('INSERT OR IGNORE INTO email_accounts (id,email,password_hash,recovery_hash,created_at) VALUES (?,?,?,?,?)').bind(id,email,hash,await digest(recoveryCode),time).run();
if(!created.meta.changes)throw new ApiError(409,'An account could not be created with these details. Try signing in or use account recovery.');
return session(id,{recoveryCode},201);
}
if(action==='password-login'){
if(!await matches(input.password,account?.password_hash))throw new ApiError(401,'The email or password is incorrect.');
return session(account.id,{});
}
const code=typeof input.recoveryCode==='string'?input.recoveryCode.trim().toLowerCase():'';
const recoveryHash=await digest(code);if(!/^[a-f0-9]{64}$/.test(code)||!account||!equal(recoveryHash,account.recovery_hash))throw new ApiError(401,'These recovery details could not be verified.');
const recoveryCode=randomToken(),newHash=await passwordHash(input.password);
const result=await db.prepare('UPDATE email_accounts SET password_hash=?,recovery_hash=? WHERE id=? AND recovery_hash=?').bind(newHash,await digest(recoveryCode),account.id,recoveryHash).run();
if(!result.meta.changes)throw new ApiError(409,'This recovery code was already used.');
// Revoke all old sessions; rotating the code makes it single-use.
await db.prepare('DELETE FROM customer_sessions WHERE customer_id=?').bind(account.id).run();
return session(account.id,{recoveryCode});
async function session(id,extra,status=200){
const token=randomToken(),old=sessionToken(request),operations=[db.prepare('INSERT INTO customer_sessions (token_hash,customer_id,expires_at) VALUES (?,?,?)').bind(await digest(token),id,time+604800),db.prepare('DELETE FROM customer_sessions WHERE token_hash IN (SELECT token_hash FROM customer_sessions WHERE expires_at<=? LIMIT 500)').bind(time)];
if(old)operations.push(db.prepare('DELETE FROM customer_sessions WHERE token_hash=?').bind(await digest(old)));
await db.batch(operations);return json({signedIn:true,email,...extra},status,{'Set-Cookie':sessionCookie(token)});
}
}
