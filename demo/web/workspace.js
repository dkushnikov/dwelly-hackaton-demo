import {STORAGE_KEY} from './simulation.js';

export const REVIEW_KEY='lettings-insight-reviews-v1';
export const RESET_KEY='lettings-village-reset-backup-v1';
const normal=text=>String(text||'').normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ');
const matches=(text,query)=>(String(query).match(/"[^"]+"|\S+/g)||[]).every(term=>normal(text).includes(normal(term).trim()));

export function homeRows(world,tickets){
  return world.properties.map(home=>{
    const cases=tickets.filter(t=>t.property===home.id);
    return {...home,landlord:world.landlords.find(l=>l.id===home.landlord_id),cases,
      active:cases.filter(t=>!t.ended).length,waiting:cases.filter(t=>!t.ended&&t.pending&&t.mode!=='replay').length};
  });
}
export function filterHomes(rows,{query='',landlord='all',status='all'}={}){
  return rows.filter(p=>(landlord==='all'||p.landlord_id===landlord)&&
    (status==='all'||status==='active'&&p.active>0||status==='waiting'&&p.waiting>0||status==='quiet'&&p.active===0)&&
    matches(`${p.id} ${p.address} ${p.tenant} ${p.type} ${p.landlord.name}`,query));
}
export function peopleRows(world,tickets){
  const homes=homeRows(world,tickets);
  const people=[
    ...homes.map(p=>({id:`tenant-${p.id}`,name:p.tenant,role:'tenant',detail:p.id,homes:[p.id]})),
    ...world.landlords.map(l=>({...l,role:'landlord',detail:'Landlord',homes:homes.filter(p=>p.landlord_id===l.id).map(p=>p.id)})),
    ...world.contractors.map(c=>({...c,role:'contractor',detail:c.trade.replaceAll('_',' '),homes:[]})),
    ...world.operators.map((name,i)=>({id:`operator-${i}`,name,role:'operator',detail:'Dwelly operator',homes:[]})),
  ];
  return people.map(person=>{
    const assignments=[];
    for(const t of tickets){
      const p=homes.find(p=>p.id===t.property),role=person.role;
      const id=t.participants?.[role]?.id||(role==='tenant'&&p?`tenant-${p.id}`:role==='landlord'?p?.landlord_id:
        role==='contractor'?t.events.findLast(e=>e.t==='effect'&&e.op==='create_work_order')?.input?.contractor_id:null);
      if(id!==person.id)continue;
      const control=t.mode==='replay'?'recorded':t.controls?.[role]||'unknown';
      assignments.push({id:t.id,property:t.property,control,title:t.scenario.title||t.issue||'Case',active:!t.ended});
    }
    const linked=[...new Set([...person.homes,...assignments.map(a=>a.property)])];
    return {...person,homes:linked,assignments,search:`${person.name} ${person.role} ${person.detail} ${linked.map(id=>{const p=homes.find(p=>p.id===id);return `${id} ${p?.address||''}`;}).join(' ')}`};
  });
}
export function filterPeople(people,{query='',role='all',home='all',control='all'}={}){
  return people.filter(p=>{
    const assignments=p.assignments.filter(a=>home==='all'||a.property===home);
    return (role==='all'||p.role===role)&&(home==='all'||p.homes.includes(home))&&matches(p.search,query)&&
      (control==='all'||control==='unassigned'&&assignments.length===0||assignments.some(a=>a.control===control));
  });
}

// Save the complete undo record before removing any app-owned storage. Never clear the origin.
export function resetLocal(storage,workspace,includeReviews=false){
  const keys=[STORAGE_KEY,...(includeReviews?[REVIEW_KEY]:[])];
  const values=Object.fromEntries(keys.map(key=>[key,storage.getItem(key)]));
  const backup={v:1,created_at:new Date().toISOString(),values,workspace};
  storage.setItem(RESET_KEY,JSON.stringify(backup));
  try{for(const key of keys)storage.removeItem(key);}
  catch(error){for(const [key,value] of Object.entries(values))if(value!==null)storage.setItem(key,value);throw error;}
  return backup;
}
export function readResetBackup(storage){
  const raw=storage.getItem(RESET_KEY);if(!raw)return null;
  const backup=JSON.parse(raw);
  if(backup?.v!==1||!backup.values||!backup.workspace||!Array.isArray(backup.workspace.simulations)||!Array.isArray(backup.workspace.replays)||
    Object.entries(backup.values).some(([key,value])=>![STORAGE_KEY,REVIEW_KEY].includes(key)||(value!==null&&typeof value!=='string')))throw new Error('The reset backup cannot be read.');
  return backup;
}
export function restoreLocal(storage,backup){
  const before=Object.fromEntries(Object.keys(backup.values).map(key=>[key,storage.getItem(key)]));
  try{for(const [key,value] of Object.entries(backup.values)){if(value===null)storage.removeItem(key);else storage.setItem(key,value);}}
  catch(error){for(const [key,value] of Object.entries(before)){if(value===null)storage.removeItem(key);else storage.setItem(key,value);}throw error;}
}
