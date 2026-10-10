import {LABELS, humanize} from './model.js';

const text=value=>typeof value==='string'?value:'';
const time=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?value:null;
const fact=(label,detail,evidence=null)=>({label,detail,evidence});
const eventsFor=ticket=>ticket.events||[];

// These are four independent facts. Finishing playback cannot prove any of them.
export function caseOverview(ticket){
  const events=eventsFor(ticket),status=ticket.status||{},recorded=status.case_facts;
  const session=ticket.ended?ticket.mode==='replay'?'Playback finished':ticket.outcome==='cancelled'?'Session stopped':'Session finished':
    ticket.pending&&ticket.mode!=='replay'?'Waiting for your decision':ticket.mode==='replay'?'Playing recording':'Session active';
  const unknown={
    work:fact('Completion not evidenced','No structured work outcome is available in this journal.'),
    closure:status.stage==='closed'?fact('Closed in recorded status','The journal does not provide a separate closure basis.',status.seq):
      fact('Closure not evidenced','A finished session or resolved decision does not prove that the case is closed.'),
    financial:fact('Payment not evidenced','No structured invoice, charge or settlement evidence is available.'),
  };
  // This contract is emitted by the browser simulator only. Live fields remain unavailable.
  if(status.simulated===true&&recorded&&typeof recorded==='object')for(const key of ['work','closure','financial']){
    const value=recorded[key];
    if(value&&text(value.label)&&text(value.detail))unknown[key]=fact(value.label,value.detail,Number.isInteger(value.evidence_seq)?value.evidence_seq:null);
  }
  const simulated=ticket.mode==='sim'||events[0]?.simulated===true;
  return {session,...unknown,simulated,qualifier:simulated?'Simulated evidence · no real works or payments':'Recorded evidence · unknown fields stay unknown'};
}

export function caseAction(ticket){
  const events=eventsFor(ticket),status=ticket.status||{},pending=!ticket.ended&&ticket.mode!=='replay'?ticket.pending:null;
  const next=status.simulated===true&&status.next_action&&typeof status.next_action==='object'?status.next_action:{};
  const handover=status.handover&&typeof status.handover==='object'?status.handover:{};
  const closed=status.stage==='closed',needsReview=!closed&&(ticket.outcome==='needs_review'||!!text(handover.question));
  const hasAction=!!pending||needsReview||!ticket.ended&&!closed;
  const kind=hasAction?(text(next.kind)||(pending?'reply':needsReview?'review':text(status.hold_reason)?'reply':'progress')):'none';
  const role=text(next.role)||pending?.role||ticket.owner||'agency';
  const reason=hasAction?(text(next.reason)||text(status.hold_reason)||text(handover.gap)||pending?.prompt||text(status.next_step)||
    (needsReview?'A recorded decision needs human review.':'No waiting reason has been recorded yet.')):'No further action is recorded in this session.';
  const nextStep=hasAction?(text(next.next_step)||pending?.prompt||text(handover.question)||text(status.next_step)||
    (ticket.ended?'Review the recorded decision and its unresolved work.':'Inspect the case while the next decision is prepared.')):'Inspect the outcome and evidence.';
  const deadline=time(next.deadline)||time(handover.deadline);
  const clock=time(events.findLast(e=>time(e.sim_time))?.sim_time);
  const overdue=!!(hasAction&&deadline&&clock&&Date.parse(clock)>Date.parse(deadline));
  const since=time(next.waiting_since)||time(pending?.sim_time)||time(status.sim_time);
  const human=!!pending||needsReview;
  const label=pending?'Take your turn →':ticket.mode==='replay'&&needsReview?'Review recorded handover →':needsReview?'Review handover →':kind==='missing_document'?'Review missing evidence →':hasAction?'Inspect next action →':'Inspect outcome →';
  return {kind,role,owner:ticket.participants?.[role]?.name||LABELS[role]||humanize(role),reason,nextStep,since,deadline,
    deadlineSource:deadline?(text(next.deadline_source)||`Recorded handover · event #${status.seq||'?'}`):'Not agreed / not recorded',
    clock,overdue,human,needsReview,playable:!!pending,recorded:ticket.mode==='replay',label,
    waitingReply:hasAction&&['reply','declined','clarification','no_access'].includes(kind),missingDocument:hasAction&&kind==='missing_document',
    visit:text(next.visit)||'Not agreed / not recorded'};
}

export function caseState(ticket){
  if(ticket.outcome==='success')return 'success';
  if(ticket.ended)return 'finished';
  if(ticket.pending&&ticket.mode!=='replay')return 'waiting';
  return 'active';
}
export function filterCaseQueue(tickets,filter='all',query=''){
  const needle=query.trim().toLowerCase();
  return tickets.filter(ticket=>{
    const action=caseAction(ticket);
    const match=filter==='all'||caseState(ticket)===filter||filter==='needs-human'&&action.human||filter==='no-reply'&&action.waitingReply||
      filter==='missing-document'&&action.missingDocument||filter==='overdue'&&action.overdue;
    return match&&`${ticket.scenario?.title||ticket.issue||''} ${ticket.property} ${ticket.provenance?.case||''} ${action.owner} ${action.reason}`.toLowerCase().includes(needle);
  }).sort((a,b)=>{
    const rank=t=>{const action=caseAction(t);return action.overdue?0:action.human?1:action.missingDocument?2:!t.ended?3:4;};
    const date=t=>Date.parse(caseAction(t).deadline)||Infinity;
    return rank(a)-rank(b)||(date(a)-date(b)||0);
  });
}
export function formatCaseTime(value){
  return time(value)?new Date(value).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/London'}):'Not recorded';
}
export function decisionEvidence(ticket){
  return eventsFor(ticket).filter(e=>e.t==='actor_message').slice(-3).map(e=>({seq:e.seq,role:LABELS[e.role]||e.role,body:text(e.body),simulated:e.simulated===true}));
}
