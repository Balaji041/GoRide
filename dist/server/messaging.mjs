export function internationalPhone(value){const digits=String(value||'').replace(/\D/g,'');return /^[6-9]\d{9}$/.test(digits)?'+91'+digits:/^[1-9]\d{10,14}$/.test(digits)?'+'+digits:'';}
export function messagingReady(env,channel){return !!(env.TWILIO_ACCOUNT_SID&&env.TWILIO_AUTH_TOKEN&&(channel==='sms'?env.TWILIO_SMS_FROM:channel==='whatsapp'&&env.TWILIO_WHATSAPP_FROM&&env.TWILIO_WHATSAPP_CONTENT_SID));}
export async function sendMessage(env,notice,fetcher=fetch){
if(notice.channel==='none')return {status:'not_requested',error:''};
if(!messagingReady(env,notice.channel))return {status:'unconfigured',error:'Messaging provider is not connected.'};
const phone=internationalPhone(notice.phone);if(!phone)return {status:'failed',error:'A valid international phone number is required.'};
const wa=notice.channel==='whatsapp',prefix=wa?'whatsapp:':'';
const form=new URLSearchParams({To:prefix+phone,From:prefix+String(wa?env.TWILIO_WHATSAPP_FROM:env.TWILIO_SMS_FROM).replace(/^whatsapp:/,'')});
if(wa){form.set('ContentSid',env.TWILIO_WHATSAPP_CONTENT_SID);form.set('ContentVariables',JSON.stringify({'1':notice.message}));}else form.set('Body',notice.message);
try{const response=await fetcher('https://api.twilio.com/2010-04-01/Accounts/'+encodeURIComponent(env.TWILIO_ACCOUNT_SID)+'/Messages.json',{method:'POST',headers:{Authorization:'Basic '+btoa(env.TWILIO_ACCOUNT_SID+':'+env.TWILIO_AUTH_TOKEN),'Content-Type':'application/x-www-form-urlencoded'},body:form,signal:AbortSignal.timeout(8000)});let data;try{data=await response.json();}catch{return {status:'unknown',error:'Provider response could not be verified. Check provider logs before retrying.'};}if(!response.ok)return {status:'failed',error:'Provider rejected the message'+(Number.isInteger(data.code)?' (code '+data.code+')':'')+'.'};if(typeof data.sid!=='string')return {status:'unknown',error:'Provider did not return a message reference.'};return {status:'submitted',providerId:data.sid,error:''};}catch{return {status:'unknown',error:'Provider response was not received. Check provider logs before retrying.'};}
}
export async function deliverNotification(db,env,id){
const claim=await db.prepare("UPDATE notifications SET delivery_status='sending' WHERE id=? AND delivery_status IN ('pending','failed','unconfigured')").bind(id).run();if(!claim.meta.changes)return;
const notice=await db.prepare('SELECT * FROM notifications WHERE id=?').bind(id).first();
const result=await sendMessage(env,notice);
await db.prepare('UPDATE notifications SET delivery_status=?,provider_id=?,delivery_error=? WHERE id=?').bind(result.status,result.providerId||null,result.error,id).run();
}
