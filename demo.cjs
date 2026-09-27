const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ROOT=process.env.BUROS_DATA_DIR||path.join(__dirname,'.buros');
const USERNAME='demo',PASSWORD='demo123456';
(async()=>{
 fs.mkdirSync(path.join(ROOT,'files'),{recursive:true});
 const usersPath=path.join(ROOT,'users.json'),statePath=path.join(ROOT,'workspace.json');
 const users=fs.existsSync(usersPath)?JSON.parse(fs.readFileSync(usersPath,'utf8')):[];
 const salt=crypto.randomBytes(16).toString('hex'),hash=crypto.scryptSync(PASSWORD,salt,64).toString('hex');
 let u=users.find(u=>u.username===USERNAME);
 if(!u){u={id:crypto.randomUUID(),name:'Demo Yönetici',username:USERNAME,grants:[]};users.push(u);}
 Object.assign(u,{role:'admin',disabled:false,salt,hash});
 fs.writeFileSync(usersPath+'.tmp',JSON.stringify(users,null,2));fs.renameSync(usersPath+'.tmp',usersPath);
 if(!fs.existsSync(statePath)){const {seed}=await import('./model.mjs');const data=seed();data.revision=1;fs.writeFileSync(statePath,JSON.stringify(data,null,2));}
 console.log(`Demo hesabı hazır → kullanıcı adı: ${USERNAME}  parola: ${PASSWORD}`);
 require('./server.cjs').start();
})();
