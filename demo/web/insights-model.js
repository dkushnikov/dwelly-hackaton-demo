// Deterministic, source-linked analytics. No LLM, network or policy mutations.
export const median = values => {const a=values.filter(Number.isFinite).toSorted((x,y)=>x-y);return a.length?(a[(a.length-1)>>1]+a[a.length>>1])/2:null;};
export const mean = values => values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
const known = value => Number.isFinite(value)&&value>=0;
const uniq = values => [...new Set(values)];
const group = (rows,key) => {const groups=new Map();for(const row of rows){const k=key(row);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(row);}return groups;};
const sum = (rows,fn) => rows.reduce((n,row)=>n+fn(row),0);
export function estimate(job,rules,rate=rules.hourly_rate_gbp){
  let minutes=0,unknown=0,staff=0;
  for(const i of job.interventions){if(i.kind!=='landlord_approval')staff++;const weight=rules.minutes[i.kind];if(known(weight))minutes+=weight;else unknown++;}
  return {minutes,cost:minutes*rate/60,unknown,staff,source_ids:uniq(job.interventions.map(i=>i.source_id))};
}
export function summary(jobs,rules,rate){
  const estimates=jobs.map(j=>estimate(j,rules,rate)),invoices=jobs.filter(j=>j.invoice),gross=invoices.filter(j=>j.invoice.vat==='included'),duration=jobs.filter(j=>known(j.duration_days));
  const money=jobs.filter(j=>j.money_mentions.length),closures=group(jobs,j=>j.closure);
  return {n:jobs.length,minutes:sum(estimates,e=>e.minutes),staffCost:sum(estimates,e=>e.cost),unknownWeights:sum(estimates,e=>e.unknown),
    staff:sum(estimates,e=>e.staff),interventions:sum(jobs,j=>j.interventions.length),duration:median(duration.map(j=>j.duration_days)),durationN:duration.length,
    invoiceTotal:gross.length?sum(gross,j=>j.invoice.amount_gbp):null,invoiceTotalN:gross.length,invoiceN:invoices.length,moneyN:money.length,
    noPayment:closures.get('CLOSED_WITHOUT_PAYMENT')?.length||0,closures:[...closures].map(([name,rows])=>({name,n:rows.length,ids:rows.map(j=>j.case_id)})),
    source_ids:jobs.flatMap(j=>j.source_ids),
    types:[...group(jobs,j=>j.case_type)].map(([name,rows])=>({name,n:rows.length,minutes:sum(rows,j=>estimate(j,rules,rate).minutes),
      cost:sum(rows,j=>estimate(j,rules,rate).cost),duration:median(rows.map(j=>j.duration_days)),ids:rows.map(j=>j.case_id)})).sort((a,b)=>b.cost-a.cost),
    holds:[...group(jobs.flatMap(j=>Object.entries(j.hold_reasons).map(([name,n])=>({name,n,id:j.case_id}))),h=>h.name)]
      .map(([name,rows])=>({name,n:sum(rows,r=>r.n),ids:uniq(rows.map(r=>r.id))})).sort((a,b)=>b.n-a.n)};
}
function effective(job,rules,rate){return job.invoice?job.invoice.amount_gbp+estimate(job,rules,rate).cost:null;}
export function contractorScores(jobs,rules,rate){
  const eligible=jobs.filter(j=>j.contractor_id&&j.invoice?.vat==='included'&&estimate(j,rules,rate).unknown===0);
  return [...group(eligible,j=>j.contractor_id)].map(([id,rows])=>{
    const costs=rows.map(j=>effective(j,rules,rate)),avg=mean(costs),n=rows.length;
    const variance=n>1?sum(costs,c=>(c-avg)**2)/(n-1):null;
    const interval=n>=rules.minimum_jobs?[Math.max(0,avg-1.96*Math.sqrt(variance/n)),avg+1.96*Math.sqrt(variance/n)]:null;
    // Each job needs a peer contractor in the same case type AND postcode area.
    const matched=rows.map(job=>{
      const peers=eligible.filter(p=>p.contractor_id!==id&&p.case_type===job.case_type&&p.postcode_area&&p.postcode_area===job.postcode_area);
      return peers.length>=rules.minimum_jobs?{job,peers,benchmark:median(peers.map(p=>effective(p,rules,rate)))}:null;
    }).filter(Boolean);
    let roi=null,adjusted=null;
    if(n>=rules.minimum_jobs&&matched.length===n){
      const cohort=uniq(matched.flatMap(m=>[m.job,...m.peers]));
      adjusted=(n*avg+rules.shrinkage_k*mean(cohort.map(j=>effective(j,rules,rate))))/(n+rules.shrinkage_k);
      roi=mean(matched.map(m=>m.benchmark))/adjusted;
    }
    const comparable=rows.filter(j=>j.accepted_quote?.amount_gbp>0&&j.accepted_quote.vat===j.invoice.vat&&j.invoice.vat!=='unknown');
    const observed=rows.filter(j=>typeof j.rework==='boolean');
    return {id,name:rows[0].contractor_name||id,n,avg,interval,adjusted,roi,matchedN:matched.length,
      quoteRatio:comparable.length?mean(comparable.map(j=>j.invoice.amount_gbp/j.accepted_quote.amount_gbp)):null,quoteN:comparable.length,
      rework:observed.length?sum(observed,j=>Number(j.rework))/observed.length:null,reworkN:observed.length,
      ids:rows.map(j=>j.case_id),peerIds:uniq(matched.flatMap(m=>m.peers.map(j=>j.case_id))),source_ids:rows.flatMap(j=>j.invoice.source_ids)};
  }).sort((a,b)=>(b.roi??-1)-(a.roi??-1)||a.id.localeCompare(b.id));
}
function fingerprint(text){let h=2166136261;for(const c of text)h=Math.imul(h^c.charCodeAt(0),16777619);return (h>>>0).toString(16);}
export function recommendations(dataset,jobs,rules,rate){
  if(!jobs.length)return [];
  const cards=[],scope=fingerprint(JSON.stringify([jobs.map(j=>j.case_id).sort(),rules,rate]));
  function add(rule,subject,title,why,rows,action){
    const refs=uniq(rows.flatMap(j=>[...j.source_ids,...j.interventions.map(i=>i.source_id),...(j.invoice?.source_ids||[]),...(j.accepted_quote?.source_ids||[]),...(j.wait_source_ids||[]),...(j.rework_source_ids||[])]));if(!refs.length)return;
    cards.push({id:`${dataset.sha256}:${scope}:${rule.id}:${subject}`,rule_id:rule.id,subject,title,why,action,
      approver:rule.approver,priority:rule.priority,case_ids:rows.map(j=>j.case_id),source_ids:refs,
      expected_gbp:null,confidence:'review required',status:'proposed',synthetic:dataset.synthetic,
      rule_version:rules.version,dataset_sha256:dataset.sha256,default_if_timeout:'Leave the current workflow and mandate unchanged.'});
  }
  for(const rule of rules.rules){
    if(rule.id==='INS-RECORD-MONEY'){
      const missing=jobs.filter(j=>!j.invoice);
      if(missing.length>=rule.min_missing)add(rule,'portfolio','Complete the money trail',`${missing.length} of ${jobs.length} cases lack a structured, evidence-linked invoice.`,missing,'Review attachments and record invoice, accepted quote, VAT treatment and payer. A money mention alone does not verify an invoice.');
    }
    if(rule.id==='INS-REVIEW-HOLDS'){
      const rows=jobs.filter(j=>sum(Object.values(j.hold_reasons),n=>n)>=rule.min_holds);
      if(rows.length)add(rule,'portfolio','Review the long chase chains',`${rows.length} cases contain at least ${rule.min_holds} hold entries.`,rows,'Inspect the reason and actual next owner. Hold counts measure bookkeeping, not elapsed days or fault.');
    }
    if(['INS-REVIEW-VARIANCE','INS-PREFERRED-REVIEW'].includes(rule.id))for(const s of contractorScores(jobs,rules,rate)){
      const rows=jobs.filter(j=>s.ids.includes(j.case_id));
      if(rule.id==='INS-REVIEW-VARIANCE'){
        const pairs=rows.filter(j=>j.accepted_quote?.amount_gbp>0&&j.invoice.vat===j.accepted_quote.vat&&j.invoice.vat!=='unknown');
        const above=pairs.filter(j=>j.invoice.amount_gbp/j.accepted_quote.amount_gbp>rule.ratio_min);
        if(pairs.length>=rule.n_min&&above.length/pairs.length>=rule.share_min)add(rule,s.id,'Check quote-to-invoice changes',`${s.id}: ${above.length} of ${pairs.length} comparable jobs exceed the accepted quote by more than ${Math.round((rule.ratio_min-1)*100)}%.`,pairs,'Review authorised scope variations with the contractor before changing the approved list.');
      }else if(s.n>=rule.n_min&&s.roi>=rule.roi_min&&s.reworkN===s.n&&s.rework<=rule.rework_max){
        const evidence=jobs.filter(j=>[...s.ids,...s.peerIds].includes(j.case_id));
        add(rule,s.id,'Review preferred-contractor status',`${s.id}: ${s.roi.toFixed(2)}× matched cost ratio across ${s.n} jobs; ${Math.round(100*s.rework)}% recorded rework.`,evidence,'Review the cohort and service quality with the landlord. Any mandate edit needs separate written approval. No payment or dispatch is authorised.');
      }
    }
    if(rule.id==='INS-CAP-REVIEW')for(const [id,rows] of group(jobs.filter(j=>j.landlord_id&&j.accepted_quote&&known(j.landlord_wait_days)),j=>j.landlord_id)){
      const below=rows.filter(j=>j.accepted_quote.vat==='included'&&j.accepted_quote.amount_gbp<=rule.amount_gbp);
      const wait=median(rows.map(j=>j.landlord_wait_days));
      if(rows.length>=rule.n_min&&below.length/rows.length>=rule.share_min&&wait>=rule.wait_days_min)add(rule,id,'Discuss the approval threshold',`${id}: ${below.length}/${rows.length} accepted quotes are ≤ £${rule.amount_gbp} including VAT; median approval wait ${wait} days.`,rows,'Compare the existing mandate with these quotes. Ask the landlord to review it in writing; this card makes no change.');
    }
  }
  return cards.sort((a,b)=>a.priority-b.priority||a.id.localeCompare(b.id)).filter((card,index,all)=>all.slice(0,index).filter(c=>c.subject===card.subject).length<5);
}
export function operationalSummary(tickets){
  // Replaying the same baseline again is not another job. Prefer its fullest playback.
  const recordings=new Map(),live=[],sim=[];
  for(const ticket of tickets){
    if(ticket.mode==='sim'||ticket.events.some(e=>e.simulated)){sim.push(ticket);continue;}
    if(ticket.mode==='live'){live.push(ticket);continue;}
    const key=ticket.provenance?.trace_sha256||ticket.id;
    if(!recordings.has(key)||recordings.get(key).events.length<ticket.events.length)recordings.set(key,ticket);
  }
  function aggregate(rows){
    return rows.map(ticket=>{
      const events=[...new Map(ticket.events.map(e=>[e.seq,e])).values()];
      const status=events.findLast(e=>e.t==='status'),refs=(predicate)=>events.filter(predicate).map(e=>`${ticket.id}/#${e.seq}`);
      const turns=events.filter(e=>e.t==='agent_thinking'),director=events.filter(e=>e.t==='director_usage');
      const tokens=rows=>sum(rows,e=>(e.usage?.input||0)+(e.usage?.output||0));
      return {id:ticket.id,title:ticket.scenario.title||ticket.issue||ticket.id,property:ticket.property,mode:ticket.mode,
        effects:refs(e=>e.t==='effect'&&!e.deduplicated),blocks:refs(e=>e.t==='gate'&&e.verdict==='deny'),
        escalations:refs(e=>e.t==='gate'&&e.verdict==='escalate'),withheld:refs(e=>e.t==='withheld'),
        errors:refs(e=>e.t==='error'||e.t==='tool_result'&&(e.error||e.status==='failed')),
        modelTurns:turns.length,tokens:tokens(turns),directorTokens:tokens(director),
        usageRefs:refs(e=>e.t==='agent_thinking'||e.t==='director_usage'),
        stage:status?.stage||'unrecorded',closed:status?.stage==='closed'||status?.stage?.startsWith('closed_')||false,
        dodDone:(status?.dod||[]).filter(d=>d.status==='done').length,dodTotal:(status?.dod||[]).length,
        awaiting:ticket.pending?.role||null,ended:ticket.ended,events};
    });
  }
  return {live:aggregate(live),sim:aggregate(sim),replay:aggregate([...recordings.values()]),duplicateReplays:[...tickets].filter(t=>t.mode==='replay'&&!t.events.some(e=>e.simulated)).length-recordings.size};
}
export function validateLedger(value){
  const fail=message=>{throw new Error(`Ledger: ${message}`);};
  const str=(v,max=300)=>typeof v==='string'&&v.length<=max;
  const refs=v=>Array.isArray(v)&&v.length>0&&v.length<=500&&v.every(x=>str(x));
  if(!value||value.v!==1||!['public_corpus','portfolio_lab','imported'].includes(value.kind)||typeof value.synthetic!=='boolean'||!str(value.title)||!str(value.source,1000)||!str(value.description,2000)||!/^[a-f0-9]{64}$/.test(value.sha256))fail('invalid dataset header');
  if(!Array.isArray(value.jobs)||value.jobs.length>5000)fail('expected at most 5,000 jobs');
  const seen=new Set();
  for(const j of value.jobs){
    if(!j||!str(j.case_id)||!j.case_id||seen.has(j.case_id))fail('case IDs must be unique');seen.add(j.case_id);
    for(const k of ['title','case_type','closure'])if(!str(j[k],1000))fail(`invalid ${k}`);
    for(const k of ['outcome','history_ref'])if(j[k]!=null&&!str(j[k],5000))fail(`invalid ${k}`);
    if(j.closure_refs!=null&&!refs(j.closure_refs))fail('invalid closure evidence');
    for(const k of ['property_id','landlord_id','tenancy_id','contractor_id','contractor_name','postcode_area','opened','closed'])if(j[k]!=null&&!str(j[k]))fail(`invalid ${k}`);
    if(!refs(j.source_ids))fail('each case needs source_ids');
    for(const k of ['duration_days','landlord_wait_days','event_count'])if(j[k]!=null&&!known(j[k]))fail(`invalid ${k}`);
    if(j.landlord_wait_days!=null&&!refs(j.wait_source_ids))fail('wait duration needs evidence');
    if(j.rework!=null&&(typeof j.rework!=='boolean'||!refs(j.rework_source_ids)))fail('rework needs a boolean and evidence');
    for(const k of ['invoice','accepted_quote'])if(j[k]!=null&&(!known(j[k].amount_gbp)||!['included','excluded','unknown'].includes(j[k].vat)||!refs(j[k].source_ids)))fail(`${k} needs amount, VAT and evidence`);
    if(!Array.isArray(j.interventions)||j.interventions.length>1000||!j.interventions.every(i=>i&&str(i.kind)&&str(i.source_id)&&i.source_id&&str(i.text,5000)))fail('invalid interventions');
    if(!j.hold_reasons||Array.isArray(j.hold_reasons)||typeof j.hold_reasons!=='object'||!Object.values(j.hold_reasons).every(n=>Number.isInteger(n)&&n>=0))fail('invalid holds');
    if(!Array.isArray(j.money_mentions)||j.money_mentions.length>1000||!j.money_mentions.every(m=>m&&known(m.amount_gbp)&&str(m.source_id)&&str(m.text,5000)))fail('invalid money mentions');
  }
  return value;
}
export function reviewRecord(card,status,reason,outcome=null){
  if(!['accepted_for_review','rejected','snoozed'].includes(status))throw new Error('Choose a review decision.');
  if(typeof reason!=='string'||!reason.trim()||reason.length>2000)throw new Error('Add a reason (up to 2,000 characters).');
  if(outcome&&(!Number.isFinite(outcome.amount_gbp)||!outcome.source_id?.trim()))throw new Error('An outcome needs a measured amount and evidence reference.');
  return {card_id:card.id,rule_id:card.rule_id,status,reason:reason.trim(),outcome,reviewed_at:new Date().toISOString(),
    source_ids:card.source_ids,dataset_sha256:card.dataset_sha256,synthetic:card.synthetic,authority_granted:false};
}
