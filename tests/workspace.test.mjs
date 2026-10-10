import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {homeRows,filterHomes,peopleRows,filterPeople,resetLocal,readResetBackup,restoreLocal,RESET_KEY,REVIEW_KEY} from '../demo/web/workspace.js';
import {STORAGE_KEY,simulationConfigFor,Simulation,ROLES} from '../demo/web/simulation.js';
import {createTicket,reduceEvent} from '../demo/web/model.js';
const {world}=JSON.parse(readFileSync(new URL('../demo/web/catalog.json',import.meta.url)));
const ticket=(id,property,control='ai',mode='sim')=>({id,property,mode,scenario:{title:id},events:[],controls:{tenant:control,landlord:control},ended:false});

test('people filters distinguish same-name tenants and compose home and control within a case',()=>{
  const cases=[ticket('one','P-002','human'),ticket('two','P-004','ai')];
  const people=peopleRows(world,cases);
  assert.equal(people.length,21);
  assert.equal(filterPeople(people,{query:'Sarah Khan'}).length,2);
  assert.deepEqual(filterPeople(people,{query:'sarah',home:'P-002',control:'human'}).map(p=>p.id),['tenant-P-002']);
  assert.deepEqual(filterPeople(people,{role:'landlord',home:'P-004',control:'human'}),[]);
  assert.equal(filterPeople(people,{query:'quickfix plumber'}).length,1);
  // Richmond also names the town in "Kew Road, Richmond". Quotes select the street.
  assert.equal(filterPeople(people,{query:'richmond road',role:'tenant'}).length,2);
  assert.equal(filterPeople(people,{query:'"richmond road"',role:'tenant'}).length,1);
  assert.equal(filterPeople(people,{role:'contractor',control:'unassigned'}).length,7);
});

test('contractor control starts with assignment; recorded controls are never playable',()=>{
  const t=ticket('repair','P-001','human');t.controls.contractor='human';
  assert.equal(filterPeople(peopleRows(world,[t]),{role:'contractor',control:'human'}).length,0);
  t.participants={contractor:{id:'C-005',name:'SecureFast Locksmiths'}};
  assert.equal(filterPeople(peopleRows(world,[t]),{role:'contractor',control:'human',home:'P-001'}).length,1);
  t.mode='replay';
  assert.equal(filterPeople(peopleRows(world,[t]),{control:'human'}).length,0);
  assert.equal(filterPeople(peopleRows(world,[t]),{role:'contractor',control:'recorded'}).length,1);
});

test('homes count active cases and human barriers without treating replay prompts as waiting',()=>{
  const active=ticket('one','P-002');active.pending={role:'tenant'};
  const ended={...ticket('two','P-002'),ended:true};
  const replay={...ticket('three','P-004','human','replay'),pending:{role:'landlord'}};
  const homes=homeRows(world,[active,ended,replay]);
  assert.equal(homes.find(p=>p.id==='P-002').cases.length,2);
  assert.equal(homes.find(p=>p.id==='P-002').active,1);
  assert.deepEqual(filterHomes(homes,{status:'waiting'}).map(p=>p.id),['P-002']);
  assert.equal(filterHomes(homes,{landlord:'L-002',status:'active'}).length,2);
  assert.equal(filterHomes(homes,{query:'sarah p-004'}).length,1);
  assert.equal(filterHomes(homes,{status:'quiet'}).length,4);
});

class Storage {
  data=new Map();failSet=null;failRemove=null;
  getItem(key){return this.data.get(key)??null;}
  setItem(key,value){if(this.failSet===key)throw new Error('Quota exceeded');this.data.set(key,value);}
  removeItem(key){if(this.failRemove===key)throw new Error('Storage unavailable');this.data.delete(key);}
}
const emptyWorkspace=()=>({simulations:[],replays:[],bi:null});
test('local reset is scoped, preserves an undo record and restores a pending simulation',()=>{
  const storage=new Storage(),scenario={id:'routine',property:'P-001',title:'Tap'};
  const cfg={id:'manual',...simulationConfigFor(world,scenario,'P-001',Object.fromEntries(ROLES.map(r=>[r,'human'])))};
  const sim=new Simulation(cfg);while(!sim.pending)sim.advance();
  const state=sim.snapshot();storage.setItem(STORAGE_KEY,JSON.stringify([state]));storage.setItem(REVIEW_KEY,'{"review":"keep"}');storage.setItem('another-app','unchanged');
  resetLocal(storage,{...emptyWorkspace(),simulations:[state]});
  assert.equal(storage.getItem(STORAGE_KEY),null);assert.equal(storage.getItem(REVIEW_KEY),'{"review":"keep"}');assert.equal(storage.getItem('another-app'),'unchanged');
  const backup=readResetBackup(storage);restoreLocal(storage,backup);
  const saved=JSON.parse(storage.getItem(STORAGE_KEY))[0],restored=new Simulation(saved.config,()=>{},saved);
  assert.deepEqual(restored.pending,sim.pending);assert.equal(restored.advance(),false);
  const t=createTicket('manual','sim',scenario);restored.events.forEach(e=>reduceEvent(t,e));assert.equal(t.pending.role,'landlord');
});

test('full local reset and undo include BI reviews but retain unrelated app storage',()=>{
  const storage=new Storage();storage.setItem(REVIEW_KEY,'{"review":"accepted"}');storage.setItem('another-app','keep');
  const backup=resetLocal(storage,emptyWorkspace(),true);assert.equal(storage.getItem(REVIEW_KEY),null);assert.equal(storage.getItem('another-app'),'keep');
  restoreLocal(storage,backup);assert.equal(storage.getItem(REVIEW_KEY),'{"review":"accepted"}');assert.equal(storage.getItem(STORAGE_KEY),null);
});

test('backup failure prevents clearing; partial storage removal rolls back',()=>{
  const storage=new Storage();storage.setItem(STORAGE_KEY,'saved sessions');storage.setItem(REVIEW_KEY,'saved reviews');storage.failSet=RESET_KEY;
  assert.throws(()=>resetLocal(storage,emptyWorkspace(),true),/Quota/);assert.equal(storage.getItem(STORAGE_KEY),'saved sessions');
  storage.failSet=null;storage.failRemove=REVIEW_KEY;
  assert.throws(()=>resetLocal(storage,emptyWorkspace(),true),/Storage/);assert.equal(storage.getItem(STORAGE_KEY),'saved sessions');assert.equal(storage.getItem(REVIEW_KEY),'saved reviews');
});

test('foreign storage keys cannot be restored through a reset backup',()=>{
  const storage=new Storage();storage.setItem(RESET_KEY,JSON.stringify({v:1,workspace:emptyWorkspace(),values:{'another-app':'overwrite'}}));
  assert.throws(()=>readResetBackup(storage),/cannot be read/);
});
