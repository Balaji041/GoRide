import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {Miniflare} from 'miniflare';
import {passwordHash} from '../server/email-auth.mjs';
test('Email passwords are independently salted',async()=>{const a=await passwordHash('a sufficiently long password'),b=await passwordHash('a sufficiently long password');assert.notEqual(a,b);assert.ok(!a.includes('sufficiently'));});
test('Email accounts isolate records; recovery rotates credentials and revokes sessions',async()=>{
const mf=new Miniflare({modules:true,scriptPath:'dist/server/index.js',compatibilityDate:'2026-01-01',d1Databases:['DB'],r2Buckets:['BUCKET'],bindings:{GORIDE_EMAIL_LOGIN:'enabled'}});
try{
const db=await mf.getD1Database('DB');for(const name of (await readdir('drizzle')).filter(n=>n.endsWith('.sql')).sort())for(const sql of (await readFile('drizzle/'+name,'utf8')).split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql.trim()).run();
const root='https://goride.test',password='a long private password 123';
const api=(path,data,cookie='',origin=root,ip='192.0.2.50',extra={})=>mf.dispatchFetch(root+path,{method:data?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie,'cf-connecting-ip':ip,...extra},body:data?JSON.stringify(data):undefined});
const auth=(action,data,cookie='',origin,ip)=>api('/api/customer-auth/'+action,data,cookie,origin,ip);
const register=email=>auth('register',{email,password,consent:true});
assert.equal((await auth('register',{email:'a@example.com',password,consent:true},'','https://evil.test')).status,403);
assert.equal((await auth('register',{email:'a@example.com',password:'short',consent:true})).status,400);
assert.equal((await auth('register',{email:'a@example.com',password,consent:false})).status,400);
const first=await register(' A@Example.com ');assert.equal(first.status,201);const result=await first.json();assert.equal(result.email,'a@example.com');assert.match(result.recoveryCode,/^[a-f0-9]{64}$/);assert.equal(first.headers.get('cache-control'),'no-store');
const cookie=first.headers.get('set-cookie').split(';')[0];assert.match(first.headers.get('set-cookie'),/Secure; HttpOnly; SameSite=Lax/);
const row=await db.prepare('SELECT * FROM email_accounts WHERE email=?').bind('a@example.com').first();assert.notEqual(row.recovery_hash,result.recoveryCode);assert.ok(!row.password_hash.includes(password));assert.equal((await register('a@example.com')).status,409);
assert.equal((await auth('password-login',{email:'a@example.com',password:'incorrect'})).status,401);
assert.equal((await auth('password-login',{email:'absent@example.com',password:'incorrect'})).status,401);
const login=await auth('password-login',{email:'a@example.com',password});assert.equal(login.status,200);const secondCookie=login.headers.get('set-cookie').split(';')[0];
const session=await (await api('/api/customer/session',null,cookie)).json();assert.equal(session.email,'a@example.com');assert.equal(session.displayName,'a');assert.equal(session.verifiedPhone,false);assert.equal(session.preview,false);assert.equal(session.verifiedEmail,false);
assert.equal((await api('/api/customer/session',null,'',root,undefined,{'oai-authenticated-user-id':'old-preview'})).status,401);
assert.equal((await api('/api/admin/bookings',null,cookie)).status,401);
const booking={id:crypto.randomUUID(),name:'Customer A',phone:'9100852287',age:25,carId:'dzire',locationId:'bangalore',mode:'self',pickupTime:'09:00',returnTime:'09:00',pickupAddress:'Test pickup landmark',returnAddress:'Test return landmark',startDate:'2030-01-01',endDate:'2030-01-03',consent:true};assert.equal((await api('/api/customer/bookings',booking,cookie)).status,201);
assert.equal((await (await api('/api/customer/session',null,cookie)).json()).displayName,'Customer');
const b=await register('b@example.com'),cookieB=b.headers.get('set-cookie').split(';')[0];assert.equal((await (await api('/api/customer/bookings',null,cookieB)).json()).bookings.length,0);assert.equal((await (await api('/api/customer/session',null,cookieB)).json()).displayName,'b');
assert.equal((await auth('recover',{email:'a@example.com',password:'another very long password',recoveryCode:'0'.repeat(64)})).status,401);
const recovered=await auth('recover',{email:'a@example.com',password:'another very long password',recoveryCode:result.recoveryCode});assert.equal(recovered.status,200);const recovery=await recovered.json();assert.notEqual(recovery.recoveryCode,result.recoveryCode);const newCookie=recovered.headers.get('set-cookie').split(';')[0];
for(const old of [cookie,secondCookie])assert.equal((await api('/api/customer/session',null,old)).status,401);
assert.equal((await (await api('/api/customer/bookings',null,newCookie)).json()).bookings.length,1);
assert.equal((await auth('recover',{email:'a@example.com',password:'another very long password',recoveryCode:result.recoveryCode})).status,401);
assert.equal((await auth('password-login',{email:'a@example.com',password})).status,401);
assert.equal((await auth('password-login',{email:'a@example.com',password:'another very long password'})).status,200);
assert.equal((await auth('logout',{},newCookie)).status,200);assert.equal((await api('/api/customer/session',null,newCookie)).status,401);
// Limits count failures server-side and apply even when clients change cookies.
for(let i=0;i<10;i++)assert.equal((await auth('password-login',{email:'limit@example.com',password:'invalid'},'',root,'192.0.2.99')).status,401);
assert.equal((await auth('password-login',{email:'limit@example.com',password:'invalid'},'',root,'192.0.2.99')).status,429);
}finally{await mf.dispose();}
});
