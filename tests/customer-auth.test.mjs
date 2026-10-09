import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {Miniflare} from 'miniflare';
import {customerAuthRoute,customerIdentity,SESSION_COOKIE,verifyProvider} from '../server/customer-auth.mjs';
class ApiError extends Error{constructor(status,message){super(message);this.status=status;}}
test('Verified phone sessions: codes, ownership, logout, expiry, rate limits and no owner privilege',async()=>{
const mf=new Miniflare({modules:true,scriptPath:'dist/server/index.js',compatibilityDate:'2026-01-01',d1Databases:['DB'],r2Buckets:['BUCKET']});
try{
const db=await mf.getD1Database('DB');for(const name of (await readdir('drizzle')).filter(n=>n.endsWith('.sql')).sort())for(const sql of (await readFile('drizzle/'+name,'utf8')).split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql.trim()).run();
const env={DB:db,TWILIO_ACCOUNT_SID:'ACtest',TWILIO_AUTH_TOKEN:'test-token',TWILIO_VERIFY_SERVICE_SID:'VA'+ 'a'.repeat(32)};
const providers=new Map();let sends=0;
const authFetch=async(url,options)=>{assert.match(url,/^https:\/\/verify.twilio.com\/v2\/Services\//);const form=options.body;if(url.endsWith('/Verifications')){sends++;const phone=form.get('To'),id='VE'+sends.toString(16).padStart(32,'0');providers.set(id,phone);return Response.json({sid:id,status:'pending'});}const id=form.get('VerificationSid');return Response.json({sid:id,to:providers.get(id),status:form.get('Code')==='123456'?'approved':'pending'});};
const helpers={ApiError,body:r=>r.json(),json:(d,status=200,headers={})=>Response.json(d,{status,headers}),authFetch};
const request=(path,data,cookie='',origin='https://goride.test')=>new Request('https://goride.test'+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie,'cf-connecting-ip':'192.0.2.1'},body:JSON.stringify(data)});
const call=(path,data,cookie='',origin)=>customerAuthRoute(request(path,data,cookie,origin),env,helpers);
await assert.rejects(call('/api/customer-auth/start',{phone:'9100852287',consent:true},'','https://evil.test'),e=>e.status===403);
await assert.rejects(call('/api/customer-auth/start',{phone:'9100852287',consent:false}),e=>e.status===400);
const start=await (await call('/api/customer-auth/start',{phone:'9100852287',consent:true})).json();assert.ok(!JSON.stringify(start).includes('123456'));assert.equal(start.maskedPhone,'••••••2287');assert.equal(sends,1);
await assert.rejects(call('/api/customer-auth/start',{phone:'9100852287',consent:true}),e=>e.status===429);assert.equal(sends,1);
await assert.rejects(call('/api/customer-auth/check',{challengeId:start.challengeId,code:'999999'}),e=>e.status===400);
const approved=await call('/api/customer-auth/check',{challengeId:start.challengeId,code:'123456'});assert.equal(approved.status,200);const setCookie=approved.headers.get('Set-Cookie');assert.match(setCookie,/Secure; HttpOnly; SameSite=Lax/);assert.match(setCookie,/Max-Age=604800/);const cookie=setCookie.split(';')[0],raw=cookie.slice(SESSION_COOKIE.length+1);
const stored=await db.prepare('SELECT * FROM customer_sessions').first();assert.notEqual(stored.token_hash,raw);assert.equal(stored.token_hash.length,64);
const identity=await customerIdentity(new Request('https://goride.test',{headers:{Cookie:cookie}}),env);assert.equal(identity.phone,'+919100852287');assert.equal(identity.verifiedPhone,true);
assert.equal(await customerIdentity(new Request('https://goride.test',{headers:{Cookie:SESSION_COOKIE+'='+'0'.repeat(64)}}),env),null);
await assert.rejects(call('/api/customer-auth/check',{challengeId:start.challengeId,code:'123456'}),e=>e.status===400);
assert.equal((await mf.dispatchFetch('https://goride.test/api/admin/session',{headers:{Cookie:cookie}})).status,401);
const booking={id:crypto.randomUUID(),name:'Verified customer',phone:'+919100852287',age:25,carId:'dzire',locationId:'bangalore',mode:'self',startDate:'2030-01-01',endDate:'2030-01-03',consent:true};
const api=(data,c=cookie)=>mf.dispatchFetch('https://goride.test/api/customer/bookings',{method:'POST',headers:{Cookie:c,Origin:'https://goride.test','Content-Type':'application/json'},body:JSON.stringify(data)});
assert.equal((await api({...booking,phone:'8610235694'})).status,400);assert.equal((await api(booking)).status,201);
const second=await (await call('/api/customer-auth/start',{phone:'8610235694',consent:true})).json();const secondAuth=await call('/api/customer-auth/check',{challengeId:second.challengeId,code:'123456'});const cookieB=secondAuth.headers.get('set-cookie').split(';')[0];
const own=await (await mf.dispatchFetch('https://goride.test/api/customer/bookings',{headers:{Cookie:cookie}})).json();assert.equal(own.bookings.length,1);const other=await (await mf.dispatchFetch('https://goride.test/api/customer/bookings',{headers:{Cookie:cookieB}})).json();assert.equal(other.bookings.length,0);
const expired=await (await call('/api/customer-auth/start',{phone:'9876543210',consent:true})).json();await db.prepare('UPDATE login_challenges SET expires_at=0 WHERE id=?').bind(expired.challengeId).run();await assert.rejects(call('/api/customer-auth/check',{challengeId:expired.challengeId,code:'123456'}),e=>e.status===400);
const limitChallenge=await (await call('/api/customer-auth/start',{phone:'9876543211',consent:true})).json();for(let i=0;i<5;i++)await assert.rejects(call('/api/customer-auth/check',{challengeId:limitChallenge.challengeId,code:'999999'}),e=>e.status===400);await assert.rejects(call('/api/customer-auth/check',{challengeId:limitChallenge.challengeId,code:'123456'}),e=>e.status===429);
const logout=await call('/api/customer-auth/logout',{},cookie);assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);assert.equal(await customerIdentity(new Request('https://goride.test',{headers:{Cookie:cookie}}),env),null);
await db.prepare('UPDATE customer_sessions SET expires_at=0').run();assert.equal(await customerIdentity(new Request('https://goride.test',{headers:{Cookie:cookieB}}),env),null);
// Configured phone login never trusts an unverified platform identity as a phone account.
assert.equal(await customerIdentity(new Request('https://goride.test',{headers:{'oai-authenticated-user-id':'preview-user'}}),env),null);
}finally{await mf.dispose();}
});
test('OTP provider failure never authenticates a customer',async()=>{
const env={TWILIO_ACCOUNT_SID:'ACtest',TWILIO_AUTH_TOKEN:'test',TWILIO_VERIFY_SERVICE_SID:'VAtest'};
assert.equal((await verifyProvider(env,'check','VEtest','123456',async()=>{throw Error('timeout');})).status,'unavailable');
assert.equal((await verifyProvider(env,'check','VEtest','123456',async()=>Response.json({status:'approved',sid:'VEwrong',to:'+919100852287'}))).status,'invalid');
});
