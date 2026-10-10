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

export class Simulation {
  constructor(config,onEvent=()=>{},saved=null){
    if(!config?.id||!config.scenario||!config.participants)throw new Error('Invalid simulation configuration.');
    for(const role of ROLES)if(!['ai','human'].includes(config.controls?.[role]))throw new Error('Every participant needs AI or human control.');
    this.config=structuredClone(config);this.onEvent=onEvent;this.plan=planFor(config.scenario,config.issue);
    this.events=[];this.index=0;this.evidence={};this.pending=null;this.finished=false;this.hours=0;this.blocked=false;
    if(saved){
      if(saved.version!==SIM_VERSION||!Number.isInteger(saved.index)||saved.index<0||saved.index>this.plan.length||!Array.isArray(saved.events))throw new Error('Unsupported saved simulation. Export it before clearing browser data.');
      Object.assign(this,{events:saved.events,index:saved.index,evidence:saved.evidence,pending:saved.pending,finished:saved.finished,hours:saved.hours,blocked:saved.blocked});
    }
  }
  emit(event){
    const e={...event,v:1,session:this.config.id,seq:this.events.length+1,tick:this.index+1,at_ms:this.events.length*900,
      sim_time:new Date(Date.UTC(2026,9,10,9)+this.hours*3600000).toISOString(),simulated:true};
    this.events.push(e);this.onEvent(e);return e;
  }
  status(stage,owner,recap){
    this.emit({t:'status',stage,owner,recap,next_step:this.plan[this.index]?.prompt||'',hold_reason:this.blocked?'Waiting for explicit confirmation':'',
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
    this.status(s.stage,s.role,s.prompt);
    if(s.op==='block_payment_change')this.emit({t:'gate',tool:'update_payment_details',verdict:'deny',reason:'Unverified payment diversion blocked by simulation rule',rules:['SIM-NO-PAYMENT-CHANGE']});
    else if(s.op)this.effect(s.op,s.role,s.prompt);
    const prompt={t:'awaiting_player',role:s.role,actor_id:this.config.participants[s.role].id,actor_name:this.config.participants[s.role].name,
      prompt_id:`${this.config.id}-${this.events.length+1}`,prompt:s.prompt,choices:s.choices.map(({id,label})=>({id,label})),suggested:s.choices.map(c=>c.body),source_ref:s.ref||null};
    this.pending=prompt;
    if(this.config.controls[s.role]==='human')this.emit(prompt);
    else this.answer(s.role,prompt.prompt_id,s.choices[0].id,'',true);
    return true;
  }
  answer(role,promptId,choiceId,note='',automatic=false){
    if(this.finished||!this.pending||this.pending.role!==role||this.pending.prompt_id!==promptId)throw new Error('This reply belongs to a different turn.');
    if(!automatic&&this.config.controls[role]!=='human')throw new Error('This participant is AI controlled.');
    if(typeof note!=='string'||note.length>4000)throw new Error('Notes must be under 4,000 characters.');
    const s=this.plan[this.index],choice=s.choices.find(c=>c.id===choiceId);
    if(!choice)throw new Error('Choose an explicit decision for this turn.');
    const reply=this.emit({t:'actor_message',role,actor_id:this.config.participants[role].id,actor_name:this.config.participants[role].name,
      body:choice.body+(note.trim()?`\nPlayer note (uninterpreted): ${note.trim()}`:''),choice:choice.id,source:automatic?'AI persona · scripted simulation':'Human · simulation',source_ref:s.ref||null});
    this.pending=null;
    if(!choice.accept){
      this.blocked=true;this.status(s.stage,role,choice.body);return;
    }
    this.blocked=false;this.evidence[s.id]=reply.seq;this.index++;
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
  snapshot(){return {version:SIM_VERSION,config:this.config,events:this.events,index:this.index,evidence:this.evidence,pending:this.pending,finished:this.finished,hours:this.hours,blocked:this.blocked};}
}

export function caseState(ticket){
  if(ticket.outcome==='success')return 'success';
  if(ticket.ended)return 'finished';
  if(ticket.pending&&ticket.mode!=='replay')return 'waiting';
  return 'active';
}
export function filterCases(tickets,filter='all',query=''){
  const needle=query.trim().toLowerCase();
  return tickets.filter(t=>(filter==='all'||caseState(t)===filter)&&`${t.scenario.title||t.issue||''} ${t.property} ${t.provenance?.case||''}`.toLowerCase().includes(needle));
}
