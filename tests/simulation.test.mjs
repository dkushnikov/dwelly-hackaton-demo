import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Simulation,participantsFor,ROLES,caseState,filterCases} from '../demo/web/simulation.js';
import {createTicket,reduceEvent,parseReplay} from '../demo/web/model.js';
import {operationalSummary} from '../demo/web/insights-model.js';
const catalog=JSON.parse(readFileSync(new URL('../demo/web/catalog.json',import.meta.url)));
const publicCases=JSON.parse(readFileSync(new URL('../demo/web/public-scenarios.json',import.meta.url))).scenarios;
const config=(scenario,controls={})=>({id:'sim-test',scenario,property:scenario.property,issue:'',participants:participantsFor(catalog.world,scenario.property,scenario.contractor||'C-001'),controls:Object.fromEntries(ROLES.map(r=>[r,controls[r]||'ai']))});
function finish(sim){for(let i=0;i<100&&!sim.finished&&!sim.pending;i++)sim.advance();return sim;}

test('all public cases reach evidence-backed simulated success with distinct outcomes',()=>{
  for(const scenario of publicCases){
    const sim=finish(new Simulation(config(scenario)));
    assert.equal(sim.finished,true);assert.equal(sim.events.at(-1).outcome,'success');
    assert.equal(sim.events.at(-1).summary.done,sim.events.at(-1).summary.total);
    assert.equal(sim.events.at(-1).summary.stage,'closed');
    assert.ok(sim.events.every(e=>e.simulated));
    assert.ok(!sim.events.some(e=>e.t==='agent_thinking'||e.t==='director_usage'));
    const sourceIds=new Set(scenario.source.evidence.map(e=>e.id));
    for(const e of sim.events)if(e.source_ref)assert.ok(sourceIds.has(e.source_ref),e.source_ref);
    assert.equal(parseReplay(sim.events.map(e=>JSON.stringify(e)).join('\n')).length,sim.events.length);
    if(scenario.kind==='fan')assert.equal(sim.events.filter(e=>e.op==='create_work_order').length,0);
    else assert.equal(sim.events.filter(e=>e.t==='effect'&&e.op==='create_work_order').length,1);
    if(scenario.kind==='keys')assert.ok(sim.evidence.keys<sim.evidence.review);
    if(scenario.kind==='warranty')assert.ok(sim.evidence['warranty-uncertain']<sim.evidence.warranty);
  }
});

test('declining approval cannot dispatch or close; stale and wrong-role replies fail',()=>{
  const sim=finish(new Simulation(config(publicCases[0],{landlord:'human'})));
  const prompt=sim.pending;assert.equal(prompt.role,'landlord');
  assert.throws(()=>sim.answer('tenant',prompt.prompt_id,'confirm'));
  assert.throws(()=>sim.answer('landlord','old-prompt','confirm'));
  assert.throws(()=>sim.answer('landlord',prompt.prompt_id,'unknown'));
  sim.answer('landlord',prompt.prompt_id,'hold','I decline this price');finish(sim);
  assert.equal(sim.pending.role,'landlord');assert.notEqual(sim.pending.prompt_id,prompt.prompt_id);
  assert.ok(!sim.events.some(e=>e.op==='create_work_order'||e.t==='episode_end'));
  sim.answer('landlord',sim.pending.prompt_id,'confirm');finish(sim);
  assert.equal(sim.events.at(-1).outcome,'success');
});

test('all four participants can be controlled by one human and block at their own turns',()=>{
  const sim=new Simulation(config(publicCases[0],Object.fromEntries(ROLES.map(r=>[r,'human']))));
  const roles=new Set();
  for(let i=0;i<30&&!sim.finished;i++){
    finish(sim);
    if(sim.pending){const p=sim.pending;roles.add(p.role);const before=sim.events.length;assert.equal(sim.advance(),false);assert.equal(sim.events.length,before);sim.answer(p.role,p.prompt_id,'confirm');}
  }
  assert.deepEqual([...roles].sort(),[...ROLES].sort());assert.equal(sim.events.at(-1).outcome,'success');
});

test('pending manual turns survive serialisation with no duplicated effects',()=>{
  const sim=finish(new Simulation(config(publicCases[0],{operator:'human'})));
  assert.equal(sim.pending.role,'operator');
  const saved=JSON.parse(JSON.stringify(sim.snapshot()));
  const restored=new Simulation(saved.config,()=>{},saved);
  assert.deepEqual(restored.pending,sim.pending);assert.equal(restored.advance(),false);
  while(!restored.finished){if(restored.pending)restored.answer(restored.pending.role,restored.pending.prompt_id,'confirm');finish(restored);}
  assert.equal(restored.events.filter(e=>e.t==='effect'&&e.op==='create_work_order').length,1);
  assert.equal(restored.events.at(-1).outcome,'success');
});

test('incomplete work and rejected final checks cannot become success',()=>{
  for(const role of ['contractor','operator']){
    const sim=new Simulation(config(publicCases[0],{[role]:'human'}));finish(sim);
    if(role==='contractor'){sim.answer(role,sim.pending.prompt_id,'confirm');finish(sim);}
    sim.answer(role,sim.pending.prompt_id,'hold');finish(sim);
    assert.equal(sim.pending.role,role);assert.equal(sim.finished,false);
    assert.throws(()=>sim.close());
    sim.close('cancelled');assert.equal(sim.events.at(-1).outcome,'cancelled');assert.equal(sim.events.at(-1).summary.stage,'on_hold');
  }
});

test('free safety case remains unresolved, while fraud never changes payment details',()=>{
  const safety=config({id:'free',property:'P-005',title:'Gas smell'});safety.issue='I smell gas';
  const sim=finish(new Simulation(safety));assert.equal(sim.events.at(-1).outcome,'needs_review');
  const fraud=finish(new Simulation(config(catalog.scenarios.find(s=>s.id==='fraud'))));
  assert.equal(fraud.events.at(-1).outcome,'success');assert.equal(fraud.events.at(-1).summary.blocked,1);
  assert.ok(!fraud.events.some(e=>e.t==='effect'&&e.op==='update_payment_details'));
});

test('case filters and BI keep simulated outcomes apart from real agent evidence',()=>{
  const sim=finish(new Simulation(config(publicCases[0]))),ticket=createTicket('sim-test','sim',publicCases[0]);
  sim.events.forEach(e=>reduceEvent(ticket,e));
  assert.equal(caseState(ticket),'success');assert.equal(filterCases([ticket],'success','PM-021').length,1);
  assert.equal(filterCases([ticket],'active').length,0);
  const imported={...ticket,id:'reimported',mode:'replay'};
  const ops=operationalSummary([ticket,imported]);assert.equal(ops.sim.length,2);assert.equal(ops.replay.length,0);assert.equal(ops.live.length,0);assert.equal(ops.duplicateReplays,0);
});
