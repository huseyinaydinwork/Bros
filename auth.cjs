const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {ROLES}=require('./access.cjs');
// Accounts are global (one per e-mail). Each space is an isolated tenant with its own
// workspace.json, files directory and member list; a membership carries the role and grants.
const EMAIL=/^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;
const CODE_ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const read=(f,d)=>fs.existsSync(f)?JSON.parse(fs.readFileSync(f,'utf8')):d;
const write=(f,v)=>{fs.writeFileSync(f+'.tmp',JSON.stringify(v,null,2));fs.renameSync(f+'.tmp',f);};
const fail=(message,status=400)=>{const e=Error(message);e.status=status;throw e;};
const inviteCode=()=>{const b=crypto.randomBytes(8);let s='';for(let i=0;i<8;i++)s+=CODE_ALPHABET[b[i]%CODE_ALPHABET.length];return s.slice(0,4)+'-'+s.slice(4);};
// Single-office installs kept users.json + workspace.json + files/ at the data root. Move them into one space.
function migrateLegacy(root){
 const accountsFile=path.join(root,'accounts.json'),usersFile=path.join(root,'users.json'),stateFile=path.join(root,'workspace.json');
 if(fs.existsSync(accountsFile)||!fs.existsSync(usersFile))return;
 const users=read(usersFile,[]),state=read(stateFile,null),now=new Date().toISOString(),id=crypto.randomUUID(),dir=path.join(root,'spaces',id);
 fs.mkdirSync(dir,{recursive:true});
 if(state)fs.renameSync(stateFile,path.join(dir,'workspace.json'));
 if(fs.existsSync(path.join(root,'files')))fs.renameSync(path.join(root,'files'),path.join(dir,'files'));
 fs.mkdirSync(path.join(dir,'files'),{recursive:true});
 write(accountsFile,users.map(u=>({id:u.id,email:u.username,name:u.name,salt:u.salt,hash:u.hash,createdAt:now,lastSpaceId:id})));
 write(path.join(root,'spaces.json'),[{id,name:state?.settings?.name||'Büro',createdAt:now,invite:{code:inviteCode(),enabled:true},members:users.map(u=>({userId:u.id,role:u.role,grants:u.grants||[],disabled:!!u.disabled,joinedAt:now}))}]);
 fs.renameSync(usersFile,usersFile+'.migrated');
}
function createAuth(root){
 migrateLegacy(root);
 const accountsFile=path.join(root,'accounts.json'),spacesFile=path.join(root,'spaces.json');
 let accounts=read(accountsFile,[]),spaces=read(spacesFile,[]);
 const sessions=new Map(),attempts=new Map();
 const saveAccounts=()=>write(accountsFile,accounts),saveSpaces=()=>write(spacesFile,spaces);
 const limit=(key,max)=>{const a=attempts.get(key)||{count:0,start:Date.now()};if(Date.now()-a.start>900000){a.count=0;a.start=Date.now();}if(a.count>=max)fail('Çok fazla deneme. 15 dakika sonra tekrar deneyin.',429);a.count++;attempts.set(key,a);return ()=>attempts.delete(key);};
 const password=p=>{if(typeof p!=='string'||p.length<10||p.length>128)fail('Parola 10–128 karakter olmalı.');const salt=crypto.randomBytes(16).toString('hex');return {salt,hash:crypto.scryptSync(p,salt,64).toString('hex')};};
 const email=v=>{const e=String(v||'').trim().toLowerCase();if(!EMAIL.test(e)||e.length>200)fail('Geçerli bir e-posta adresi yazın.');return e;};
 const name=v=>{if(typeof v!=='string'||!v.trim()||v.length>100)fail('Ad ve soyad gerekli.');return v.trim();};
 const spaceName=v=>{if(typeof v!=='string'||!v.trim()||v.trim().length>80)fail('Çalışma alanı adı 1–80 karakter olmalı.');return v.trim();};
 const safeAccount=a=>({id:a.id,name:a.name,email:a.email});
 const memberOf=(space,accountId)=>space?.members.find(m=>m.userId===accountId);
 const token=req=>(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('buros_session='))?.slice(14);
 const session=req=>{const s=sessions.get(token(req));if(!s||s.expires<Date.now())return null;return s;};
 const issue=(res,a,spaceId=null)=>{const t=crypto.randomBytes(32).toString('hex');sessions.set(t,{id:a.id,spaceId,expires:Date.now()+12*3600000});res.setHeader('Set-Cookie',`buros_session=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200`);};
 const usable=(a,spaceId)=>{const space=spaces.find(s=>s.id===spaceId),m=memberOf(space,a.id);return m&&!m.disabled?space:null;};
 function context(req){
  const s=session(req),account=s&&accounts.find(a=>a.id===s.id);if(!account)return {};
  const space=s.spaceId&&usable(account,s.spaceId);if(!space){s.spaceId=null;return {account,session:s};}
  const m=memberOf(space,account.id);
  return {account,session:s,space,actor:{id:account.id,name:account.name,email:account.email,username:account.email,role:m.role,grants:m.grants,disabled:false}};
 }
 function info(req){
  const {account,space,actor}=context(req);if(!account)return {user:null};
  const list=spaces.filter(s=>{const m=memberOf(s,account.id);return m&&!m.disabled;}).map(s=>({id:s.id,name:s.name,role:memberOf(s,account.id).role,members:s.members.filter(m=>!m.disabled).length}));
  return {user:{...safeAccount(account),...(actor?{role:actor.role,grants:actor.grants,username:account.email}:{})},spaces:list,space:space?{id:space.id,name:space.name,role:actor.role,...(actor.role==='admin'?{invite:space.invite}:{})}:null};
 }
 const select=(s,account,space)=>{s.spaceId=space.id;account.lastSpaceId=space.id;saveAccounts();};
 return {context,info,dirFor:id=>path.join(root,'spaces',id),
  signup(v,req,res){limit('signup:'+req.socket.remoteAddress,30);const e=email(v.email);const n=name(v.name);const p=password(v.password);if(accounts.some(a=>a.email===e))fail('Bu e-posta ile bir hesap zaten var. Giriş yapmayı deneyin.',409);const a={id:crypto.randomUUID(),email:e,name:n,...p,createdAt:new Date().toISOString(),lastSpaceId:null};accounts.push(a);saveAccounts();issue(res,a);return safeAccount(a);},
  login(v,req,res){const done=limit('login:'+req.socket.remoteAddress,20);const id=String(v.email??v.username??'').trim().toLowerCase();const a=accounts.find(a=>a.email===id);const hash=crypto.scryptSync(String(v.password||'').slice(0,128),a?.salt||'0'.repeat(32),64);if(!a||!crypto.timingSafeEqual(hash,Buffer.from(a.hash,'hex')))fail('E-posta veya parola hatalı.',401);done();const space=usable(a,a.lastSpaceId)||spaces.find(s=>usable(a,s.id));issue(res,a,space?.id||null);return safeAccount(a);},
  logout(req,res){sessions.delete(token(req));res.setHeader('Set-Cookie','buros_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');},
  createSpace(v,req){const {account,session:s}=context(req);if(spaces.filter(x=>memberOf(x,account.id)?.role==='admin').length>=20)fail('En fazla 20 çalışma alanı yönetebilirsiniz.',429);const now=new Date().toISOString(),space={id:crypto.randomUUID(),name:spaceName(v.name),createdAt:now,invite:{code:inviteCode(),enabled:true},members:[{userId:account.id,role:'admin',grants:[],disabled:false,joinedAt:now}]};fs.mkdirSync(path.join(root,'spaces',space.id,'files'),{recursive:true});spaces.push(space);saveSpaces();select(s,account,space);return {id:space.id,name:space.name};},
  joinSpace(v,req){const {account,session:s}=context(req);limit('join:'+account.id,10);const code=String(v.code||'').toUpperCase().replace(/[^A-Z0-9]/g,'');const space=code.length===8&&spaces.find(x=>x.invite.enabled&&x.invite.code.replace('-','')===code);if(!space)fail('Davet kodu geçersiz veya devre dışı.',404);const m=memberOf(space,account.id);if(m?.disabled)fail('Bu çalışma alanındaki erişiminiz kapatılmış. Yöneticiyle görüşün.',403);if(!m){space.members.push({userId:account.id,role:'staff',grants:[],disabled:false,joinedAt:new Date().toISOString()});saveSpaces();}select(s,account,space);return {id:space.id,name:space.name};},
  selectSpace(v,req){const {account,session:s}=context(req);const space=usable(account,v.spaceId);if(!space)fail('Bu çalışma alanına erişiminiz yok.',403);select(s,account,space);return {id:space.id,name:space.name};},
  leaveSpace(req){const {account,session:s,space,actor}=context(req);if(!space)fail('Çalışma alanı seçili değil.');if(actor.role==='admin'&&space.members.filter(m=>m.role==='admin'&&!m.disabled).length<2)fail('Son yönetici çalışma alanından ayrılamaz.');space.members=space.members.filter(m=>m.userId!==account.id);saveSpaces();s.spaceId=null;return {ok:true};},
  invite(v,space){if(v.regenerate)space.invite.code=inviteCode();if(typeof v.enabled==='boolean')space.invite.enabled=v.enabled;saveSpaces();return space.invite;},
  rename(space,n){if(typeof n==='string'&&n.trim()&&n.trim().length<=80&&space.name!==n.trim()){space.name=n.trim();saveSpaces();}},
  members(space){return space.members.map(m=>{const a=accounts.find(a=>a.id===m.userId);return a&&{id:a.id,name:a.name,email:a.email,username:a.email,role:m.role,grants:m.grants,disabled:!!m.disabled};}).filter(Boolean);},
  updateMember(v,actor,space,state){
   if(!ROLES[v.role])fail('Rol geçersiz.');
   if(!Array.isArray(v.grants)||v.grants.some(g=>!['site','client'].includes(g.scope)||!['view','edit'].includes(g.level)||(g.finance!==undefined&&typeof g.finance!=='boolean')||!(g.scope==='site'?state.projects:state.clients).some(x=>x.id===g.targetId)))fail('Erişim kapsamı geçersiz.');
   let m=v.id&&memberOf(space,v.id),a;
   if(m){a=accounts.find(x=>x.id===m.userId);if(a.id===actor.id&&(v.role!=='admin'||v.disabled))fail('Kendi yönetici erişiminizi kaldıramazsınız.');}
   else{const e=email(v.email);a=accounts.find(x=>x.email===e);if(a&&memberOf(space,a.id))fail('Bu kişi zaten ekipte.',409);if(!a){a={id:crypto.randomUUID(),email:e,name:name(v.name),...password(v.password),createdAt:new Date().toISOString(),lastSpaceId:space.id};accounts.push(a);saveAccounts();}m={userId:a.id,joinedAt:new Date().toISOString()};space.members.push(m);}
   Object.assign(m,{role:v.role,grants:v.grants,disabled:!!v.disabled});saveSpaces();
   for(const [key,s] of sessions)if(s.id===a.id&&s.spaceId===space.id&&a.id!==actor.id)sessions.delete(key);
   return this.members(space).find(x=>x.id===a.id);
  }
 };
}
module.exports={createAuth,migrateLegacy,inviteCode};
