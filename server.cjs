const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {createAuth}=require('./auth.cjs');
const {createMailer}=require('./mailer.cjs');
const {createAutomations}=require('./automations.cjs');
const {levelFor,visibleState,mergeScoped}=require('./access.cjs');
const {createStorage}=require('./storage.cjs');
const {migrateLegacy}=require('./auth.cjs');
const ROOT = process.env.BUROS_DATA_DIR || path.join(__dirname, '.buros');
const PROD=process.env.NODE_ENV==='production';
const PUBLIC_URL=(process.env.BUROS_PUBLIC_URL||'').replace(/\/$/,'');
const HOST=process.env.HOST||(PROD?'0.0.0.0':'127.0.0.1');
const TRUST_PROXY=process.env.TRUST_PROXY==='1'||PROD;
// Requests must name one of these hosts; localhost always works so health checks and local runs pass.
const allowedHosts=new Set(['localhost','127.0.0.1','[::1]',...(PUBLIC_URL?[new URL(PUBLIC_URL).hostname]:[]),...(process.env.BUROS_ALLOWED_HOSTS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean)]);
// Links inside e-mails need an absolute address; BUROS_PUBLIC_URL wins, otherwise the last host seen.
let seenOrigin='';const publicUrl=()=>PUBLIC_URL||seenOrigin||'http://localhost:3000';
let storage,auth,mailer,automations;
async function init(){
 if(storage)return;
 if(!process.env.DATABASE_URL)migrateLegacy(ROOT);
 storage=await createStorage({root:ROOT});
 auth=createAuth(storage,{publicUrl,emit:(event,payload)=>automations?.fire(event,payload).catch(e=>console.error('otomasyon',e.message))});
 mailer=createMailer(storage);
 automations=createAutomations(storage,{mailer,auth,publicUrl});
 for(const l of storage.collection('leads'))l.id??=crypto.randomUUID();
 storage.save('leads');
}
const leads=()=>storage.collection('leads');
function addLead(entry){const list=leads();if(list.length>=5000){const e=Error('Liste şu an dolu.');e.status=429;throw e;}if(!list.some(x=>x.email===entry.email&&x.plan===entry.plan&&x.type===entry.type)){list.unshift({id:crypto.randomUUID(),...entry,at:new Date().toISOString()});storage.save('leads');}}
const FINANCE_FLOW={id:'finans',name:'Finans',scope:'finance',states:[{id:'planned',name:'Planlandı',progress:0,type:'pending',color:'gray'},{id:'invoiced',name:'Faturalandı',progress:50,type:'active',color:'blue'},{id:'paid',name:'Ödendi',progress:100,type:'completed',color:'green'}]};
// Workspaces are loaded lazily and cached; every change is written through the storage layer.
const states=new Map();
function normalize(s){if(!s)return s;if(!Array.isArray(s.finance))s.finance=[];if(Array.isArray(s.workflows)&&!s.workflows.some(w=>w.scope==='finance'))s.workflows.push(structuredClone(FINANCE_FLOW));for(const p of s.projects||[])if(!Array.isArray(p.files))p.files=[];return s;}
async function load(id){if(!states.has(id))states.set(id,normalize(await storage.loadWorkspace(id)));return states.get(id);}
function store(id,s){states.set(id,s);return storage.saveWorkspace(id,s);}
const publicFiles = {'/':'landing.html','/landing.html':'landing.html','/landing.css':'landing.css','/landing.js':'landing.js','/vendor/three.min.js':'vendor/three.min.js','/app':'index.html','/index.html':'index.html','/app.js':'app.js','/model.mjs':'model.mjs','/calendar.mjs':'calendar.mjs','/style.css':'style.css','/favicon.svg':'favicon.svg','/brand/logo.svg':'brand/logo.svg','/brand/logo-ink.svg':'brand/logo-ink.svg','/brand/mark.svg':'brand/mark.svg','/admin':'admin.html','/admin.js':'admin.js','/hukuki':'legal.html','/hukuki.html':'legal.html'};
const IMAGE_TYPES=['image/png','image/jpeg','image/webp'];
// Responses wait until pending writes reach storage, so a success reply means the change is durable.
async function json(res, code, body) { if(storage){await storage.flush();if(storage.failures()>(res.failBase??0)&&code<400){code=500;body={error:'Değişiklik kaydedilemedi. Lütfen tekrar deneyin.'};}} if(res.headersSent)return; res.writeHead(code, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); res.end(JSON.stringify(body)); }
const CSP="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-src 'self' about:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'";
async function body(req, limit) { const chunks=[]; let size=0; for await (const chunk of req) { size+=chunk.length; if(size>limit) { const e=new Error('Dosya boyutu sınırı aşıldı.'); e.status=413; throw e; } chunks.push(chunk); } return Buffer.concat(chunks); }
const readJson=async(req,limit=16384)=>JSON.parse((await body(req,limit)).toString()||'{}');
function valid(s) {
 const text=v=>typeof v==='string',id=v=>text(v)&&/^[a-z0-9_-]{1,100}$/i.test(v),arr=Array.isArray;
 const unique=list=>new Set(list.map(x=>x.id)).size===list.length;
 const props=list=>arr(list)&&list.every(p=>id(p.id)&&text(p.name)&&['text','number','date','checkbox','select','email','url'].includes(p.type)&&['string','number','boolean'].includes(typeof p.value)&&(!p.options||arr(p.options)&&p.options.every(text)));
 const files=list=>arr(list)&&list.every(f=>id(f.id)&&text(f.name)&&Number.isFinite(f.size)&&f.size>=0&&text(f.createdAt));
 if(!s||s.version!==2||!Number.isInteger(s.revision)||!s.settings||!text(s.settings.name)||!text(s.settings.person)||!text(s.settings.role))return false;
 if(!arr(s.clients)||!s.clients.every(c=>id(c.id)&&text(c.name)&&text(c.contact||'')&&text(c.email||'')&&text(c.phone||''))||!unique(s.clients))return false;
 if(!arr(s.workflows)||!s.workflows.length||!unique(s.workflows)||!s.workflows.every(w=>id(w.id)&&text(w.name)&&arr(w.states)&&w.states.length&&unique(w.states)&&w.states.every(x=>id(x.id)&&text(x.name)&&Number.isFinite(x.progress)&&x.progress>=0&&x.progress<=100&&['pending','active','completed'].includes(x.type)&&['gray','green','blue','purple','orange'].includes(x.color))&&(!w.scope||['items','finance'].includes(w.scope))))return false;
 const financeFlow=s.workflows.filter(w=>w.scope==='finance');if(financeFlow.length>1)return false;const itemFlow=id=>s.workflows.some(w=>w.id===id&&w.scope!=='finance');
 const item=o=>id(o.id)&&text(o.name)&&text(o.owner)&&text(o.notes)&&text(o.date)&&(!o.date||/^\d{4}-\d{2}-\d{2}$/.test(o.date))&&itemFlow(o.workflowId)&&s.workflows.some(w=>w.id===o.workflowId&&w.states.some(x=>x.id===o.stateId))&&props(o.properties)&&files(o.files)&&arr(o.comments)&&o.comments.every(c=>id(c.id)&&text(c.text)&&text(c.author)&&text(c.time));
 if(!arr(s.projects)||!unique(s.projects)||!s.projects.every(p=>id(p.id)&&text(p.name)&&text(p.location)&&s.clients.some(c=>c.id===p.clientId)&&(p.files===undefined||files(p.files))&&(!p.banner||text(p.banner)&&/^[a-f0-9-]{36}$/.test(p.banner))&&arr(p.sections)&&unique(p.sections)&&p.sections.every(g=>id(g.id)&&text(g.name)&&Number.isFinite(g.weight)&&g.weight>0&&arr(g.items)&&unique(g.items)&&g.items.every(item))))return false;
 const itemIds=s.projects.flatMap(p=>p.sections.flatMap(g=>g.items));if(!unique(itemIds))return false;
 if(!arr(s.templates)||!unique(s.templates)||!s.templates.every(t=>id(t.id)&&text(t.name)&&text(t.description)&&arr(t.sections)&&t.sections.every(g=>text(g.name)&&Number.isFinite(g.weight)&&g.weight>0&&arr(g.items)&&g.items.every(o=>text(o.name)&&itemFlow(o.workflowId)&&(!o.properties||arr(o.properties)&&o.properties.every(p=>text(p.name)&&['text','number','date','checkbox','select','email','url'].includes(p.type)&&(!p.options||arr(p.options)&&p.options.every(text))))))))return false;
 const finance=list=>arr(list)&&list.every(f=>id(f.id)&&s.projects.some(p=>p.id===f.projectId)&&['income','expense'].includes(f.type)&&text(f.title)&&f.title.trim()&&Number.isFinite(f.amount)&&f.amount>=0&&text(f.date)&&(!f.date||/^\d{4}-\d{2}-\d{2}$/.test(f.date))&&(financeFlow[0]?financeFlow[0].states.some(x=>x.id===f.status):['planned','invoiced','paid'].includes(f.status))&&text(f.category)&&f.category.trim()&&text(f.notes||'')&&text(f.createdAt)&&text(f.createdBy||''));
 if(!finance(s.finance)||!unique(s.finance))return false;
 return arr(s.activity)&&s.activity.every(a=>text(a.text)&&text(a.time));
}
const siteOfFile=(state,id)=>state?.projects.find(p=>p.banner===id||(p.files||[]).some(f=>f.id===id)||p.sections.some(s=>s.items.some(o=>o.files.some(f=>f.id===id))));
const handler=async(req,res)=>{try{
 res.failBase=storage.failures();
 const host=String(req.headers.host||'').toLowerCase(),proto=TRUST_PROXY&&req.headers['x-forwarded-proto']==='https'||PUBLIC_URL.startsWith('https://')&&TRUST_PROXY?'https':'http';
 req.ip=TRUST_PROXY&&req.headers['x-forwarded-for']?String(req.headers['x-forwarded-for']).split(',')[0].trim():req.socket.remoteAddress;
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');res.setHeader('Content-Security-Policy',CSP);
 if(proto==='https')res.setHeader('Strict-Transport-Security','max-age=31536000; includeSubDomains');
 if(!allowedHosts.has(host.replace(/:\d+$/,'')))return json(res,421,{error:'Bu alan adı için yapılandırılmamış.'});
 if(req.headers.origin){let o=null;try{o=new URL(req.headers.origin);}catch{}if(!o||o.host!==host)return json(res,403,{error:'Geçersiz kaynak.'});}
 const url=new URL(req.url,`http://${host}`),route=url.pathname,method=req.method;if(!PUBLIC_URL)seenOrigin=`${proto}://${host}`;
 if(route==='/healthz'){try{return json(res,200,{ok:true,...await storage.health()});}catch(e){return json(res,503,{ok:false,error:e.message});}}
 if(route==='/api/session'&&method==='GET')return json(res,200,auth.info(req));
 if(route==='/api/waitlist'&&method==='POST'){const v=await readJson(req,2048);const email=String(v.email||'').trim().toLowerCase().slice(0,200);if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))return json(res,400,{error:'Geçerli bir e-posta adresi yazın.'});addLead({type:'demo',email,plan:['ekip','buro','kurumsal'].includes(v.plan)?v.plan:'buro',company:String(v.company||'').trim().slice(0,120)});return json(res,201,{ok:true});}
 if(route==='/abonelik'&&method==='GET'){const ok=auth.unsubscribe(url.searchParams.get('t')||'');res.writeHead(ok?200:404,{'Content-Type':'text/html; charset=utf-8'});return res.end(`<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>bürOS</title><body style="font:16px/1.6 system-ui,sans-serif;background:#f3f4f0;color:#121a15;display:grid;place-items:center;min-height:100vh;margin:0"><div style="max-width:440px;padding:32px;background:#fff;border:1px solid #e3e6de;border-radius:14px"><h1 style="font-size:20px;margin:0 0 8px">${ok?'Abonelikten çıktınız':'Bağlantı geçersiz'}</h1><p style="margin:0;color:#4d5850">${ok?'Artık bilgilendirme ve kampanya e-postası göndermeyeceğiz. Hesabınızla ilgili zorunlu bildirimler gelmeye devam eder.':'Bu bağlantı artık geçerli değil.'}</p></div>`);}
 if(route.startsWith('/api/invites/')&&route!=='/api/invites/accept'&&method==='GET')return json(res,200,auth.invitation(route.split('/').pop()));
 if(route==='/api/signup'&&method==='POST')return json(res,201,auth.signup(await readJson(req),req,res));
 if(route==='/api/login'&&method==='POST')return json(res,200,auth.login(await readJson(req),req,res));
 if(route==='/api/logout'&&method==='POST'){auth.logout(req,res);return json(res,200,{ok:true});}
 if(route==='/api/password/forgot'&&method==='POST')return json(res,200,auth.requestPasswordReset(await readJson(req),req));
 if(route==='/api/password/reset'&&method==='POST')return json(res,200,auth.resetPassword(await readJson(req),res));
 if(route==='/api/email/verify'&&method==='POST')return json(res,200,auth.verifyEmail(await readJson(req)));
 if(!route.startsWith('/api/'))return serveStatic(url,req,res);
 const ctx=auth.context(req);
 if(!ctx.account)return json(res,401,{error:'Devam etmek için oturum açın.'});
 if(route.startsWith('/api/admin/')){if(!auth.isPlatformAdmin(ctx.account))return json(res,403,{error:'Bu alan yalnızca platform yöneticileri içindir.'});return adminRoutes(route,method,url,req,res,ctx.account);}
 if(route==='/api/email/resend'&&method==='POST')return json(res,200,auth.resendVerification(req));
 if(route==='/api/account'&&method==='POST')return json(res,200,auth.updateAccount(await readJson(req),req));
 if(route==='/api/invites/accept'&&method==='POST')return json(res,200,auth.acceptInvitation(await readJson(req),req));
 if(route==='/api/spaces'&&method==='POST')return json(res,201,auth.createSpace(await readJson(req),req));
 if(route==='/api/spaces/join'&&method==='POST')return json(res,200,auth.joinSpace(await readJson(req),req));
 if(route==='/api/spaces/select'&&method==='POST')return json(res,200,auth.selectSpace(await readJson(req),req));
 if(route==='/api/spaces/leave'&&method==='POST')return json(res,200,auth.leaveSpace(req));
 const {actor,space}=ctx;
 if(!space)return json(res,409,{error:'Önce bir çalışma alanı oluşturun veya birine katılın.',code:'no-space'});
 let state=await load(space.id);const bill=auth.billing(space);
 const readOnly=()=>json(res,402,{error:'Deneme süreniz sona erdi. Çalışma alanı salt okunur; devam etmek için bir plan seçin.',code:'trial-expired'});
 if(bill.expired&&method!=='GET'&&!['/api/billing/upgrade','/api/spaces/invite'].includes(route))return readOnly();
 if(route==='/api/billing/upgrade'&&method==='POST'){const v=await readJson(req);addLead({type:'upgrade',email:ctx.account.email,name:ctx.account.name,plan:['ekip','buro','kurumsal'].includes(v.plan)?v.plan:'buro',company:space.name,spaceId:space.id});return json(res,200,{ok:true});}
 if(route==='/api/spaces/invitations'&&method==='POST'){if(actor.role!=='admin')return json(res,403,{error:'Davetleri yalnızca yönetici gönderebilir.'});return json(res,200,auth.inviteByEmail(await readJson(req,32768),actor,space));}
 if(route==='/api/spaces/invitations/revoke'&&method==='POST'){if(actor.role!=='admin')return json(res,403,{error:'Davetleri yalnızca yönetici yönetebilir.'});return json(res,200,auth.revokeInvitation((await readJson(req)).id,space));}
 if(route==='/api/spaces/profile'&&method==='POST'){if(actor.role!=='admin')return json(res,403,{error:'Şirket bilgilerini yalnızca yönetici düzenleyebilir.'});const out=auth.updateSpaceProfile(await readJson(req),space);if(state&&state.settings.name!==space.name){state.settings.name=space.name;state.revision++;await store(space.id,state);}return json(res,200,{...out,revision:state?.revision});}
 if(route==='/api/spaces/invite'&&method==='POST'){if(actor.role!=='admin')return json(res,403,{error:'Davet kodunu yalnızca yönetici yönetebilir.'});return json(res,200,auth.invite(await readJson(req),space));}
 if(route==='/api/users'){
  if(actor.role!=='admin')return json(res,403,{error:'Yalnızca yönetici ekip ve erişim izinlerini düzenleyebilir.'});
  if(method==='GET')return json(res,200,auth.members(space));
  if(method==='POST'){const v=await readJson(req,65536);if(!state)return json(res,400,{error:'Önce çalışma alanını oluşturun.'});return json(res,200,auth.updateMember(v,actor,space,state));}
 }
 if(route==='/api/state'&&method==='GET')return json(res,200,visibleState(state,actor));
 if(route==='/api/state'&&method==='PUT'){
 let incoming=normalize(await readJson(req,8*1024*1024));
 if(!valid(incoming))return json(res,400,{error:'Geçersiz çalışma alanı verisi.'});
 if(state && incoming.revision!==state.revision)return json(res,409,{error:'Başka bir sekme verileri güncelledi. Yerel değişikliklerini dışa aktar, ardından sayfayı yenile.'});
 if(!state&&actor.role!=='admin')return json(res,403,{error:'Çalışma alanını yalnızca yönetici oluşturabilir.'});
 if(state)incoming=mergeScoped(state,incoming,actor);
 if(!valid(incoming))return json(res,400,{error:"Birleştirilmiş çalışma alanı geçersiz veya kayıt kimlikleri çakışıyor."});
 if(incoming.clients.some(c=>!incoming.projects.some(p=>p.clientId===c.id)))return json(res,400,{error:'Her müşteri en az bir şantiyeye bağlı olmalı. Müşteriyi yeni şantiye ile birlikte oluşturun.'});
 const owned=async(id,check)=>{if(!/^[a-f0-9-]{36}$/.test(id))return false;const m=await storage.files.meta(space.id,id);return !!m&&check(m);};
 for(const p of incoming.projects){
  const old=state?.projects.find(x=>x.id===p.id);
  if(p.banner&&p.banner!==old?.banner&&!await owned(p.banner,m=>m.kind==='banner'&&m.projectId===p.id))return json(res,403,{error:'Görsel bu şantiyeye ait değil.'});
  for(const f of p.files||[])if(!old?.files?.some(x=>x.id===f.id)&&!await owned(f.id,m=>m.projectId===p.id&&!m.objectId&&m.kind!=='banner'))return json(res,403,{error:'Dosya bu şantiyeye ait değil.'});
  for(const section of p.sections)for(const o of section.items)for(const f of o.files){
   const previous=state?.projects.flatMap(x=>x.sections.flatMap(g=>g.items)).find(x=>x.id===o.id)?.files.some(x=>x.id===f.id);
   if(!previous&&!await owned(f.id,m=>m.objectId===o.id))return json(res,403,{error:'Dosya bu kayda ait değil.'});
  }
 }
 incoming.revision=(state?.revision||0)+1;await store(space.id,incoming);if(actor.role==='admin')auth.rename(space,incoming.settings.name);
 return json(res,200,{revision:incoming.revision});}
 if(route==='/api/files'&&method==='POST'){
 const objectId=url.searchParams.get('objectId'),kind=url.searchParams.get('kind')==='banner'?'banner':'file';
 const site=objectId?state?.projects.find(p=>p.sections.some(s=>s.items.some(o=>o.id===objectId))):state?.projects.find(p=>p.id===url.searchParams.get('projectId'));
 if(levelFor(actor,site)!=='edit')return json(res,403,{error:'Bu alana dosya yükleme izniniz yok.'});
 const type=String(req.headers['content-type']||'').split(';')[0].trim().toLowerCase();
 if(kind==='banner'&&(objectId||!IMAGE_TYPES.includes(type)))return json(res,400,{error:'Görsel PNG, JPEG veya WebP olmalı.'});
 const name=String(url.searchParams.get('name')||'dosya').slice(0,200);const bytes=await body(req,(kind==='banner'?8:25)*1024*1024);if(!bytes.length)return json(res,400,{error:'Boş dosya yüklenemez.'});
 const id=crypto.randomUUID();const meta={id,name,size:bytes.length,createdAt:new Date().toISOString(),objectId:objectId||null,projectId:site.id,kind,type:IMAGE_TYPES.includes(type)?type:'',uploadedBy:actor.id};await storage.files.put(space.id,id,bytes,meta);return json(res,201,meta);}
 if(route.startsWith('/api/files/')&&method==='GET'){
 const id=route.split('/').pop();if(!/^[a-f0-9-]{36}$/.test(id))return json(res,404,{error:'Dosya bulunamadı.'});if(!levelFor(actor,siteOfFile(state,id)))return json(res,404,{error:'Dosya bulunamadı.'});const meta=await storage.files.meta(space.id,id),stream=meta&&await storage.files.open(space.id,id);if(!stream)return json(res,404,{error:'Dosya bulunamadı.'});const inline=meta.type&&url.searchParams.has('inline');res.writeHead(200,{'Content-Type':inline?meta.type:'application/octet-stream','Content-Disposition':`${inline?'inline':'attachment'}; filename*=UTF-8''${encodeURIComponent(meta.name)}`,'Content-Length':meta.size,'Cache-Control':'private, max-age=3600'});stream.on('error',()=>res.destroy());return stream.pipe(res);}
 return json(res,404,{error:'Bulunamadı.'});
 }catch(e){json(res,e.status||400,{error:e.message||'İşlem tamamlanamadı.'});}};

// Platform administration: every tenant, account, lead, e-mail and automation.
async function adminRoutes(route,method,url,req,res,me){
 const {accounts,spaces}=auth.all(),DAY=864e5,ago=d=>Date.now()-d*DAY;
 const spaceRow=async s=>{const b=auth.billing(s),owner=accounts.find(a=>a.id===s.createdBy)||accounts.find(a=>s.members.some(m=>m.userId===a.id&&m.role==='admin'));let projects=0;try{projects=(await load(s.id))?.projects.length||0;}catch{}return {id:s.id,name:s.name,createdAt:s.createdAt,owner:owner?{name:owner.name,email:owner.email,phone:owner.phone||''}:null,members:s.members.filter(m=>!m.disabled).length,pendingInvites:s.invitations.filter(i=>!i.acceptedAt).length,profile:s.profile,projects,...b};};
 const accountRow=a=>({id:a.id,name:a.name,email:a.email,phone:a.phone||'',title:a.title||'',source:a.source||'',marketingConsent:!!a.marketingConsent,createdAt:a.createdAt,lastLoginAt:a.lastLoginAt||null,disabled:!!a.disabled,platformAdmin:auth.isPlatformAdmin(a),spaces:spaces.filter(s=>s.members.some(m=>m.userId===a.id)).map(s=>({id:s.id,name:s.name,role:s.members.find(m=>m.userId===a.id).role}))});
 if(route==='/api/admin/overview'&&method==='GET'){
  const days=Array.from({length:30},(_,i)=>{const d=new Date(Date.now()-(29-i)*DAY).toISOString().slice(0,10);return {date:d,signups:accounts.filter(a=>(a.createdAt||'').startsWith(d)).length};});
  const rows=spaces.map(s=>auth.billing(s));
  return json(res,200,{accounts:accounts.length,newAccounts7:accounts.filter(a=>new Date(a.createdAt).getTime()>ago(7)).length,active7:accounts.filter(a=>a.lastLoginAt&&new Date(a.lastLoginAt).getTime()>ago(7)).length,consented:accounts.filter(a=>a.marketingConsent).length,spaces:spaces.length,trialActive:rows.filter(b=>b.plan==='trial'&&!b.expired).length,trialExpired:rows.filter(b=>b.expired).length,paid:rows.filter(b=>b.plan!=='trial').length,plans:['trial','ekip','buro','kurumsal'].map(p=>({plan:p,count:rows.filter(b=>b.plan===p).length})),leads:leads().length,emails:mailer.list().length,mailProvider:mailer.provider(),storage:storage.kind,files:storage.filesKind,publicUrl:publicUrl(),days});
 }
 if(route==='/api/admin/accounts'&&method==='GET')return json(res,200,accounts.map(accountRow));
 if(route==='/api/admin/accounts.csv'&&method==='GET'){const q=v=>`"${String(v??'').replace(/"/g,'""')}"`;const rows=[['Ad','E-posta','Telefon','Unvan','Kaynak','Pazarlama izni','Kayıt','Son giriş','Çalışma alanları'],...accounts.map(accountRow).map(a=>[a.name,a.email,a.phone,a.title,a.source,a.marketingConsent?'Evet':'Hayır',a.createdAt,a.lastLoginAt||'',a.spaces.map(s=>s.name).join('; ')])];res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="buros-kullanicilar.csv"'});return res.end('﻿'+rows.map(r=>r.map(q).join(';')).join('\n'));}
 const accountMatch=route.match(/^\/api\/admin\/accounts\/([\w-]+)$/);
 if(accountMatch&&method==='POST')return json(res,200,auth.setAccount(accountMatch[1],await readJson(req),me));
 if(route==='/api/admin/spaces'&&method==='GET')return json(res,200,await Promise.all(spaces.map(spaceRow)));
 const spaceMatch=route.match(/^\/api\/admin\/spaces\/([\w-]+)$/);
 if(spaceMatch&&method==='POST'){auth.setPlan(spaceMatch[1],await readJson(req));return json(res,200,await spaceRow(spaces.find(s=>s.id===spaceMatch[1])));}
 if(route==='/api/admin/leads'&&method==='GET')return json(res,200,leads());
 if(route==='/api/admin/outbox'&&method==='GET')return json(res,200,mailer.list().slice(0,300));
 if(route==='/api/admin/automations'&&method==='GET')return json(res,200,{rules:automations.rules(),stats:automations.stats(),segments:Object.entries(automations.segments).map(([id,name])=>({id,name,count:automations.audience(id).length})),campaigns:automations.campaigns()});
 const ruleMatch=route.match(/^\/api\/admin\/automations\/([\w-]+)$/);
 if(ruleMatch&&method==='POST'){if(ruleMatch[1]==='run')return json(res,200,await automations.tick());return json(res,200,automations.updateRule(ruleMatch[1],await readJson(req,32768)));}
 if(route==='/api/admin/campaigns'&&method==='POST')return json(res,201,await automations.campaign(await readJson(req,32768),me));
 if(route==='/api/admin/preview'&&method==='POST'){const v=await readJson(req,32768);const a=accounts.find(x=>x.id===me.id);res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(mailer.preview(mailer.fill(v.body,{ad:(a.name||'').split(' ')[0],ad_soyad:a.name,eposta:a.email,firma:'Örnek Mimarlık',uygulama:`${publicUrl()}/app`,deneme_bitis:new Date(Date.now()+14*DAY).toLocaleDateString('tr-TR',{day:'numeric',month:'long',year:'numeric'}),kalan_gun:'3',davet_eden:a.name,davet_linki:`${publicUrl()}/app#davet=ornek`}),{unsubscribeUrl:v.kind==='marketing'?`${publicUrl()}/abonelik?t=ornek`:''}));}
 return json(res,404,{error:'Bulunamadı.'});
}
// Legal page: company details come from the environment so the texts never need hand editing.
// Anything missing stays visibly marked and the page shows a draft notice naming the variables.
const LEGAL_FIELDS={SIRKET:['BUROS_COMPANY','Şirket unvanı'],ADRES:['BUROS_COMPANY_ADDRESS','Adres'],MERSIS:['BUROS_MERSIS','MERSİS no'],KEP:['BUROS_KEP','KEP adresi'],KVKK_EPOSTA:['BUROS_KVKK_EMAIL','kvkk@alanadiniz.com'],DESTEK_EPOSTA:['BUROS_SUPPORT_EMAIL','destek@alanadiniz.com'],BARINDIRMA:['BUROS_HOSTING','Barındırma sağlayıcısı ve ülkesi'],EPOSTA_SAGLAYICI:['BUROS_MAIL_SERVICE','E-posta sağlayıcısı ve ülkesi'],YETKILI_MAHKEME:['BUROS_COURT','İl (adliye)']};
function legalPage(){
 const esc=v=>String(v).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),missing=[],hours=Number(process.env.SESSION_HOURS)||168;
 const vals={GUNCELLEME:esc(process.env.BUROS_LEGAL_DATE||'1 Ekim 2026'),YIL:String(new Date().getFullYear()),SIRKET_KISA:esc(process.env.BUROS_COMPANY_SHORT||'bürOS'),SAKLAMA_GUN:String(Number(process.env.BUROS_RETENTION_DAYS)||90),OTURUM_SURESI:hours%24?hours+' saat':hours/24+' gün',ALAN_ADI:PUBLIC_URL?esc(new URL(PUBLIC_URL).host):'<mark>[alan adı]</mark>'};
 for(const [k,[env,label]] of Object.entries(LEGAL_FIELDS)){const v=(process.env[env]||'').trim();if(v)vals[k]=esc(v);else{missing.push(env);vals[k]=`<mark>[${label}]</mark>`;}}
 vals.TASLAK=missing.length?`<div class="draft"><b>Eksik bilgi.</b> İşaretli alanlar (<mark>[…]</mark>) sunucu ortam değişkenlerinden doldurulur: ${missing.map(m=>'<code>'+m+'</code>').join(', ')}. Yayından önce metinleri bir hukuk danışmanına gözden geçirtin.</div>`:'';
 return fs.readFileSync(path.join(__dirname,'legal.html'),'utf8').replace(/\{\{([A-Z_]+)\}\}/g,(m,k)=>vals[k]??m);
}
function serveStatic(url,req,res){const file=publicFiles[url.pathname];if(!file||!['GET','HEAD'].includes(req.method))return json(res,404,{error:'Bulunamadı.'});
 if(file==='legal.html'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'});return res.end(req.method==='HEAD'?undefined:legalPage());}const type=file.endsWith('.css')?'text/css':file.endsWith('.js')||file.endsWith('.mjs')?'text/javascript':file.endsWith('.svg')?'image/svg+xml':'text/html';res.writeHead(200,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-cache'});if(req.method==='HEAD')return res.end();fs.createReadStream(path.join(__dirname,file)).on('error',()=>res.end()).pipe(res);}
// Starts the HTTP server. In production it binds 0.0.0.0 behind a reverse proxy that terminates TLS.
async function start(port=Number(process.env.PORT)||3000){
 await init();
 if(PROD&&!PUBLIC_URL)console.warn('Uyarı: BUROS_PUBLIC_URL tanımlı değil; e-posta bağlantıları yanlış adrese gidebilir.');
 const server=http.createServer(handler);server.requestTimeout=120000;server.headersTimeout=65000;server.keepAliveTimeout=61000;
 await new Promise(r=>server.listen(port,HOST,r));
 console.log(`BürOS hazır: http://${HOST==='0.0.0.0'?'localhost':HOST}:${port} · depolama: ${storage.kind} · dosyalar: ${storage.filesKind} · e-posta: ${mailer.provider()}`);
 // Some systems resolve "localhost" to ::1 first; an IPv6 loopback listener avoids a refused connection there.
 if(HOST==='127.0.0.1'){const v6=http.createServer(handler);v6.on('error',()=>{});v6.listen(port,'::1');}
 const run=()=>automations.tick().catch(e=>console.error('otomasyon',e.message));setTimeout(run,5000).unref();setInterval(run,3600000).unref();
 let closing=false;const shutdown=async sig=>{if(closing)return;closing=true;console.log(`${sig} alındı, kapatılıyor…`);server.close();setTimeout(()=>process.exit(1),10000).unref();try{await storage.close();}catch(e){console.error(e.message);}process.exit(0);};
 process.on('SIGTERM',()=>shutdown('SIGTERM'));process.on('SIGINT',()=>shutdown('SIGINT'));
 return server;
}
if(require.main===module)start().catch(e=>{console.error('Sunucu başlatılamadı:',e.message);process.exit(1);});
module.exports={init,start,handler,valid,FINANCE_FLOW,app:()=>({storage,auth,mailer,automations})};
