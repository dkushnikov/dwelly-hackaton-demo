import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {caseOverview,caseAction,filterCaseQueue,decisionEvidence} from '../demo/web/case-view.js';
import {createTicket,reduceEvent,parseReplay} from '../demo/web/model.js';
import {Simulation,simulationConfigFor,ROLES} from '../demo/web/simulation.js';
import {homeSignal} from '../demo/web/village.js';
const world=JSON.parse(readFileSync(new URL('../demo/web/catalog.json',import.meta.url))).world;
const scenarios=JSON.parse(readFileSync(new URL('../demo/web/public-scenarios.json',import.meta.url))).scenarios;
function simulation(kind,manual=[]){
  const scenario=scenarios.find(s=>s.kind===kind),ticket=createTicket(`test-${kind}`,'sim',scenario);
  const config={id:ticket.id,...simulationConfigFor(world,scenario,scenario.property,Object.fromEntries(ROLES.map(role=>[role,manual.includes(role)?'human':'ai'])))};
  const sim=new Simulation(config,e=>reduceEvent(ticket,e));return {sim,ticket};
}
function advance(sim){for(let i=0;i<100&&!sim.pending&&!sim.finished;i++)sim.advance();}
function answer(sim,id='confirm'){const p=sim.pending;sim.answer(p.role,p.prompt_id,id);}
function recording(name){const ticket=createTicket(name,'replay');parseReplay(readFileSync(new URL(`../demo/web/replays/${name}.jsonl`,import.meta.url),'utf8')).forEach(e=>reduceEvent(ticket,e));return ticket;}

test('finished authentic recordings never manufacture repairs, closure or settlement',()=>{
  for(const name of ['routine','approval','fraud','vulnerable']){
    const ticket=recording(name),facts=caseOverview(ticket);
    assert.equal(facts.session,'Playback finished');assert.equal(facts.work.label,'Completion not evidenced');
    assert.equal(facts.closure.label,'Closure not evidenced');assert.equal(facts.financial.label,'Payment not evidenced');
    assert.equal(facts.simulated,false);
  }
  assert.equal(recording('routine').status.disposition,'resolved','a resolved decision still is not a finished repair');
});
test('fan operation, closure and no-payment category stay distinct',()=>{
  const {sim,ticket}=simulation('fan',['operator']);advance(sim);
  let facts=caseOverview(ticket);assert.equal(facts.work.label,'Working after advice');assert.equal(facts.closure.label,'Case remains open');assert.equal(facts.financial.label,'Payment not evidenced');
  assert.ok(!sim.config.participants.contractor);answer(sim);advance(sim);facts=caseOverview(ticket);
  assert.equal(facts.closure.label,'Closed · checks evidenced');assert.equal(facts.financial.label,'Closed without payment');
  assert.match(facts.financial.detail,/does not establish.*zero charge/);assert.equal(facts.financial.evidence,sim.evidence.review);
  assert.match(facts.closure.detail,/No contractor is required/);
});
test('completed lock repair stays open until office keys are physically confirmed',()=>{
  const {sim,ticket}=simulation('keys',['operator']);advance(sim);
  assert.equal(sim.plan[sim.index].id,'keys');let facts=caseOverview(ticket);
  assert.equal(facts.work.label,'Repair reported complete');assert.equal(facts.closure.label,'Case remains open');
  answer(sim,'hold');assert.equal(caseAction(ticket).kind,'clarification');assert.match(caseOverview(ticket).closure.detail,/not confirmed/);
  advance(sim);answer(sim);advance(sim);assert.equal(sim.plan[sim.index].id,'review');assert.equal(caseOverview(ticket).closure.label,'Case remains open');
  answer(sim);advance(sim);facts=caseOverview(ticket);assert.equal(facts.closure.label,'Closed · checks evidenced');assert.equal(facts.financial.label,'Payment not evidenced');
});
test('warranty investigation does not approve chargeable works or assert a completed free repair',()=>{
  const {sim,ticket}=simulation('warranty',['landlord','contractor']);advance(sim);
  assert.equal(sim.pending.choices[0].label,'Investigate warranty cover');assert.match(sim.pending.choices[0].consequence,/investigation only/);
  answer(sim);advance(sim);assert.equal(sim.plan[sim.index].id,'warranty-uncertain');
  assert.equal(caseOverview(ticket).financial.label,'Payment not evidenced');
  answer(sim);advance(sim);assert.equal(sim.plan[sim.index].id,'warranty');
  answer(sim);advance(sim);assert.equal(caseOverview(ticket).financial.label,'Charge-free cover confirmed');assert.equal(caseOverview(ticket).work.label,'Completion not evidenced');
  while(!sim.finished){if(sim.pending)answer(sim);advance(sim);}
  assert.equal(caseOverview(ticket).financial.label,'No landlord charge reported');assert.match(caseOverview(ticket).financial.detail,/No payment is recorded/);
});
test('missing evidence and declined scope stay in the queue and survive restoration',()=>{
  const {sim,ticket}=simulation('keys',['landlord']);advance(sim);answer(sim,'clarify');
  assert.equal(caseAction(ticket).missingDocument,true);assert.equal(filterCaseQueue([ticket],'missing-document').length,1);
  assert.equal(homeSignal([ticket],ticket.property).state,'attention');assert.ok(!sim.events.some(e=>e.t==='effect'&&e.op==='create_work_order'));
  const since=caseAction(ticket).since,snapshot=JSON.parse(JSON.stringify(sim.snapshot()));
  const restoredTicket=createTicket(ticket.id,'sim',ticket.scenario);snapshot.events.forEach(e=>reduceEvent(restoredTicket,e));
  const restored=new Simulation(snapshot.config,e=>reduceEvent(restoredTicket,e),snapshot);advance(restored);
  assert.equal(caseAction(restoredTicket).missingDocument,true);assert.equal(caseAction(restoredTicket).since,since);
  answer(restored,'hold');assert.equal(caseAction(restoredTicket).kind,'declined');assert.match(caseAction(restoredTicket).reason,/decline/);
  assert.equal(filterCaseQueue([restoredTicket],'no-reply').length,1);advance(restored);answer(restored);advance(restored);
  assert.equal(restored.finished,true);assert.equal(filterCaseQueue([restoredTicket],'missing-document').length,0);
});
test('overdue uses the last scenario timestamp, not the computer clock or playback milliseconds',()=>{
  const ticket=createTicket('deadline','live');
  reduceEvent(ticket,{v:1,seq:1,t:'status',owner:'operator',stage:'on_hold',sim_time:'2020-01-01T09:00:00Z',handover:{question:'Review access',deadline:'2020-01-02T09:00:00Z'}});
  assert.equal(caseAction(ticket).overdue,false);
  reduceEvent(ticket,{v:1,seq:2,t:'time_passes',sim_time:'2020-01-03T09:00:00Z',at_ms:1});
  assert.equal(caseAction(ticket).overdue,true);assert.match(caseAction(ticket).deadlineSource,/event #1/);
  assert.equal(filterCaseQueue([ticket],'overdue').length,1);
  ticket.status.handover.deadline=null;assert.equal(caseAction(ticket).overdue,false);assert.equal(caseAction(ticket).deadlineSource,'Not agreed / not recorded');
});
test('recorded handovers remain reviewable without creating a playable human turn',()=>{
  const ticket=recording('vulnerable'),action=caseAction(ticket);
  assert.equal(action.human,true);assert.equal(action.playable,false);assert.equal(action.label,'Review recorded handover →');
  assert.equal(action.overdue,false);assert.equal(action.visit,'Not agreed / not recorded');
  assert.equal(filterCaseQueue([ticket],'needs-human').length,1);assert.equal(filterCaseQueue([ticket],'waiting').length,0);
});
test('the queue ranks overdue obligations first, then human turns; missing dates remain unagreed',()=>{
  const {sim,ticket:manual}=simulation('fan',['tenant']);advance(sim);
  const active=createTicket('active','sim',{title:'New intake'});
  const late=createTicket('late','live');reduceEvent(late,{v:1,seq:1,t:'status',owner:'operator',sim_time:'2026-10-11T12:00:00Z',handover:{question:'Review',deadline:'2026-10-10T12:00:00Z'}});
  assert.deepEqual(filterCaseQueue([active,manual,late]).map(t=>t.id),['late',manual.id,'active']);
  const action=caseAction(manual);assert.equal(action.deadline,null);assert.equal(action.deadlineSource,'Not agreed / not recorded');assert.equal(action.visit,'Not agreed / not recorded');
});
test('consequence text and participant evidence survive export, but replay cannot send decisions',()=>{
  const {sim,ticket}=simulation('fan',['tenant']);advance(sim);
  assert.equal(sim.pending.choices.length,3);assert.ok(sim.pending.choices.every(c=>typeof c.consequence==='string'&&c.consequence.length>20));
  assert.match(sim.pending.choices.find(c=>c.id==='hold').consequence,/does not automatically book a repair/);
  assert.ok(decisionEvidence(ticket).every(e=>Number.isInteger(e.seq)&&e.simulated));
  const replay=createTicket('imported','replay');parseReplay(sim.events.map(e=>JSON.stringify(e)).join('\n')).forEach(e=>reduceEvent(replay,e));
  assert.equal(caseAction(replay).playable,false);assert.equal(caseOverview(replay).simulated,true);
  assert.deepEqual(replay.pending.choices,sim.pending.choices);
});
test('unknown live result contracts and financial prose are not converted to confirmed facts',()=>{
  const ticket=createTicket('live','live');reduceEvent(ticket,{v:1,seq:1,t:'status',stage:'closed',owner:'agency',recap:'Paid £120; all fixed',case_facts:{financial:{label:'Paid',detail:'Unrecognised live contract'}}});
  const facts=caseOverview(ticket);assert.equal(facts.financial.label,'Payment not evidenced');assert.equal(facts.work.label,'Completion not evidenced');
  assert.equal(facts.closure.label,'Closed in recorded status');assert.equal(ticket.ended,false);
});
