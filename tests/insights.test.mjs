import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {summary,estimate,contractorScores,recommendations,operationalSummary,validateLedger,reviewRecord} from '../demo/web/insights-model.js';
import {createTicket,reduceEvent,parseReplay} from '../demo/web/model.js';
const read=name=>JSON.parse(readFileSync(new URL(`../demo/web/${name}.json`,import.meta.url),'utf8'));
const rules=read('insights-rules'),corpus=validateLedger(read('insights-corpus')),lab=validateLedger(read('insights-lab'));

test('public corpus distinguishes staff from landlord effort; money mentions are not spend',()=>{
  const s=summary(corpus.jobs,rules,30);
  assert.equal(s.n,50);assert.equal(s.interventions,635);assert.equal(s.staff,595);
  assert.equal(s.minutes,1325);assert.equal(s.staffCost,662.5);assert.equal(s.duration,13);
  assert.equal(s.moneyN,13);assert.equal(s.noPayment,17);assert.equal(s.invoiceTotal,null);
  assert.equal(s.unknownWeights,0);assert.deepEqual(contractorScores(corpus.jobs,rules,30),[]);
});
test('staff-rate what-if changes estimates only; zero rate and empty filter are valid',()=>{
  const a=summary(lab.jobs,rules,30),b=summary(lab.jobs,rules,60);
  assert.equal(b.staffCost,a.staffCost*2);assert.equal(b.invoiceTotal,a.invoiceTotal);
  assert.equal(summary(lab.jobs,rules,0).staffCost,0);
  assert.equal(summary([],rules,30).duration,null);assert.equal(summary([],rules,30).invoiceTotal,null);
});
test('only matched repeat jobs can produce a contractor comparison',()=>{
  const scores=contractorScores(lab.jobs,rules,30),good=scores.find(s=>s.id==='C-001'),over=scores.find(s=>s.id==='C-007');
  assert.equal(good.n,12);assert.ok(good.roi>1.2);assert.ok(over.roi<.8);assert.equal(over.rework,1/3);
  assert.ok(good.interval[0]<good.avg&&good.interval[1]>good.avg);
  assert.equal(scores.find(s=>s.id==='C-002').roi,null);
  assert.ok(contractorScores(lab.jobs.filter(j=>j.contractor_id==='C-001'),rules,30).every(s=>s.roi===null));
  const oneEach=lab.jobs.filter(j=>j.case_id.endsWith('-01'));
  assert.ok(contractorScores(oneEach,rules,30).every(s=>s.roi===null&&s.interval===null));
  const otherArea=structuredClone(lab.jobs);otherArea.filter(j=>j.contractor_id==='C-007').forEach(j=>j.postcode_area='SW');
  assert.ok(contractorScores(otherArea,rules,30).every(s=>s.roi===null));
});
test('VAT and missing weights cannot silently contaminate gross costs',()=>{
  const job=structuredClone(lab.jobs[0]);job.invoice.vat='excluded';
  assert.equal(summary([job],rules,30).invoiceN,1);assert.equal(summary([job],rules,30).invoiceTotal,null);
  assert.deepEqual(contractorScores([job],rules,30),[]);
  job.invoice.vat='included';job.interventions.push({kind:'new_unknown_kind',source_id:'ev-new',text:'Unweighted action'});
  assert.equal(estimate(job,rules,30).unknown,1);assert.deepEqual(contractorScores([job],rules,30),[]);
});
test('rules fire on intended portfolio and paired controls suppress them',()=>{
  const cards=recommendations(lab,lab.jobs,rules,30);
  assert.deepEqual(new Set(cards.map(c=>c.rule_id)),new Set(['INS-REVIEW-VARIANCE','INS-PREFERRED-REVIEW','INS-CAP-REVIEW']));
  assert.ok(cards.every(c=>c.expected_gbp===null&&c.source_ids.length>0&&c.synthetic));
  assert.ok(cards.find(c=>c.rule_id==='INS-REVIEW-VARIANCE').source_ids.some(s=>s.endsWith('/invoice')));
  const control=structuredClone(lab.jobs);for(const j of control){j.invoice.amount_gbp=j.accepted_quote.amount_gbp;j.landlord_wait_days=1;j.rework=false;}
  const negative=recommendations({...lab,jobs:control},control,rules,30);
  assert.ok(!negative.some(c=>c.rule_id==='INS-REVIEW-VARIANCE'||c.rule_id==='INS-CAP-REVIEW'));
  assert.deepEqual(recommendations(lab,[],rules,30),[]);
});
test('feedback is evidence-bound and never confers authority',()=>{
  const card=recommendations(lab,lab.jobs,rules,30)[0];
  assert.throws(()=>reviewRecord(card,'accepted_for_review',''));
  assert.throws(()=>reviewRecord(card,'done','Reason'));
  assert.throws(()=>reviewRecord(card,'accepted_for_review','Review',{amount_gbp:100,source_id:''}));
  const review=reviewRecord(card,'rejected','Scope variation is missing.');assert.equal(review.authority_granted,false);
  const changed=recommendations(lab,lab.jobs,rules,50).find(c=>c.rule_id===card.rule_id);
  assert.notEqual(changed.id,card.id);assert.equal(review.dataset_sha256,lab.sha256);
});
test('imports reject duplicates, non-finite values, malformed evidence and unsafe shapes',()=>{
  const source={...structuredClone(lab),kind:'imported'};assert.equal(validateLedger(source),source);
  for(const mutate of [d=>d.jobs.push(d.jobs[0]),d=>d.jobs[0].invoice.amount_gbp=-1,d=>d.jobs[0].invoice.source_ids=[],d=>d.jobs[0].landlord_wait_days=NaN,d=>d.jobs[0].closure_refs='not an array',d=>d.jobs[0].money_mentions=[null],d=>d.jobs[0].source_ids=[],d=>d.jobs[0].rework='false']){
    const bad=structuredClone(lab);mutate(bad);assert.throws(()=>validateLedger(bad));
  }
});
test('operational metrics separate live and replay, deduplicate playback and count usage once',()=>{
  const events=parseReplay(readFileSync(new URL('../demo/web/replays/routine.jsonl',import.meta.url),'utf8'));
  const replay=createTicket('one','replay'),duplicate=createTicket('two','replay');
  events.forEach(e=>{reduceEvent(replay,e);reduceEvent(duplicate,e);});
  const live=createTicket('live','live');events.forEach(e=>reduceEvent(live,e));
  const ops=operationalSummary([replay,duplicate,live]);assert.equal(ops.replay.length,1);assert.equal(ops.live.length,1);assert.equal(ops.duplicateReplays,1);
  assert.equal(ops.replay[0].effects.length,6);assert.equal(ops.replay[0].blocks.length,0);assert.equal(ops.replay[0].closed,false);
  const actual=events.filter(e=>e.t==='agent_thinking').reduce((n,e)=>n+e.usage.input+e.usage.output,0);
  assert.equal(ops.replay[0].tokens,actual);
});
test('untrusted evidence is rendered with textContent, not HTML',()=>{
  assert.equal(/\.innerHTML\s*=/.test(readFileSync(new URL('../demo/web/insights.js',import.meta.url),'utf8')),false);
});
