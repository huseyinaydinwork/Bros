const crypto=require('node:crypto'),net=require('node:net'),tls=require('node:tls');
// Every e-mail is recorded in the outbox. Delivery: SMTP when SMTP_HOST is set, Resend's HTTP API
// when RESEND_API_KEY is set, otherwise the message only stays in the outbox with status "logged".
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fill=(tpl,vars)=>String(tpl||'').replace(/\{\{\s*([a-z_]+)\s*\}\}/gi,(_,k)=>vars[k]??'');
function html(text,{unsubscribeUrl}={}){
 const linked=esc(text).replace(/(https?:\/\/[^\s<]+)/g,'<a href="$1" style="color:#56703a">$1</a>');
 const paragraphs=linked.split(/\n{2,}/).map(p=>`<p style="margin:0 0 16px;line-height:1.6">${p.replace(/\n/g,'<br>')}</p>`).join('');
 return `<!doctype html><html lang="tr"><body style="margin:0;background:#f3f4f0;font:15px/1.6 -apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#121a15"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%"><tr><td style="background:#131c16;border-radius:14px 14px 0 0;padding:22px 28px;font:700 22px -apple-system,'Segoe UI',Arial,sans-serif;color:#f7f4e6;letter-spacing:-.5px">bür<span style="color:#adbe8e">OS</span></td></tr><tr><td style="background:#ffffff;border:1px solid #e3e6de;border-top:0;border-radius:0 0 14px 14px;padding:28px">${paragraphs}</td></tr><tr><td style="padding:18px 8px;font-size:12px;color:#838c85;line-height:1.5">Bu e-postayı bürOS hesabınız nedeniyle aldınız.${unsubscribeUrl?` Bilgilendirme e-postalarını almak istemiyorsanız <a href="${esc(unsubscribeUrl)}" style="color:#838c85">abonelikten çıkabilirsiniz</a>.`:''}</td></tr></table></td></tr></table></body></html>`;
}
const fromHeader=()=>process.env.MAIL_FROM||'bürOS <bildirim@buros.app>';
const addressOf=v=>(String(v).match(/<([^>]+)>/)||[,String(v).trim()])[1];
const encodeWord=v=>/^[\x20-\x7e]*$/.test(v)?v:`=?UTF-8?B?${Buffer.from(v).toString('base64')}?=`;
const b64=v=>Buffer.from(v).toString('base64').replace(/.{76}/g,'$&\r\n');
function mime({from,to,subject,text,html}){
 const boundary='b'+crypto.randomBytes(12).toString('hex'),m=String(from).match(/^(.*)<([^>]+)>\s*$/);
 const fromValue=m?`${encodeWord(m[1].trim())} <${m[2]}>`:from;
 return [`From: ${fromValue}`,`To: ${to}`,`Subject: ${encodeWord(subject)}`,`Date: ${new Date().toUTCString()}`,`Message-ID: <${crypto.randomUUID()}@${addressOf(from).split('@')[1]||'buros'}>`,'MIME-Version: 1.0',`Content-Type: multipart/alternative; boundary="${boundary}"`,'',`--${boundary}`,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',b64(text),`--${boundary}`,'Content-Type: text/html; charset=UTF-8','Content-Transfer-Encoding: base64','',b64(html),`--${boundary}--`,''].join('\r\n');
}
// Minimal SMTP client: implicit TLS (port 465, SMTP_SECURE=1) or STARTTLS when the server offers it.
function smtpSend({host,port,secure,user,pass,from,to,message,allowInsecure}){
 return new Promise((resolve,reject)=>{
  let socket,buffer='',waiting=null,tlsActive=!!secure;const timer=setTimeout(()=>fail(Error('SMTP zaman aşımı')),20000);
  const fail=e=>{clearTimeout(timer);try{socket.destroy();}catch{}reject(e);};
  const onData=d=>{buffer+=d.toString('utf8');const lines=buffer.split('\r\n');const done=lines.findIndex(l=>/^\d{3} /.test(l));if(done>=0&&waiting){const reply=lines.slice(0,done+1);buffer=lines.slice(done+1).join('\r\n');const w=waiting;waiting=null;w(reply);}};
  const attach=s=>{socket=s;s.on('data',onData);s.on('error',fail);};
  const read=()=>new Promise(r=>{waiting=r;onData('');});
  const cmd=async(line,expect)=>{if(line!==null)socket.write(line+'\r\n');const reply=await read();const code=Number(reply.at(-1).slice(0,3));if(!expect.includes(code))throw Error(`SMTP ${code}: ${reply.at(-1).slice(4)}`);return reply;};
  (async()=>{
   attach(secure?tls.connect({host,port,servername:host}):net.connect({host,port}));
   await cmd(null,[220]);let ehlo=await cmd('EHLO buros',[250]);
   if(!secure&&ehlo.some(l=>/STARTTLS/i.test(l))){await cmd('STARTTLS',[220]);socket.removeAllListeners('data');attach(tls.connect({socket,servername:host}));tlsActive=true;ehlo=await cmd('EHLO buros',[250]);}
   if(user){if(!tlsActive&&!allowInsecure)throw Error('SMTP sunucusu şifreli bağlantı sunmuyor.');await cmd('AUTH PLAIN '+Buffer.from(`\0${user}\0${pass}`).toString('base64'),[235]);}
   await cmd(`MAIL FROM:<${addressOf(from)}>`,[250]);await cmd(`RCPT TO:<${to}>`,[250,251]);await cmd('DATA',[354]);
   await cmd(message.replace(/\r\n\./g,'\r\n..')+'\r\n.',[250]);socket.write('QUIT\r\n');clearTimeout(timer);socket.end();resolve();
  })().catch(fail);
 });
}
async function deliver(entry,{html:htmlBody,text}){
 if(process.env.SMTP_HOST){
  await smtpSend({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT)||(process.env.SMTP_SECURE==='1'?465:587),secure:process.env.SMTP_SECURE==='1',user:process.env.SMTP_USER,pass:process.env.SMTP_PASS,from:fromHeader(),to:entry.to,allowInsecure:process.env.SMTP_ALLOW_INSECURE==='1',message:mime({from:fromHeader(),to:entry.to,subject:entry.subject,text,html:htmlBody})});
  return 'smtp';
 }
 if(process.env.RESEND_API_KEY){
  const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from:fromHeader(),to:[entry.to],subject:entry.subject,text,html:htmlBody})});
  if(!r.ok)throw Error((await r.text()).slice(0,300));
  return 'resend';
 }
 return null;
}
const provider=()=>process.env.SMTP_HOST?'smtp':process.env.RESEND_API_KEY?'resend':'log';
function createMailer(storage){
 const outbox=storage.collection('outbox');
 outbox.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
 const save=()=>{if(outbox.length>5000)outbox.length=5000;return storage.save('outbox');};
 async function send({to,subject,body,vars={},kind='service',tag='',unsubscribeUrl=''}){
  const s=fill(subject,vars),text=fill(body,vars);
  const entry={id:crypto.randomUUID(),to,subject:s,text,kind,tag,status:'logged',createdAt:new Date().toISOString()};
  outbox.unshift(entry);
  try{const via=await deliver(entry,{text:text+(unsubscribeUrl?`\n\nAbonelikten çık: ${unsubscribeUrl}`:''),html:html(text,{unsubscribeUrl})});if(via){entry.status='sent';entry.via=via;}}
  catch(e){entry.status='failed';entry.error=String(e.message).slice(0,300);console.error('[e-posta]',to,e.message);}
  save();return entry;
 }
 return {send,list:()=>outbox,fill,provider,preview:(text,opts)=>html(text,opts)};
}
module.exports={createMailer,fill,mime,smtpSend};
