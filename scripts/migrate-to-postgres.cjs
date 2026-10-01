// Copies a file-based installation (BUROS_DATA_DIR, default .buros) into PostgreSQL (DATABASE_URL).
// With S3_BUCKET set, uploaded files are copied to object storage as well; otherwise keep the
// files/ directories on the server's disk. Safe to re-run: rows are upserted.
//   DATABASE_URL=postgres://... node scripts/migrate-to-postgres.cjs
const fs=require('node:fs'),path=require('node:path');
const {createStorage}=require('../storage.cjs');
const {migrateLegacy}=require('../auth.cjs');
(async()=>{
 const root=process.env.BUROS_DATA_DIR||path.join(__dirname,'..','.buros');
 if(!process.env.DATABASE_URL)throw Error('DATABASE_URL tanımlı değil.');
 if(!fs.existsSync(root))throw Error(`Veri klasörü bulunamadı: ${root}`);
 migrateLegacy(root);
 const source=await createStorage({root,databaseUrl:null,s3:null});
 const target=await createStorage({root,exclusive:false});
 for(const name of ['accounts','spaces','leads','outbox','sessions']){
  const rows=source.collection(name),into=target.collection(name);
  if(name==='leads')for(const l of rows)l.id??=require('node:crypto').randomUUID();
  const ids=new Set(into.map(r=>r.id??r.tokenHash));
  for(const r of rows)if(!ids.has(r.id??r.tokenHash))into.push(r);
  target.save(name);console.log(`${name}: ${rows.length}`);
 }
 if(source.doc('automations'))target.setDoc('automations',source.doc('automations'));
 let workspaces=0,files=0;
 for(const space of source.collection('spaces')){
  const state=await source.loadWorkspace(space.id);if(state){await target.saveWorkspace(space.id,state);workspaces++;}
  if(target.filesKind==='s3'){const dir=path.join(root,'spaces',space.id,'files');if(!fs.existsSync(dir))continue;
   for(const f of fs.readdirSync(dir).filter(f=>!f.endsWith('.json'))){const meta=JSON.parse(fs.readFileSync(path.join(dir,f+'.json'),'utf8'));if(await target.files.meta(space.id,f))continue;await target.files.put(space.id,f,fs.readFileSync(path.join(dir,f)),meta);files++;}}
 }
 await target.flush();
 if(target.failures())throw Error('Bazı kayıtlar yazılamadı; çıktıyı kontrol edin.');
 console.log(`Çalışma alanı: ${workspaces}${target.filesKind==='s3'?` · S3'e kopyalanan dosya: ${files}`:' · dosyalar diskte kalıyor'}`);
 await target.close();console.log('Aktarım tamamlandı.');
})().catch(e=>{console.error('Aktarım başarısız:',e.message);process.exit(1);});
