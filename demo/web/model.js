export const STAGES = ['intake', 'landlord_approval', 'provider_selection', 'visit_scheduling', 'quote_approval', 'work_in_progress', 'result', 'final_checks', 'closed'];
export const LABELS = {agency:'Dwelly agent',tenant:'Tenant',landlord:'Landlord',contractor:'Contractor',operator:'Dwelly operator'};
export const humanize = value => String(value || '').replaceAll('_', ' ');
export function createTicket(id, mode, scenario = {}) {
  return {id,mode,scenario,events:[],seen:new Set(),owner:'agency',stage:'intake',status:null,ended:false,pending:null,property:scenario.property || 'P-001',progress:0};
}
export function reduceEvent(ticket, event) {
  if(event.v !== 1 || !Number.isInteger(event.seq) || ticket.seen.has(event.seq)) return false;
  ticket.seen.add(event.seq); ticket.events.push(event);
  if(event.t === 'ticket_opened') {ticket.issue=event.issue;ticket.property=event.property;ticket.provenance=event.provenance;ticket.controls=event.controls||ticket.controls;ticket.participants=event.participants||ticket.participants;}
  if(event.t === 'participant_assigned') ticket.participants={...ticket.participants,[event.role]:{id:event.actor_id,name:event.actor_name}};
  if(event.t === 'agent_thinking') {ticket.owner='agency';ticket.pending=null;}
  if(event.t === 'status') {ticket.status=event;ticket.owner=event.owner;ticket.stage=event.stage;}
  if(event.t === 'awaiting_player') {ticket.pending=event;ticket.owner=event.role;}
  if(event.t === 'actor_message') ticket.pending=null;
  if(event.t === 'episode_end') {ticket.ended=true;ticket.pending=null;ticket.summary=event.summary;ticket.endReason=event.reason;ticket.outcome=event.outcome;ticket.progress=1;}
  return true;
}
export function metrics(tickets) {
  const values=[...tickets];
  return {active:values.filter(t=>!t.ended).length,humans:values.filter(t=>t.pending || (!t.ended && ['operator','landlord','tenant','contractor'].includes(t.owner))).length,
    effects:values.reduce((n,t)=>n+t.events.filter(e=>e.t==='effect'&&!e.deduplicated).length,0)};
}
const kinds = new Set(['ticket_opened','participant_assigned','actor_message','agent_thinking','playbook','gate','tool_result','effect','status','awaiting_player','time_passes','episode_end','withheld','error','queued','terminal','nudge','reconciled','time_nudge','director_usage']);
export function parseReplay(text) {
  if(text.length>2_000_000) throw new Error('Recording is larger than 2 MB.');
  const lines=text.trim().split('\n');
  if(lines.length>5000) throw new Error('Recording has too many events.');
  const events=lines.map(line=>JSON.parse(line));
  let previous=0, previousTime=0;
  for(const e of events){
    if(!e || typeof e!=='object' || Array.isArray(e))throw new Error('Every event must be an object.');
    if(e.v!==1 || !kinds.has(e.t) || !Number.isInteger(e.seq) || e.seq<=previous || typeof e.at_ms!=='number' || !Number.isFinite(e.at_ms) || e.at_ms<previousTime || e.at_ms>86400000) throw new Error('Recording must use ordered protocol v1 events and valid timestamps.');
    const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
    const strings=value=>Array.isArray(value)&&value.every(item=>typeof item==='string');
    for(const key of ['body','issue','property','role','tool','reason','prompt','recap','next_step','hold_reason','owner','stage','op','to_role','message','sim_time','source']){
      if(e[key]!=null && typeof e[key]!=='string')throw new Error(`Invalid text field: ${key}`);
    }
    if(e.rules!==undefined&&!strings(e.rules))throw new Error('Invalid rule identifiers.');
    if(e.input!==undefined&&!object(e.input))throw new Error('Invalid action inputs.');
    if(e.usage!==undefined&&(!object(e.usage)||Object.values(e.usage).some(value=>typeof value!=='number'||!Number.isFinite(value)||value<0)))throw new Error('Invalid usage data.');
    if(e.t==='status'){
      for(const key of ['dod','red_flags'])if(e[key]!==undefined&&(!Array.isArray(e[key])||!e[key].every(object)))throw new Error('Invalid status in recording.');
      if(e.withheld_actions!==undefined&&!strings(e.withheld_actions))throw new Error('Invalid withheld actions.');
      if(e.handover!=null&&(!object(e.handover)||(e.handover.summary!==undefined&&!strings(e.handover.summary))))throw new Error('Invalid handover.');
    }
    if(e.suggested!==undefined&&!strings(e.suggested))throw new Error('Invalid suggested replies.');
    if(e.t==='episode_end' && e.summary!==undefined&&!object(e.summary))throw new Error('Invalid run summary.');
    if(e.t==='participant_assigned'&&(!['contractor','operator'].includes(e.role)||typeof e.actor_id!=='string'||!e.actor_id||typeof e.actor_name!=='string'||!e.actor_name))throw new Error('Invalid participant assignment.');
    previous=e.seq;previousTime=e.at_ms;
  }
  if(!events.length || events[0].t!=='ticket_opened') throw new Error('Recording must begin with ticket_opened.');
  return events;
}
export function shouldShow(event){return ['participant_assigned','actor_message','playbook','effect','withheld','status','error','episode_end','awaiting_player','time_passes'].includes(event.t) || (event.t==='gate' && event.reason!=='read');}
