// Creates a platform admin account (or promotes an existing one) and prints a one-time password.
//   node scripts/create-admin.cjs eposta@ornek.com ["Ad Soyad"]
//   docker compose exec app node scripts/create-admin.cjs eposta@ornek.com
// The password is generated randomly and shown only once; change it after the first login.
// For an existing account the password is reset only when --reset-password is given.
// The server reads accounts at start-up, so restart it afterwards.
const crypto=require('node:crypto'),path=require('node:path');
const {createStorage}=require('../storage.cjs');
const args=process.argv.slice(2),reset=args.includes('--reset-password'),[email,name]=args.filter(a=>a!=='--reset-password');
if(!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){console.error('Kullanım: node scripts/create-admin.cjs eposta@ornek.com ["Ad Soyad"] [--reset-password]');process.exit(1);}
(async()=>{
 const storage=await createStorage({exclusive:false,root:process.env.BUROS_DATA_DIR||path.join(__dirname,'..','.buros')});
 const accounts=storage.collection('accounts'),now=new Date().toISOString(),mail=email.trim().toLowerCase();
 const password=crypto.randomBytes(12).toString('base64url'),salt=crypto.randomBytes(16).toString('hex'),hash=crypto.scryptSync(password,salt,64).toString('hex');
 let a=accounts.find(x=>x.email===mail),created=false;
 if(!a){created=true;a={id:crypto.randomUUID(),email:mail,name:name||mail.split('@')[0],createdAt:now,lastSpaceId:null,prefs:{weeklyDigest:true,overdueEmails:true},unsubToken:crypto.randomBytes(24).toString('hex'),marketingConsent:false,kvkkAcceptedAt:now,emailVerifiedAt:now,salt,hash};accounts.push(a);}
 else if(reset)Object.assign(a,{salt,hash});
 Object.assign(a,{platformAdmin:true,disabled:false});if(name)a.name=name;
 // Drop open sessions when the password changed.
 if(created||reset){const sessions=storage.collection('sessions');for(let i=sessions.length-1;i>=0;i--)if(sessions[i].id===a.id)sessions.splice(i,1);storage.save('sessions');}
 storage.save('accounts');await storage.flush();
 if(storage.failures()){console.error('Kayıt yazılamadı.');process.exit(1);}
 console.log(created?`Platform yöneticisi oluşturuldu: ${mail}`:`${mail} platform yöneticisi yapıldı.`);
 if(created||reset)console.log(`Geçici parola: ${password}\nİlk girişten sonra Ayarlar → Profil bölümünden değiştirin.`);
 else console.log('Parola değişmedi (sıfırlamak için --reset-password ekleyin).');
 console.log('Uygulama çalışıyorsa yeniden başlatın (docker compose restart app / fly apps restart), sonra giriş yapıp /admin adresine gidin.');
 await storage.close();
})().catch(e=>{console.error(e.message);process.exit(1);});
