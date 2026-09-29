const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
// Every e-mail is recorded in outbox.json. When RESEND_API_KEY is set it is also delivered through
// Resend's HTTP API (no SDK needed); otherwise it stays in the outbox with status "logged".
const read=(f,d)=>fs.existsSync(f)?JSON.parse(fs.readFileSync(f,'utf8')):d;
const write=(f,v)=>{fs.writeFileSync(f+'.tmp',JSON.stringify(v,null,2));fs.renameSync(f+'.tmp',f);};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fill=(tpl,vars)=>String(tpl||'').replace(/\{\{\s*([a-z_]+)\s*\}\}/gi,(_,k)=>vars[k]??'');
function html(text,{unsubscribeUrl}={}){
 const linked=esc(text).replace(/(https?:\/\/[^\s<]+)/g,'<a href="$1" style="color:#56703a">$1</a>');
 const paragraphs=linked.split(/\n{2,}/).map(p=>`<p style="margin:0 0 16px;line-height:1.6">${p.replace(/\n/g,'<br>')}</p>`).join('');
 return `<!doctype html><html lang="tr"><body style="margin:0;background:#f3f4f0;font:15px/1.6 -apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#121a15"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%"><tr><td style="background:#131c16;border-radius:14px 14px 0 0;padding:22px 28px;font:700 22px -apple-system,'Segoe UI',Arial,sans-serif;color:#f7f4e6;letter-spacing:-.5px">bür<span style="color:#adbe8e">OS</span></td></tr><tr><td style="background:#ffffff;border:1px solid #e3e6de;border-top:0;border-radius:0 0 14px 14px;padding:28px">${paragraphs}</td></tr><tr><td style="padding:18px 8px;font-size:12px;color:#838c85;line-height:1.5">Bu e-postayı bürOS hesabınız nedeniyle aldınız.${unsubscribeUrl?` Bilgilendirme e-postalarını almak istemiyorsanız <a href="${esc(unsubscribeUrl)}" style="color:#838c85">abonelikten çıkabilirsiniz</a>.`:''}</td></tr></table></td></tr></table></body></html>`;
}
function createMailer(root){
 const file=path.join(root,'outbox.json');let outbox=read(file,[]);
 const save=()=>write(file,outbox.slice(0,5000));
 async function send({to,subject,body,vars={},kind='service',tag='',unsubscribeUrl=''}){
  const s=fill(subject,vars),text=fill(body,vars);
  const entry={id:crypto.randomUUID(),to,subject:s,text,kind,tag,status:'logged',createdAt:new Date().toISOString()};
  outbox.unshift(entry);
  if(process.env.RESEND_API_KEY){
   try{const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.MAIL_FROM||'bürOS <bildirim@buros.app>',to:[to],subject:s,text:text+(unsubscribeUrl?`\n\nAbonelikten çık: ${unsubscribeUrl}`:''),html:html(text,{unsubscribeUrl})})});entry.status=r.ok?'sent':'failed';if(!r.ok)entry.error=(await r.text()).slice(0,300);}
   catch(e){entry.status='failed';entry.error=e.message;}
  }
  save();return entry;
 }
 return {send,list:()=>outbox,fill,preview:(text,opts)=>html(text,opts)};
}
module.exports={createMailer,fill};
