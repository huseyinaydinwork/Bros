const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {migrateLegacy,inviteCode}=require('./auth.cjs');
const ROOT=process.env.BUROS_DATA_DIR||path.join(__dirname,'.buros');
const EMAIL='demo@buros.local',PASSWORD='demo123456';
const read=(f,d)=>fs.existsSync(f)?JSON.parse(fs.readFileSync(f,'utf8')):d;
const write=(f,v)=>{fs.writeFileSync(f+'.tmp',JSON.stringify(v,null,2));fs.renameSync(f+'.tmp',f);};
(async()=>{
 fs.mkdirSync(ROOT,{recursive:true});migrateLegacy(ROOT);
 const accountsPath=path.join(ROOT,'accounts.json'),spacesPath=path.join(ROOT,'spaces.json');
 const accounts=read(accountsPath,[]),spaces=read(spacesPath,[]),now=new Date().toISOString();
 const salt=crypto.randomBytes(16).toString('hex'),hash=crypto.scryptSync(PASSWORD,salt,64).toString('hex');
 // Older installs used the plain "demo" username; keep that account and give it the e-mail login.
 let a=accounts.find(a=>a.email===EMAIL)||accounts.find(a=>a.email==='demo');
 if(!a){a={id:crypto.randomUUID(),name:'Demo Yönetici',createdAt:now,lastSpaceId:null};accounts.push(a);}
 Object.assign(a,{email:EMAIL,salt,hash,platformAdmin:true,disabled:false,kvkkAcceptedAt:a.kvkkAcceptedAt||now,title:a.title||'Kurucu / ortak'});
 let space=spaces.find(s=>s.members.some(m=>m.userId===a.id&&m.role==='admin'));
 if(!space){space={id:crypto.randomUUID(),name:'Demo Mimarlık',createdAt:now,invite:{code:inviteCode(),enabled:true},members:[{userId:a.id,role:'admin',grants:[],disabled:false,joinedAt:now}],createdBy:a.id,profile:{sector:'Mimarlık',teamSize:'6–15',projects:'6–20',city:'İstanbul'},invitations:[]};spaces.push(space);}
 // Keep the demo usable: every run restarts its 14-day trial.
 Object.assign(space,{plan:'trial',trialEndsAt:new Date(Date.now()+14*864e5).toISOString()});
 const m=space.members.find(m=>m.userId===a.id);Object.assign(m,{role:'admin',disabled:false});
 a.lastSpaceId=space.id;write(accountsPath,accounts);write(spacesPath,spaces);
 const dir=path.join(ROOT,'spaces',space.id),statePath=path.join(dir,'workspace.json');fs.mkdirSync(path.join(dir,'files'),{recursive:true});
 if(!fs.existsSync(statePath)){const {seed}=await import('./model.mjs');const data=seed();data.settings.name=space.name;data.revision=1;write(statePath,data);}
 console.log(`Demo hesabı hazır → e-posta: ${EMAIL}  parola: ${PASSWORD}  davet kodu: ${space.invite.code}\nPlatform yönetim paneli: /admin`);
 require('./server.cjs').start();
})();
