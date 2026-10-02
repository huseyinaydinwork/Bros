// Minimal ZIP writer (store, no compression) for project downloads. Files are written one by one,
// so memory use is bounded by the largest single file. Names are UTF-8 (general purpose bit 11).
const CRC_TABLE=new Uint32Array(256).map((_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function crc32(buf){let c=0xffffffff;for(let i=0;i<buf.length;i++)c=CRC_TABLE[(c^buf[i])&0xff]^(c>>>8);return (c^0xffffffff)>>>0;}
function dosTime(d){return {time:(d.getHours()<<11)|(d.getMinutes()<<5)|Math.floor(d.getSeconds()/2),date:((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate()};}
// entries: [{path, date, read: async () => Buffer}]
async function writeZip(out,entries){
 const central=[];let offset=0;
 const write=b=>new Promise((resolve,reject)=>{out.write(b,e=>e?reject(e):resolve());});
 for(const e of entries){
  let data;try{data=await e.read();}catch{continue;}if(!data)continue;
  const name=Buffer.from(e.path.replace(/\\/g,'/'),'utf8'),crc=crc32(data),{time,date}=dosTime(e.date||new Date());
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0x0800,6);local.writeUInt16LE(0,8);local.writeUInt16LE(time,10);local.writeUInt16LE(date,12);local.writeUInt32LE(crc,14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(name.length,26);local.writeUInt16LE(0,28);
  await write(Buffer.concat([local,name]));await write(data);
  const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50,0);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(0x0800,8);c.writeUInt16LE(0,10);c.writeUInt16LE(time,12);c.writeUInt16LE(date,14);c.writeUInt32LE(crc,16);c.writeUInt32LE(data.length,20);c.writeUInt32LE(data.length,24);c.writeUInt16LE(name.length,28);c.writeUInt32LE(offset,42);
  central.push(Buffer.concat([c,name]));offset+=30+name.length+data.length;
 }
 const dir=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(central.length,8);end.writeUInt16LE(central.length,10);end.writeUInt32LE(dir.length,12);end.writeUInt32LE(offset,16);
 await write(dir);await write(end);
 return central.length;
}
// Folder-safe name for Windows, macOS and Linux.
const safeName=v=>String(v||'').replace(/[\\/:*?"<>|\x00-\x1f]+/g,'-').replace(/\s+/g,' ').replace(/^[ .]+|[ .]+$/g,'').slice(0,120)||'adsiz';
module.exports={writeZip,crc32,safeName};
