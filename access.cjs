const ROLES = {admin:'Yönetici', lead:'Proje Sorumlusu', staff:'Büro Personeli'};
function levelFor(user, site) {
  if (!user || user.disabled || !site) return null;
  if (user.role === 'admin') return 'edit';
  const grants=(user.grants||[]).filter(g => g.scope==='site'&&g.targetId===site.id || g.scope==='client'&&g.targetId===site.clientId);
  return grants.some(g=>g.level==='edit')?'edit':grants.some(g=>g.level==='view')?'view':null;
}
function clientLevel(user,id){if(user?.role==='admin')return 'edit';const grants=(user?.grants||[]).filter(g=>g.scope==='client'&&g.targetId===id);return grants.some(g=>g.level==='edit')?'edit':grants.some(g=>g.level==='view')?'view':null;}
function financeFor(user,site){if(!user||user.disabled||!site)return false;if(user.role==='admin')return true;return (user.grants||[]).some(g=>g.finance&&(g.scope==='site'&&g.targetId===site.id||g.scope==='client'&&g.targetId===site.clientId));}
function visibleState(state,user){if(!state)return null;const result=structuredClone(state);result.projects=result.projects.filter(p=>levelFor(user,p));result.clients=result.clients.filter(c=>result.projects.some(p=>p.clientId===c.id));result.activity=result.activity.filter(a=>user.role==='admin'||a.projectId&&result.projects.some(p=>p.id===a.projectId));result.finance=(result.finance||[]).filter(e=>{const p=result.projects.find(p=>p.id===e.projectId);return p&&financeFor(user,p);});return result;}
function mergeScoped(state,incoming,user){
 if(user.role==='admin')return incoming;
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),error=()=>{const e=Error('Bu işlem için düzenleme yetkiniz yok.');e.status=403;throw e;};
 for(const key of ['settings','workflows','templates'])if(!same(incoming[key],state[key]))error();
 const visible=visibleState(state,user);
 if(incoming.projects.length!==visible.projects.length||incoming.clients.length!==visible.clients.length)error();
 for(const p of incoming.projects){const old=state.projects.find(x=>x.id===p.id);if(!old||!levelFor(user,old)||p.clientId!==old.clientId)error();if(levelFor(user,old)!=='edit'&&!same(p,old))error();
  if(user.role==='staff'){
   const structure=p=>({name:p.name,location:p.location,archived:p.archived,cover:p.cover,sections:p.sections.map(s=>({id:s.id,name:s.name,weight:s.weight,items:s.items.map(o=>({id:o.id,name:o.name,workflowId:o.workflowId,properties:o.properties.map(({value,...definition})=>definition)}))}))});
   if(!same(structure(p),structure(old)))error();
  }
 }
 for(const c of incoming.clients){const old=state.clients.find(x=>x.id===c.id);if(!old||!visible.clients.some(x=>x.id===c.id))error();if(clientLevel(user,c.id)!=='edit'&&!same(c,old))error();}
 const merged=structuredClone(state);merged.projects=state.projects.map(p=>incoming.projects.find(x=>x.id===p.id)||p);merged.clients=state.clients.map(c=>incoming.clients.find(x=>x.id===c.id)||c);merged.finance=user.role==='admin'?incoming.finance:state.finance;
 const newActivities=incoming.activity.filter(a=>!state.activity.some(b=>b.id===a.id));
 if(newActivities.some(a=>!a.projectId||levelFor(user,state.projects.find(p=>p.id===a.projectId))!=='edit'))error();
 merged.activity=[...newActivities.map(a=>({...a,actor:user.name})),...state.activity].slice(0,500);merged.revision=incoming.revision;return merged;
}
module.exports={ROLES,levelFor,clientLevel,financeFor,visibleState,mergeScoped};
