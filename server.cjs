const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {createAuth}=require('./auth.cjs');
const {createMailer}=require('./mailer.cjs');
const {createAutomations}=require('./automations.cjs');
const {levelFor,visibleState,mergeScoped}=require('./access.cjs');
const ROOT = process.env.BUROS_DATA_DIR || path.join(__dirname, '.buros');
fs.mkdirSync(ROOT, { recursive: true });
// Links inside e-mails need an absolute address; BUROS_PUBLIC_URL wins, otherwise the last host seen.
let seenOrigin='';const publicUrl=()=>(process.env.BUROS_PUBLIC_URL||seenOrigin||'http://localhost:3000').replace(/\/$/,'');
let automations;
const auth=createAuth(ROOT,{publicUrl,emit:(event,payload)=>automations?.fire(event,payload).catch(e=>console.error('otomasyon',e.message))});
const mailer=createMailer(ROOT);
automations=createAutomations(ROOT,{mailer,auth,publicUrl});
const readList=f=>fs.existsSync(path.join(ROOT,f))?JSON.parse(fs.readFileSync(path.join(ROOT,f),'utf8')):[];
function addLead(entry){const file=path.join(ROOT,'leads.json'),list=readList('leads.json');if(list.length>=5000){const e=Error('Liste şu an dolu.');e.status=429;throw e;}if(!list.some(x=>x.email===entry.email&&x.plan===entry.plan&&x.type===entry.type)){list.unshift({...entry,at:new Date().toISOString()});fs.writeFileSync(file+'.tmp',JSON.stringify(list,null,2));fs.renameSync(file+'.tmp',file);}}
const FINANCE_FLOW={id:'finans',name:'Finans',scope:'finance',states:[{id:'planned',name:'Planlandı',progress:0,type:'pending',color:'gray'},{id:'invoiced',name:'Faturalandı',progress:50,type:'active',color:'blue'},{id:'paid',name:'Ödendi',progress:100,type:'completed',color:'green'}]};
// Each space keeps its own workspace.json and files/ directory; states are loaded lazily and cached.
const states=new Map();
function normalize(s){if(!s)return s;if(!Array.isArray(s.finance))s.finance=[];if(Array.isArray(s.workflows)&&!s.workflows.some(w=>w.scope==='finance'))s.workflows.push(structuredClone(FINANCE_FLOW));for(const p of s.projects||[])if(!Array.isArray(p.files))p.files=[];return s;}
const statePath=id=>path.join(auth.dirFor(id),'workspace.json'),filesDir=id=>path.join(auth.dirFor(id),'files');
function load(id){if(!states.has(id)){fs.mkdirSync(filesDir(id),{recursive:true});states.set(id,fs.existsSync(statePath(id))?normalize(JSON.parse(fs.readFileSync(statePath(id),'utf8'))):null);}return states.get(id);}
function store(id,s){fs.writeFileSync(statePath(id)+'.tmp',JSON.stringify(s,null,2));fs.renameSync(statePath(id)+'.tmp',statePath(id));states.set(id,s);}
const publicFiles = {'/':'landing.html','/landing.html':'landing.html','/landing.css':'landing.css','/landing.js':'landing.js','/vendor/three.min.js':'vendor/three.min.js','/app':'index.html','/index.html':'index.html','/app.js':'app.js','/model.mjs':'model.mjs','/calendar.mjs':'calendar.mjs','/style.css':'style.css','/favicon.svg':'favicon.svg','/brand/logo.svg':'brand/logo.svg','/brand/logo-ink.svg':'brand/logo-ink.svg','/brand/mark.svg':'brand/mark.svg','/admin':'admin.html','/admin.js':'admin.js','/hukuki':'legal.html','/hukuki.html':'legal.html'};
const IMAGE_TYPES=['image/png','image/jpeg','image/webp'];
function json(res, code, body) { res.writeHead(code, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); res.end(JSON.stringify(body)); }
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
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY'); const host=req.headers.host||'';
 if(!/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host))return json(res,403,{error:'Yerel bağlantı gerekli.'});
 if(req.headers.origin && req.headers.origin!==`http://${host}`)return json(res,403,{error:'Geçersiz kaynak.'});
 const url=new URL(req.url,`http://${host}`),route=url.pathname,method=req.method;seenOrigin=`http://${host}`;
 if(route==='/api/session'&&method==='GET')return json(res,200,auth.info(req));
 if(route==='/api/waitlist'&&method==='POST'){const v=await readJson(req,2048);const email=String(v.email||'').trim().toLowerCase().slice(0,200);if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))return json(res,400,{error:'Geçerli bir e-posta adresi yazın.'});addLead({type:'demo',email,plan:['ekip','buro','kurumsal'].includes(v.plan)?v.plan:'buro',company:String(v.company||'').trim().slice(0,120)});return json(res,201,{ok:true});}
 if(route==='/abonelik'&&method==='GET'){const ok=auth.unsubscribe(url.searchParams.get('t')||'');res.writeHead(ok?200:404,{'Content-Type':'text/html; charset=utf-8'});return res.end(`<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>bürOS</title><body style="font:16px/1.6 system-ui,sans-serif;background:#f3f4f0;color:#121a15;display:grid;place-items:center;min-height:100vh;margin:0"><div style="max-width:440px;padding:32px;background:#fff;border:1px solid #e3e6de;border-radius:14px"><h1 style="font-size:20px;margin:0 0 8px">${ok?'Abonelikten çıktınız':'Bağlantı geçersiz'}</h1><p style="margin:0;color:#4d5850">${ok?'Artık bilgilendirme ve kampanya e-postası göndermeyeceğiz. Hesabınızla ilgili zorunlu bildirimler gelmeye devam eder.':'Bu bağlantı artık geçerli değil.'}</p></div>`);}
 if(route.startsWith('/api/invites/')&&route!=='/api/invites/accept'&&method==='GET')return json(res,200,auth.invitation(route.split('/').pop()));
 if(route==='/api/signup'&&method==='POST')return json(res,201,auth.signup(await readJson(req),req,res));
 if(route==='/api/login'&&method==='POST')return json(res,200,auth.login(await readJson(req),req,res));
 if(route==='/api/logout'&&method==='POST'){auth.logout(req,res);return json(res,200,{ok:true});}
 if(!route.startsWith('/api/'))return serveStatic(url,req,res);
 const ctx=auth.context(req);
 if(!ctx.account)return json(res,401,{error:'Devam etmek için oturum açın.'});
 if(route.startsWith('/api/admin/')){if(!auth.isPlatformAdmin(ctx.account))return json(res,403,{error:'Bu alan yalnızca platform yöneticileri içindir.'});return adminRoutes(route,method,url,req,res,ctx.account);}
 if(route==='/api/account'&&method==='POST')return json(res,200,auth.updateAccount(await readJson(req),req));
 if(route==='/api/invites/accept'&&method==='POST')return json(res,200,auth.acceptInvitation(await readJson(req),req));
 if(route==='/api/spaces'&&method==='POST')return json(res,201,auth.createSpace(await readJson(req),req));
 if(route==='/api/spaces/join'&&method==='POST')return json(res,200,auth.joinSpace(await readJson(req),req));
 if(route==='/api/spaces/select'&&method==='POST')return json(res,200,auth.selectSpace(await readJson(req),req));
 if(route==='/api/spaces/leave'&&method==='POST')return json(res,200,auth.leaveSpace(req));
 const {actor,space}=ctx;
 if(!space)return json(res,409,{error:'Önce bir çalışma alanı oluşturun veya birine katılın.',code:'no-space'});
 let state=load(space.id);const dir=filesDir(space.id),bill=auth.billing(space);
 const readOnly=()=>json(res,402,{error:'Deneme süreniz sona erdi. Çalışma alanı salt okunur; devam etmek için bir plan seçin.',code:'trial-expired'});
 if(bill.expired&&method!=='GET'&&!['/api/billing/upgrade','/api/spaces/invite'].includes(route))return readOnly();
 if(route==='/api/billing/upgrade'&&method==='POST'){const v=await readJson(req);addLead({type:'upgrade',email:ctx.account.email,name:ctx.account.name,plan:['ekip','buro','kurumsal'].includes(v.plan)?v.plan:'buro',company:space.name,spaceId:space.id});return json(res,200,{ok:true});}
 if(route==='/api/spaces/invitations'&&method==='POST'){if(actor.role!=='admin')return json(res,403,{error:'Davetleri yalnızca yönetici gönderebilir.'});return json(res,200,auth.inviteByEmail(await readJson(req,32768),actor,space));}
 if(route==='/api/spaces/invitations/revoke'&&method==='POST'){if(actor.role!=='admin')return json(res,403,{error:'Davetleri yalnızca yönetici yönetebilir.'});return json(res,200,auth.revokeInvitation((await readJson(req)).id,space));}
 if(route==='/api/spaces/profile'&&method==='POST'){if(actor.role!=='admin')return json(res,403,{error:'Şirket bilgilerini yalnızca yönetici düzenleyebilir.'});const out=auth.updateSpaceProfile(await readJson(req),space);if(state&&state.settings.name!==space.name){state.settings.name=space.name;state.revision++;store(space.id,state);}return json(res,200,{...out,revision:state?.revision});}
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
 const meta=id=>{const f=path.join(dir,id+'.json');return fs.existsSync(f)?JSON.parse(fs.readFileSync(f,'utf8')):null;};
 const owned=(id,check)=>{const m=/^[a-f0-9-]{36}$/.test(id)&&meta(id);return !!m&&check(m);};
 for(const p of incoming.projects){
  const old=state?.projects.find(x=>x.id===p.id);
  if(p.banner&&p.banner!==old?.banner&&!owned(p.banner,m=>m.kind==='banner'&&m.projectId===p.id))return json(res,403,{error:'Görsel bu şantiyeye ait değil.'});
  for(const f of p.files||[])if(!old?.files?.some(x=>x.id===f.id)&&!owned(f.id,m=>m.projectId===p.id&&!m.objectId&&m.kind!=='banner'))return json(res,403,{error:'Dosya bu şantiyeye ait değil.'});
  for(const section of p.sections)for(const o of section.items)for(const f of o.files){
   const previous=state?.projects.flatMap(x=>x.sections.flatMap(g=>g.items)).find(x=>x.id===o.id)?.files.some(x=>x.id===f.id);
   if(!previous&&!owned(f.id,m=>m.objectId===o.id))return json(res,403,{error:'Dosya bu kayda ait değil.'});
  }
 }
 incoming.revision=(state?.revision||0)+1;store(space.id,incoming);if(actor.role==='admin')auth.rename(space,incoming.settings.name);
 return json(res,200,{revision:incoming.revision});}
 if(route==='/api/files'&&method==='POST'){
 const objectId=url.searchParams.get('objectId'),kind=url.searchParams.get('kind')==='banner'?'banner':'file';
 const site=objectId?state?.projects.find(p=>p.sections.some(s=>s.items.some(o=>o.id===objectId))):state?.projects.find(p=>p.id===url.searchParams.get('projectId'));
 if(levelFor(actor,site)!=='edit')return json(res,403,{error:'Bu alana dosya yükleme izniniz yok.'});
 const type=String(req.headers['content-type']||'').split(';')[0].trim().toLowerCase();
 if(kind==='banner'&&(objectId||!IMAGE_TYPES.includes(type)))return json(res,400,{error:'Görsel PNG, JPEG veya WebP olmalı.'});
 const name=String(url.searchParams.get('name')||'dosya').slice(0,200);const bytes=await body(req,(kind==='banner'?8:25)*1024*1024);if(!bytes.length)return json(res,400,{error:'Boş dosya yüklenemez.'});
 const id=crypto.randomUUID();fs.writeFileSync(path.join(dir,id),bytes,{flag:'wx'});const meta={id,name,size:bytes.length,createdAt:new Date().toISOString(),objectId:objectId||null,projectId:site.id,kind,type:IMAGE_TYPES.includes(type)?type:'',uploadedBy:actor.id};fs.writeFileSync(path.join(dir,id+'.json'),JSON.stringify(meta));return json(res,201,meta);}
 if(route.startsWith('/api/files/')&&method==='GET'){
 const id=route.split('/').pop();if(!/^[a-f0-9-]{36}$/.test(id))return json(res,404,{error:'Dosya bulunamadı.'});if(!levelFor(actor,siteOfFile(state,id)))return json(res,404,{error:'Dosya bulunamadı.'});const file=path.join(dir,id);if(!fs.existsSync(file+'.json'))return json(res,404,{error:'Dosya bulunamadı.'});const meta=JSON.parse(fs.readFileSync(file+'.json','utf8'));const inline=meta.type&&url.searchParams.has('inline');res.writeHead(200,{'Content-Type':inline?meta.type:'application/octet-stream','Content-Disposition':`${inline?'inline':'attachment'}; filename*=UTF-8''${encodeURIComponent(meta.name)}`,'Content-Length':meta.size,'Cache-Control':'private, max-age=3600'});return fs.createReadStream(file).pipe(res);}
 return json(res,404,{error:'Bulunamadı.'});
 }catch(e){json(res,e.status||400,{error:e.message||'İşlem tamamlanamadı.'});}};

// Platform administration: every tenant, account, lead, e-mail and automation.
async function adminRoutes(route,method,url,req,res,me){
 const {accounts,spaces}=auth.all(),DAY=864e5,ago=d=>Date.now()-d*DAY;
 const spaceRow=s=>{const b=auth.billing(s),owner=accounts.find(a=>a.id===s.createdBy)||accounts.find(a=>s.members.some(m=>m.userId===a.id&&m.role==='admin'));let projects=0;try{projects=load(s.id)?.projects.length||0;}catch{}return {id:s.id,name:s.name,createdAt:s.createdAt,owner:owner?{name:owner.name,email:owner.email,phone:owner.phone||''}:null,members:s.members.filter(m=>!m.disabled).length,pendingInvites:s.invitations.filter(i=>!i.acceptedAt).length,profile:s.profile,projects,...b};};
 const accountRow=a=>({id:a.id,name:a.name,email:a.email,phone:a.phone||'',title:a.title||'',source:a.source||'',marketingConsent:!!a.marketingConsent,createdAt:a.createdAt,lastLoginAt:a.lastLoginAt||null,disabled:!!a.disabled,platformAdmin:auth.isPlatformAdmin(a),spaces:spaces.filter(s=>s.members.some(m=>m.userId===a.id)).map(s=>({id:s.id,name:s.name,role:s.members.find(m=>m.userId===a.id).role}))});
 if(route==='/api/admin/overview'&&method==='GET'){
  const days=Array.from({length:30},(_,i)=>{const d=new Date(Date.now()-(29-i)*DAY).toISOString().slice(0,10);return {date:d,signups:accounts.filter(a=>(a.createdAt||'').startsWith(d)).length};});
  const rows=spaces.map(s=>auth.billing(s));
  return json(res,200,{accounts:accounts.length,newAccounts7:accounts.filter(a=>new Date(a.createdAt).getTime()>ago(7)).length,active7:accounts.filter(a=>a.lastLoginAt&&new Date(a.lastLoginAt).getTime()>ago(7)).length,consented:accounts.filter(a=>a.marketingConsent).length,spaces:spaces.length,trialActive:rows.filter(b=>b.plan==='trial'&&!b.expired).length,trialExpired:rows.filter(b=>b.expired).length,paid:rows.filter(b=>b.plan!=='trial').length,plans:['trial','ekip','buro','kurumsal'].map(p=>({plan:p,count:rows.filter(b=>b.plan===p).length})),leads:readList('leads.json').length,emails:mailer.list().length,mailProvider:process.env.RESEND_API_KEY?'resend':'log',publicUrl:publicUrl(),days});
 }
 if(route==='/api/admin/accounts'&&method==='GET')return json(res,200,accounts.map(accountRow));
 if(route==='/api/admin/accounts.csv'&&method==='GET'){const q=v=>`"${String(v??'').replace(/"/g,'""')}"`;const rows=[['Ad','E-posta','Telefon','Unvan','Kaynak','Pazarlama izni','Kayıt','Son giriş','Çalışma alanları'],...accounts.map(accountRow).map(a=>[a.name,a.email,a.phone,a.title,a.source,a.marketingConsent?'Evet':'Hayır',a.createdAt,a.lastLoginAt||'',a.spaces.map(s=>s.name).join('; ')])];res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="buros-kullanicilar.csv"'});return res.end('﻿'+rows.map(r=>r.map(q).join(';')).join('\n'));}
 const accountMatch=route.match(/^\/api\/admin\/accounts\/([\w-]+)$/);
 if(accountMatch&&method==='POST')return json(res,200,auth.setAccount(accountMatch[1],await readJson(req),me));
 if(route==='/api/admin/spaces'&&method==='GET')return json(res,200,spaces.map(spaceRow));
 const spaceMatch=route.match(/^\/api\/admin\/spaces\/([\w-]+)$/);
 if(spaceMatch&&method==='POST'){auth.setPlan(spaceMatch[1],await readJson(req));return json(res,200,spaceRow(spaces.find(s=>s.id===spaceMatch[1])));}
 if(route==='/api/admin/leads'&&method==='GET')return json(res,200,readList('leads.json'));
 if(route==='/api/admin/outbox'&&method==='GET')return json(res,200,mailer.list().slice(0,300));
 if(route==='/api/admin/automations'&&method==='GET')return json(res,200,{rules:automations.rules(),stats:automations.stats(),segments:Object.entries(automations.segments).map(([id,name])=>({id,name,count:automations.audience(id).length})),campaigns:automations.campaigns()});
 const ruleMatch=route.match(/^\/api\/admin\/automations\/([\w-]+)$/);
 if(ruleMatch&&method==='POST'){if(ruleMatch[1]==='run')return json(res,200,await automations.tick());return json(res,200,automations.updateRule(ruleMatch[1],await readJson(req,32768)));}
 if(route==='/api/admin/campaigns'&&method==='POST')return json(res,201,await automations.campaign(await readJson(req,32768),me));
 if(route==='/api/admin/preview'&&method==='POST'){const v=await readJson(req,32768);const a=accounts.find(x=>x.id===me.id);res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(mailer.preview(mailer.fill(v.body,{ad:(a.name||'').split(' ')[0],ad_soyad:a.name,eposta:a.email,firma:'Örnek Mimarlık',uygulama:`${publicUrl()}/app`,deneme_bitis:new Date(Date.now()+14*DAY).toLocaleDateString('tr-TR',{day:'numeric',month:'long',year:'numeric'}),kalan_gun:'3',davet_eden:a.name,davet_linki:`${publicUrl()}/app#davet=ornek`}),{unsubscribeUrl:v.kind==='marketing'?`${publicUrl()}/abonelik?t=ornek`:''}));}
 return json(res,404,{error:'Bulunamadı.'});
}
function serveStatic(url,req,res){const file=publicFiles[url.pathname];if(!file||!['GET','HEAD'].includes(req.method))return json(res,404,{error:'Bulunamadı.'});const type=file.endsWith('.css')?'text/css':file.endsWith('.js')||file.endsWith('.mjs')?'text/javascript':file.endsWith('.svg')?'image/svg+xml':'text/html';res.writeHead(200,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-cache'});if(req.method==='HEAD')return res.end();fs.createReadStream(path.join(__dirname,file)).on('error',()=>res.end()).pipe(res);}
const server=http.createServer(handler);
// Some systems resolve "localhost" to ::1 first; an IPv6 loopback listener avoids a refused connection there.
function start(port=Number(process.env.PORT)||3000){const run=()=>automations.tick().catch(e=>console.error('otomasyon',e.message));setTimeout(run,5000).unref();setInterval(run,3600000).unref();server.listen(port,'127.0.0.1',()=>console.log(`BürOS hazır: http://localhost:${port}`));const v6=http.createServer(handler);v6.on('error',()=>{});v6.listen(port,'::1');}
if(require.main===module)start();
module.exports={server,valid,start,FINANCE_FLOW,auth,automations,mailer};
