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
if(path==='/api/customer/session'&&method==='GET'){
const latest=await db.prepare('SELECT name FROM bookings WHERE customer_id=? ORDER BY created_at DESC,id DESC LIMIT 1').bind(customerId).first();
const displayName=latest?.name?.trim().split(/\s+/)[0]||email.split('@')[0]?.replace(/[._-]+/g,' ').trim().split(/\s+/)[0]||'Rider';
return json({email,displayName,phone:identity.phone,verifiedPhone:identity.verifiedPhone,verifiedEmail:identity.verifiedEmail||false,preview:identity.preview});}

if(path==='/api/admin/bookings/calendar'&&method==='GET'){
const month=url.searchParams.get('month')||'';if(!/^(20\d{2})-(0[1-9]|1[0-2])$/.test(month))throw new ApiError(400,'Choose a month between 2000 and 2099.');
const [year,m]=month.split('-').map(Number),from=month+'-01T00:00',until=new Date(Date.UTC(year,m,1)).toISOString().slice(0,10)+'T00:00',car=url.searchParams.get('car')||'';
if(car.length>100)throw new ApiError(400,'Choose a valid car.');
const rows=await db.prepare("SELECT id,car_id,car_name,location,mode,name,status,start_date,end_date,pickup_time,return_time FROM bookings WHERE status IN ('requested','confirmed','completed') AND (start_date||'T'||COALESCE(pickup_time,'00:00'))<? AND (end_date||'T'||COALESCE(return_time,'00:00'))>? AND (?='' OR car_id=?) ORDER BY start_date,COALESCE(pickup_time,'00:00'),id LIMIT 1001").bind(until,from,car,car).all();
if(rows.results.length>1000)throw new ApiError(422,'Too many bookings for this month. Select one car to view its calendar.');
return json({month,bookings:rows.results,updatedAt:new Date().toISOString()});
}

if((path==='/api/customer/bookings'||path==='/api/admin/bookings')&&method==='GET'){
const rows=await (admin?db.prepare('SELECT * FROM bookings ORDER BY created_at DESC LIMIT 200'):db.prepare('SELECT * FROM bookings WHERE customer_id=? ORDER BY created_at DESC LIMIT 200').bind(customerId)).all();
const bookings=await Promise.all(rows.results.map(async row=>{const docs=await db.prepare('SELECT id,kind,created_at FROM documents WHERE booking_id=?').bind(row.id).all();const cancellations=await db.prepare('SELECT id,reason,status,created_at,decision_at,decision_note FROM cancellation_requests WHERE booking_id=? ORDER BY created_at DESC,id DESC').bind(row.id).all();const payments=await db.prepare("SELECT id,kind,amount,method,reference,note,created_at FROM payment_records WHERE booking_id=? ORDER BY created_at,id").bind(row.id).all();const {customer_id,...safe}=row;return {...safe,documents:docs.results,cancellations:cancellations.results,payments:payments.results};}));return json({bookings});}
if(path==='/api/customer/bookings'&&method==='POST'){
const input=await body(request);if(!UUID.test(input.id||''))throw new ApiError(400,'Refresh the form and try again.');
const existing=await db.prepare('SELECT id FROM bookings WHERE id=? AND customer_id=?').bind(input.id,customerId).first();if(existing)return json(existing);
const name=text(input.name,'Full name',100),phone=text(input.phone,'Phone number',20);if(!/^\+?[0-9 ()-]{10,20}$/.test(phone)||phone.replace(/\D/g,'').length<10)throw new ApiError(400,'Enter a valid phone number.');
if(identity.verifiedPhone&&internationalPhone(phone)!==identity.phone)throw new ApiError(400,'Use your verified mobile number for this booking.');
if(!Number.isInteger(input.age)||input.age<18||input.age>100)throw new ApiError(400,'Enter an age from 18 to 100.');if(input.consent!==true)throw new ApiError(400,'Please consent to using your details for this rental request.');
const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
const validTime=value=>typeof value==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(value);
if(!validDate(input.startDate)||!validDate(input.endDate)||!validTime(input.pickupTime)||!validTime(input.returnTime))throw new ApiError(400,'Choose valid pick-up and return dates and times (Indian Standard Time).');
const starts=input.startDate+'T'+input.pickupTime,ends=input.endDate+'T'+input.returnTime;
if(Date.parse(starts+':00+05:30')<=Date.now()||ends<=starts)throw new ApiError(400,'Choose a future pick-up and a return later than pick-up.');
const pickupAddress=text(input.pickupAddress,'Pick-up address or landmark',300),returnAddress=text(input.returnAddress,'Return address or landmark',300);
const tripNotes=typeof input.tripNotes==='string'?input.tripNotes.trim():'';if(tripNotes.length>1000)throw new ApiError(400,'Trip notes must be 1,000 characters or fewer.');
const catalogue=await readAll(db),car=catalogue.cars.find(c=>c.id===input.carId&&c.status==='active'),location=catalogue.locations.find(l=>l.id===input.locationId&&l.enabled);
if(!car||!location||!car.locationIds.includes(location.id)||!['self','driver'].includes(input.mode)||!(input.mode==='self'?car.selfEnabled:car.driverEnabled))throw new ApiError(400,'This car or rental option is no longer available. Refresh and choose again.');
if(input.mode==='self'&&input.age<21)throw new ApiError(400,'Self-drive drivers must be at least 21 years old.');
const notifyVia=input.notifyVia||'none';if(!['none','sms','whatsapp'].includes(notifyVia)||notifyVia!=='none'&&(input.alertConsent!==true||!internationalPhone(phone)))throw new ApiError(400,'Confirm messaging consent and a valid phone number, or choose in-app updates only.');
const now=new Date().toISOString(),noticeId='request:'+input.id,ownerChannel=['sms','whatsapp'].includes(env.GORIDE_OWNER_ALERT_CHANNEL)?env.GORIDE_OWNER_ALERT_CHANNEL:'none';
const message='New GoRide booking request '+input.id.slice(0,8)+': '+car.name+', '+location.name+', '+input.startDate+' to '+input.endDate+'. Open your Admin Panel to accept or reject.';
const results=await db.batch([
db.prepare("INSERT OR IGNORE INTO bookings (id,customer_id,email,name,age,phone,car_id,car_name,location,mode,start_date,end_date,status,created_at,consent_at,notify_via,alert_consent_at,pickup_time,return_time,pickup_address,return_address,trip_notes) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM bookings WHERE car_id=? AND status IN ('confirmed','completed') AND (start_date||'T'||COALESCE(pickup_time,'00:00'))<? AND (end_date||'T'||COALESCE(return_time,'00:00'))>?)").bind(input.id,customerId,email,name,input.age,phone,car.id,car.name,location.name,input.mode,input.startDate,input.endDate,'requested',now,now,notifyVia,notifyVia==='none'?null:now,input.pickupTime,input.returnTime,pickupAddress,returnAddress,tripNotes,car.id,ends,starts),
db.prepare('INSERT OR IGNORE INTO notifications (id,recipient,booking_id,message,created_at,channel,phone) SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM bookings WHERE id=? AND customer_id=?)').bind(noticeId,'owner',input.id,message,now,ownerChannel,env.GORIDE_OWNER_ALERT_PHONE||'',input.id,customerId)]);
if(!results[0].meta.changes){const saved=await db.prepare('SELECT id FROM bookings WHERE id=? AND customer_id=?').bind(input.id,customerId).first();if(saved)return json(saved);throw new ApiError(409,'This car is already booked for those dates. Choose another car or different dates.');}
notify(noticeId);return json({id:input.id,status:'requested'},201);}
const cancellationMatch=path.match(/^\/api\/customer\/bookings\/([a-f0-9-]+)\/cancellations$/);
if(cancellationMatch&&method==='POST'){
const row=await booking(cancellationMatch[1]),input=await body(request);
if(!UUID.test(input.id||''))throw new ApiError(400,'Refresh the booking and try again.');
const previous=await db.prepare('SELECT id,status FROM cancellation_requests WHERE id=? AND booking_id=? AND customer_id=?').bind(input.id,row.id,customerId).first();
if(previous)return json({id:previous.id,status:previous.status,version:row.version});
if(input.version!==row.version)throw new ApiError(409,'This booking changed. Refresh before requesting cancellation.');
if(!['requested','confirmed'].includes(row.status))throw new ApiError(400,'This booking is closed. Contact GoRide for help.');
const reason=text(input.reason,'Cancellation reason',1000),now=new Date().toISOString(),nextVersion=row.version+1,noticeId='cancellation-request:'+input.id;
const ownerChannel=['sms','whatsapp'].includes(env.GORIDE_OWNER_ALERT_CHANNEL)?env.GORIDE_OWNER_ALERT_CHANNEL:'none';
const results=await db.batch([
db.prepare("INSERT OR IGNORE INTO cancellation_requests (id,booking_id,customer_id,reason,status,created_at) SELECT ?,?,?,?,'pending',? WHERE EXISTS (SELECT 1 FROM bookings WHERE id=? AND customer_id=? AND version=? AND status IN ('requested','confirmed')) AND NOT EXISTS (SELECT 1 FROM cancellation_requests WHERE booking_id=? AND status='pending')").bind(input.id,row.id,customerId,reason,now,row.id,customerId,row.version,row.id),
db.prepare("UPDATE bookings SET version=version+1,updated_at=? WHERE id=? AND customer_id=? AND version=? AND status IN ('requested','confirmed') AND EXISTS (SELECT 1 FROM cancellation_requests WHERE id=? AND booking_id=bookings.id AND status='pending')").bind(now,row.id,customerId,row.version,input.id),
db.prepare("INSERT OR IGNORE INTO notifications (id,recipient,booking_id,message,created_at,channel,phone) SELECT ?,'owner',?,?,?,?,? WHERE EXISTS (SELECT 1 FROM cancellation_requests c JOIN bookings b ON b.id=c.booking_id WHERE c.id=? AND c.booking_id=? AND b.customer_id=? AND b.version=?)").bind(noticeId,row.id,'Cancellation requested for GoRide booking '+row.id.slice(0,8)+'. Open Bookings & customers to approve or decline.',now,ownerChannel,env.GORIDE_OWNER_ALERT_PHONE||'',input.id,row.id,customerId,nextVersion)
]);
if(!results[0].meta.changes){const saved=await db.prepare('SELECT id,status FROM cancellation_requests WHERE id=? AND booking_id=? AND customer_id=?').bind(input.id,row.id,customerId).first();if(saved)return json({...saved,version:(await booking(row.id)).version});throw new ApiError(409,'There is already a pending cancellation, or this booking changed. Refresh to see its status.');}
notify(noticeId);return json({id:input.id,status:'pending',version:nextVersion},201);
}
const cancellationDecisionMatch=path.match(/^\/api\/admin\/bookings\/([a-f0-9-]+)\/cancellations\/([a-f0-9-]+)$/);
if(cancellationDecisionMatch&&method==='PUT'){
const row=await booking(cancellationDecisionMatch[1]),input=await body(request);
const cancellation=await db.prepare('SELECT * FROM cancellation_requests WHERE id=? AND booking_id=?').bind(cancellationDecisionMatch[2],row.id).first();if(!cancellation)throw new ApiError(404,'Cancellation request not found.');
if(!['approved','declined'].includes(input.status))throw new ApiError(400,'Approve or decline the cancellation request.');
if(cancellation.status!=='pending'){if(cancellation.status===input.status&&cancellation.decision_version===input.version+1)return json({saved:true,status:cancellation.status,version:row.version});throw new ApiError(409,'This cancellation request has already been decided. Refresh to see the result.');}
if(input.version!==row.version)throw new ApiError(409,'This booking changed. Refresh before deciding.');
if(!['requested','confirmed'].includes(row.status))throw new ApiError(409,'This booking is closed. Refresh before deciding.');
const note=text(input.note,'Reply to customer',1000),now=new Date().toISOString(),nextVersion=row.version+1,noticeId='cancellation-decision:'+cancellation.id;
const approved=input.status==='approved',status=approved?'cancelled':row.status;
const results=await db.batch([
db.prepare("UPDATE bookings SET status=?,decision_note=?,version=version+1,updated_at=? WHERE id=? AND version=? AND status IN ('requested','confirmed') AND EXISTS (SELECT 1 FROM cancellation_requests WHERE id=? AND booking_id=bookings.id AND status='pending')").bind(status,approved?note:row.decision_note,now,row.id,row.version,cancellation.id),
db.prepare("UPDATE cancellation_requests SET status=?,decision_note=?,decision_at=?,decision_version=? WHERE id=? AND status='pending' AND EXISTS (SELECT 1 FROM bookings WHERE id=? AND version=? AND status=?)").bind(input.status,note,now,nextVersion,cancellation.id,row.id,nextVersion,status),
db.prepare("INSERT OR IGNORE INTO notifications (id,recipient,booking_id,message,created_at,channel,phone) SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM cancellation_requests WHERE id=? AND status=? AND decision_version=?)").bind(noticeId,row.customer_id,row.id,'Your cancellation request for GoRide booking '+row.id.slice(0,8)+' was '+input.status+'. '+(approved?'The booking is cancelled. ':'The booking remains '+(row.status==='confirmed'?'accepted':'requested')+'. ')+note+' Open My bookings for details. No refund is processed by this action.',now,row.notify_via,row.phone,cancellation.id,input.status,nextVersion)
]);
if(!results[0].meta.changes)throw new ApiError(409,'This cancellation or booking changed. Refresh before deciding.');
notify(noticeId);return json({saved:true,status:input.status,bookingStatus:status,version:nextVersion});
}
// Append-only owner-entered records. No payment provider is called here.
const paymentMatch=path.match(/^\/api\/admin\/bookings\/([a-f0-9-]+)\/payments$/);
if(paymentMatch&&method==='POST'){
const row=await booking(paymentMatch[1]),input=await body(request);
if(!UUID.test(input.id||''))throw new ApiError(400,'Refresh the payment form and retry.');
const kinds=['rental_received','rental_refunded','deposit_received','deposit_refunded'];
if(!kinds.includes(input.kind)||!Number.isSafeInteger(input.amount)||input.amount<1||input.amount>10000000)throw new ApiError(400,'Choose a valid payment type and a positive whole-rupee amount.');
if(!['cash','upi','bank','card','other'].includes(input.method))throw new ApiError(400,'Choose the payment method used.');
const reference=input.reference==null||input.reference===''?'':text(input.reference,'Payment reference',100),note=text(input.note,'Record note',500);
if(!note)throw new ApiError(400,'Add a note explaining this record.');
const existing=await db.prepare('SELECT * FROM payment_records WHERE id=?').bind(input.id).first();
if(existing){if(existing.booking_id!==row.id||existing.kind!==input.kind||existing.amount!==input.amount||existing.method!==input.method||existing.reference!==reference||existing.note!==note)throw new ApiError(409,'This record reference has already been used.');return json({saved:true});}
if(input.version!==row.version)throw new ApiError(409,'This booking changed. Refresh before recording money.');
if(row.quoted_total==null)throw new ApiError(400,'Accept the booking with an agreed quote before recording payments.');
const refund=input.kind.endsWith('_refunded'),category=input.kind.startsWith('deposit')?'deposit':'rental';
if(!refund&&!['confirmed','completed'].includes(row.status))throw new ApiError(400,'Received money can only be recorded for accepted or completed bookings.');
let quote;try{quote=JSON.parse(row.quote_details||'{}');}catch{quote={};}
const cap=category==='deposit'?quote.deposit:row.quoted_total;
if(!Number.isSafeInteger(cap)||cap<0)throw new ApiError(400,'This booking has no agreed deposit amount.');
const now=new Date().toISOString(),delta=refund?-input.amount:input.amount,nextVersion=row.version+1,noticeId='payment:'+input.id;
const netSql="COALESCE((SELECT SUM(CASE WHEN kind=? THEN amount WHEN kind=? THEN -amount ELSE 0 END) FROM payment_records WHERE booking_id=?),0)";
const balance=netSql+'+?';
const results=await db.batch([
db.prepare("INSERT OR IGNORE INTO payment_records (id,booking_id,kind,amount,method,reference,note,created_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM bookings WHERE id=? AND version=? AND quoted_total IS NOT NULL) AND "+balance+" BETWEEN 0 AND ?").bind(input.id,row.id,input.kind,input.amount,input.method,reference,note,now,row.id,row.version,category+'_received',category+'_refunded',row.id,delta,cap),
db.prepare('UPDATE bookings SET version=version+1,updated_at=? WHERE id=? AND version=? AND EXISTS (SELECT 1 FROM payment_records WHERE id=? AND booking_id=bookings.id)').bind(now,row.id,row.version,input.id),
db.prepare('INSERT OR IGNORE INTO notifications (id,recipient,booking_id,message,created_at,channel,phone) SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM payment_records p JOIN bookings b ON b.id=p.booking_id WHERE p.id=? AND p.booking_id=? AND b.version=?)').bind(noticeId,row.customer_id,row.id,'GoRide recorded '+category+' '+(refund?'refund':'payment')+' of INR '+input.amount+' for booking '+row.id.slice(0,8)+'. Open My bookings to review the record. Contact GoRide if it does not match your payment.',now,'none',row.phone,input.id,row.id,nextVersion)
]);
if(!results[0].meta.changes){const retry=await db.prepare('SELECT * FROM payment_records WHERE id=? AND booking_id=?').bind(input.id,row.id).first();if(retry&&retry.kind===input.kind&&retry.amount===input.amount&&retry.method===input.method&&retry.reference===reference&&retry.note===note)return json({saved:true});throw new ApiError(409,'Booking changed or amount exceeds the agreed balance. Refunds cannot exceed money held. Refresh and check the record.');}
return json({saved:true},201);
}
const statusMatch=path.match(/^\/api\/admin\/bookings\/([a-f0-9-]+)$/);
if(statusMatch&&method==='PUT'){
const row=await booking(statusMatch[1]),input=await body(request);if(input.version!==row.version)throw new ApiError(409,'This booking changed. Refresh before deciding.');
if(await db.prepare("SELECT id FROM cancellation_requests WHERE booking_id=? AND status='pending'").bind(row.id).first())throw new ApiError(409,'Resolve the pending cancellation request before changing this booking.');
if(!transitions[row.status]?.includes(input.status))throw new ApiError(400,'This booking cannot move to that status.');
const note=typeof input.note==='string'?input.note.trim():'';if(note.length>1000||['rejected','cancelled'].includes(input.status)&&!note)throw new ApiError(400,'Enter a reason (up to 1,000 characters).');
let quoteDetails=row.quote_details;
if(input.status==='confirmed'){quoteDetails=JSON.stringify(validateQuote(input.quoteDetails,ApiError));}
const quote=input.status==='confirmed'?input.quotedTotal:row.quoted_total;if(input.status==='confirmed'&&(!Number.isSafeInteger(quote)||quote<0||quote>10000000))throw new ApiError(400,'Enter the agreed rental total in whole rupees.');
if(input.status==='confirmed'&&JSON.parse(quoteDetails).total!==quote)throw new ApiError(400,'The rental total must equal base fare, delivery, driver allowance and tax.');
if(input.status==='confirmed'){const catalogue=await readAll(db),car=catalogue.cars.find(c=>c.id===row.car_id&&c.status==='active');if(!car||!catalogue.locations.some(l=>l.enabled&&l.name===row.location))throw new ApiError(409,'The car or location is no longer active. Check the request before accepting.');}
const now=new Date().toISOString(),nextVersion=row.version+1,noticeId='decision:'+row.id+':'+nextVersion;
const action={confirmed:'accepted',rejected:'rejected',cancelled:'cancelled',completed:'completed'}[input.status];
const message='GoRide booking '+row.id.slice(0,8)+' was '+action+'.'+(input.status==='confirmed'?' Agreed rental total: INR '+quote+'.':'')+(note?' '+note:'')+' Open My bookings for details.';
const results=await db.batch([
db.prepare("UPDATE bookings SET status=?,decision_note=?,quoted_total=?,quote_details=?,version=version+1,updated_at=? WHERE id=? AND version=? AND NOT EXISTS (SELECT 1 FROM cancellation_requests c WHERE c.booking_id=bookings.id AND c.status='pending') AND (?!='confirmed' OR NOT EXISTS (SELECT 1 FROM bookings b WHERE b.car_id=bookings.car_id AND b.id!=bookings.id AND b.status IN ('confirmed','completed') AND (b.start_date||'T'||COALESCE(b.pickup_time,'00:00'))<(bookings.end_date||'T'||COALESCE(bookings.return_time,'00:00')) AND (b.end_date||'T'||COALESCE(b.return_time,'00:00'))>(bookings.start_date||'T'||COALESCE(bookings.pickup_time,'00:00'))))").bind(input.status,note,quote,quoteDetails,now,row.id,row.version,input.status),
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

function validateQuote(value,ApiError){
if(!value||typeof value!=='object'||Array.isArray(value))throw new ApiError(400,'Complete the quote details before accepting.');
const quote={version:1};
for(const field of ['baseFare','deliveryFee','driverAllowance','taxAmount','deposit','includedKm','includedHours','extraKmRate','extraHourRate']){
const n=value[field];if(!Number.isSafeInteger(n)||n<0||n>10000000)throw new ApiError(400,'Quote amounts, kilometres and hours must be non-negative whole numbers.');quote[field]=n;
}
if(quote.includedHours<1)throw new ApiError(400,'Enter at least one included hour.');
for(const [key,allowed] of Object.entries({fuel:['same-level','included','customer-pays'],tollsParking:['included','at-actuals'],permits:['included','at-actuals']})){
if(!allowed.includes(value[key]))throw new ApiError(400,'Choose the fuel, toll/parking and permit arrangements.');quote[key]=value[key];}
quote.total=quote.baseFare+quote.deliveryFee+quote.driverAllowance+quote.taxAmount;
if(quote.total>10000000)throw new ApiError(400,'Rental total is too large.');
return quote;
}
