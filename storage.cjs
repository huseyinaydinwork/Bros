const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
// Persistence for bürOS. Everything the server needs is kept in memory and written through to
// one of two backends: JSON files under the data directory (development, single machine) or
// PostgreSQL (production, set DATABASE_URL). Uploaded files go to disk or to S3-compatible
// object storage (set S3_BUCKET). The in-memory model assumes a single application instance.
const COLLECTIONS=['accounts','spaces','leads','outbox','sessions'];
const DOCS=['automations'];
const read=(f,d)=>{try{return fs.existsSync(f)?JSON.parse(fs.readFileSync(f,'utf8')):d;}catch{return d;}};
const writeFile=(f,v)=>{fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f+'.tmp',typeof v==='string'||Buffer.isBuffer(v)?v:JSON.stringify(v,null,2));fs.renameSync(f+'.tmp',f);};
const keyOf=(name,row)=>name==='sessions'?row.tokenHash:row.id;

function fileBackend(root){
 return {kind:'file',
  async loadCollection(name){return read(path.join(root,name+'.json'),[]);},
  async saveCollection(name,rows){writeFile(path.join(root,name+'.json'),rows);},
  async loadDoc(name){return read(path.join(root,name+'.json'),null);},
  async saveDoc(name,value){writeFile(path.join(root,name+'.json'),value);},
  async loadWorkspace(id){return read(path.join(root,'spaces',id,'workspace.json'),null);},
  async saveWorkspace(id,state){writeFile(path.join(root,'spaces',id,'workspace.json'),state);},
  async close(){}
 };
}

async function pgBackend(url){
 const {Pool}=require('pg');
 const ssl=/sslmode=(require|verify)/.test(url)||process.env.DATABASE_SSL==='1'?{rejectUnauthorized:process.env.DATABASE_SSL_INSECURE!=='1'}:undefined;
 const pool=new Pool({connectionString:url.replace(/[?&]sslmode=[^&]*/,''),ssl,max:Number(process.env.DATABASE_POOL)||10});
 await pool.query(`create table if not exists buros_records(kind text not null,id text not null,data jsonb not null,updated_at timestamptz not null default now(),primary key(kind,id));
  create table if not exists buros_workspaces(space_id text primary key,revision integer not null default 0,data jsonb not null,updated_at timestamptz not null default now());`);
 const last=new Map();// kind -> Map(id -> serialized) so only changed rows are written
 return {kind:'postgres',pool,
  async loadCollection(name){const r=await pool.query('select id,data from buros_records where kind=$1 order by updated_at desc, id',[name]);last.set(name,new Map(r.rows.map(x=>[x.id,JSON.stringify(x.data)])));return r.rows.map(x=>x.data);},
  async saveCollection(name,rows){
   const prev=last.get(name)||new Map(),next=new Map(rows.map(r=>[String(keyOf(name,r)),JSON.stringify(r)]));
   const changed=[...next].filter(([id,json])=>prev.get(id)!==json),removed=[...prev.keys()].filter(id=>!next.has(id));
   if(!changed.length&&!removed.length)return;
   const client=await pool.connect();
   try{await client.query('begin');
    for(const [id,json] of changed)await client.query('insert into buros_records(kind,id,data,updated_at) values($1,$2,$3::jsonb,now()) on conflict(kind,id) do update set data=excluded.data,updated_at=now()',[name,id,json]);
    if(removed.length)await client.query('delete from buros_records where kind=$1 and id=any($2::text[])',[name,removed]);
    await client.query('commit');last.set(name,next);
   }catch(e){await client.query('rollback').catch(()=>{});throw e;}finally{client.release();}
  },
  async loadDoc(name){const r=await pool.query("select data from buros_records where kind='doc' and id=$1",[name]);return r.rows[0]?.data??null;},
  async saveDoc(name,value){await pool.query("insert into buros_records(kind,id,data,updated_at) values('doc',$1,$2::jsonb,now()) on conflict(kind,id) do update set data=excluded.data,updated_at=now()",[name,JSON.stringify(value)]);},
  async loadWorkspace(id){const r=await pool.query('select data from buros_workspaces where space_id=$1',[id]);return r.rows[0]?.data??null;},
  async saveWorkspace(id,state){await pool.query('insert into buros_workspaces(space_id,revision,data,updated_at) values($1,$2,$3::jsonb,now()) on conflict(space_id) do update set revision=excluded.revision,data=excluded.data,updated_at=now()',[id,state.revision||0,JSON.stringify(state)]);},
  async close(){await pool.end();}
 };
}

// ---- Files: local disk or S3-compatible object storage (AWS S3, Cloudflare R2, MinIO, ...) ----
function diskFiles(root){
 const dir=id=>path.join(root,'spaces',id,'files');
 return {kind:'disk',
  async put(spaceId,id,bytes,meta){fs.mkdirSync(dir(spaceId),{recursive:true});fs.writeFileSync(path.join(dir(spaceId),id),bytes,{flag:'wx'});fs.writeFileSync(path.join(dir(spaceId),id+'.json'),JSON.stringify(meta));},
  async meta(spaceId,id){return read(path.join(dir(spaceId),id+'.json'),null);},
  async open(spaceId,id){const f=path.join(dir(spaceId),id);return fs.existsSync(f)?fs.createReadStream(f):null;}
 };
}
const sha256=v=>crypto.createHash('sha256').update(v).digest('hex');
const hmac=(k,v)=>crypto.createHmac('sha256',k).update(v).digest();
const rfc3986=s=>encodeURIComponent(s).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
// AWS Signature Version 4, header-based. Exported for tests against the published AWS example.
function signV4({method,url,headers={},payloadHash,accessKeyId,secretAccessKey,region,service='s3',now=new Date()}){
 const u=new URL(url),amzDate=now.toISOString().replace(/[:-]|\.\d{3}/g,''),day=amzDate.slice(0,8);
 const all={...Object.fromEntries(Object.entries(headers).map(([k,v])=>[k.toLowerCase(),String(v).trim()])),host:u.host,'x-amz-date':amzDate};
 if(payloadHash)all['x-amz-content-sha256']=payloadHash;
 const names=Object.keys(all).sort(),signedHeaders=names.join(';');
 const query=[...u.searchParams].sort(([a,x],[b,y])=>a===b?(x<y?-1:1):(a<b?-1:1)).map(([k,v])=>`${rfc3986(k)}=${rfc3986(v)}`).join('&');
 const canonicalPath=service==='s3'?u.pathname.split('/').map(s=>rfc3986(decodeURIComponent(s))).join('/'):u.pathname;
 const request=[method,canonicalPath||'/',query,names.map(n=>`${n}:${all[n]}\n`).join(''),signedHeaders,payloadHash||sha256('')].join('\n');
 const scope=`${day}/${region}/${service}/aws4_request`,toSign=['AWS4-HMAC-SHA256',amzDate,scope,sha256(request)].join('\n');
 const key=hmac(hmac(hmac(hmac('AWS4'+secretAccessKey,day),region),service),'aws4_request');
 const signature=crypto.createHmac('sha256',key).update(toSign).digest('hex');
 return {...all,authorization:`AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`};
}
function s3Files(cfg){
 const base=`${cfg.endpoint.replace(/\/$/,'')}/${cfg.bucket}`,key=(s,id)=>`${cfg.prefix||''}${s}/${id}`;
 async function call(method,objectKey,body,contentType){
  const url=`${base}/${objectKey}`,payload=body?sha256(body):'UNSIGNED-PAYLOAD';
  const headers=signV4({method,url,headers:contentType?{'content-type':contentType}:{},payloadHash:body?payload:sha256(''),accessKeyId:cfg.accessKeyId,secretAccessKey:cfg.secretAccessKey,region:cfg.region});
  delete headers.host;
  const r=await fetch(url,{method,headers,body});
  if(r.status===404)return null;
  if(!r.ok)throw Object.assign(Error(`Dosya deposu hatası (${r.status}).`),{status:502});
  return r;
 }
 return {kind:'s3',
  async put(spaceId,id,bytes,meta){await call('PUT',key(spaceId,id),bytes,'application/octet-stream');await call('PUT',key(spaceId,id+'.json'),Buffer.from(JSON.stringify(meta)),'application/json');},
  async meta(spaceId,id){const r=await call('GET',key(spaceId,id+'.json'));return r?await r.json():null;},
  async open(spaceId,id){const r=await call('GET',key(spaceId,id));if(!r)return null;const {Readable}=require('node:stream');return Readable.fromWeb(r.body);}
 };
}

// S3_* variables, or the AWS_* / BUCKET_NAME names that `fly storage create` (Tigris) sets.
function s3FromEnv(e=process.env){
 const bucket=e.S3_BUCKET||e.BUCKET_NAME;if(!bucket)return null;
 const region=e.S3_REGION||e.AWS_REGION||'auto';
 return {bucket,endpoint:e.S3_ENDPOINT||e.AWS_ENDPOINT_URL_S3||`https://s3.${region==='auto'?'eu-central-1':region}.amazonaws.com`,region,accessKeyId:e.S3_ACCESS_KEY_ID||e.AWS_ACCESS_KEY_ID,secretAccessKey:e.S3_SECRET_ACCESS_KEY||e.AWS_SECRET_ACCESS_KEY,prefix:e.S3_PREFIX||''};
}
async function createStorage({root,databaseUrl=process.env.DATABASE_URL,s3=s3FromEnv()}={}){
 fs.mkdirSync(root,{recursive:true});
 const backend=databaseUrl?await pgBackend(databaseUrl):fileBackend(root);
 const files=s3?s3Files(s3):diskFiles(root);
 const data={},docs={},queues=new Map();let pending=Promise.resolve(),failures=0;
 for(const name of COLLECTIONS)data[name]=await backend.loadCollection(name);
 for(const name of DOCS)docs[name]=await backend.loadDoc(name);
 // Writes for the same target run in order; flush() waits for all of them.
 const enqueue=(target,job)=>{const prev=queues.get(target)||Promise.resolve();const next=prev.then(job).catch(e=>{failures++;console.error('[depolama]',target,e.message);});queues.set(target,next);pending=Promise.all([pending,next]);return next;};
 return {kind:backend.kind,filesKind:files.kind,files,
  collection:name=>data[name],
  save:name=>enqueue('c:'+name,()=>backend.saveCollection(name,data[name].slice())),
  doc:name=>docs[name],
  setDoc:(name,value)=>{docs[name]=value;return enqueue('d:'+name,()=>backend.saveDoc(name,structuredClone(value)));},
  loadWorkspace:id=>backend.loadWorkspace(id),
  saveWorkspace:(id,state)=>enqueue('w:'+id,()=>backend.saveWorkspace(id,state)),
  async flush(){await pending;},
  failures:()=>failures,
  health:async()=>{if(backend.pool)await backend.pool.query('select 1');return {storage:backend.kind,files:files.kind,writeFailures:failures};},
  async close(){await this.flush();await backend.close();}
 };
}
module.exports={createStorage,signV4,fileBackend};
