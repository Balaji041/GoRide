import {customerIdentity} from './customer-auth.mjs';
import {deliverNotification,internationalPhone,messagingReady} from './messaging.mjs';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const transitions={requested:['confirmed','rejected','cancelled'],confirmed:['completed','cancelled'],completed:[],rejected:[],cancelled:[]};
export async function customerRoute(request,env,h){
const {owner,body,json,ApiError,readAll,upload,text}=h;
const url=new URL(request.url),path=url.pathname,method=request.method;
if(!path.startsWith('/api/customer/')&&!path.startsWith('/api/admin/bookings')&&!path.startsWith('/api/admin/documents/')&&!path.startsWith('/api/admin/feedback')&&!path.startsWith('/api/admin/notifications')&&path!=='/api/reviews')return null;
if(!env.DB)throw new ApiError(503,'Customer records are temporarily unavailable.');
const db=env.DB;
if(path==='/api/reviews'&&method==='GET'){const rows=await db.prepare("SELECT display_name AS name,rating,message,created_at AS createdAt FROM feedback WHERE kind='review' AND status='approved' ORDER BY created_at DESC LIMIT 50").all();return json({reviews:rows.results});}
const admin=path.startsWith('/api/admin/');let customerId,identity;
if(admin)owner(request);else{identity=await customerIdentity(request,env);customerId=identity?.id;if(!customerId)throw new ApiError(401,'Sign in to manage your bookings and documents.');}
if(!['GET','HEAD'].includes(method)){const origin=request.headers.get('origin');if((origin&&origin!==url.origin)||request.headers.get('sec-fetch-site')==='cross-site')throw new ApiError(403,'Please submit from GoRide.');}
const email=admin?request.headers.get('oai-authenticated-user-email')||'':identity.email;
const recipient=admin?'owner':customerId;
const notify=(id)=>{const work=deliverNotification(db,env,id).catch(()=>{});if(h.waitUntil)h.waitUntil(work);return work;};
if((path==='/api/customer/notifications'||path==='/api/admin/notifications')&&method==='GET'){
const fields='id,booking_id,message,created_at,read_at,channel,delivery_status,delivery_error';const rows=await (admin?db.prepare('SELECT '+fields+',recipient FROM notifications ORDER BY created_at DESC LIMIT 100'):db.prepare('SELECT '+fields+' FROM notifications WHERE recipient=? ORDER BY created_at DESC LIMIT 100').bind(recipient)).all();return json({notifications:rows.results,messaging:admin?{sms:messagingReady(env,'sms'),whatsapp:messagingReady(env,'whatsapp')}:undefined});}
const noticeMatch=path.match(/^\/api\/(?:customer|admin)\/notifications\/([^/]+)$/);
if(noticeMatch&&method==='PUT'){let noticeId;try{noticeId=decodeURIComponent(noticeMatch[1]);}catch{throw new ApiError(400,'Invalid notification.');}const notice=await db.prepare('SELECT id FROM notifications WHERE id=? AND recipient=?').bind(noticeId,recipient).first();if(!notice)throw new ApiError(404,'Notification not found.');await db.prepare('UPDATE notifications SET read_at=? WHERE id=? AND recipient=?').bind(new Date().toISOString(),notice.id,recipient).run();return json({saved:true});}
if(path==='/api/admin/notifications/retry'&&method==='POST'){const input=await body(request);const notice=await db.prepare('SELECT id,delivery_status FROM notifications WHERE id=?').bind(input.id||'').first();if(!notice)throw new ApiError(404,'Notification not found.');if(!['unconfigured','failed'].includes(notice.delivery_status))throw new ApiError(409,'This message cannot be safely retried. Check provider logs if its status is unknown.');await notify(notice.id);return json({saved:true});}

async function booking(id){const row=await db.prepare('SELECT * FROM bookings WHERE id=?').bind(id).first();if(!row||!admin&&row.customer_id!==customerId)throw new ApiError(404,'Booking not found.');return row;}
if(path==='/api/customer/session'&&method==='GET')return json({email,phone:identity.phone,verifiedPhone:identity.verifiedPhone,verifiedEmail:identity.verifiedEmail||false,preview:identity.preview});
if((path==='/api/customer/bookings'||path==='/api/admin/bookings')&&method==='GET'){
const rows=await (admin?db.prepare('SELECT * FROM bookings ORDER BY created_at DESC LIMIT 200'):db.prepare('SELECT * FROM bookings WHERE customer_id=? ORDER BY created_at DESC LIMIT 200').bind(customerId)).all();
const bookings=await Promise.all(rows.results.map(async row=>{const docs=await db.prepare('SELECT id,kind,created_at FROM documents WHERE booking_id=?').bind(row.id).all();const {customer_id,...safe}=row;return {...safe,documents:docs.results};}));return json({bookings});}
if(path==='/api/customer/bookings'&&method==='POST'){
const input=await body(request);if(!UUID.test(input.id||''))throw new ApiError(400,'Refresh the form and try again.');
const existing=await db.prepare('SELECT id FROM bookings WHERE id=? AND customer_id=?').bind(input.id,customerId).first();if(existing)return json(existing);
const name=text(input.name,'Full name',100),phone=text(input.phone,'Phone number',20);if(!/^\+?[0-9 ()-]{10,20}$/.test(phone)||phone.replace(/\D/g,'').length<10)throw new ApiError(400,'Enter a valid phone number.');
if(identity.verifiedPhone&&internationalPhone(phone)!==identity.phone)throw new ApiError(400,'Use your verified mobile number for this booking.');
if(!Number.isInteger(input.age)||input.age<18||input.age>100)throw new ApiError(400,'Enter an age from 18 to 100.');if(input.consent!==true)throw new ApiError(400,'Please consent to using your details for this rental request.');
const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
const today=new Date(Date.now()+330*60000).toISOString().slice(0,10);
if(!validDate(input.startDate)||!validDate(input.endDate)||input.startDate<today||input.endDate<=input.startDate)throw new ApiError(400,'Choose a pick-up from today and a later return date.');
const catalogue=await readAll(db),car=catalogue.cars.find(c=>c.id===input.carId&&c.status==='active'),location=catalogue.locations.find(l=>l.id===input.locationId&&l.enabled);
if(!car||!location||!car.locationIds.includes(location.id)||!['self','driver'].includes(input.mode)||!(input.mode==='self'?car.selfEnabled:car.driverEnabled))throw new ApiError(400,'This car or rental option is no longer available. Refresh and choose again.');
const notifyVia=input.notifyVia||'none';if(!['none','sms','whatsapp'].includes(notifyVia)||notifyVia!=='none'&&(input.alertConsent!==true||!internationalPhone(phone)))throw new ApiError(400,'Confirm messaging consent and a valid phone number, or choose in-app updates only.');
const now=new Date().toISOString(),noticeId='request:'+input.id,ownerChannel=['sms','whatsapp'].includes(env.GORIDE_OWNER_ALERT_CHANNEL)?env.GORIDE_OWNER_ALERT_CHANNEL:'none';
const message='New GoRide booking request '+input.id.slice(0,8)+': '+car.name+', '+location.name+', '+input.startDate+' to '+input.endDate+'. Open your Admin Panel to accept or reject.';
const results=await db.batch([
db.prepare("INSERT OR IGNORE INTO bookings (id,customer_id,email,name,age,phone,car_id,car_name,location,mode,start_date,end_date,status,created_at,consent_at,notify_via,alert_consent_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM bookings WHERE car_id=? AND status IN ('confirmed','completed') AND start_date<? AND end_date>?)").bind(input.id,customerId,email,name,input.age,phone,car.id,car.name,location.name,input.mode,input.startDate,input.endDate,'requested',now,now,notifyVia,notifyVia==='none'?null:now,car.id,input.endDate,input.startDate),
db.prepare('INSERT OR IGNORE INTO notifications (id,recipient,booking_id,message,created_at,channel,phone) SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM bookings WHERE id=? AND customer_id=?)').bind(noticeId,'owner',input.id,message,now,ownerChannel,env.GORIDE_OWNER_ALERT_PHONE||'',input.id,customerId)]);
if(!results[0].meta.changes){const saved=await db.prepare('SELECT id FROM bookings WHERE id=? AND customer_id=?').bind(input.id,customerId).first();if(saved)return json(saved);throw new ApiError(409,'This car is already booked for those dates. Choose another car or different dates.');}
notify(noticeId);return json({id:input.id,status:'requested'},201);}
const statusMatch=path.match(/^\/api\/admin\/bookings\/([a-f0-9-]+)$/);
if(statusMatch&&method==='PUT'){
const row=await booking(statusMatch[1]),input=await body(request);if(input.version!==row.version)throw new ApiError(409,'This booking changed. Refresh before deciding.');
if(!transitions[row.status]?.includes(input.status))throw new ApiError(400,'This booking cannot move to that status.');
const note=typeof input.note==='string'?input.note.trim():'';if(note.length>1000||['rejected','cancelled'].includes(input.status)&&!note)throw new ApiError(400,'Enter a reason (up to 1,000 characters).');
const quote=input.status==='confirmed'?input.quotedTotal:row.quoted_total;if(input.status==='confirmed'&&(!Number.isSafeInteger(quote)||quote<0||quote>10000000))throw new ApiError(400,'Enter the agreed rental total in whole rupees.');
if(input.status==='confirmed'){const catalogue=await readAll(db),car=catalogue.cars.find(c=>c.id===row.car_id&&c.status==='active');if(!car||!catalogue.locations.some(l=>l.enabled&&l.name===row.location))throw new ApiError(409,'The car or location is no longer active. Check the request before accepting.');}
const now=new Date().toISOString(),nextVersion=row.version+1,noticeId='decision:'+row.id+':'+nextVersion;
const action={confirmed:'accepted',rejected:'rejected',cancelled:'cancelled',completed:'completed'}[input.status];
const message='GoRide booking '+row.id.slice(0,8)+' was '+action+'.'+(input.status==='confirmed'?' Agreed rental total: INR '+quote+'.':'')+(note?' '+note:'')+' Open My bookings for details.';
const results=await db.batch([
db.prepare("UPDATE bookings SET status=?,decision_note=?,quoted_total=?,version=version+1,updated_at=? WHERE id=? AND version=? AND (?!='confirmed' OR NOT EXISTS (SELECT 1 FROM bookings b WHERE b.car_id=bookings.car_id AND b.id!=bookings.id AND b.status IN ('confirmed','completed') AND b.start_date<bookings.end_date AND b.end_date>bookings.start_date))").bind(input.status,note,quote,now,row.id,row.version,input.status),
db.prepare('INSERT OR IGNORE INTO notifications (id,recipient,booking_id,message,created_at,channel,phone) SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM bookings WHERE id=? AND version=? AND status=?)').bind(noticeId,row.customer_id,row.id,message,now,row.notify_via,row.phone,row.id,nextVersion,input.status)]);
if(!results[0].meta.changes)throw new ApiError(409,'This car has an overlapping accepted booking, or this request changed. Refresh before deciding.');
notify(noticeId);return json({saved:true,status:input.status,version:nextVersion});}
const uploadMatch=path.match(/^\/api\/customer\/bookings\/([a-f0-9-]+)\/documents\/(licence|aadhaar)$/);
if(uploadMatch&&method==='POST'){
const row=await booking(uploadMatch[1]);if(['cancelled','completed','rejected'].includes(row.status))throw new ApiError(400,'Documents cannot be added to a closed booking.');
if(request.headers.get('x-document-consent')!=='yes'||uploadMatch[2]==='aadhaar'&&request.headers.get('x-masked-aadhaar')!=='yes')throw new ApiError(400,'Confirm consent and upload only a masked Aadhaar image.');
const result=await upload(request,env,'private/');const key=(await result.json()).url.slice('/media/'.length);const previous=await db.prepare('SELECT * FROM documents WHERE booking_id=? AND kind=?').bind(row.id,uploadMatch[2]).first();const id=previous?.id||crypto.randomUUID();
try{await db.prepare('INSERT INTO documents (id,booking_id,kind,storage_key,created_at) VALUES (?,?,?,?,?) ON CONFLICT(booking_id,kind) DO UPDATE SET storage_key=excluded.storage_key,created_at=excluded.created_at').bind(id,row.id,uploadMatch[2],key,new Date().toISOString()).run();}catch(e){await env.BUCKET.delete(key);throw e;}
if(previous)await env.BUCKET.delete(previous.storage_key);return json({id,kind:uploadMatch[2]},201);}
const docMatch=path.match(/^\/api\/(?:customer|admin)\/documents\/([a-f0-9-]+)$/);
if(docMatch&&['GET','HEAD','DELETE'].includes(method)){
const doc=await db.prepare('SELECT * FROM documents WHERE id=?').bind(docMatch[1]).first();if(!doc)throw new ApiError(404,'Document not found.');await booking(doc.booking_id);if(!env.BUCKET)throw new ApiError(503,'Document storage unavailable.');
if(method==='DELETE'){await env.BUCKET.delete(doc.storage_key);await db.prepare('DELETE FROM documents WHERE id=?').bind(doc.id).run();return json({deleted:true});}
const file=await env.BUCKET.get(doc.storage_key);if(!file)throw new ApiError(404,'Document not found.');return new Response(method==='HEAD'?null:file.body,{headers:{'Content-Type':file.httpMetadata.contentType,'Cache-Control':'private,no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; frame-ancestors 'self'",'Referrer-Policy':'no-referrer'}});}
if(path==='/api/customer/feedback'&&method==='POST'){
const input=await body(request),message=text(input.message,'Message',2000);if(!['review','feedback'].includes(input.kind)||!UUID.test(input.id||''))throw new ApiError(400,'Invalid feedback request.');
const old=await db.prepare('SELECT id FROM feedback WHERE id=? AND customer_id=?').bind(input.id,customerId).first();if(old)return json(old);
let row=null;if(input.bookingId)row=await booking(input.bookingId);
if(input.kind==='review'&&(!row||row.status!=='completed'||!Number.isInteger(input.rating)||input.rating<1||input.rating>5||input.publishConsent!==true))throw new ApiError(400,'Reviews need a completed booking, a 1–5 rating and permission to publish.');
if(input.kind==='review'&&await db.prepare("SELECT id FROM feedback WHERE booking_id=? AND kind='review'").bind(row.id).first())throw new ApiError(409,'You already reviewed this booking.');
const displayName=input.kind==='review'?text(input.displayName,'Public display name',60):'';
await db.prepare('INSERT INTO feedback (id,customer_id,email,booking_id,kind,display_name,rating,message,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(input.id,customerId,email,input.kind==='review'?row.id:null,input.kind,displayName,input.kind==='review'?input.rating:null,message,'pending',new Date().toISOString()).run();return json({id:input.id,status:'pending'},201);}
if(path==='/api/admin/feedback'&&method==='GET'){const rows=await db.prepare('SELECT id,email,booking_id,kind,display_name,rating,message,status,created_at FROM feedback ORDER BY created_at DESC LIMIT 200').all();return json({feedback:rows.results});}
const reviewMatch=path.match(/^\/api\/admin\/feedback\/([a-f0-9-]+)$/);
if(reviewMatch&&method==='PUT'){const input=await body(request),row=await db.prepare('SELECT * FROM feedback WHERE id=?').bind(reviewMatch[1]).first();if(!row)throw new ApiError(404,'Feedback not found.');if(!(row.kind==='review'?['approved','hidden']:['pending','resolved']).includes(input.status))throw new ApiError(400,'Choose a valid status.');await db.prepare('UPDATE feedback SET status=? WHERE id=?').bind(input.status,row.id).run();return json({saved:true});}
throw new ApiError(404,'This action is not available.');
}
