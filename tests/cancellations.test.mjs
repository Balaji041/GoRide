import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {Miniflare} from 'miniflare';
import {runInNewContext} from 'node:vm';
const quote={baseFare:4000,deliveryFee:0,driverAllowance:0,taxAmount:0,deposit:3000,includedKm:300,includedHours:24,extraKmRate:12,extraHourRate:150,fuel:'same-level',tollsParking:'at-actuals',permits:'at-actuals'};
test('Cancellation ownership, review history, retries, state guards and release of reserved car',async()=>{
const mf=new Miniflare({modules:true,scriptPath:'dist/server/index.js',compatibilityDate:'2026-01-01',d1Databases:['DB'],r2Buckets:['BUCKET']});
try{const db=await mf.getD1Database('DB');for(const name of (await readdir('drizzle')).filter(n=>n.endsWith('.sql')).sort())for(const sql of (await readFile('drizzle/'+name,'utf8')).split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql.trim()).run();
const headers={'oai-authenticated-user-id':'cancel-customer','oai-authenticated-user-email':'cancel@example.test','Content-Type':'application/json',Origin:'http://goride.test'},other={...headers,'oai-authenticated-user-id':'another-customer'},owner={...headers,'oai-authenticated-user-email':'nagendra@headrun.com'};
const call=(path,method='GET',data,h=headers)=>mf.dispatchFetch('http://goride.test'+path,{method,headers:h,body:data===undefined?undefined:JSON.stringify(data)});
const date=d=>new Date(Date.now()+d*86400000).toISOString().slice(0,10);
const booking={id:crypto.randomUUID(),name:'Cancellation Test',age:28,phone:'9100852287',carId:'dzire',locationId:'bangalore',mode:'self',startDate:date(8),endDate:date(9),pickupTime:'09:00',returnTime:'09:00',pickupAddress:'Pickup test landmark',returnAddress:'Return test landmark',consent:true};
const base='/api/customer/bookings/'+booking.id+'/cancellations',admin='/api/admin/bookings/'+booking.id;
const get=async h=>(await (await call('/api/customer/bookings','GET',undefined,h||headers)).json()).bookings.find(b=>b.id===booking.id);
assert.equal((await call('/api/customer/bookings','POST',booking)).status,201);
assert.equal((await call(admin,'PUT',{status:'confirmed',version:1,quotedTotal:4000,quoteDetails:quote},owner)).status,200);
const originalQuote=(await get()).quote_details;
const request={id:crypto.randomUUID(),version:2,reason:'Plans changed'};
assert.equal((await call(base,'POST',request,{})).status,401);
assert.equal((await call(base,'POST',request,other)).status,404);
assert.equal((await call(base,'POST',request,{...headers,Origin:'https://evil.test'})).status,403);
for(const patch of [{reason:''},{reason:'x'.repeat(1001)},{id:'invalid'},{version:1}])assert.ok([400,409].includes((await call(base,'POST',{...request,...patch})).status));
assert.equal((await call(base,'POST',request)).status,201);
assert.equal((await call(base,'POST',request)).status,200);
assert.equal((await call(base,'POST',{...request,id:crypto.randomUUID(),version:3})).status,409);
let row=await get();assert.equal(row.status,'confirmed');assert.equal(row.version,3);assert.equal(row.cancellations.length,1);assert.equal(row.cancellations[0].reason,'Plans changed');
assert.equal(await get(other),undefined);
for(const status of ['completed','cancelled'])assert.equal((await call(admin,'PUT',{status,version:3,note:'Owner action'},owner)).status,409);
assert.equal((await call('/api/customer/bookings','POST',{...booking,id:crypto.randomUUID()})).status,409,'pending cancellation keeps accepted car reserved');
const decision=admin+'/cancellations/'+request.id;
assert.equal((await call(decision,'PUT',{status:'approved',version:3,note:'Okay'},headers)).status,403);
for(const data of [{status:'approved',version:2,note:'Okay'},{status:'invalid',version:3,note:'Okay'},{status:'declined',version:3,note:''}])assert.ok([400,409].includes((await call(decision,'PUT',data,owner)).status));
const declined={status:'declined',version:3,note:'Please contact us to discuss the trip already arranged.'};assert.equal((await call(decision,'PUT',declined,owner)).status,200);assert.equal((await call(decision,'PUT',declined,owner)).status,200,'safe retry');
row=await get();assert.equal(row.status,'confirmed');assert.equal(row.version,4);assert.equal(row.quote_details,originalQuote);assert.equal(row.cancellations[0].status,'declined');assert.equal(row.cancellations[0].decision_note,declined.note);
assert.equal((await call(decision,'PUT',{status:'approved',version:4,note:'Changed mind'},owner)).status,409);
const again={id:crypto.randomUUID(),version:4,reason:'New circumstances; cannot travel'};assert.equal((await call(base,'POST',again)).status,201);
const next=admin+'/cancellations/'+again.id;
const competing=await Promise.all([call(next,'PUT',{status:'approved',version:5,note:'Cancellation approved. Refund arrangements will be confirmed separately.'},owner),call(next,'PUT',{status:'declined',version:5,note:'Please contact support.'},owner)]);
assert.deepEqual(competing.map(r=>r.status).sort(),[200,409]);row=await get();assert.equal(row.cancellations.length,2);assert.equal(row.version,6);
// Ensure the approval path is tested even if the decline wins the race.
if(row.status!=='cancelled'){const third={id:crypto.randomUUID(),version:6,reason:'Please cancel'};assert.equal((await call(base,'POST',third)).status,201);assert.equal((await call(admin+'/cancellations/'+third.id,'PUT',{status:'approved',version:7,note:'Approved; discuss any refund separately.'},owner)).status,200);}
row=await get();assert.equal(row.status,'cancelled');assert.equal(row.quote_details,originalQuote);assert.equal((await call('/api/customer/bookings','POST',{...booking,id:crypto.randomUUID()})).status,201,'approved cancellation releases car');
assert.equal((await call(base,'POST',{id:crypto.randomUUID(),version:row.version,reason:'Again'})).status,400);
const notices=(await (await call('/api/customer/notifications')).json()).notifications;assert.equal(notices.filter(n=>n.id==='cancellation-decision:'+request.id).length,1);assert.equal((await (await call('/api/customer/notifications','GET',undefined,other)).json()).notifications.length,0);
assert.ok(notices.some(n=>n.message.includes('No refund is processed')));
// Unaccepted requests can also be cancelled; a pending cancellation blocks acceptance.
const fresh={...booking,id:crypto.randomUUID(),carId:'baleno'};assert.equal((await call('/api/customer/bookings','POST',fresh)).status,201);
let req={id:crypto.randomUUID(),version:1,reason:'No longer needed'};const competingRequest={...req,id:crypto.randomUUID()};const requestRace=await Promise.all([call('/api/customer/bookings/'+fresh.id+'/cancellations','POST',req),call('/api/customer/bookings/'+fresh.id+'/cancellations','POST',competingRequest)]);assert.deepEqual(requestRace.map(r=>r.status).sort(),[201,409]);if(requestRace[1].status===201)req=competingRequest;assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM cancellation_requests WHERE booking_id=?').bind(fresh.id).first()).count,1);
assert.equal((await call('/api/admin/bookings/'+fresh.id,'PUT',{status:'confirmed',version:2,quotedTotal:4000,quoteDetails:quote},owner)).status,409);
assert.equal((await call('/api/admin/bookings/'+fresh.id+'/cancellations/'+req.id,'PUT',{status:'approved',version:2,note:'Request cancelled without a booking charge.'},owner)).status,200);
}finally{await mf.dispose();}
});
test('Cancellation views escape customer input and show review controls only to owner',async()=>{
const context={window:{}};runInNewContext(await readFile('dist/cancellations.js','utf8'),context);const view=context.window.GoRideCancellations;
const row={id:'test',status:'confirmed',cancellations:[{id:'request',status:'pending',reason:'<img src=x onerror=alert(1)>',created_at:'2030-01-01T00:00:00Z'}]};
assert.match(view.render(row),/&lt;img/);assert.doesNotMatch(view.render(row),/<img/);assert.doesNotMatch(view.render(row),/data-cancel-response/);assert.match(view.render(row,true),/data-cancel-response="approved"/);assert.match(view.render(row),/IST/);
});
