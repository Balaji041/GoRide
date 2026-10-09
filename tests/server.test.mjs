import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {Miniflare} from 'miniflare';

test('Owner catalogue: authorization, durable updates, locations and photo storage',async()=>{
const mf=new Miniflare({modules:true,scriptPath:'dist/server/index.js',compatibilityDate:'2026-01-01',d1Databases:['DB'],r2Buckets:['BUCKET']});
try{
const db=await mf.getD1Database('DB');for(const name of (await readdir('drizzle')).filter(n=>n.endsWith('.sql')).sort()){const sql=await readFile('drizzle/'+name,'utf8');for(const statement of sql.split('--> statement-breakpoint'))if(statement.trim())await db.prepare(statement.trim()).run();}
const ownerHeaders={'oai-authenticated-user-email':'nagendra@headrun.com','Content-Type':'application/json','Origin':'http://goride.test'};
const call=(path,method='GET',data,headers=ownerHeaders)=>mf.dispatchFetch('http://goride.test'+path,{method,headers,redirect:'manual',body:data===undefined?undefined:JSON.stringify(data)});
assert.equal((await call('/api/admin/catalog','GET',undefined,{})).status,401);
assert.equal((await call('/api/admin/catalog','GET',undefined,{'oai-authenticated-user-email':'other@example.com'})).status,403);
assert.equal((await call('/api/admin/initialize','POST',{}, {...ownerHeaders,Origin:'https://evil.test'})).status,403);
assert.equal((await call('/admin','GET',undefined,{})).status,302);
for(const route of ['/admin','/admin/','/admin.html','/admin.js','/admin.css','/admin-customers.js']){
assert.equal((await call(route,'GET',undefined,{'oai-authenticated-user-email':'customer@example.com'})).status,403,route);
assert.equal((await call(route,'GET')).status,200,route);
}
const customerHome=await (await call('/','GET',undefined,{})).text();assert.doesNotMatch(customerHome,/href=["']\/admin|Owner dashboard/);

let r=await call('/api/admin/initialize','POST',{});assert.equal(r.status,200);let data=await r.json();assert.equal(data.cars.length,3);assert.equal(data.locations.length,3);assert.equal(data.initialized,true);
const original=data.cars.find(c=>c.id==='dzire');r=await call('/api/admin/cars/dzire','PUT',{...original,name:'GoRide Dzire',selfRate:2500,driverRate:3500,deposit:5000,notes:'250 km / day; fuel excluded.'});assert.equal(r.status,200);const changed=await r.json();assert.equal(changed.version,2);
let customer=await (await call('/api/catalog','GET',undefined,{})).json();assert.equal(customer.cars.find(c=>c.id==='dzire').selfRate,2500);
assert.equal((await call('/api/admin/cars/dzire','PUT',{...original,selfRate:99})).status,409);
r=await call('/api/admin/initialize','POST',{});assert.equal((await r.json()).cars.find(c=>c.id==='dzire').selfRate,2500);
assert.equal((await call('/api/admin/cars','POST',{...original,selfRate:-1})).status,400);
assert.equal((await call('/api/admin/cars','POST',{...original,image:'javascript:alert(1)'})).status,400);
assert.equal((await call('/api/admin/cars','POST',{...original,gallery:[{url:'javascript:alert(1)'}]})).status,400);
assert.equal((await call('/api/admin/cars','POST',{...original,gallery:Array(8).fill({url:'https://example.com/car.jpg'})})).status,400);
const gallery=[{url:'https://example.com/car-rear.jpg',credit:'GoRide',source:'https://example.com/photos',license:'Owner supplied',licenseUrl:''}];
const withGallery=await call('/api/admin/cars','POST',{...original,name:'Gallery test car',gallery});assert.equal(withGallery.status,201);const savedGallery=await withGallery.json();assert.deepEqual(savedGallery.gallery,gallery);
const publicGallery=await (await call('/api/catalog','GET',undefined,{})).json();assert.deepEqual(publicGallery.cars.find(c=>c.id===savedGallery.id).gallery,gallery);
// Legacy single-photo records gain default extra photos only while the original cover matches.
const legacy={...original};delete legacy.gallery;await db.prepare('UPDATE cars SET data=? WHERE id=?').bind(JSON.stringify(legacy),'baleno').run();
const legacyCatalog=await (await call('/api/catalog','GET',undefined,{})).json();assert.deepEqual(legacyCatalog.cars.find(c=>c.id==='baleno').gallery,[]);

assert.equal((await call('/api/admin/cars','POST',{...original,locationIds:['unknown']})).status,400);
r=await call('/api/admin/locations','POST',{name:'Hyderabad'});assert.equal(r.status,201);const location=await r.json();
r=await call('/api/admin/cars','POST',{...original,name:'New car',locationIds:[location.id],selfRate:1800});assert.equal(r.status,201);const newCar=await r.json();
customer=await (await call('/api/catalog','GET',undefined,{})).json();assert.ok(customer.cars.some(c=>c.id===newCar.id));
assert.equal((await call('/api/admin/locations/'+location.id,'PUT',{...location,enabled:false})).status,200);
customer=await (await call('/api/catalog','GET',undefined,{})).json();assert.ok(!customer.locations.some(l=>l.id===location.id));assert.ok(!customer.cars.some(c=>c.id===newCar.id));
assert.equal((await call('/api/admin/cars/dzire','PUT',{...changed,status:'hidden'})).status,200);
customer=await (await call('/api/catalog','GET',undefined,{})).json();assert.ok(!customer.cars.some(c=>c.id==='dzire'));
const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6l1sAAAAASUVORK5CYII=','base64'));
r=await mf.dispatchFetch('http://goride.test/api/admin/photos',{method:'POST',headers:{...ownerHeaders,'Content-Type':'image/png'},body:png});assert.equal(r.status,201);const photo=await r.json();r=await call(photo.url,'GET',undefined,{});assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/png');assert.equal((await r.arrayBuffer()).byteLength,png.byteLength);
r=await mf.dispatchFetch('http://goride.test/api/admin/photos',{method:'POST',headers:{...ownerHeaders,'Content-Type':'image/png'},body:'not an image'});assert.equal(r.status,400);
r=await mf.dispatchFetch('http://goride.test/api/admin/photos',{method:'POST',headers:{...ownerHeaders,'Content-Type':'image/svg+xml'},body:'<svg></svg>'});assert.equal(r.status,400);
assert.equal((await call('/api/admin/locations','POST',{name:'bangalore'})).status,409);
const assets=await call('/admin');assert.equal(assets.status,200);assert.match(await assets.text(),/Cars & prices/);
}finally{await mf.dispose();}
});
