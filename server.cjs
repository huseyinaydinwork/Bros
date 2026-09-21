const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {createAuth}=require('./auth.cjs');
const {levelFor,visibleState,mergeScoped}=require('./access.cjs');
const ROOT = process.env.BUROS_DATA_DIR || path.join(__dirname, '.buros');
fs.mkdirSync(path.join(ROOT, 'files'), { recursive: true });
const statePath = path.join(ROOT, 'workspace.json');
let state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : null;
if (state && !Array.isArray(state.finance)) state.finance = [];
const auth=createAuth(ROOT);
const publicFiles = {'/':'index.html','/index.html':'index.html','/app.js':'app.js','/model.mjs':'model.mjs','/calendar.mjs':'calendar.mjs','/style.css':'style.css','/favicon.svg':'favicon.svg'};
const fontsDir=path.join(__dirname,'fonts');
if(fs.existsSync(fontsDir))for(const name of fs.readdirSync(fontsDir))if(/^[a-zA-Z0-9_.-]+\.(ttf|css)$/.test(name))publicFiles['/fonts/'+name]='fonts/'+name;
function json(res, code, body) { res.writeHead(code, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); res.end(JSON.stringify(body)); }
async function body(req, limit) { const chunks=[]; let size=0; for await (const chunk of req) { size+=chunk.length; if(size>limit) { const e=new Error('Dosya boyutu sınırı aşıldı.'); e.status=413; throw e; } chunks.push(chunk); } return Buffer.concat(chunks); }
function valid(s) {
 const text=v=>typeof v==='string',id=v=>text(v)&&/^[a-z0-9_-]{1,100}$/i.test(v),arr=Array.isArray;
 const unique=list=>new Set(list.map(x=>x.id)).size===list.length;
 const props=list=>arr(list)&&list.every(p=>id(p.id)&&text(p.name)&&['text','number','date','checkbox','select','email','url'].includes(p.type)&&['string','number','boolean'].includes(typeof p.value)&&(!p.options||arr(p.options)&&p.options.every(text)));
 const files=list=>arr(list)&&list.every(f=>id(f.id)&&text(f.name)&&Number.isFinite(f.size)&&f.size>=0&&text(f.createdAt));
 if(!s||s.version!==2||!Number.isInteger(s.revision)||!s.settings||!text(s.settings.name)||!text(s.settings.person)||!text(s.settings.role))return false;
 if(!arr(s.clients)||!s.clients.every(c=>id(c.id)&&text(c.name)&&text(c.contact||'')&&text(c.email||'')&&text(c.phone||''))||!unique(s.clients))return false;
 if(!arr(s.workflows)||!s.workflows.length||!unique(s.workflows)||!s.workflows.every(w=>id(w.id)&&text(w.name)&&arr(w.states)&&w.states.length&&unique(w.states)&&w.states.every(x=>id(x.id)&&text(x.name)&&Number.isFinite(x.progress)&&x.progress>=0&&x.progress<=100&&['pending','active','completed'].includes(x.type)&&['gray','green','blue','purple','orange'].includes(x.color))))return false;
 const item=o=>id(o.id)&&text(o.name)&&text(o.owner)&&text(o.notes)&&text(o.date)&&(!o.date||/^\d{4}-\d{2}-\d{2}$/.test(o.date))&&s.workflows.some(w=>w.id===o.workflowId&&w.states.some(x=>x.id===o.stateId))&&props(o.properties)&&files(o.files)&&arr(o.comments)&&o.comments.every(c=>id(c.id)&&text(c.text)&&text(c.author)&&text(c.time));
 if(!arr(s.projects)||!unique(s.projects)||!s.projects.every(p=>id(p.id)&&text(p.name)&&text(p.location)&&s.clients.some(c=>c.id===p.clientId)&&arr(p.sections)&&unique(p.sections)&&p.sections.every(g=>id(g.id)&&text(g.name)&&Number.isFinite(g.weight)&&g.weight>0&&arr(g.items)&&unique(g.items)&&g.items.every(item))))return false;
 const itemIds=s.projects.flatMap(p=>p.sections.flatMap(g=>g.items));if(!unique(itemIds))return false;
 if(!arr(s.templates)||!unique(s.templates)||!s.templates.every(t=>id(t.id)&&text(t.name)&&text(t.description)&&arr(t.sections)&&t.sections.every(g=>text(g.name)&&Number.isFinite(g.weight)&&g.weight>0&&arr(g.items)&&g.items.every(o=>text(o.name)&&s.workflows.some(w=>w.id===o.workflowId)&&(!o.properties||arr(o.properties)&&o.properties.every(p=>text(p.name)&&['text','number','date','checkbox','select','email','url'].includes(p.type)&&(!p.options||arr(p.options)&&p.options.every(text))))))))return false;
 const finance=list=>arr(list)&&list.every(f=>id(f.id)&&s.projects.some(p=>p.id===f.projectId)&&['income','expense'].includes(f.type)&&text(f.title)&&f.title.trim()&&Number.isFinite(f.amount)&&f.amount>=0&&text(f.date)&&(!f.date||/^\d{4}-\d{2}-\d{2}$/.test(f.date))&&['planned','invoiced','paid'].includes(f.status)&&text(f.category)&&f.category.trim()&&text(f.notes||'')&&text(f.createdAt)&&text(f.createdBy||''));
 if(!finance(s.finance)||!unique(s.finance))return false;
 return arr(s.activity)&&s.activity.every(a=>text(a.text)&&text(a.time));
}
const server=http.createServer(async(req,res)=>{try{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY'); const host=req.headers.host||'';
 if(!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host))return json(res,403,{error:'Yerel bağlantı gerekli.'});
 if(req.headers.origin && req.headers.origin!==`http://${host}`)return json(res,403,{error:'Geçersiz kaynak.'});
 const url=new URL(req.url,`http://${host}`);
 if(url.pathname==='/api/session'&&req.method==='GET')return json(res,200,{setupRequired:auth.needsSetup(),user:auth.user(req)?auth.safe(auth.user(req)):null});
 if(url.pathname==='/api/setup'&&req.method==='POST')return json(res,201,auth.setup(JSON.parse((await body(req,16384)).toString()),res));
 if(url.pathname==='/api/login'&&req.method==='POST')return json(res,200,auth.login(JSON.parse((await body(req,16384)).toString()),req,res));
 if(url.pathname==='/api/logout'&&req.method==='POST'){auth.logout(req,res);return json(res,200,{ok:true});}
 const actor=auth.user(req);
 if(url.pathname.startsWith('/api/')&&!actor)return json(res,401,{error:'Devam etmek için oturum açın.'});
 if(url.pathname==='/api/users'){
  if(actor.role!=='admin')return json(res,403,{error:'Yalnızca yönetici ekip ve erişim izinlerini düzenleyebilir.'});
  if(req.method==='GET')return json(res,200,auth.list());
  if(req.method==='POST'){const v=JSON.parse((await body(req,65536)).toString());if(!state)return json(res,400,{error:'Önce çalışma alanını oluşturun.'});return json(res,200,auth.update(v,actor,state));}
 }
 if(url.pathname==='/api/state'&&req.method==='GET')return json(res,200,visibleState(state,actor));
 if(url.pathname==='/api/state'&&req.method==='PUT'){
 let incoming=JSON.parse((await body(req,8*1024*1024)).toString());
 if(!valid(incoming))return json(res,400,{error:'Geçersiz çalışma alanı verisi.'});
 if(state && incoming.revision!==state.revision)return json(res,409,{error:'Başka bir sekme verileri güncelledi. Yerel değişikliklerini dışa aktar, ardından sayfayı yenile.'});
 if(!state&&actor.role!=='admin')return json(res,403,{error:'Çalışma alanını yalnızca yönetici oluşturabilir.'});
 if(state)incoming=mergeScoped(state,incoming,actor);
 if(!valid(incoming))return json(res,400,{error:"Birleştirilmiş çalışma alanı geçersiz veya kayıt kimlikleri çakışıyor."});
 if(incoming.clients.some(c=>!incoming.projects.some(p=>p.clientId===c.id)))return json(res,400,{error:'Her müşteri en az bir şantiyeye bağlı olmalı. Müşteriyi yeni şantiye ile birlikte oluşturun.'});
 for(const p of incoming.projects)for(const section of p.sections)for(const o of section.items)for(const f of o.files){
  const previous=state?.projects.flatMap(x=>x.sections.flatMap(g=>g.items)).find(x=>x.id===o.id)?.files.some(x=>x.id===f.id);
  if(!previous){const metaPath=path.join(ROOT,'files',f.id+'.json');if(!fs.existsSync(metaPath)||JSON.parse(fs.readFileSync(metaPath,'utf8')).objectId!==o.id)return json(res,403,{error:'Dosya bu kayda ait değil.'});}
 }
 incoming.revision=(state?.revision||0)+1;fs.writeFileSync(statePath+'.tmp',JSON.stringify(incoming,null,2));fs.renameSync(statePath+'.tmp',statePath);state=incoming;
 return json(res,200,{revision:state.revision});}
 if(url.pathname==='/api/files'&&req.method==='POST'){
 const objectId=url.searchParams.get('objectId');const site=state?.projects.find(p=>p.sections.some(s=>s.items.some(o=>o.id===objectId)));
 if(levelFor(actor,site)!=='edit')return json(res,403,{error:'Bu kayda dosya yükleme izniniz yok.'});
 const name=String(url.searchParams.get('name')||'dosya').slice(0,200);const bytes=await body(req,25*1024*1024);if(!bytes.length)return json(res,400,{error:'Boş dosya yüklenemez.'});
 const id=crypto.randomUUID();fs.writeFileSync(path.join(ROOT,'files',id),bytes,{flag:'wx'});const meta={id,name,size:bytes.length,createdAt:new Date().toISOString(),objectId,uploadedBy:actor.id};fs.writeFileSync(path.join(ROOT,'files',id+'.json'),JSON.stringify(meta));return json(res,201,meta);}
 if(url.pathname.startsWith('/api/files/')&&req.method==='GET'){
 const id=url.pathname.split('/').pop();if(!/^[a-f0-9-]{36}$/.test(id))return json(res,404,{error:'Dosya bulunamadı.'});const site=state?.projects.find(p=>p.sections.some(s=>s.items.some(o=>o.files.some(f=>f.id===id))));if(!levelFor(actor,site))return json(res,404,{error:'Dosya bulunamadı.'});const file=path.join(ROOT,'files',id);if(!fs.existsSync(file+'.json'))return json(res,404,{error:'Dosya bulunamadı.'});const meta=JSON.parse(fs.readFileSync(file+'.json','utf8'));res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(meta.name)}`,'Content-Length':meta.size});return fs.createReadStream(file).pipe(res);}
 const file=publicFiles[url.pathname];if(!file||!['GET','HEAD'].includes(req.method))return json(res,404,{error:'Bulunamadı.'});const type=file.endsWith('.ttf')?'font/ttf':file.endsWith('.css')?'text/css':file.endsWith('.js')||file.endsWith('.mjs')?'text/javascript':file.endsWith('.svg')?'image/svg+xml':'text/html';res.writeHead(200,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-cache'});if(req.method==='HEAD')return res.end();fs.createReadStream(path.join(__dirname,file)).pipe(res);
 }catch(e){json(res,e.status||400,{error:e.message||'İşlem tamamlanamadı.'});}});
if(require.main===module)server.listen(Number(process.env.PORT)||3000,'127.0.0.1',()=>console.log(`BürOS hazır: http://localhost:${process.env.PORT||3000}`));
module.exports={server,valid};
