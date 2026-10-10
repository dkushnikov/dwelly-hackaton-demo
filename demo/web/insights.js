import {summary,estimate,contractorScores,recommendations,operationalSummary,validateLedger,reviewRecord,median} from './insights-model.js';

const gbp=new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',maximumFractionDigits:0});
const money=n=>n==null?'Not recorded':gbp.format(n);
const decimal=n=>n==null?'—':Number(n).toLocaleString('en-GB',{maximumFractionDigits:1});
const label=s=>String(s||'').replaceAll('_',' ').toLowerCase();
const node=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;};
const btn=(text,cls,action)=>{const e=node('button',cls,text);e.type='button';e.addEventListener('click',action);return e;};
const sum=(rows,key)=>rows.reduce((n,r)=>n+(Array.isArray(r[key])?r[key].length:r[key]||0),0);
function download(name,value,type='application/json'){const url=URL.createObjectURL(new Blob([typeof value==='string'?value:JSON.stringify(value,null,2)],{type}));const a=node('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function textBlock(title,text){const e=node('div','bi-explainer');e.append(node('h3','',title),node('p','',text));return e;}
function selectField(labelText,options,change){const wrapper=node('label','bi-field',labelText),select=node('select');for(const [value,text] of options){const option=node('option','',text);option.value=value;select.append(option);}select.addEventListener('change',()=>change(select.value));wrapper.append(select);return {wrapper,select};}
function table(headers,rows){const wrap=node('div','bi-table-wrap'),t=node('table','bi-table'),head=node('thead'),tr=node('tr');headers.forEach(h=>{const th=node('th','',h);th.scope='col';tr.append(th);});head.append(tr);const body=node('tbody');for(const cells of rows){const row=node('tr');for(const content of cells){const cell=node('td');cell.append(content instanceof Node?content:document.createTextNode(String(content)));row.append(cell);}body.append(row);}t.append(head,body);wrap.append(t);return wrap;}
function stat(title,value,detail,action){const box=action?btn('','bi-stat',action):node('div','bi-stat');box.append(node('span','eyebrow',title),node('strong','',value),node('span','bi-stat-note',detail+(action?' ↗':'')));return box;}
const STORAGE='lettings-insight-reviews-v1';

export async function createIntelligence(root,{getTickets,openTicket,dialog}){
  root.replaceChildren(node('p','notice','Opening the evidence ledger…'));
  const read=async path=>{const response=await fetch(path);if(!response.ok)throw new Error(`Could not load ${path}.`);return response.json();};
  let datasets,rules;
  try{const [corpus,lab,config]=await Promise.all([read('/insights-corpus.json'),read('/insights-lab.json'),read('/insights-rules.json')]);datasets={public_corpus:validateLedger(corpus),portfolio_lab:validateLedger(lab)};rules=config;}
  catch(error){root.replaceChildren(node('p','error-notice',error.message));return {refreshOps(){}};}
  let source='public_corpus',tab='portfolio',type='all',rate=rules.hourly_rate_gbp,page=0,reviews={},storageWorks=true;
  try{const raw=localStorage.getItem(STORAGE);if(raw&&raw.length<1_000_000){const parsed=JSON.parse(raw);if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))reviews=parsed;}}catch{storageWorks=false;}
  const current=()=>datasets[source],jobs=()=>current().jobs.filter(j=>type==='all'||j.case_type===type),cards=()=>recommendations(current(),jobs(),rules,rate);
  const statusFor=card=>['accepted_for_review','rejected','snoozed'].includes(reviews[card.id]?.status)?reviews[card.id].status:'proposed';
  const header=node('section','page-heading bi-heading'),copy=node('div');copy.append(node('div','eyebrow','DWELLY · MONEY INTELLIGENCE'),node('h1','','Good decisions, in perspective.'),node('p','','Follow the money, the workload and the evidence behind every recommendation.'));
  header.append(copy,btn('Export evidence ↓','button secondary',()=>download('dwelly-evidence-ledger.json',{...current(),jobs:jobs(),analysis:{rules,rate_gbp_per_hour:rate,summary:summary(jobs(),rules,rate),recommendations:cards()}})));
  const notice=node('div','bi-source-note'),controls=node('div','bi-controls'),tabs=node('nav','bi-tabs');tabs.setAttribute('aria-label','Intelligence views');
  const sourceField=selectField('Data source',[['public_corpus','Public corpus · 50 cases'],['portfolio_lab','Portfolio lab · 84 simulated jobs']],value=>{source=value;type='all';page=0;setTypes();render();});
  const typeField=selectField('Case type',[['all','All case types']],value=>{type=value;page=0;render();});
  const rateField=node('label','bi-field','Staff rate · estimated £/h'),rateInput=node('input');rateInput.type='number';rateInput.min='0';rateInput.max='500';rateInput.step='1';rateInput.value=String(rate);rateInput.setAttribute('aria-label','Estimated staff hourly rate');rateField.append(rateInput);
  rateInput.addEventListener('change',()=>{const value=Number(rateInput.value);if(!rateInput.value||!Number.isFinite(value)||value<0||value>500){rateInput.value=String(rate);return;}rate=value;render();});
  const upload=node('input');upload.type='file';upload.accept='.json';upload.hidden=true;
  const importButton=btn('Import ledger ↥','text-button',()=>upload.click());
  upload.addEventListener('change',async()=>{const file=upload.files[0];upload.value='';if(!file)return;try{if(file.size>4_000_000)throw new Error('Choose a ledger under 4 MB.');const data=validateLedger(JSON.parse(await file.text()));if(data.kind!=='imported')throw new Error('External ledgers must declare kind: imported.');
    // Bind subsequent human feedback to these actual bytes, not a caller-supplied hash.
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(data.jobs)));data.sha256=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
    datasets.imported=data;if(![...sourceField.select.options].some(o=>o.value==='imported')){const option=node('option','','Imported ledger');option.value='imported';sourceField.select.append(option);}source='imported';sourceField.select.value=source;type='all';page=0;setTypes();render();
  }catch(error){const body=dialog('IMPORT LEDGER','The ledger needs attention');body.append(node('p','',error.message));}});
  controls.append(sourceField.wrapper,typeField.wrapper,rateField,importButton,upload);
  const tabsById=new Map(),content=node('div','bi-content');
  for(const [id,title] of [['portfolio','Portfolio'],['agents','Agent activity'],['review','Review queue'],['method','Method & coverage']]){const b=btn(title,'',()=>{tab=id;render();});tabsById.set(id,b);tabs.append(b);}
  root.replaceChildren(header,notice,controls,tabs,content);
  function setTypes(){typeField.select.replaceChildren();for(const item of ['all',...[...new Set(current().jobs.map(j=>j.case_type))].sort()]){const option=node('option','',item==='all'?'All case types':label(item));option.value=item;typeField.select.append(option);}typeField.select.value=type;}
  function openJobs(ids,title='The cases behind the number'){
    const selected=current().jobs.filter(j=>ids.includes(j.case_id)),body=dialog('SOURCE EVIDENCE',title);
    body.append(node('p','',`${selected.length} cases · ${current().title} · ${current().synthetic?'synthetic data':'imported; source supplied by file'}`));
    body.append(table(['Case','Type','Duration','Staff estimate'],selected.map(j=>[btn(j.case_id+' · '+j.title,'bi-link',()=>openCase(j)),label(j.case_type),`${decimal(j.duration_days)} d`,money(estimate(j,rules,rate).cost)])));
  }
  function openCase(j){
    const body=dialog('CASE EVIDENCE · '+j.case_id,j.title),e=estimate(j,rules,rate);
    body.append(node('p','',j.outcome||'No outcome narrative supplied.'),textBlock('Recorded closure',`${label(j.closure)} · ${(j.closure_refs||j.source_ids).join(', ')}. “Without payment” describes this workflow; it does not prove £0 cost.`));
    body.append(textBlock('Cost ledger',`Invoice: ${j.invoice?money(j.invoice.amount_gbp)+' · VAT '+j.invoice.vat+' · '+j.invoice.source_ids.join(', '):'not recorded'}. Accepted quote: ${j.accepted_quote?money(j.accepted_quote.amount_gbp)+' · VAT '+j.accepted_quote.vat+' · '+j.accepted_quote.source_ids.join(', '):'not recorded'}. Staff estimate: ${e.minutes} min × £${rate}/h ÷ 60 = ${money(e.cost)}. ${e.unknown} unweighted events.`));
    body.append(textBlock('Timing & identity',`${decimal(j.duration_days)} elapsed days (source index; not handling time). Property: ${j.property_id||'not keyed'}, landlord: ${j.landlord_id||'not keyed'}, contractor: ${j.contractor_id||'not keyed'}. Approval wait: ${j.landlord_wait_days==null?'not recorded':decimal(j.landlord_wait_days)+' days · '+j.wait_source_ids.join(', ')}. Rework: ${j.rework==null?'not recorded':String(j.rework)+' · '+j.rework_source_ids.join(', ')}.`));
    body.append(node('h3','bi-subtitle','Intervention ledger'));
    body.append(table(['Event','Kind','Minutes · estimated','Evidence excerpt'],j.interventions.map(i=>[i.source_id,label(i.kind),rules.minutes[i.kind]??'unweighted',i.text])));
    if(j.money_mentions.length){body.append(node('h3','bi-subtitle','Money mentions · unverified, never summed as spend'),table(['Event','Mention','Context'],j.money_mentions.map(m=>[m.source_id,money(m.amount_gbp),m.text])));}
    body.append(textBlock('Source record',`${current().source}\n${j.source_ids.join('\n')}\n${j.history_ref||'Structured record supplied by this dataset'}\nDataset SHA-256: ${current().sha256}`));
  }
  function bars(title,rows,valueKey,format){
    const box=node('section','bi-card');box.append(node('h2','',title));const max=Math.max(1,...rows.map(r=>r[valueKey]));
    if(!rows.length)box.append(node('p','bi-empty','No structured entries in this selection.'));
    for(const row of rows){const b=btn('','bi-bar-row',()=>openJobs(row.ids,label(row.name))),line=node('div','bi-bar-label');line.append(node('span','',label(row.name)),node('b','',format(row[valueKey])));const track=node('div','bi-bar-track'),fill=node('span');fill.style.width=`${100*row[valueKey]/max}%`;track.append(fill);b.append(line,track);box.append(b);}return box;
  }
  function renderPortfolio(){
    const rows=jobs(),s=summary(rows,rules,rate),kpis=node('div','bi-kpis');
    kpis.append(stat('Invoice ledger · gross',s.invoiceTotal==null?'—':money(s.invoiceTotal),`${s.invoiceTotalN}/${s.n} VAT-inclusive invoices`,()=>openJobs(rows.filter(j=>j.invoice?.vat==='included').map(j=>j.case_id),'Recorded VAT-inclusive invoices')),
      stat('Staff cost · estimate',money(s.staffCost),`${decimal(s.minutes/60)} hours · £${rate}/h`,()=>openJobs(rows.map(j=>j.case_id),'Staff cost evidence')),
      stat('Median case duration',s.duration==null?'—':`${decimal(s.duration)} days`,`${s.durationN} dated cases · elapsed time`,()=>openJobs(rows.map(j=>j.case_id),'Case durations')),
      stat('Staff interventions',String(s.staff),`${s.interventions-s.staff} landlord replies excluded`,()=>openJobs(rows.map(j=>j.case_id),'Intervention evidence')));
    content.append(kpis);
    const grid=node('div','bi-overview-grid'),work=bars('Where handling time goes',s.types,'cost',money);work.prepend(node('span','eyebrow','ESTIMATED COST BY CASE TYPE'));work.append(node('p','bi-caption','Click a bar to inspect its cases. This is estimated staff effort, not an invoice or a claim of savings.'));
    const coverage=node('section','bi-card bi-coverage');coverage.append(node('span','eyebrow','HOW MUCH DO WE KNOW?'),node('h2','','The evidence comes first.'));
    const items=[['Invoices',s.invoiceN],['Money mentioned in text',s.moneyN],['Stable contractor IDs',rows.filter(j=>j.contractor_id).length],['Approval wait measured',rows.filter(j=>j.landlord_wait_days!=null).length]];
    for(const [title,n] of items){const line=node('div','bi-coverage-row');line.append(node('span','',title),node('b','',`${n} / ${s.n}`));coverage.append(line);}
    coverage.append(node('p','bi-caption',source==='public_corpus'?'Amounts in messages can be quotes, duplicates or invoices. PDF extraction and approval matching are still needed.':source==='portfolio_lab'?'These financial results were invented to exercise the scoring and review flow. They are not evidence of contractor performance.':'Imported figures are assertions from the supplied ledger; this app does not verify invoices with a payment system.'));
    grid.append(work,coverage);content.append(grid);
    if(s.unknownWeights)content.append(node('p','error-notice',`${s.unknownWeights} intervention entries have no configured time weight. Staff cost is incomplete.`));
    const scores=contractorScores(rows,rules,rate),contractors=node('section','bi-card');contractors.append(node('div','eyebrow','CONTRACTORS · MATCHED WORK'),node('h2','','Price is only part of the picture.'));
    if(!scores.length)contractors.append(node('p','bi-empty','No contractor comparison yet. This corpus has no stable actor IDs and no structured invoice ledger. Explore Portfolio lab for the clearly labelled demonstration.'));
    else{contractors.append(node('p','bi-caption','Cost = VAT-inclusive invoice + estimated staff time. Unknown VAT or time weights exclude a job. ROI proxy compares peers in the same case type and postcode area; it excludes unmeasured delay, rework cost and margin. “—” means insufficient matched evidence.'));
      contractors.append(table(['Contractor','Jobs','Mean cost · approx. 95% interval','ROI proxy','Invoice / quote','Rework'],scores.map(s=>[
        btn(`${s.id} · ${s.name}`,'bi-link',()=>openJobs([...s.ids,...s.peerIds],`${s.id} · jobs and matched peers`)),s.n,
        `${money(s.avg)}${s.interval?' · '+money(s.interval[0])+'–'+money(s.interval[1]):' · n < 3'}`,
        s.roi==null?'—':s.roi.toFixed(2)+'×',s.quoteRatio==null?'—':`${s.quoteRatio.toFixed(2)}× (n=${s.quoteN})`,s.rework==null?'—':`${Math.round(100*s.rework)}% (n=${s.reworkN})`
      ])));}content.append(contractors);
    const homes=[...new Set(rows.map(j=>j.property_id).filter(Boolean))].sort();
    if(homes.length){const properties=node('section','bi-card');properties.append(node('span','eyebrow','PROPERTY CONTEXT'),node('h2','','Workload belongs in context.'),node('p','bi-caption','Totals for this selection, not annualised costs or tenant scores. Different repair types and asset conditions are not adjusted.'));
      properties.append(table(['Property','Landlord IDs','Jobs','Invoice · gross','Staff estimate','Median approval wait'],homes.map(id=>{const group=rows.filter(j=>j.property_id===id),s=summary(group,rules,rate),wait=group.filter(j=>j.landlord_wait_days!=null);return [btn(id+' ↗','bi-link',()=>openJobs(group.map(j=>j.case_id),'Property '+id)),[...new Set(group.map(j=>j.landlord_id).filter(Boolean))].join(', ')||'Not keyed',group.length,`${money(s.invoiceTotal)} (${s.invoiceTotalN}/${s.n})`,money(s.staffCost),wait.length?`${decimal(median(wait.map(j=>j.landlord_wait_days)))} d (n=${wait.length})`:'Not recorded'];})));content.append(properties);}
    if(s.holds.length){const lower=node('div','bi-overview-grid');lower.append(bars('What the hold entries say',s.holds,'n',n=>`${n} entries`));const closures=node('section','bi-card');closures.append(node('span','eyebrow','RECORDED OUTCOMES'),node('h2','','Closed does not always mean paid.'));
      for(const c of s.closures)closures.append(btn(`${label(c.name)}  ·  ${c.n}`,'bi-closure',()=>openJobs(c.ids,label(c.name))));closures.append(node('p','bi-caption','“Closed without payment” is a workflow label. A landlord may have paid directly; no avoided-cost amount is inferred. Hold entries are counts, not days waiting.'));lower.append(closures);content.append(lower);}
    const ledger=node('section','bi-card'),heading=node('div','section-heading');heading.append(node('h2','',`Case ledger · ${rows.length} records`),btn('Download ledger ↓','text-button',()=>download('dwelly-ledger.json',{...current(),jobs:rows})));ledger.append(heading);
    const ordered=rows.toSorted((a,b)=>estimate(b,rules,rate).cost-estimate(a,rules,rate).cost||a.case_id.localeCompare(b.case_id)),start=page*8;
    ledger.append(table(['Case / evidence','Type','Days','Staff estimate','Invoice','Closure'],ordered.slice(start,start+8).map(j=>[btn(j.case_id+' ↗','bi-link',()=>openCase(j)),label(j.case_type),decimal(j.duration_days),money(estimate(j,rules,rate).cost),money(j.invoice?.amount_gbp),label(j.closure)])));
    const paging=node('div','bi-pagination'),prev=btn('← Previous','text-button',()=>{page--;render();}),next=btn('Next →','text-button',()=>{page++;render();});prev.disabled=page===0;next.disabled=start+8>=rows.length;paging.append(prev,node('span','',`${Math.min(start+1,rows.length)}–${Math.min(start+8,rows.length)} of ${rows.length}`),next);ledger.append(paging);content.append(ledger);
  }
  function renderAgents(){
    const ops=operationalSummary(getTickets());content.append(textBlock('The village feeds this view as it runs','Interactive simulation, replay and live sessions stay separate. Events arrive through the same reducer as the game; replay duplicates count once. A finished run is not necessarily a closed maintenance ticket. Playback time is not repair duration.'));
    for(const [key,title] of [['sim','Interactive simulations · no LLM calls'],['live','Live sessions · mock world'],['replay','Recorded sessions · unique sources']]){
      const rows=ops[key],section=node('section','bi-card');section.append(node('h2','',title));
      if(!rows.length){section.append(node('p','bi-empty',key==='live'?'No live sessions in this browser. Start the server with the real agent to collect live activity.':'Start the village or import a recording, then return here.'));content.append(section);continue;}
      const metrics=node('div','bi-kpis');metrics.append(stat(key==='sim'?'Simulated actions':'Confirmed writes',sum(rows,'effects'),key==='sim'?'Browser simulation only':'Deduplicated receipts'),stat('Gate denials',sum(rows,'blocks'),`${sum(rows,'escalations')} gate escalations`),stat('Agent decisions to withhold',sum(rows,'withheld'),'Includes choices requiring no action'),stat('Recorded model tokens',decimal(sum(rows,'tokens')),`${decimal(sum(rows,'directorTokens'))} director tokens separate`));section.append(metrics);
      section.append(table(['Session',key==='sim'?'Simulated actions':'Confirmed writes','Errors','Stage / completion','Model calls','Evidence'],rows.map(r=>[btn(r.title,'bi-link',()=>openTicket(r.id)),r.effects.length,r.errors.length,`${r.stage} · ${r.dodDone}/${r.dodTotal} checklist${r.awaiting?' · waiting for '+r.awaiting:''}`,r.modelTurns,btn('Inspect events ↗','bi-link',()=>{const body=dialog('AGENT TELEMETRY',r.title);body.append(node('p','',`${r.id} · ${r.mode} · ${r.closed?'closed stage recorded':'closed stage not recorded'}`));body.append(table(['Seq','Type','Evidence'],r.events.map(e=>[e.seq,e.t,e.op||e.tool||e.reason||e.stage||(e.usage?JSON.stringify(e.usage):'—')])));body.append(btn('Download event evidence ↓','button secondary',()=>download(`agent-events-${r.id}.json`,r.events)));})])));section.append(node('p','bi-caption','Token totals use model-turn input + output once, excluding cached-read counters and repeated status totals. Token billing, dollar spend and decision quality are not inferred.'));content.append(section);
    }
    if(ops.duplicateReplays)content.append(node('p','notice',`${ops.duplicateReplays} repeated playback(s) excluded from the replay totals.`));
  }
  function reviewCard(card){
    const body=dialog('HUMAN REVIEW · '+card.rule_id,card.title),status=statusFor(card);
    body.append(node('p','',card.why),textBlock('Proposed next step',card.action),textBlock('Authority & value',`Approver: ${card.approver}. Financial benefit: not estimated. ${card.default_if_timeout} ${card.synthetic?'Synthetic evidence: for demo review only.':''}`));
    body.append(btn(`Inspect ${card.case_ids.length} source cases ↗`,'text-button',()=>openJobs(card.case_ids,card.title)));
    const form=node('form'),decision=selectField('Review decision',[['accepted_for_review','Accept for human follow-up'],['rejected','Reject'],['snoozed','Snooze']],()=>{});
    decision.select.value=status==='proposed'?'accepted_for_review':status;
    const reasonLabel=node('label','bi-field','Reason / next step'),reason=node('textarea');reason.required=true;reason.maxLength=2000;reason.setAttribute('aria-label','Review reason');reason.value=reviews[card.id]?.reason||'';reasonLabel.append(reason);
    const outcome=node('details','bi-outcome-form');outcome.append(node('summary','','Record a measured outcome (optional)'));
    const amountLabel=node('label','bi-field','Realised net benefit · GBP (can be negative)'),amount=node('input');amount.type='number';amount.step='0.01';amount.setAttribute('aria-label','Measured net benefit');amount.value=reviews[card.id]?.outcome?.amount_gbp??'';amountLabel.append(amount);
    const evidenceLabel=node('label','bi-field','Outcome evidence reference'),evidence=node('input');evidence.maxLength=300;evidence.setAttribute('aria-label','Outcome evidence reference');evidence.value=reviews[card.id]?.outcome?.source_id||'';evidenceLabel.append(evidence);outcome.append(amountLabel,evidenceLabel,node('p','bi-caption','A reviewer-supplied observation. No saving is verified automatically. No scheduled 30/90/180-day follow-up is configured.'));
    const error=node('p','error-notice');error.hidden=true;const save=node('button','button primary','Save review');save.type='submit';form.append(decision.wrapper,reasonLabel,outcome,error,save);
    form.addEventListener('submit',event=>{event.preventDefault();try{let result=null;if(amount.value||evidence.value){if(!amount.value||!evidence.value.trim())throw new Error('Supply both an outcome amount and an evidence reference.');result={amount_gbp:Number(amount.value),source_id:evidence.value.trim(),reported_by:'human reviewer',verified:false};}reviews[card.id]=reviewRecord(card,decision.select.value,reason.value,result);try{localStorage.setItem(STORAGE,JSON.stringify(reviews));}catch{storageWorks=false;}render();body.replaceChildren(node('h2','','Review saved'),node('p','',storageWorks?'Saved in this browser. Export the review packet to hand it to the agent team.':'Saved for this page session only. Browser storage is unavailable; export before closing.'),node('p','notice','This records feedback only. It does not update a mandate, dispatch work, send a message or move money.'),btn('Export review packet ↓','button primary',exportReview));}catch(err){error.hidden=false;error.textContent=err.message;}});body.append(form);
  }
  function exportReview(){const active=cards(),packet={v:1,exported_at:new Date().toISOString(),dataset:{kind:current().kind,sha256:current().sha256,synthetic:current().synthetic,source:current().source},rules,rate_gbp_per_hour:rate,authority_granted:false,recommendations:active,reviews:active.map(c=>reviews[c.id]).filter(Boolean)};
    const body=dialog('REVIEW PACKET','Evidence, decision and feedback.'),json=node('textarea');json.readOnly=true;json.rows=14;json.setAttribute('aria-label','Review packet JSON');json.value=JSON.stringify(packet,null,2);body.append(node('p','',`${active.length} proposals · ${packet.reviews.length} human reviews. Save the JSON or select and copy it below. This packet has not been sent to the agent.`),json,btn('Download JSON ↓','button primary',()=>download('dwelly-insight-review-packet.json',packet)));
  }
  function renderReview(){
    const active=cards(),reviewed=active.filter(c=>statusFor(c)!=='proposed'),accepted=active.filter(c=>statusFor(c)==='accepted_for_review');
    const metrics=node('div','bi-kpis');metrics.append(stat('Evidence-backed proposals',active.length,'This source and filter'),stat('Reviewed',reviewed.length,'Bound to this data snapshot'),stat('Accepted for follow-up',accepted.length,'No execution permission granted'),stat('Outcome reports',active.filter(c=>reviews[c.id]?.outcome).length,'Reviewer supplied · not verified'));content.append(metrics);
    const strip=node('div','bi-review-strip');strip.append(node('p','',storageWorks?'Feedback is stored locally in this browser. Export it to close the loop with the agent team.':'Browser storage unavailable. Export your feedback before leaving.'),btn('Export review packet ↓','button secondary',exportReview));content.append(strip);
    for(const card of active){const c=node('article','bi-recommendation'),copy=node('div');copy.append(node('span','tag',`${card.rule_id} · ${label(statusFor(card))}`),node('h2','',card.title),node('p','',card.why),node('p','bi-caption',`${card.approver} · ${card.case_ids.length} evidence cases · expected £: not established`));const actions=node('div','bi-recommendation-actions');actions.append(btn('Review proposal →','button secondary',()=>reviewCard(card)),btn('View evidence ↗','text-button',()=>openJobs(card.case_ids,card.title)));c.append(copy,actions);content.append(c);}
    if(!active.length)content.append(node('p','bi-empty','No recommendation passes the configured rules in this selection.'));
    content.append(textBlock('Feedback improves the process through a human','Accepted and rejected proposals, reasons and measured outcomes are exportable. They do not train the model or change its rules. The team can use the packet to write regression cases and review changes to the agent.'));
  }
  function renderMethod(){
    content.append(textBlock('Three different kinds of evidence','Public corpus: indexed synthetic hackathon histories. Portfolio lab: invented repeat jobs for demonstrating contractor comparisons. Agent activity: actual events from a recorded or live agent run in the mock world. These populations are never combined into a single ROI figure.'));
    content.append(textBlock('Staff time and money','Minutes come from configurable intervention weights, multiplied by the selected hourly rate. Landlord replies carry zero staff minutes. Invoice totals cover only structured VAT-inclusive records with source references; unverified text mentions, quotes and payments are not inferred. VAT-exclusive and unknown values remain visible at case level but are excluded from gross totals and contractor comparisons. Compare invoices with quotes only on the same VAT basis.'));
    content.append(table(['Intervention','Assumed minutes'],Object.entries(rules.minutes).map(([kind,n])=>[label(kind),n])));
    content.append(textBlock('Contractor comparison','Effective cost here is invoice + estimated staff time. Peers must have the same case type and postcode area, excluding the subject contractor. A matched comparison requires at least 3 jobs for the contractor and 3 peer jobs for every included case. Missing matches suppress ROI. The own mean is shrunk toward the cohort mean with k = 5. The displayed interval is an approximate 95% interval of the unadjusted mean (mean ± 1.96 × sample SD / √n); it is not a forecast or a fairness guarantee.'));
    content.append(textBlock('Boundaries of these metrics','A finished agent run is not a completed repair. A closed-without-payment label is not a measured saving. Hold counts are not hold duration. Repair reports do not establish tenant liability. No tenant ranking, rent change, payment, tenancy or liability action is implemented. Names, health, household makeup and age are not model inputs.'));
    content.append(textBlock('Review and integration','All cards are proposals, with an approver and sources. Missing financial evidence suppresses savings estimates. Below the sample threshold, contractor comparisons are not ranked. Local review feedback is not an agent command; exporting a packet does not deliver it. The import contract and integration backlog are documented in docs/INTELLIGENCE.md.'));
    content.append(textBlock('Current source',`${current().description}\nSource: ${current().source}\nSHA-256: ${current().sha256}\nRules: ${rules.version} · staff rate: £${rate}/hour`));
    content.append(btn('Download current ledger as an import template ↓','button secondary',()=>download('dwelly-import-template.json',{...current(),kind:'imported',title:'Imported evidence ledger'})));
  }
  function render(){
    notice.replaceChildren(node('span','tag',current().synthetic?'SYNTHETIC DATA':'IMPORTED · NOT INDEPENDENTLY VERIFIED'),node('span','',tab==='agents'?'Agent telemetry uses village sessions; portfolio filters do not affect it.':current().description));
    controls.hidden=tab==='agents';for(const [key,b] of tabsById){b.classList.toggle('active',key===tab);b.setAttribute('aria-current',key===tab?'page':'false');}content.replaceChildren();
    if(tab==='portfolio')renderPortfolio();if(tab==='agents')renderAgents();if(tab==='review')renderReview();if(tab==='method')renderMethod();
  }
  setTypes();render();
  return {refreshOps(){if(tab==='agents'&&!root.hidden)render();}};
}
