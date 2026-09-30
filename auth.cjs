const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {ROLES}=require('./access.cjs');
// Accounts are global (one per e-mail). Each space is an isolated tenant with its own
// workspace.json, files directory, member list, invitations and subscription state.
const EMAIL=/^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;
const CODE_ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TRIAL_DAYS=14,DAY=864e5;
const PLANS=['trial','ekip','buro','kurumsal'];
const OPTIONS={
 title:['Kurucu / ortak','Mimar','Mühendis','Proje yöneticisi','Ofis yöneticisi','Diğer'],
 source:['Arama motoru','Sosyal medya','Tavsiye','Etkinlik / fuar','Meslek odası','Diğer'],
 sector:['Mimarlık','Mühendislik','İç mimarlık','Müteahhitlik / inşaat','Proje yönetimi','Diğer'],
 teamSize:['1–5','6–15','16–50','51–200','200+'],
 projects:['1–5','6–20','21–50','50+']
};
const read=(f,d)=>fs.existsSync(f)?JSON.parse(fs.readFileSync(f,'utf8')):d;
const write=(f,v)=>{fs.writeFileSync(f+'.tmp',JSON.stringify(v,null,2));fs.renameSync(f+'.tmp',f);};
const fail=(message,status=400,code)=>{const e=Error(message);e.status=status;if(code)e.code=code;throw e;};
const inviteCode=()=>{const b=crypto.randomBytes(8);let s='';for(let i=0;i<8;i++)s+=CODE_ALPHABET[b[i]%CODE_ALPHABET.length];return s.slice(0,4)+'-'+s.slice(4);};
const token=()=>crypto.randomBytes(24).toString('hex');
const pick=(v,list)=>list.includes(v)?v:'';
const str=(v,max)=>typeof v==='string'?v.trim().slice(0,max):'';
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
function createAuth(storage,{emit=()=>{},publicUrl=()=>''}={}){
 const accounts=storage.collection('accounts'),spaces=storage.collection('spaces'),sessionRows=storage.collection('sessions');
 const now=()=>new Date().toISOString();
 // Older records predate the trial, profile and consent fields.
 for(const a of accounts){a.prefs??={weeklyDigest:true,overdueEmails:true};a.unsubToken??=token();a.createdAt??=now();a.marketingConsent??=false;}
 for(const a of accounts)if(a.emailVerifiedAt===undefined)a.emailVerifiedAt=a.createdAt;// accounts from before verification existed count as verified
 for(const s of spaces){s.plan??='trial';s.trialEndsAt??=new Date(Date.now()+TRIAL_DAYS*DAY).toISOString();s.invitations??=[];s.profile??={};s.createdAt??=now();s.createdBy??=s.members.find(m=>m.role==='admin')?.userId||null;}
 // Sessions are stored by the SHA-256 of their token, so a database leak does not leak live cookies.
 const SESSION_MS=(Number(process.env.SESSION_HOURS)||168)*3600000,secure=()=>publicUrl().startsWith('https://')?'; Secure':'';
 const hashToken=t=>crypto.createHash('sha256').update(String(t||'')).digest('hex');
 const sessions=new Map(sessionRows.filter(r=>r.expires>Date.now()).map(r=>[r.tokenHash,r])),attempts=new Map();
 const saveSessions=()=>{sessionRows.splice(0,sessionRows.length,...[...sessions.values()].filter(s=>s.expires>Date.now()));return storage.save('sessions');};
 const dropSessions=test=>{let n=0;for(const [k,s] of sessions)if(test(s,k)){sessions.delete(k);n++;}if(n)saveSessions();};
 const saveAccounts=()=>storage.save('accounts'),saveSpaces=()=>storage.save('spaces');
 saveAccounts();saveSpaces();saveSessions();
 const limit=(key,max)=>{const a=attempts.get(key)||{count:0,start:Date.now()};if(Date.now()-a.start>900000){a.count=0;a.start=Date.now();}if(a.count>=max)fail('Çok fazla deneme. 15 dakika sonra tekrar deneyin.',429);a.count++;attempts.set(key,a);return ()=>attempts.delete(key);};
 const password=p=>{if(typeof p!=='string'||p.length<10||p.length>128)fail('Parola 10–128 karakter olmalı.');const salt=crypto.randomBytes(16).toString('hex');return {salt,hash:crypto.scryptSync(p,salt,64).toString('hex')};};
 const checkPassword=(a,p)=>{const hash=crypto.scryptSync(String(p||'').slice(0,128),a?.salt||'0'.repeat(32),64);return !!a&&crypto.timingSafeEqual(hash,Buffer.from(a.hash,'hex'));};
 const email=v=>{const e=String(v||'').trim().toLowerCase();if(!EMAIL.test(e)||e.length>200)fail('Geçerli bir e-posta adresi yazın.');return e;};
 const name=v=>{if(typeof v!=='string'||!v.trim()||v.length>100)fail('Ad ve soyad gerekli.');return v.trim();};
 const spaceName=v=>{if(typeof v!=='string'||!v.trim()||v.trim().length>80)fail('Firma adı 1–80 karakter olmalı.');return v.trim();};
 const phone=v=>{const p=str(v,30);if(p&&!/^[+0-9 ()-]{7,30}$/.test(p))fail('Telefon numarası geçersiz.');return p;};
 const isPlatformAdmin=a=>!!a&&(a.platformAdmin||(process.env.BUROS_PLATFORM_ADMINS||'').split(',').map(x=>x.trim().toLowerCase()).includes(a.email));
 const safeAccount=a=>({id:a.id,name:a.name,email:a.email,phone:a.phone||'',title:a.title||'',marketingConsent:!!a.marketingConsent,prefs:a.prefs,platformAdmin:isPlatformAdmin(a),emailVerified:!!a.emailVerifiedAt});
 const memberOf=(space,accountId)=>space?.members.find(m=>m.userId===accountId);
 const cookieToken=req=>(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('buros_session='))?.slice(14);
 const session=req=>{const t=cookieToken(req);if(!t)return null;const s=sessions.get(hashToken(t));if(!s||s.expires<Date.now())return null;return s;};
 const issue=(res,a,spaceId=null)=>{const t=crypto.randomBytes(32).toString('hex'),h=hashToken(t);sessions.set(h,{tokenHash:h,id:a.id,spaceId,expires:Date.now()+SESSION_MS,createdAt:now()});saveSessions();res.setHeader('Set-Cookie',`buros_session=${t}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(SESSION_MS/1000)}${secure()}`);};
 const usable=(a,spaceId)=>{const space=spaces.find(s=>s.id===spaceId),m=memberOf(space,a.id);return m&&!m.disabled?space:null;};
 function billing(space){const ends=new Date(space.trialEndsAt).getTime(),trial=space.plan==='trial',daysLeft=Math.max(0,Math.ceil((ends-Date.now())/DAY));return {plan:space.plan,trialEndsAt:space.trialEndsAt,daysLeft:trial?daysLeft:null,expired:trial&&ends<=Date.now()};}
 function context(req){
  const s=session(req),account=s&&accounts.find(a=>a.id===s.id&&!a.disabled);if(!account)return {};
  const space=s.spaceId&&usable(account,s.spaceId);if(!space){s.spaceId=null;return {account,session:s};}
  const m=memberOf(space,account.id);
  return {account,session:s,space,actor:{id:account.id,name:account.name,email:account.email,username:account.email,role:m.role,grants:m.grants,disabled:false}};
 }
 function info(req){
  const {account,space,actor}=context(req);if(!account)return {user:null,options:OPTIONS};
  const list=spaces.filter(s=>usable(account,s.id)).map(s=>({id:s.id,name:s.name,role:memberOf(s,account.id).role,members:s.members.filter(m=>!m.disabled).length,...billing(s)}));
  return {user:{...safeAccount(account),...(actor?{role:actor.role,grants:actor.grants,username:account.email}:{})},spaces:list,options:OPTIONS,space:space?{id:space.id,name:space.name,role:actor.role,profile:space.profile,billing:billing(space),...(actor.role==='admin'?{invite:space.invite,invitations:space.invitations.filter(i=>!i.acceptedAt).map(({token,...i})=>i)}:{})}:null};
 }
 const select=(s,account,space)=>{s.spaceId=space.id;account.lastSpaceId=space.id;saveAccounts();saveSessions();};
 const profileOf=v=>({sector:pick(v.sector,OPTIONS.sector),teamSize:pick(v.teamSize,OPTIONS.teamSize),projects:pick(v.projects,OPTIONS.projects),city:str(v.city,60),phone:phone(v.phone),website:str(v.website,120),taxOffice:str(v.taxOffice,80)});
 const inviteUrl=t=>`${publicUrl()}/app#davet=${t}`;
 function addInvitation(space,inviter,addr,role){
  let inv=space.invitations.find(i=>i.email===addr&&!i.acceptedAt);
  if(!inv){inv={id:crypto.randomUUID(),email:addr,role,token:token(),createdAt:now(),invitedBy:inviter.id,expiresAt:new Date(Date.now()+14*DAY).toISOString()};space.invitations.push(inv);}
  else Object.assign(inv,{role,expiresAt:new Date(Date.now()+14*DAY).toISOString()});
  return inv;
 }
 const verifyUrl=a=>{const t=token();a.verifyHash=hashToken(t);return `${publicUrl()}/app#dogrula=${t}`;};
 return {context,info,billing,isPlatformAdmin,options:OPTIONS,
  signup(v,req,res){
   limit('signup:'+(req.ip||req.socket.remoteAddress),30);const e=email(v.email),n=name(v.name),p=password(v.password);
   if(v.kvkk!==true)fail('Devam etmek için KVKK aydınlatma metnini onaylayın.');
   if(accounts.some(a=>a.email===e))fail('Bu e-posta ile bir hesap zaten var. Giriş yapmayı deneyin.',409);
   const a={id:crypto.randomUUID(),email:e,name:n,...p,phone:phone(v.phone),title:pick(v.title,OPTIONS.title),source:pick(v.source,OPTIONS.source),marketingConsent:v.marketingConsent===true,kvkkAcceptedAt:now(),createdAt:now(),lastLoginAt:now(),lastSpaceId:null,prefs:{weeklyDigest:true,overdueEmails:true},unsubToken:token()};
   a.emailVerifiedAt=null;const url=verifyUrl(a);accounts.push(a);saveAccounts();issue(res,a);emit('signup',{account:a});emit('verify_email',{account:a,url});return safeAccount(a);
  },
  login(v,req,res){const done=limit('login:'+(req.ip||req.socket.remoteAddress),20);const id=String(v.email??v.username??'').trim().toLowerCase();const a=accounts.find(a=>a.email===id&&!a.disabled);if(!checkPassword(a,v.password))fail('E-posta veya parola hatalı.',401);done();a.lastLoginAt=now();saveAccounts();const space=usable(a,a.lastSpaceId)||spaces.find(s=>usable(a,s.id));issue(res,a,space?.id||null);return safeAccount(a);},
  logout(req,res){const t=cookieToken(req);if(t&&sessions.delete(hashToken(t)))saveSessions();res.setHeader('Set-Cookie',`buros_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure()}`);},
  requestPasswordReset(v,req){limit('reset:'+(req.ip||req.socket.remoteAddress),10);const e=String(v.email||'').trim().toLowerCase();const a=accounts.find(a=>a.email===e&&!a.disabled);if(a){const t=token();a.resetHash=hashToken(t);a.resetExpires=Date.now()+3600000;saveAccounts();emit('password_reset',{account:a,url:`${publicUrl()}/app#sifre=${t}`});}return {ok:true};},
  resetPassword(v,res){const h=hashToken(v.token);const a=accounts.find(a=>a.resetHash===h&&a.resetExpires>Date.now()&&!a.disabled);if(!a)fail('Bağlantı geçersiz veya süresi dolmuş. Yeniden parola sıfırlama isteyin.',400);Object.assign(a,password(v.password));delete a.resetHash;delete a.resetExpires;a.emailVerifiedAt??=now();a.lastLoginAt=now();saveAccounts();dropSessions(s=>s.id===a.id);const space=usable(a,a.lastSpaceId)||spaces.find(s=>usable(a,s.id));issue(res,a,space?.id||null);return safeAccount(a);},
  verifyEmail(v){const h=hashToken(v.token);const a=accounts.find(a=>a.verifyHash===h);if(!a)fail('Doğrulama bağlantısı geçersiz veya daha önce kullanılmış.',400);a.emailVerifiedAt=now();delete a.verifyHash;saveAccounts();return safeAccount(a);},
  resendVerification(req){const {account:a}=context(req);if(a.emailVerifiedAt)return {ok:true};limit('verify:'+a.id,5);const url=verifyUrl(a);saveAccounts();emit('verify_email',{account:a,url});return {ok:true};},
  createSpace(v,req){
   const {account,session:s}=context(req);
   if(spaces.filter(x=>memberOf(x,account.id)?.role==='admin').length>=20)fail('En fazla 20 çalışma alanı yönetebilirsiniz.',429);
   const space={id:crypto.randomUUID(),name:spaceName(v.name),createdAt:now(),createdBy:account.id,invite:{code:inviteCode(),enabled:true},members:[{userId:account.id,role:'admin',grants:[],disabled:false,joinedAt:now()}],profile:profileOf(v),plan:'trial',trialEndsAt:new Date(Date.now()+TRIAL_DAYS*DAY).toISOString(),invitations:[]};
   spaces.push(space);saveSpaces();select(s,account,space);emit('space_created',{account,space});
   return {id:space.id,name:space.name};
  },
  joinSpace(v,req){const {account,session:s}=context(req);limit('join:'+account.id,10);const code=String(v.code||'').toUpperCase().replace(/[^A-Z0-9]/g,'');const space=code.length===8&&spaces.find(x=>x.invite.enabled&&x.invite.code.replace('-','')===code);if(!space)fail('Davet kodu geçersiz veya devre dışı.',404);const m=memberOf(space,account.id);if(m?.disabled)fail('Bu çalışma alanındaki erişiminiz kapatılmış. Yöneticiyle görüşün.',403);if(!m){space.members.push({userId:account.id,role:'staff',grants:[],disabled:false,joinedAt:now()});saveSpaces();}select(s,account,space);return {id:space.id,name:space.name};},
  selectSpace(v,req){const {account,session:s}=context(req);const space=usable(account,v.spaceId);if(!space)fail('Bu çalışma alanına erişiminiz yok.',403);select(s,account,space);return {id:space.id,name:space.name};},
  leaveSpace(req){const {account,session:s,space,actor}=context(req);if(!space)fail('Çalışma alanı seçili değil.');if(actor.role==='admin'&&space.members.filter(m=>m.role==='admin'&&!m.disabled).length<2)fail('Son yönetici çalışma alanından ayrılamaz.');space.members=space.members.filter(m=>m.userId!==account.id);saveSpaces();s.spaceId=null;return {ok:true};},
  invite(v,space){if(v.regenerate)space.invite.code=inviteCode();if(typeof v.enabled==='boolean')space.invite.enabled=v.enabled;saveSpaces();return space.invite;},
  inviteByEmail(v,actor,space){
   const list=[...new Set((Array.isArray(v.emails)?v.emails:[]).map(x=>String(x||'').trim().toLowerCase()).filter(Boolean))];
   if(!list.length)fail('En az bir e-posta adresi yazın.');if(list.length>25)fail('Tek seferde en fazla 25 kişi davet edebilirsiniz.');
   const role=ROLES[v.role]?v.role:'staff',out=[];
   for(const addr of list)if(!EMAIL.test(addr)||addr.length>200)fail(`Geçersiz e-posta adresi: ${addr}`);
   for(const addr of list){const existing=accounts.find(a=>a.email===addr);if(existing&&memberOf(space,existing.id))continue;const inv=addInvitation(space,actor,addr,role);out.push(inv);emit('invite',{space,invitation:inv,inviter:accounts.find(a=>a.id===actor.id),url:inviteUrl(inv.token)});}
   saveSpaces();return out.map(({token,...i})=>i);
  },
  revokeInvitation(id,space){space.invitations=space.invitations.filter(i=>i.id!==id||i.acceptedAt);saveSpaces();return {ok:true};},
  invitation(t){const space=spaces.find(s=>s.invitations.some(i=>i.token===t&&!i.acceptedAt));const inv=space?.invitations.find(i=>i.token===t);if(!inv||new Date(inv.expiresAt)<Date.now())fail('Davet bağlantısı geçersiz veya süresi dolmuş.',404);return {email:inv.email,role:inv.role,spaceName:space.name,inviter:accounts.find(a=>a.id===inv.invitedBy)?.name||'',hasAccount:accounts.some(a=>a.email===inv.email)};},
  acceptInvitation(v,req){
   const {account,session:s}=context(req);const space=spaces.find(x=>x.invitations.some(i=>i.token===v.token&&!i.acceptedAt));const inv=space?.invitations.find(i=>i.token===v.token);
   if(!inv||new Date(inv.expiresAt)<Date.now())fail('Davet bağlantısı geçersiz veya süresi dolmuş.',404);
   if(inv.email!==account.email)fail(`Bu davet ${inv.email} adresine gönderildi. O hesapla giriş yapın.`,403);
   const m=memberOf(space,account.id);if(m?.disabled)fail('Bu çalışma alanındaki erişiminiz kapatılmış.',403);
   if(!m)space.members.push({userId:account.id,role:inv.role,grants:[],disabled:false,joinedAt:now()});
   inv.acceptedAt=now();if(!account.emailVerifiedAt){account.emailVerifiedAt=now();saveAccounts();}saveSpaces();select(s,account,space);return {id:space.id,name:space.name};
  },
  updateAccount(v,req){
   const {account:a}=context(req);
   if(v.name!==undefined)a.name=name(v.name);if(v.phone!==undefined)a.phone=phone(v.phone);if(v.title!==undefined)a.title=pick(v.title,OPTIONS.title);
   if(typeof v.marketingConsent==='boolean')a.marketingConsent=v.marketingConsent;
   if(v.prefs&&typeof v.prefs==='object')a.prefs={weeklyDigest:!!v.prefs.weeklyDigest,overdueEmails:!!v.prefs.overdueEmails};
   if(v.newPassword){if(!checkPassword(a,v.currentPassword))fail('Mevcut parola hatalı.',403);Object.assign(a,password(v.newPassword));const current=hashToken(cookieToken(req));dropSessions((s,k)=>s.id===a.id&&k!==current);}
   saveAccounts();return safeAccount(a);
  },
  updateSpaceProfile(v,space){if(v.name!==undefined)space.name=spaceName(v.name);space.profile=profileOf({...space.profile,...v});saveSpaces();return {name:space.name,profile:space.profile};},
  rename(space,n){if(typeof n==='string'&&n.trim()&&n.trim().length<=80&&space.name!==n.trim()){space.name=n.trim();saveSpaces();}},
  members(space){return space.members.map(m=>{const a=accounts.find(a=>a.id===m.userId);return a&&{id:a.id,name:a.name,email:a.email,username:a.email,role:m.role,grants:m.grants,disabled:!!m.disabled};}).filter(Boolean);},
  updateMember(v,actor,space,state){
   if(!ROLES[v.role])fail('Rol geçersiz.');
   if(!Array.isArray(v.grants)||v.grants.some(g=>!['site','client'].includes(g.scope)||!['view','edit'].includes(g.level)||(g.finance!==undefined&&typeof g.finance!=='boolean')||!(g.scope==='site'?state.projects:state.clients).some(x=>x.id===g.targetId)))fail('Erişim kapsamı geçersiz.');
   let m=v.id&&memberOf(space,v.id),a;
   if(m){a=accounts.find(x=>x.id===m.userId);if(a.id===actor.id&&(v.role!=='admin'||v.disabled))fail('Kendi yönetici erişiminizi kaldıramazsınız.');}
   else{const e=email(v.email);a=accounts.find(x=>x.email===e);if(a&&memberOf(space,a.id))fail('Bu kişi zaten ekipte.',409);
    if(!a){const inv=addInvitation(space,actor,e,v.role);saveSpaces();emit('invite',{space,invitation:inv,inviter:accounts.find(x=>x.id===actor.id),url:inviteUrl(inv.token)});return {invited:true,email:e};}
    m={userId:a.id,joinedAt:now()};space.members.push(m);}
   Object.assign(m,{role:v.role,grants:v.grants,disabled:!!v.disabled});saveSpaces();
   dropSessions(s=>s.id===a.id&&s.spaceId===space.id&&a.id!==actor.id);
   return this.members(space).find(x=>x.id===a.id);
  },
  unsubscribe(t){const a=accounts.find(a=>a.unsubToken===t);if(!a)return false;a.marketingConsent=false;saveAccounts();return true;},
  // Platform administration
  all:()=>({accounts,spaces}),
  save(){saveAccounts();saveSpaces();},
  setPlan(id,v){const s=spaces.find(s=>s.id===id);if(!s)fail('Çalışma alanı bulunamadı.',404);if(v.plan!==undefined){if(!PLANS.includes(v.plan))fail('Plan geçersiz.');s.plan=v.plan;}if(Number.isFinite(v.extendDays)&&v.extendDays>0&&v.extendDays<=365){const base=Math.max(Date.now(),new Date(s.trialEndsAt).getTime());s.trialEndsAt=new Date(base+v.extendDays*DAY).toISOString();s.plan='trial';}saveSpaces();return billing(s);},
  setAccount(id,v,actor){const a=accounts.find(a=>a.id===id);if(!a)fail('Hesap bulunamadı.',404);if(a.id===actor.id&&(v.disabled||v.platformAdmin===false))fail('Kendi erişiminizi kaldıramazsınız.');if(typeof v.disabled==='boolean')a.disabled=v.disabled;if(typeof v.platformAdmin==='boolean')a.platformAdmin=v.platformAdmin;if(a.disabled)dropSessions(s=>s.id===a.id);saveAccounts();return safeAccount(a);}
 };
}
module.exports={createAuth,migrateLegacy,inviteCode,OPTIONS,TRIAL_DAYS};
