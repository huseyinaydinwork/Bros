
// Event and schedule driven e-mails. "service" rules go to everyone involved; "marketing" rules
// and campaigns only reach accounts that opted in, and always carry an unsubscribe link.
const DAY=864e5;
const RULES=[
 {id:'welcome',name:'Hoş geldin e-postası',trigger:'signup',kind:'service',enabled:true,subject:'bürOS\'a hoş geldiniz, {{ad}}',body:'Merhaba {{ad}},\n\nbürOS hesabınız hazır. Şimdi büronuz için bir çalışma alanı kurabilir ya da ekibinizden aldığınız davet koduyla mevcut bir alana katılabilirsiniz.\n\nUygulamaya giriş: {{uygulama}}\n\nSorularınız için bu e-postayı yanıtlayabilirsiniz.\n\nbürOS ekibi'},
 {id:'space_created',name:'Çalışma alanı kuruldu',trigger:'space_created',kind:'service',enabled:true,subject:'{{firma}} çalışma alanı hazır, 14 günlük deneme başladı',body:'Merhaba {{ad}},\n\n{{firma}} çalışma alanınız kuruldu. Deneme süreniz {{deneme_bitis}} tarihine kadar sürüyor; bu sürede Büro planının tüm özelliklerini kullanabilirsiniz.\n\nİlk adımlar için öneriler:\n1. Bir proje oluşturun ya da şablondan başlayın.\n2. Ekibinizi davet edin ve proje bazında erişim verin.\n3. Hedef tarihleri girin; geciken işler genel bakışta görünsün.\n\n{{uygulama}}'},
 {id:'invite',name:'Ekip daveti',trigger:'invite',kind:'service',enabled:true,locked:true,subject:'{{davet_eden}} sizi {{firma}} çalışma alanına davet etti',body:'Merhaba,\n\n{{davet_eden}}, sizi bürOS üzerindeki {{firma}} çalışma alanına davet etti.\n\nDaveti kabul etmek için: {{davet_linki}}\n\nBağlantı 14 gün geçerlidir. Bu daveti beklemiyorsanız e-postayı dikkate almayın.'},
 {id:'join_request',name:'Katılım isteği (yöneticiye)',trigger:'join_request',kind:'service',enabled:true,locked:true,subject:'{{talep_eden}} {{firma}} çalışma alanına katılmak istiyor',body:'Merhaba {{ad}},\n\n{{talep_eden}} ({{talep_eposta}}) davet koduyla {{firma}} çalışma alanına katılmak istiyor.\n\nİsteği onaylamak ya da reddetmek için Ekip ve erişim ekranını açın: {{ekip_linki}}\n\nBu kişiyi tanımıyorsanız isteği reddedin ve Ekip ekranından yeni bir davet kodu oluşturun.'},
 {id:'join_approved',name:'Katılım onaylandı',trigger:'join_approved',kind:'service',enabled:true,locked:true,subject:'{{firma}} çalışma alanına katılımınız onaylandı',body:'Merhaba {{ad}},\n\n{{firma}} çalışma alanına katılım isteğiniz onaylandı. Giriş yaparak çalışmaya başlayabilirsiniz: {{uygulama}}\n\nHangi projeleri göreceğinizi çalışma alanı yöneticisi belirler.'},
 {id:'verify_email',name:'E-posta doğrulama',trigger:'verify_email',kind:'service',enabled:true,locked:true,subject:'E-posta adresinizi doğrulayın',body:'Merhaba {{ad}},\n\nbürOS hesabınızın e-posta adresini doğrulamak için bağlantıya tıklayın:\n{{dogrulama_linki}}\n\nBu hesabı siz açmadıysanız e-postayı dikkate almayın.'},
 {id:'password_reset',name:'Parola sıfırlama',trigger:'password_reset',kind:'service',enabled:true,locked:true,subject:'bürOS parola sıfırlama',body:'Merhaba {{ad}},\n\nParolanızı sıfırlamak için aşağıdaki bağlantıyı kullanın. Bağlantı 1 saat geçerlidir ve yalnızca bir kez kullanılabilir.\n{{sifirlama_linki}}\n\nBu isteği siz yapmadıysanız e-postayı dikkate almayın; parolanız değişmez.'},
 {id:'trial_ending',name:'Deneme bitiyor (3 gün kala)',trigger:'trial_ending',kind:'service',enabled:true,subject:'Deneme sürenizin bitmesine {{kalan_gun}} gün kaldı',body:'Merhaba {{ad}},\n\n{{firma}} çalışma alanınızın deneme süresi {{deneme_bitis}} tarihinde sona eriyor. Kesintisiz devam etmek için bir plan seçin; verileriniz olduğu gibi kalır.\n\n{{uygulama}}'},
 {id:'trial_expired',name:'Deneme sona erdi',trigger:'trial_expired',kind:'service',enabled:true,subject:'{{firma}} deneme süresi sona erdi',body:'Merhaba {{ad}},\n\n{{firma}} çalışma alanınızın deneme süresi doldu. Kayıtlarınız silinmedi; çalışma alanı şu an salt okunur. Bir plan seçtiğinizde kaldığınız yerden devam edebilirsiniz.\n\n{{uygulama}}'},
 {id:'inactive',name:'14 gündür giriş yapmayanlar',trigger:'inactive_14',kind:'marketing',enabled:false,subject:'{{firma}} sizi bekliyor',body:'Merhaba {{ad}},\n\nBir süredir bürOS\'a uğramadınız. Geciken teslimleri ve yaklaşan tarihleri genel bakış ekranında tek bakışta görebilirsiniz.\n\n{{uygulama}}'}
];
function createAutomations(storage,{mailer,auth,publicUrl}){
 const data=storage.doc('automations')||{rules:[],log:{},campaigns:[]};
 data.rules=RULES.map(r=>({...r,...(data.rules.find(x=>x.id===r.id)||{}),trigger:r.trigger,kind:r.kind,locked:!!r.locked}));
 data.log??={};data.campaigns??=[];
 const save=()=>storage.setDoc('automations',data);save();
 const date=iso=>new Date(iso).toLocaleDateString('tr-TR',{day:'numeric',month:'long',year:'numeric'});
 const unsubscribeUrl=a=>`${publicUrl()}/abonelik?t=${a.unsubToken}`;
 function vars(account,space,extra={}){const b=space&&auth.billing(space);return {ad:(account?.name||'').split(' ')[0],ad_soyad:account?.name||'',eposta:account?.email||'',firma:space?.name||'',uygulama:`${publicUrl()}/app`,deneme_bitis:b?date(b.trialEndsAt):'',kalan_gun:b?.daysLeft??'',...extra};}
 async function deliver(rule,to,account,v,key){
  if(key&&data.log[key])return null;
  if(rule.kind==='marketing'&&!account?.marketingConsent)return null;
  const entry=await mailer.send({to,subject:rule.subject,body:rule.body,vars:v,kind:rule.kind,tag:rule.id,unsubscribeUrl:account&&rule.kind==='marketing'?unsubscribeUrl(account):''});
  if(key){data.log[key]=entry.createdAt;save();}
  return entry;
 }
 async function fire(trigger,p){
  const rule=data.rules.find(r=>r.trigger===trigger);if(!rule||(!rule.enabled&&!rule.locked))return;
  if(trigger==='invite'){const {accounts}=auth.all();const target=accounts.find(a=>a.email===p.invitation.email);return deliver(rule,p.invitation.email,target,vars(target,p.space,{davet_eden:p.inviter?.name||'Ekibiniz',davet_linki:p.url}));}
  if(trigger==='join_request'){for(const admin of p.admins||[])await deliver(rule,admin.email,admin,vars(admin,p.space,{talep_eden:p.account.name,talep_eposta:p.account.email,ekip_linki:`${publicUrl()}/app#ekip`}));return;}
  if(trigger==='join_approved')return deliver(rule,p.account.email,p.account,vars(p.account,p.space));
  if(trigger==='verify_email')return deliver(rule,p.account.email,p.account,vars(p.account,null,{dogrulama_linki:p.url}));
  if(trigger==='password_reset')return deliver(rule,p.account.email,p.account,vars(p.account,null,{sifirlama_linki:p.url}));
  return deliver(rule,p.account.email,p.account,vars(p.account,p.space),`${rule.id}:${p.account.id}:${p.space?.id||''}`);
 }
 // Time-based rules; safe to run repeatedly because every send is recorded in the log.
 async function tick(){
  const {accounts,spaces}=auth.all();let sent=0;
  for(const space of spaces){const b=auth.billing(space);if(space.plan!=='trial')continue;
   const trigger=b.expired?'trial_expired':b.daysLeft<=3?'trial_ending':null;if(!trigger)continue;
   const rule=data.rules.find(r=>r.trigger===trigger);if(!rule?.enabled)continue;
   for(const m of space.members.filter(m=>m.role==='admin'&&!m.disabled)){const a=accounts.find(a=>a.id===m.userId);if(a&&!a.disabled&&await deliver(rule,a.email,a,vars(a,space),`${rule.id}:${a.id}:${space.id}`))sent++;}
  }
  const inactive=data.rules.find(r=>r.trigger==='inactive_14');
  if(inactive?.enabled)for(const a of accounts){const last=new Date(a.lastLoginAt||a.createdAt).getTime();if(a.disabled||Date.now()-last<14*DAY)continue;const space=spaces.find(s=>s.members.some(m=>m.userId===a.id&&!m.disabled));if(await deliver(inactive,a.email,a,vars(a,space),`inactive:${a.id}:${new Date(last).toISOString().slice(0,10)}`))sent++;}
  return {sent};
 }
 // Audience segments for campaigns. Campaigns are marketing mail, so consent is always required.
 const SEGMENTS={all:'Tüm izinli kullanıcılar',owners:'Çalışma alanı yöneticileri',trial_active:'Denemesi süren alanların yöneticileri',trial_ending:'Denemesi 3 gün içinde bitecekler',trial_expired:'Denemesi bitmiş alanların yöneticileri',paid:'Ücretli plan kullanan alanlar',no_space:'Hesap açıp alan kurmayanlar',inactive:'14 gündür giriş yapmayanlar'};
 function audience(segment){
  const {accounts,spaces}=auth.all(),admins=s=>s.members.filter(m=>m.role==='admin'&&!m.disabled).map(m=>m.userId);
  const bySpaces=f=>new Set(spaces.filter(f).flatMap(admins));
  const ids={owners:bySpaces(()=>true),trial_active:bySpaces(s=>s.plan==='trial'&&!auth.billing(s).expired),trial_ending:bySpaces(s=>{const b=auth.billing(s);return s.plan==='trial'&&!b.expired&&b.daysLeft<=3;}),trial_expired:bySpaces(s=>auth.billing(s).expired),paid:bySpaces(s=>s.plan!=='trial')}[segment];
  return accounts.filter(a=>!a.disabled&&a.marketingConsent).filter(a=>{
   if(segment==='all')return true;
   if(segment==='no_space')return !spaces.some(s=>s.members.some(m=>m.userId===a.id));
   if(segment==='inactive')return Date.now()-new Date(a.lastLoginAt||a.createdAt).getTime()>=14*DAY;
   return ids.has(a.id);
  });
 }
 async function campaign(v,actor){
  const subject=String(v.subject||'').trim().slice(0,160),body=String(v.body||'').trim().slice(0,8000),name=String(v.name||subject).trim().slice(0,120);
  if(!subject||!body)throw Object.assign(Error('Konu ve içerik gerekli.'),{status:400});
  if(!SEGMENTS[v.segment])throw Object.assign(Error('Hedef kitle geçersiz.'),{status:400});
  const list=audience(v.segment),{spaces}=auth.all(),rule={id:'campaign',kind:'marketing',subject,body};
  const c={id:Date.now().toString(36),name,subject,body,segment:v.segment,createdAt:new Date().toISOString(),createdBy:actor.email,recipients:list.length,sent:0};
  for(const a of list){const space=spaces.find(s=>s.members.some(m=>m.userId===a.id));if(await deliver(rule,a.email,a,vars(a,space)))c.sent++;}
  data.campaigns.unshift(c);save();return c;
 }
 function updateRule(id,v){const r=data.rules.find(r=>r.id===id);if(!r)throw Object.assign(Error('Otomasyon bulunamadı.'),{status:404});if(typeof v.enabled==='boolean'&&!r.locked)r.enabled=v.enabled;if(typeof v.subject==='string'&&v.subject.trim())r.subject=v.subject.trim().slice(0,160);if(typeof v.body==='string'&&v.body.trim())r.body=v.body.trim().slice(0,8000);save();return r;}
 function stats(){const out={};for(const k of Object.keys(data.log)){const id=k.split(':')[0];out[id]=(out[id]||0)+1;}return out;}
 return {fire,tick,campaign,audience,updateRule,rules:()=>data.rules,campaigns:()=>data.campaigns,segments:SEGMENTS,stats};
}
module.exports={createAutomations};
