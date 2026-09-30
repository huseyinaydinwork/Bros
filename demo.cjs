// Local demo: creates (or resets) demo@buros.local as platform admin of "Demo Mimarlık" with sample data.
// Works with both storage backends. Refuses to run in production because the password is public.
const crypto=require('node:crypto');
const {inviteCode}=require('./auth.cjs');
const EMAIL='demo@buros.local',PASSWORD='demo123456';
if(process.env.NODE_ENV==='production'&&process.env.ALLOW_DEMO!=='1'){console.error('Demo hesabı üretimde oluşturulmaz. Gerekirse ALLOW_DEMO=1 ile çalıştırın.');process.exit(1);}
(async()=>{
 const srv=require('./server.cjs');await srv.init();
 const {storage}=srv.app(),accounts=storage.collection('accounts'),spaces=storage.collection('spaces'),now=new Date().toISOString();
 const salt=crypto.randomBytes(16).toString('hex'),hash=crypto.scryptSync(PASSWORD,salt,64).toString('hex');
 // Older installs used the plain "demo" username; keep that account and give it the e-mail login.
 let a=accounts.find(a=>a.email===EMAIL)||accounts.find(a=>a.email==='demo');
 if(!a){a={id:crypto.randomUUID(),name:'Demo Yönetici',createdAt:now,lastSpaceId:null,prefs:{weeklyDigest:true,overdueEmails:true},unsubToken:crypto.randomBytes(24).toString('hex'),marketingConsent:false};accounts.push(a);}
 Object.assign(a,{email:EMAIL,salt,hash,platformAdmin:true,disabled:false,kvkkAcceptedAt:a.kvkkAcceptedAt||now,emailVerifiedAt:a.emailVerifiedAt||now,title:a.title||'Kurucu / ortak'});
 let space=spaces.find(s=>s.members.some(m=>m.userId===a.id&&m.role==='admin'));
 if(!space){space={id:crypto.randomUUID(),name:'Demo Mimarlık',createdAt:now,invite:{code:inviteCode(),enabled:true},members:[{userId:a.id,role:'admin',grants:[],disabled:false,joinedAt:now}],createdBy:a.id,profile:{sector:'Mimarlık',teamSize:'6–15',projects:'6–20',city:'İstanbul'},invitations:[]};spaces.push(space);}
 // Keep the demo usable: every run restarts its 14-day trial.
 Object.assign(space,{plan:'trial',trialEndsAt:new Date(Date.now()+14*864e5).toISOString()});
 Object.assign(space.members.find(m=>m.userId===a.id),{role:'admin',disabled:false});
 a.lastSpaceId=space.id;storage.save('accounts');storage.save('spaces');
 if(!await storage.loadWorkspace(space.id)){const {seed}=await import('./model.mjs');const data=seed();data.settings.name=space.name;data.revision=1;await storage.saveWorkspace(space.id,data);}
 await storage.flush();
 console.log(`Demo hesabı hazır → e-posta: ${EMAIL}  parola: ${PASSWORD}  davet kodu: ${space.invite.code}\nPlatform yönetim paneli: /admin`);
 await srv.start();
})().catch(e=>{console.error(e);process.exit(1);});
