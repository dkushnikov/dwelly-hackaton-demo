import {caseState, filterCaseQueue} from './case-view.js';
export {caseState};

// Deterministic, browser-local roleplay. No provider calls or real-world actions.
// A success is earned from explicit simulated evidence, never from elapsed time.
export const ROLES=['tenant','landlord','contractor','operator'];
export const SIM_VERSION=1;
export const STORAGE_KEY='lettings-village-sim-v1';
function kindFor(scenario,issue=''){
  if(scenario.kind==='free'||scenario.id==='free'){
    if(/bank|payment details|pay me directly/i.test(issue))return 'fraud';
    if(/gas|fire|smoke|flood|sparks/i.test(issue))return 'safety';
  }
  return scenario.kind||scenario.id;
}
const choose=(id,label,body,accept=true)=>({id,label,body,accept});
const yes=(label,body)=>choose('confirm',label,body);
const no=(label='Not yet',body='This is not confirmed. Keep the case open.')=>choose('hold',label,body,false);
const step=(id,stage,role,prompt,body,extra={})=>({id,stage,role,prompt,choices:[yes('Confirm',body),no()],...extra});

export function participantsFor(world,propertyId){
  const p=world.properties.find(p=>p.id===propertyId);
  if(!p)throw new Error('Choose a known property.');
  const l=world.landlords.find(l=>l.id===p.landlord_id);
  return {tenant:{id:`tenant-${p.id}`,name:p.tenant},landlord:{id:l.id,name:l.name},contractor:null,operator:null};
}
export function simulationConfigFor(world,scenario,property,controls,issue=''){
  return {scenario,property,controls,issue,participants:participantsFor(world,property),
    directory:structuredClone({contractors:world.contractors,operators:world.operators})};
}
function contractorTrade(scenario,issue){
  const kind=kindFor(scenario,issue);
  if(kind==='keys')return 'locksmith';
  if(kind==='warranty')return 'general';
  if(kind==='routine')return 'plumber';
  if(['approval','vulnerable'].includes(kind))return 'heating';
  const text=issue||scenario.issue||'';
  if(/lock|\bkeys?\b/i.test(text))return 'locksmith';
  if(/boiler|heating|radiator/i.test(text))return 'heating';
  if(/electri|socket|light|wiring/i.test(text))return 'electrician';
  if(/tap|leak|pipe|plumb|drain|toilet/i.test(text))return 'plumber';
  return 'general';
}

export function planFor(scenario,issue=''){
  const kind=kindFor(scenario,issue);
  const approval=step('approval','landlord_approval','landlord','May we arrange the stated work? Approval is required before dispatch.',
    'I approve this scope of work. Please arrange the repair.',{op:'request_landlord_approval',ref:kind==='keys'?'PM-021/ev006':null,
      choices:[yes('Approve this scope','I approve this scope of work. Please arrange the repair.'),no('Decline / seek another option','I decline this proposal. Do not order the work.')]});
  const access=step('access','visit_scheduling','tenant','Confirm access for the agreed visit.','I confirm access for the agreed visit.',
    {choices:[yes('Confirm access','I confirm access for the agreed visit.'),no('Cannot provide access','I cannot provide access at that time. Please reschedule.')]});
  const complete=step('completion','work_in_progress','contractor','Confirm the agreed work is complete and provide the completion report.',
    kind==='keys'?'The cylinder and handles are replaced. Four keys are allocated: two for the tenant, one for the agency and one for the landlord. Office keys will be delivered next.':
    kind==='warranty'?'The oven repair is complete under the manufacturer warranty. There is no charge to the landlord.':'The agreed repair is complete and the completion report is ready.',
    {ref:kind==='keys'?'PM-021/ev020':kind==='warranty'?'PM-025/ev062':null,
      choices:[yes('Work completed',kind==='keys'?'Cylinder and handles replaced; four keys allocated, office delivery next.':kind==='warranty'?'Warranty repair completed, no charge to the landlord.':'Agreed work completed; completion report supplied.'),no('Work incomplete','The work is incomplete. Keep the case open.')]});
  const review=step('review','final_checks','operator','Review the evidence and confirm every closure check.','I have checked the evidence and approve closing this simulated case.',{ref:kind==='keys'?'PM-021/ev029':null,
    choices:[yes('Pass final checks','I have checked the evidence and approve closing this simulated case.'),no('Reject closure','Evidence is incomplete. Do not close this case.')]});
  if(kind==='fan')return [
    step('advice','landlord_approval','landlord','Do you know how the extractor is operated?','There is a switch to the right-hand side of the hob. Please check that switch.',{ref:'PM-017/ev008'}),
    step('working','result','tenant','Following the landlord’s advice, does the extractor now work?','I found the switch and the extractor fan is working.',{ref:'PM-017/ev011',choices:[yes('Fan works','I found the switch and the extractor fan is working.'),no('Still not working','The fan still does not work. Do not close the case.')]}),
    {...review,prompt:'Tenant confirmation is recorded. Close without a visit, invoice or payment?',ref:'PM-017/ev014'}];
  if(kind==='fraud')return [
    step('fraud-check','intake','operator','A message asks to bypass approval and redirect payment. Block it and verify through trusted records?',
      'Block the payment change. Record the attempted diversion and use contacts on file.',{op:'block_payment_change',choices:[yes('Block and verify','Block the payment change. Record the attempted diversion and use contacts on file.'),no('Need more evidence','Keep the request blocked while I investigate.')]}),
    step('fraud-verified','final_checks','landlord','Using the established contact on file, confirm this diversion was not authorised.',
      'I did not authorise the payment diversion. Keep the existing bank details.'),
    {...review,id:'fraud-review',prompt:'Confirm the request was rejected, bank details remain unchanged and the incident was recorded.'}];
  if(kind==='safety')return [
    step('safety','intake','operator','Review this safety report and confirm the emergency handover in the simulation.',
      'Emergency handover recorded; keep the repair ticket open.',{op:'create_human_task'}),
    {...review,id:'safety-review',prompt:'Confirm the handover is recorded. This simulation cannot confirm a repair.',terminal:'needs_review'}];
  const plan=[];
  if(kind==='vulnerable')plan.push(step('welfare','intake','operator','Record the resident’s vulnerability and confirm a priority welfare handover.',
    'Priority welfare handover recorded. Contact the named representative and arrange urgent attendance.',{op:'create_human_task'}));
  if(kind==='warranty')plan.push(
    {...approval,prompt:'Shall we check the previous installation for a charge-free warranty repair?',ref:'PM-025/ev006'},
    step('warranty-uncertain','provider_selection','contractor','Check the original warranty before committing spend.','The 12-month warranty appears expired. I will check manufacturer cover.',{ref:'PM-025/ev020'}),
    step('warranty','provider_selection','contractor','What did the manufacturer confirm?','The oven is covered by a two-year manufacturer warranty. The repair is charge-free.',{ref:'PM-025/ev042'}));
  else plan.push(approval);
  plan.push(step('provider','provider_selection','contractor','Accept the approved scope and propose an attendance window.',
    'I accept this scope and can attend tomorrow morning.'),access,
    {id:'dispatch',stage:'work_in_progress',action:'create_work_order',requires:kind==='warranty'?['approval','warranty','provider','access']:['approval','provider','access']});
  if(kind==='warranty')plan.push(step('parts','work_in_progress','contractor','Has the engineer completed the repair, or are parts required?',
    'Parts have been ordered. Keep the job open until the follow-up repair.',{ref:'PM-025/ev050',advanceHours:24}));
  plan.push(complete);
  if(kind==='keys')plan.push(step('keys','final_checks','operator','Confirm the office keys were received: one agency key and one landlord key; two keys remain with the tenant.',
    'Office key return confirmed. The four-key distribution is recorded.',{ref:'PM-021/ev028'}));
  if(kind!=='keys'&&kind!=='warranty')plan.push(step('resident-check','result','tenant','Is the repair working as agreed?',
    'The repair is working as agreed.',{choices:[yes('Repair works','The repair is working as agreed.'),no('Problem remains','The problem remains. Keep the ticket open.')]}));
  plan.push(review);
  return plan;
}

// Choice IDs remain compatible with saved turns; the added text describes the actual branch.
export function decisionChoices(s,kind){
  const consequences={
    approval:['Record approval for this stated scope. Provider selection follows; no work order is issued until provider and access are confirmed.','Keep approval unresolved. No contractor dispatch or closure; the same role must reconsider the scope.'],
    advice:['Send the switch instructions to the tenant. Ask whether the fan works; no contractor or invoice is created.','Keep the operating instructions unresolved. Ask the landlord for clarification before checking the fan.'],
    working:['Record the tenant’s confirmation. The operator can review closure without a visit. This does not prove a zero charge.','Record that the fan still fails. Keep the case open with the tenant; this scenario does not automatically book a repair.'],
    'warranty-uncertain':['Record the uncertainty and check manufacturer cover next. No spend or charge-free repair is authorised by this answer.','Keep warranty investigation open. No work order may be issued until cover is confirmed.'],
    warranty:['Record manufacturer cover as simulated evidence. Continue to provider and access confirmation; no payment is made.','Keep cover unconfirmed and request warranty evidence. No work order or paid repair is authorised.'],
    provider:['Record acceptance and a proposed morning window. The tenant must confirm access before dispatch.','Keep provider acceptance unresolved. No work order is issued.'],
    access:['Record access confirmation. The next step may issue one simulated work order if all dispatch checks pass.','Keep access unresolved and request a new arrangement. No work order is issued; a replacement time is not invented.'],
    parts:['Record the parts wait. The repair remains incomplete until a separate completion report is confirmed.','Keep the parts update unresolved. Completion and closure remain blocked.'],
    completion:['Record a simulated completion report. Remaining key-return, resident or operator checks must still pass before closure.','Record incomplete work. Keep the case open; no completion or successful closure is claimed.'],
    keys:['Record physical office key return and the four-key distribution. Final operator review follows.','Keep office key return unconfirmed, even if the lock is repaired. Closure remains blocked.'],
    review:['Approve closure once every simulated check is present. Close the case next; no invoice settlement or payment is created.','Reject closure. Keep the case open for the operator to obtain the missing evidence.'],
  };
  const pair=consequences[s.id]||['Record this confirmation and continue to the next scenario check.','Keep this check unresolved. No later scenario action or closure occurs.'];
  const labels={advice:['Share switch instructions','Instructions unclear'], 'warranty-uncertain':['Check manufacturer cover','Need warranty records'],warranty:['Confirm manufacturer cover','Cover not confirmed'],parts:['Parts ordered; repair pending','Parts update missing'],keys:['Office keys received','Office keys still missing']};
  const choices=s.choices.map((c,index)=>({...c,label:labels[s.id]?.[index]||c.label,consequence:pair[c.accept?0:1],
    wait_kind:c.accept?null:['warranty','warranty-uncertain','parts','review'].includes(s.id)?'missing_document':s.id==='approval'?'declined':s.id==='access'?'no_access':'clarification'}));
  if(['fan','keys','warranty'].includes(kind))choices.push({id:'clarify',label:'Request supporting evidence',accept:false,wait_kind:'missing_document',
    body:`Supporting evidence is missing for this decision: ${s.prompt} Keep this step open.`,
    consequence:'Record an evidence request and keep this decision open with the same participant. No later action or closure occurs until a new confirmation.'});
  if(kind==='warranty'&&s.id==='approval'){
    choices[0].label='Investigate warranty cover';
    choices[0].body='Please investigate the previous installation and manufacturer cover. I have not authorised chargeable work.';
    choices[0].consequence='Authorise warranty investigation only. Manufacturer cover, provider acceptance and access must be confirmed before a charge-free work order.';
  }
  if(kind==='fan'&&s.id==='review')choices[0].label='Close after tenant confirmation';
  return choices;
}

export class Simulation {
  constructor(config,onEvent=()=>{},saved=null){
    if(!config?.id||!config.scenario||!config.participants)throw new Error('Invalid simulation configuration.');
    for(const role of ROLES)if(!['ai','human'].includes(config.controls?.[role]))throw new Error('Every participant needs AI or human control.');
    this.config=structuredClone(config);this.onEvent=onEvent;this.plan=planFor(config.scenario,config.issue);
    this.events=[];this.index=0;this.evidence={};this.pending=null;this.finished=false;this.hours=0;this.blocked=false;this.waitKind=null;this.waitingSince=null;this.blockReason='';
    if(saved){
      if(saved.version!==SIM_VERSION||!Number.isInteger(saved.index)||saved.index<0||saved.index>this.plan.length||!Array.isArray(saved.events))throw new Error('Unsupported saved simulation. Export it before clearing browser data.');
      Object.assign(this,{events:saved.events,index:saved.index,evidence:saved.evidence,pending:saved.pending,finished:saved.finished,hours:saved.hours,blocked:saved.blocked,waitKind:saved.waitKind||null,waitingSince:saved.waitingSince||null,blockReason:saved.blockReason||''});
    }
  }
  emit(event){
    const e={...event,v:1,session:this.config.id,seq:this.events.length+1,tick:this.index+1,at_ms:this.events.length*900,
      sim_time:new Date(Date.UTC(2026,9,10,9)+this.hours*3600000).toISOString(),simulated:true};
    this.events.push(e);this.onEvent(e);return e;
  }
  facts(stage){
    const kind=kindFor(this.config.scenario,this.config.issue),e=this.evidence;
    const item=(label,detail,evidence_seq=null)=>({label,detail,evidence_seq});
    let work=item('Completion not evidenced','The required work or operating check has not been confirmed.');
    let financial=item('Payment not evidenced','No invoice or settlement evidence is recorded by this simulation.');
    if(kind==='fan'&&e.working)work=item('Working after advice','Tenant confirmed the fan works after finding its switch. No repair visit was required.',e.working);
    else if(e.completion)work=item(e['resident-check']?'Working · tenant confirmed':'Repair reported complete',e.keys?'Completion and physical office key return are both confirmed.':'The contractor supplied a simulated completion report; closure has separate checks.',e['resident-check']||e.completion);
    else if(e.parts)work=item('Repair pending · parts ordered','Parts were ordered; this is not a completion report.',e.parts);
    if(kind==='warranty'&&e.warranty)financial=item(e.completion?'No landlord charge reported':'Charge-free cover confirmed',e.completion?'The completion report states a warranty repair at no charge to the landlord. No payment is recorded.':'Manufacturer cover is confirmed in the simulation. Completion is still a separate check.',e.completion||e.warranty);
    if(kind==='fan'&&stage==='closed')financial=item('Closed without payment','This is a closure category. It does not establish an invoice amount, a zero charge, or a settled payment.',e.review);
    if(kind==='fraud'){
      work=item('Repair not established','This scenario verifies a payment diversion, not the existence or completion of a repair.',e['fraud-verified']||null);
      if(e['fraud-check'])financial=item('Payment change blocked','The diversion is blocked; no payment or repair is claimed.',e['fraud-check']);
    }
    const closure=stage==='closed'?item('Closed · checks evidenced',kind==='fan'?'Landlord advice, tenant confirmation and operator review. No contractor is required.':kind==='keys'?'Approval, completion, four-key distribution, physical office return and operator review.':kind==='warranty'?'Manufacturer cover, completion report and operator review.':'All required simulated evidence and the final review are recorded.',e.review||e['fraud-review']):
      item('Case remains open',this.blockReason||'Required evidence and a final closure decision are still pending.');
    return {work,closure,financial};
  }
  status(stage,owner,recap){
    const s=this.plan[this.index],active=stage!=='closed'&&!this.finished;
    this.emit({t:'status',stage,owner,recap,next_step:active?s?.prompt||'Review the recorded checks and close the case.':'',hold_reason:this.blocked?this.blockReason||'Waiting for explicit confirmation':'',
      case_facts:this.facts(stage),next_action:active?{role:s?.role||'agency',kind:this.blocked?this.waitKind||'reply':s?.role?'reply':'progress',reason:this.blockReason||s?.prompt||'Final closure checks are ready.',
        next_step:s?.prompt||'Close after the recorded checks.',waiting_since:this.waitingSince,deadline:null,deadline_source:null,
        visit:this.evidence.access?'Access confirmed; exact date not recorded':this.evidence.provider?'Proposed: tomorrow morning; not a confirmed appointment':'Not agreed / not recorded'}:null,
      dod:this.plan.filter(s=>s.role).map(s=>({item:s.id,text:s.prompt,status:this.evidence[s.id]?'done':'pending',evidence:this.evidence[s.id]?`Simulated reply #${this.evidence[s.id]}`:''})),red_flags:[],withheld_actions:[]});
  }
  effect(op,to_role='agency',summary=op){
    this.emit({t:'gate',tool:op,verdict:'allow',rules:['SIM-EVIDENCE'],reason:'Deterministic simulation rule; not the production policy gate'});
    const input={property_id:this.config.property};
    if(op==='create_work_order'){
      if(!this.config.participants.contractor)throw new Error('Dispatch requires an assigned contractor.');
      input.contractor_id=this.config.participants.contractor.id;
    }
    this.emit({t:'effect',op,to_role,summary,property:this.config.property,input,result:{id:`sim-${this.config.id}-${this.events.length}`,simulated:true}});
  }
  assign(role){
    if(this.config.participants[role])return;
    const {scenario,issue,directory}=this.config;
    let actor,reason;
    if(role==='operator'){
      const kind=kindFor(scenario,issue),name=kind==='fraud'?'Finance desk':['safety','vulnerable'].includes(kind)?'Safeguarding desk':'Property manager';
      const index=directory.operators.indexOf(name);
      if(index<0)throw new Error('No operator is available for this case.');
      actor={id:`operator-${index}`,name};reason=`Case routed to ${name}.`;
    }else if(role==='contractor'){
      const trade=contractorTrade(scenario,issue),provider=directory.contractors.find(c=>c.trade===trade);
      if(!provider)throw new Error('No contractor is available for this trade.');
      actor={id:provider.id,name:provider.name};reason=`${provider.name} selected for ${trade.replaceAll('_',' ')} work at provider selection.`;
    }else throw new Error('The home must identify its tenant and landlord.');
    this.config.participants={...this.config.participants,[role]:actor};
    this.emit({t:'participant_assigned',role,actor_id:actor.id,actor_name:actor.name,reason});
  }
  advance(){
    if(this.finished||this.pending)return false;
    if(!this.events.length){
      const s=this.config.scenario,source=s.source;
      this.emit({t:'ticket_opened',ticket:source?.case||this.config.id,property:this.config.property,issue:this.config.issue||s.issue||s.title,mode:'sim',
        controls:this.config.controls,participants:structuredClone(this.config.participants),source:'Deterministic browser simulation',
        provenance:source?{...source,kind:'public_case_simulation',source:source.url}: {kind:'synthetic_simulation',source:'Village scenario',case:s.id}});
      this.assign('operator');
      this.emit({t:'actor_message',role:'tenant',body:this.config.issue||s.issue||s.title,source:source?'Public case intake · adapted to village':'Synthetic intake'});return true;
    }
    const s=this.plan[this.index];
    if(!s){this.close();return true;}
    this.hours+=s.advanceHours||1;
    if(s.action){
      if(s.requires.some(id=>!this.evidence[id]))throw new Error('Dispatch requires approval, provider and access evidence.');
      this.effect(s.action,'contractor','Simulated work order issued after approval and confirmed access');this.index++;return true;
    }
    this.assign(s.role);
    if(!this.waitingSince)this.waitingSince=new Date(Date.UTC(2026,9,10,9)+this.hours*3600000).toISOString();
    this.status(s.stage,s.role,s.prompt);
    if(s.op==='block_payment_change')this.emit({t:'gate',tool:'update_payment_details',verdict:'deny',reason:'Unverified payment diversion blocked by simulation rule',rules:['SIM-NO-PAYMENT-CHANGE']});
    else if(s.op)this.effect(s.op,s.role,s.prompt);
    const prompt={t:'awaiting_player',role:s.role,actor_id:this.config.participants[s.role].id,actor_name:this.config.participants[s.role].name,
      prompt_id:`${this.config.id}-${this.events.length+1}`,prompt:s.prompt,choices:decisionChoices(s,kindFor(this.config.scenario,this.config.issue)).map(({id,label,consequence,accept})=>({id,label,consequence,accept})),suggested:s.choices.map(c=>c.body),source_ref:s.ref||null};
    this.pending=prompt;
    if(this.config.controls[s.role]==='human')this.emit(prompt);
    else this.answer(s.role,prompt.prompt_id,s.choices[0].id,'',true);
    return true;
  }
  answer(role,promptId,choiceId,note='',automatic=false){
    if(this.finished||!this.pending||this.pending.role!==role||this.pending.prompt_id!==promptId)throw new Error('This reply belongs to a different turn.');
    if(!automatic&&this.config.controls[role]!=='human')throw new Error('This participant is AI controlled.');
    if(typeof note!=='string'||note.length>4000)throw new Error('Notes must be under 4,000 characters.');
    const s=this.plan[this.index],choice=decisionChoices(s,kindFor(this.config.scenario,this.config.issue)).find(c=>c.id===choiceId);
    if(!choice)throw new Error('Choose an explicit decision for this turn.');
    const reply=this.emit({t:'actor_message',role,actor_id:this.config.participants[role].id,actor_name:this.config.participants[role].name,
      body:choice.body+(note.trim()?`\nPlayer note (uninterpreted): ${note.trim()}`:''),choice:choice.id,step_id:s.id,accepted:choice.accept,consequence:choice.consequence,source:automatic?'AI persona · scripted simulation':'Human · simulation',source_ref:s.ref||null});
    this.pending=null;
    if(!choice.accept){
      this.blocked=true;this.waitKind=choice.wait_kind;this.blockReason=choice.body;this.status(s.stage,role,choice.body);return;
    }
    this.blocked=false;this.waitKind=null;this.blockReason='';this.waitingSince=null;this.evidence[s.id]=reply.seq;this.index++;
    if(s.terminal){this.close(s.terminal);return;}
    this.status(s.stage,'agency',choice.body);
  }
  close(outcome='success'){
    if(this.finished)return;
    const required=this.plan.filter(s=>s.role).map(s=>s.id),success=outcome==='success'&&required.every(id=>this.evidence[id]);
    if(outcome==='success'&&!success)throw new Error('Cannot close without all required simulated evidence.');
    this.finished=true;this.pending=null;
    const kind=kindFor(this.config.scenario,this.config.issue);
    const reason=success?(kind==='fraud'?'Fraud incident resolved: payment change blocked; no repair or payment claimed.':
      kind==='fan'?'Extractor working, tenant confirmation recorded; closed without payment.':
      kind==='warranty'?'Warranty repair completed; no charge to the landlord.':
      kind==='keys'?'Lock repaired, four keys accounted for, final checks passed.':'Simulated work completed and all closure checks passed.'):
      outcome==='cancelled'?'Simulation stopped. No successful closure claimed.':'Emergency handover recorded; repair remains open for review.';
    this.status(success?'closed':'on_hold',success?'agency':'operator',reason);
    if(success)this.effect('close_case','agency',reason);
    this.emit({t:'episode_end',reason,outcome:success?'success':outcome,verdict:success?'simulated_success':null,
      summary:{stage:success?'closed':'on_hold',allowed:this.events.filter(e=>e.t==='gate'&&e.verdict==='allow').length,
        blocked:this.events.filter(e=>e.t==='gate'&&e.verdict==='deny').length,approvals:this.events.filter(e=>e.op==='request_landlord_approval').length,
        withheld:0,done:required.filter(id=>this.evidence[id]).length,total:required.length}});
  }
  snapshot(){return {version:SIM_VERSION,config:this.config,events:this.events,index:this.index,evidence:this.evidence,pending:this.pending,finished:this.finished,hours:this.hours,blocked:this.blocked,waitKind:this.waitKind,waitingSince:this.waitingSince,blockReason:this.blockReason};}
}

export const filterCases=filterCaseQueue;
