import {Village} from './village.js';
import {createTicket, reduceEvent, metrics, parseReplay, shouldShow, humanize, LABELS, STAGES} from './model.js';
import {createIntelligence} from './insights.js';
import {Simulation, participantsFor, simulationConfigFor, ROLES, STORAGE_KEY, caseState, filterCases} from './simulation.js';
import {homeRows,filterHomes,peopleRows,filterPeople,resetLocal,readResetBackup,restoreLocal,RESET_KEY,REVIEW_KEY} from './workspace.js';

const $=id=>document.getElementById(id);
function el(tag,cls,text){const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=String(text);return node;}
function button(text,cls,action){const node=el('button',cls,text);node.type='button';node.addEventListener('click',action);return node;}
const tickets=new Map(), recordings=new Map(), simulations=new Map();
let catalog,selectedId=null,paused=false,speed=1,live=false,stream=null,toastTimeout,bannerTimeout,renderScheduled=false;
let intelligence,intelligencePromise,publicScenarios=[],currentView='village',caseFilter='all',caseQuery='',storageWarning=false,storageBlocked=false;
let peopleRefresh=null,resetInProgress=false;
const params=new URLSearchParams(location.search);
const symbols={routine:'⌁',approval:'£',fraud:'◇',vulnerable:'✳','public-keys':'⚿','public-fan':'✳','public-warranty':'◷'};
const village=new Village($('village'),showProperty,role=>showPeople({role}));
let mapExpanded=false,mapOwnsFullscreen=false;
function setMapExpanded(on){
  mapExpanded=on;document.body.classList.toggle('map-expanded',on);
  $('expand-map').textContent=on?'↙ Exit full screen':'⛶ Full screen';$('expand-map').setAttribute('aria-pressed',String(on));
  // Keep the rest of the workspace out of keyboard navigation while the map fills the viewport.
  for(const node of document.querySelectorAll('.topbar,.rail,.workspace-tabs,.workspace-tools,.page-heading,.metrics,.ticket-panel,.village-column > :not(.map-card),.page-footer,#presenter-panel'))node.inert=on;
  if(!on)$('expand-map').focus({preventScroll:true});
}
async function toggleMap(){
  if(mapExpanded){setMapExpanded(false);if(mapOwnsFullscreen&&document.fullscreenElement)await document.exitFullscreen();mapOwnsFullscreen=false;return;}
  setMapExpanded(true);
  if(document.documentElement.requestFullscreen&&!document.fullscreenElement){
    try{await document.documentElement.requestFullscreen();mapOwnsFullscreen=true;}
    catch{$('expand-map').textContent='↙ Exit expanded view';}
  }else if(!document.fullscreenElement)$('expand-map').textContent='↙ Exit expanded view';
}
document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement&&mapOwnsFullscreen){mapOwnsFullscreen=false;setMapExpanded(false);}});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&mapExpanded&&!$('dialog').open){event.preventDefault();toggleMap().catch(showError);}});

function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>$('toast').hidden=true,4500);}
function showError(error){toast(error.message || String(error));}
function dialogError(error){const note=el('p','error-notice',error.message||String(error));note.setAttribute('role','alert');$('dialog-content').append(note);}
function showDialog(kicker,title){peopleRefresh=null;$('dialog-kicker').textContent=kicker;$('dialog-content').replaceChildren(el('h2','',title));if(!$('dialog').open)$('dialog').showModal();return $('dialog-content');}
function closeDialog(){$('dialog').close();peopleRefresh=null;}
function openText(text){const body=showDialog('EVENT DETAILS','A closer look');body.append(el('p','',text));}
function scenarioById(id){return [...publicScenarios,...catalog.scenarios].find(s=>s.id===id);}
function propertyById(id){return catalog.world.properties.find(p=>p.id===id);}
function selected(){return tickets.get(selectedId);}
function showView(name){
  if(mapExpanded)toggleMap().catch(showError);
  currentView=name;
  for(const view of ['village','cases','homes','intelligence']){
    $(view==='village'?'village-view':view).hidden=view!==name;
    $(`view-${view}`).classList.toggle('active',view===name);$(`view-${view}`).setAttribute('aria-current',view===name?'page':'false');
    $(`nav-${view}`)?.classList.toggle('selected',view===name);
  }
  history.replaceState(null,'',location.pathname+location.search+(name==='village'?'':'#'+name));
  if(name==='cases')renderCases();
  if(name==='homes')renderHomes();
  if(name==='intelligence'&&!intelligencePromise)intelligencePromise=createIntelligence($('intelligence'),{getTickets:()=>[...tickets.values()],openTicket:id=>{showView('village');select(id);},dialog:showDialog}).then(result=>intelligence=result);
  intelligence?.refreshOps();
}
function select(id){selectedId=id;render();}
function scheduleRender(){if(!renderScheduled){renderScheduled=true;requestAnimationFrame(()=>{renderScheduled=false;render();});}}
function ownerName(ticket){
  const property=propertyById(ticket.property);
  if(ticket.participants?.[ticket.owner])return ticket.participants[ticket.owner].name;
  if(ticket.owner==='tenant')return property?.tenant || 'Tenant';
  if(ticket.owner==='landlord')return catalog.world.landlords.find(l=>l.id===property?.landlord_id)?.name || 'Landlord';
  if(ticket.owner==='contractor'){
    const order=ticket.events.findLast(e=>e.t==='effect'&&e.op==='create_work_order');
    return catalog.world.contractors.find(c=>c.id===order?.input?.contractor_id)?.name || 'Contractor';
  }
  return LABELS[ticket.owner] || 'Dwelly agent';
}
function handleEvent(ticket,event,animate=true){
  const previous=ticket.owner;
  if(!reduceEvent(ticket,event))return;
  if(animate)village.event(event,ticket);
  if(ticket.id===selectedId){
    if(previous!==ticket.owner)toast(`${ownerName(ticket)} has the ticket`);
    if(event.sim_time){const d=new Date(event.sim_time);if(!Number.isNaN(d.valueOf()))$('world-clock').textContent=d.toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/London'}).toUpperCase();}
    if(event.t==='gate' && ['deny','escalate'].includes(event.verdict))safety('Stopped at the policy gate',`${(event.rules || []).join(' · ')} — ${event.reason}`);
    if(event.t==='withheld'&&!ticket.withheldShown){ticket.withheldShown=true;safety('The agent refused the request',event.reason);}
    if(event.t==='error')toast(event.message);
    if(event.t==='time_passes')toast(`${event.hours} simulated hours later…`);
  }
  if(animate && event.t==='awaiting_player' && ['live','sim'].includes(ticket.mode)){if(ticket.id===selectedId||!selected()?.pending)select(ticket.id);toast(`Your turn as ${event.role}`);}
  scheduleRender();
}
function safety(title,text){$('safety-title').textContent=title;$('safety-text').textContent=text;$('safety-banner').hidden=false;clearTimeout(bannerTimeout);bannerTimeout=setTimeout(()=>$('safety-banner').hidden=true,8000);}

async function loadReplay(scenario){
  if(!recordings.has(scenario.id)){
    const response=await fetch(scenario.replay);if(!response.ok)throw new Error('This recording is unavailable. Try another story.');
    recordings.set(scenario.id,parseReplay(await response.text()));
  }
  return recordings.get(scenario.id);
}
async function startReplay(scenario,focus=true,delay=0){
  if(tickets.size>=32)throw new Error('The village has 32 stories. Reload to start a new presentation.');
  const events=await loadReplay(scenario);const id=crypto.randomUUID();const ticket=createTicket(id,'replay',scenario);
  ticket.recording=events;ticket.position=0;ticket.playhead=-delay;ticket.running=true;tickets.set(id,ticket);
  if(focus)select(id);
  if(delay===0){handleEvent(ticket,events[0]);ticket.position=1;}
  paused=false;updatePlayback();closeDialog();render();return ticket;
}
function persistSimulations(){
  if(storageBlocked)return false;
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify([...simulations.values()].map(sim=>sim.snapshot())));return true;}
  catch{if(!storageWarning){storageWarning=true;toast('Browser storage is unavailable or full. Export important sessions before reloading.');}return false;}
}
function startSimulation(config,scenario,focus=true){
  if(tickets.size>=32)throw new Error('The village has 32 cases. Clear finished simulations from Cases to make room.');
  const id=crypto.randomUUID(),ticket=createTicket(id,'sim',scenario);
  ticket.property=config.property;ticket.participants=config.participants;ticket.controls=config.controls;
  tickets.set(id,ticket);
  const sim=new Simulation({...config,id,scenario},event=>handleEvent(ticket,event));simulations.set(id,sim);
  sim.advance();ticket.simCountdown=800;if(focus)select(id);
  paused=false;persistSimulations();closeDialog();render();return ticket;
}
function restoreSimulations(){
  try{
    const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');
    if(!Array.isArray(saved)||saved.length>32)throw new Error('Invalid session archive.');
    for(const raw of saved){
      const events=parseReplay(raw.events.map(e=>JSON.stringify(e)).join('\n'));
      const ticket=createTicket(raw.config.id,'sim',raw.config.scenario);ticket.participants=raw.config.participants;ticket.controls=raw.config.controls;
      const sim=new Simulation(raw.config,e=>handleEvent(ticket,e),{...raw,events});
      tickets.set(ticket.id,ticket);simulations.set(ticket.id,sim);events.forEach(e=>handleEvent(ticket,e,false));
      ticket.pending=sim.pending;ticket.simCountdown=1000;ticket.ended=sim.finished;
    }
    if(tickets.size)selectedId=[...tickets.keys()][0];
  }catch{toast('Saved simulations could not be restored. Existing browser data was left untouched.');storageWarning=true;storageBlocked=true;}
}
function startVillage(){
  try{
    if(tickets.size+publicScenarios.length+1>32)throw new Error('This fixed pack needs four free case slots. Clear finished simulations or use Reset demo first.');
    for(const [index,scenario] of [...publicScenarios,scenarioById('fraud')].entries())startSimulation(
      simulationConfigFor(catalog.world,scenario,scenario.property,Object.fromEntries(ROLES.map(r=>[r,'ai']))),scenario,index===0);
    toast('Three public cases and one fraud scenario. All participants are simulated.');
  }catch(error){showError(error);}
}
let lastFrame=performance.now();
function tick(now){
  const dt=Math.min(500,now-lastFrame);lastFrame=now;
  if(!paused){for(const ticket of tickets.values())if(ticket.mode==='replay'&&ticket.running){
    ticket.playhead+=dt*speed;
    while(ticket.position<ticket.recording.length && ticket.recording[ticket.position].at_ms<=ticket.playhead){handleEvent(ticket,ticket.recording[ticket.position++]);}
    ticket.progress=ticket.position/ticket.recording.length;
    if(ticket.position===ticket.recording.length){ticket.running=false;ticket.ended=true;}
  }
  for(const ticket of tickets.values())if(ticket.mode==='sim'&&!ticket.ended&&!ticket.pending){
    ticket.simCountdown=(ticket.simCountdown||0)-dt*speed;
    if(ticket.simCountdown<=0){const sim=simulations.get(ticket.id);sim.advance();ticket.progress=sim.index/sim.plan.length;ticket.simCountdown=1600;persistSimulations();}
  }}
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
function updatePlayback(){
  $('pause').textContent=paused?'▶':'Ⅱ';$('pause').setAttribute('aria-label',paused?'Resume playback':'Pause playback');
  const ticket=selected();$('mode-badge').textContent=ticket?.mode==='live'?'LIVE AGENT':ticket?.mode==='sim'?'SIMULATION · API OFF':'REPLAY STUDIO';
  $('playback-description').textContent=ticket?.mode==='live'?'Real agent connected · mock world':paused?'Paused · Space to resume':ticket?.mode==='sim'?'Interactive personas · simulated evidence':'Real recordings · compressed timing';
  $('skip').disabled=ticket?.mode==='live'||ticket?.mode==='sim'&&(!!ticket.pending||ticket.ended);
}
function skip(){const ticket=selected();if(ticket?.mode==='sim'){simulations.get(ticket.id).advance();persistSimulations();render();return;}if(!ticket?.recording || !ticket.running)return;let next=ticket.position;while(next<ticket.recording.length-1&&!shouldShow(ticket.recording[next]))next++;ticket.playhead=ticket.recording[next].at_ms;while(ticket.position<=next)handleEvent(ticket,ticket.recording[ticket.position++]);ticket.progress=ticket.position/ticket.recording.length;render();}

function render(){
  if(!catalog)return;
  const values=[...tickets.values()],stats=metrics(values);
  $('metric-tickets').textContent=stats.active;$('metric-humans').textContent=stats.humans;$('metric-safe').textContent=stats.effects;
  $('story-count').textContent=String(values.length).padStart(2,'0');$('empty-village').hidden=values.length>0;
  $('ticket-list').replaceChildren(...values.map(ticket=>{
    const tile=button('',`ticket-tile${ticket.id===selectedId?' active':''}`,()=>select(ticket.id));
    tile.setAttribute('aria-label',`${ticket.scenario.title || ticket.issue || 'New story'}, ${ticket.mode}`);tile.setAttribute('aria-pressed',String(ticket.id===selectedId));
    tile.append(el('span',`tile-icon ${ticket.scenario.color || 'sage'}`,symbols[ticket.scenario.id] || '⌂'));
    const copy=el('div');copy.append(el('h3','',ticket.scenario.title || (ticket.issue || 'New story').slice(0,55)),el('p','',propertyById(ticket.property)?.address || ticket.property));
    const state=ticket.pending?'Your turn':ticket.outcome==='success'?'Success · all checks passed':ticket.ended?'Finished · see outcome':ticket.events.length?'With '+ownerName(ticket):'Starting soon';
    copy.append(el('span','tile-badge',`${ticket.mode==='replay'?'↺ REPLAY':ticket.mode==='sim'?'◉ SIM':'● LIVE'} · ${state}`));tile.append(copy);
    const progress=el('div','tile-progress'),bar=el('span');bar.style.width=`${Math.round((ticket.mode!=='live'?ticket.progress:ticket.ended?1:.35)*100)}%`;progress.append(bar);tile.append(progress);return tile;
  }));
  const ticket=selected();$('ticket-empty').hidden=!!ticket;$('ticket-detail').hidden=!ticket;$('export').disabled=!ticket;
  if(ticket){renderTicket(ticket);const sim=ticket.events.at(-1)?.sim_time;if(sim){const date=new Date(sim);if(!Number.isNaN(date.valueOf()))$('world-clock').textContent=date.toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/London'}).toUpperCase();}}
  village.update(values,ticket);updatePlayback();renderPresenter();intelligence?.refreshOps();if(currentView==='cases')renderCases();if(currentView==='homes')renderHomes();if($('dialog').open)peopleRefresh?.();
}
function timelineItem(event){
  const row=el('div',`timeline-item ${event.t} ${event.verdict || ''}`);
  const icons={actor_message:'✉',playbook:'▤',effect:'↗',withheld:'◇',status:'✓',error:'!',episode_end:'·',awaiting_player:'?',gate:'◇',time_passes:'◷'};
  row.append(el('span','timeline-dot',icons[event.t] || '·'));
  const titles={participant_assigned:LABELS[event.role]+' assigned',actor_message:event.actor_name || LABELS[event.role] || event.role,playbook:'Playbook selected',effect:humanize(event.op),withheld:'Action withheld by the agent',status:'Decision recorded',error:'The office needs attention',episode_end:'Run complete',awaiting_player:'Your turn',gate:humanize(event.tool),time_passes:`${event.hours} hours later`};
  const label=el('div','timeline-label');label.append(el('b','',titles[event.t] || humanize(event.t)),el('span','',`#${String(event.seq).padStart(2,'0')}`));row.append(label);
  let body=event.body || event.summary || event.reason || event.prompt || event.recap || event.message || (event.t==='playbook'?`${event.name} · ${event.urgency}`:'');
  if(typeof body==='object')body=event.reason || 'Decision recorded';
  body=String(body);
  if(body.length>180){row.append(el('p','',body.slice(0,177)+'…'));row.append(button('Read full detail ↗','text-button',()=>openText(body)));}
  else if(body)row.append(el('p','',body));
  if(event.t==='gate'){const chip=el('span','verdict',`${humanize(event.verdict).toUpperCase()}${event.rules?.length?' · '+event.rules.join(', '):''}`);row.append(chip);}
  if(event.t==='effect')row.append(el('span','verdict',event.simulated?'SIMULATED WORLD EFFECT':event.deduplicated?'EXISTING EFFECT · NOT REPEATED':'CONFIRMED WRITE'));
  if(event.t==='withheld')row.append(el('span','verdict','AGENT REFUSAL · NO TOOL ATTEMPT'));
  if(event.source && event.t==='actor_message')row.append(el('span','verdict',event.source.toUpperCase()));
  if(event.source_ref)row.append(el('span','verdict','SCENARIO REFERENCE · '+event.source_ref));
  return row;
}
function renderTicket(ticket){
  $('ticket-id').textContent=ticket.events[0]?.ticket || 'NEW TICKET';$('ticket-mode').textContent=ticket.mode==='replay'?'↺ Recorded run':ticket.mode==='sim'?'◉ Simulation · no LLM calls':'● Real agent · mock world';
  $('ticket-title').textContent=ticket.scenario.title || ticket.issue || 'A new story';$('ticket-address').textContent=propertyById(ticket.property)?.address || ticket.property;
  $('owner-name').textContent=ownerName(ticket);$('owner-avatar').textContent={agency:'D',tenant:'T',landlord:'L',contractor:'C',operator:'O'}[ticket.owner] || 'D';
  $('owner-note').textContent=ticket.pending?'Waiting for your reply':ticket.ended?'Final case owner':ticket.owner==='agency'?'Reading, checking, taking care':'The next step is with this person';
  $('case-result').hidden=!ticket.ended;$('case-result').className='case-result '+(ticket.outcome==='success'?'success':'');
  $('case-result').textContent=ticket.outcome==='success'?'✓ Success · all simulated checks passed':ticket.endReason||'Run finished';
  $('case-source').hidden=!ticket.scenario.source;$('case-source').textContent=ticket.scenario.source?`${ticket.scenario.source.case} · View public case evidence ↗`:'';
  $('case-controls').textContent=ticket.controls?ROLES.map(r=>ticket.mode==='sim'&&r==='contractor'&&!ticket.participants?.contractor?
    ticket.ended?'Contractor: not involved':`Contractor (if needed): ${ticket.controls[r]==='human'?'You':'AI'}`:
    `${ticket.participants?.[r]?.name||LABELS[r]}: ${ticket.controls[r]==='human'?'You':'AI'}`).join(' · '):'';
  $('ticket-flags').replaceChildren(...(ticket.status?.red_flags || []).map(flag=>el('span','flag',humanize(flag.kind))));
  const timeline=$('timeline'),wasBottom=timeline.scrollHeight-timeline.clientHeight-timeline.scrollTop<45;
  // Render untrusted text exclusively through textContent; no HTML interpolation.
  timeline.replaceChildren(...ticket.events.filter(shouldShow).map(timelineItem));
  if(wasBottom)timeline.scrollTop=timeline.scrollHeight;
  const state=ticket.status;$('stage-badge').textContent=humanize(ticket.stage);
  const current=STAGES.indexOf(ticket.stage);
  $('stages').replaceChildren(...STAGES.map((stage,index)=>el('li',index===current?'current':current>=0&&index<current?'past':'',humanize(stage))));
  $('legacy-note').textContent=state?.stage==='unknown'?'This older recording did not include a workflow stage or completion checklist. No stage has been inferred.':state?.hold_reason || '';
  $('recap').textContent=state?.recap || 'The agent is working through the evidence.';$('next-step').textContent=state?.next_step || (ticket.ended?'Read the handover and recorded decision below.':'The next step will appear when the agent records its decision.');
  const items=(state?.dod || []).map(item=>{const li=el('li');li.append(el('span','',item.status==='done'?'✓':item.status==='skipped'?'−':'○'),el('div','',item.text || humanize(item.item)));li.title=item.evidence || '';return li;});
  $('dod').replaceChildren(...items);if(!items.length)$('dod').append(el('li','muted','No checklist recorded yet.'));
  $('handover').hidden=!state?.handover;
  if(state?.handover){const h=state.handover;$('handover').replaceChildren(el('h3','','A decision for a human'),el('p','',h.question));for(const fact of h.summary || [])$('handover').append(el('p','',`• ${fact}`));for(const [label,key] of [['Recommended','recommended'],['If nobody replies','default_if_timeout'],['Undo','undo']])if(h[key])$('handover').append(el('h3','',label),el('p','',h[key]));}
  $('outcome').hidden=!ticket.summary;
  if(ticket.summary){const s=ticket.summary;$('outcome').replaceChildren(el('h3','','This run, in numbers'),el('p','',`${s.allowed} allowed writes · ${s.approvals} approval requests · ${s.blocked} gate blocks · ${s.withheld} withheld actions`),el('p','',`${s.done}/${s.total} checklist items complete · Stage: ${humanize(s.stage)}`),el('p','muted',ticket.endReason));}
  $('provenance').textContent=ticket.mode==='sim'?`${ticket.provenance?.case||'Synthetic scenario'}\n${ticket.provenance?.source}\n${ticket.provenance?.adaptation||'Scripted browser simulation. No external side effects or LLM evaluation.'}\nHistory SHA-256: ${ticket.provenance?.history_sha256||'not applicable'}`:ticket.provenance?`${ticket.provenance.source}\n${ticket.provenance.case}\nState SHA-256: ${ticket.provenance.state_sha256}\nTrace SHA-256: ${ticket.provenance.trace_sha256}\n${ticket.provenance.timing}`:'Live session. Recorded in order by the server. Imported files retain the provenance they contain; imports are not independently verified.';
  $('ticket-footer-text').textContent=ticket.ended?'Run finished. Follow the recorded ticket status.':'Every action has a receipt.';
  $('stop-ticket').hidden=ticket.ended;
  const prompt=['live','sim'].includes(ticket.mode)?ticket.pending:null;$('player-card').hidden=!prompt;
  if(prompt && $('player-card').dataset.prompt!==prompt.prompt_id){$('player-card').dataset.prompt=prompt.prompt_id;$('player-title').textContent=`Reply as ${prompt.actor_name||LABELS[prompt.role]||prompt.role}`;$('player-prompt').textContent=prompt.prompt;$('player-reply').value='';$('player-reply').required=ticket.mode==='live';$('player-reply').placeholder=ticket.mode==='sim'?'Optional note (recorded as text; the selected decision controls the simulation)…':'Write your reply…';
    $('player-decision-field').hidden=ticket.mode!=='sim';$('player-decision').replaceChildren(...[...(ticket.mode==='sim'?[{id:'',label:'Choose your decision…'}]:[]),...(prompt.choices||[])].map(c=>{const option=el('option','',c.label);option.value=c.id;return option;}));$('player-decision').required=ticket.mode==='sim';
    $('player-suggestions').replaceChildren(...(ticket.mode==='sim'?[]:prompt.suggested || []).map(text=>button(text.slice(0,90)+(text.length>90?'…':''),'',()=>{$('player-reply').value=text;})));}
}
function renderPresenter(){
  const ticket=selected();if(!$('presenter-panel').hidden){const usage=ticket?.events.filter(e=>['agent_thinking','director_usage'].includes(e.t)).reduce((sum,e)=>sum+(e.usage?.input||0)+(e.usage?.output||0),0) || 0;$('presenter-panel').textContent=`SESSION ${ticket?.id || '—'}  |  API ${ticket?.mode==='live'?'ON':'OFF'}  |  TICK ${ticket?.events.at(-1)?.tick || 0}  |  EVENTS ${ticket?.events.length || 0}  |  TOKENS ${usage.toLocaleString()}  |  ${paused?'PAUSED':speed+'×'}`;}
}

function showSource(scenario){
  const source=scenario.source;if(!source)return;
  const body=showDialog('PUBLIC CASE · '+source.case,scenario.title);
  body.append(el('p','',source.adaptation),el('p','',source.caveat),el('p','',`Original property: ${source.original_property}`));
  const link=el('a','button secondary','Open original public case ↗');link.href=source.url;link.target='_blank';link.rel='noopener noreferrer';body.append(link);
  for(const evidence of source.evidence){const detail=el('details','source-evidence');detail.append(el('summary','',evidence.id),el('pre','',evidence.text));body.append(detail);}
  body.append(el('p','muted',`Source revision: ${source.revision} · History SHA-256: ${source.history_sha256}`));
}
function showScenarios(){
  const body=showDialog('CHOOSE A STORY','Different problems. Visible outcomes.');
  body.append(el('p','','Simulate a complete public case, take control of any participants, or inspect an authentic recorded agent decision.'));
  body.append(button('+ Create your own case','button primary',()=>showLaunch(null,propertyById('P-001'))));
  const grid=el('div','scenario-grid');[...publicScenarios,...catalog.scenarios].forEach(s=>{const card=button('','scenario-choice',()=>showLaunch(s));card.append(el('span',`tile-icon ${s.color}`,symbols[s.id]),el('span','tag',s.tag),el('h3','',s.title),el('p','',s.source?'Complete interactive simulation · source evidence included':s.description));grid.append(card);});body.append(grid);
}
function field(label,options){const wrapper=el('label','field',label),select=document.createElement('select');for(const [value,text] of options){const option=el('option','',text);option.value=value;select.append(option);}wrapper.append(select);return {wrapper,select};}
function showLaunch(scenario,property=null){
  const free=!scenario,body=showDialog(free?'A NEW CASE':'START A STORY',scenario?.title || 'What is happening at home?');
  body.append(el('p','',scenario?.source?`${scenario.source.case} · Public case adapted to this village. See source evidence for the recorded outcome.`:scenario?.description || 'Choose a home, describe the issue and assign control to each participant.'));
  if(scenario?.source)body.append(button('View original case & evidence ↗','text-button',()=>showSource(scenario)));
  const form=el('form'),grid=el('div','form-grid');
  const mode=field('Experience',[['sim','Simulation · interactive · no API'],...(live?[['live','Real LLM agent · mock world']]:[]),...(scenario?.replay?[['replay','Recorded agent decision']]:[])]);
  const home=field('Home',catalog.world.properties.map(p=>[p.id,`${p.id} · ${p.tenant}`]));home.select.value=property?.id||scenario?.property||'P-001';
  const director=field('Automatic participants in live mode',[['scripted','Scripted personas'],['improvise','LLM personas · additional API calls']]);
  const rounds=field('Maximum live rounds',[['8','8 rounds'],['4','4 rounds'],['1','1 round']]);
  grid.append(mode.wrapper,home.wrapper,director.wrapper,rounds.wrapper);form.append(grid);
  form.append(el('h3','cast-title','Who is AI, and who is you?'));
  form.append(el('p','muted','Choose which roles you control. The case routes the operator and selects a contractor only if needed. Your turn begins when that role is involved.'));
  const cast=el('div','cast-grid'),controlFields={};
  for(const role of ROLES){const control=field(LABELS[role],[['ai','AI · automatic persona'],['human','You · manual decisions']]);controlFields[role]=control;cast.append(control.wrapper);}form.append(cast);
  const presets=el('div','suggestions');for(const [label,humanRoles] of [['All AI',[]],['Play everyone',ROLES],['Play the tenant',['tenant']]])presets.append(button(label,'',()=>{for(const role of ROLES)controlFields[role].select.value=humanRoles.includes(role)?'human':'ai';}));form.append(presets);
  const notice=el('div','notice');form.append(notice);
  const sync=()=>{
    const replay=mode.select.value==='replay',isLive=mode.select.value==='live';
    const people=participantsFor(catalog.world,home.select.value);
    for(const role of ROLES){controlFields[role].wrapper.firstChild.textContent=`${LABELS[role]} · ${people[role]?.name||(role==='contractor'?'joins if needed':'routed by case')}`;controlFields[role].select.disabled=replay;}
    home.select.disabled=replay||isLive&&!free&&!scenario?.source;
    director.wrapper.hidden=!isLive;rounds.wrapper.hidden=!isLive;
    notice.textContent=replay?'Authentic recorded agent decision. Playback does not accept player input.':isLive?'The real CaseAgent runs against its isolated mock world. Choose manual or automatic control for each role; replies are untrusted evidence. The agent selects contractors.':'All effects stay in this browser. AI means a scripted simulation persona; no LLM calls. Manual participants pause the story until you choose a decision. Notes are recorded without interpreting them.';
  };
  for(const input of [mode,home])input.select.addEventListener('change',sync);sync();
  let issue;
  if(free){const label=el('label','field','Describe the issue');issue=el('textarea');issue.maxLength=4000;issue.required=true;issue.placeholder='The kitchen tap is leaking…';label.append(issue);form.append(label);}
  const actions=el('div','dialog-actions');actions.append(button('Back','button secondary',showScenarios));const start=el('button','button primary','Start case →');start.type='submit';actions.append(start);form.append(actions);
  form.addEventListener('submit',async event=>{
    event.preventDefault();start.disabled=true;
    try{
      const controls=Object.fromEntries(ROLES.map(r=>[r,controlFields[r].select.value])),propertyId=home.select.value;
      if(mode.select.value==='replay')await startReplay(scenario);
      else if(mode.select.value==='sim'){
        const story=scenario||{id:'free',kind:'free',title:issue.value,issue:issue.value,property:propertyId,color:'blue'};
        startSimulation(simulationConfigFor(catalog.world,story,propertyId,controls,issue?.value||''),story);
      }
      else await startLive({scenario:scenario?.source||free?'free':scenario.id,property:propertyId,issue:issue?.value||(scenario?.source?scenario.issue:''),role:'watch',controls,director:director.select.value,max_ticks:Number(rounds.select.value)},scenario);
      showView('village');
    }catch(error){showError(error);start.disabled=false;}
  });body.append(form);
}
function renderCases(){
  const rows=filterCases([...tickets.values()],caseFilter,caseQuery),container=$('case-list');
  $('case-count').textContent=`${rows.length} of ${tickets.size} cases`;
  container.replaceChildren(...rows.map(ticket=>{
    const card=el('article','case-row'),copy=el('div'),state=caseState(ticket);
    copy.append(el('span',`tag ${state}`,`${ticket.mode.toUpperCase()} · ${state==='waiting'?'YOUR TURN':state.toUpperCase()}`),el('h3','',ticket.scenario.title||ticket.issue||'New case'),el('p','',`${ticket.provenance?.case||ticket.property} · ${propertyById(ticket.property)?.address||ticket.property}`),el('p','',ticket.pending?`Waiting for ${ownerName(ticket)}`:ticket.endReason||`Next: ${ownerName(ticket)}`));
    if(ticket.controls)copy.append(el('p','muted',ROLES.map(r=>`${LABELS[r]}: ${ticket.controls[r]==='human'?'You':'AI'}`).join(' · ')));
    card.append(copy,button(ticket.pending?'Take your turn →':'Open case →','button secondary',()=>{showView('village');select(ticket.id);$('ticket-title').scrollIntoView({behavior:'smooth',block:'center'});}));return card;
  }));
  if(!rows.length)container.append(el('p','notice','No cases match this view. Start a new simulation or change the filter.'));
}
function showProperty(id){
  if(!catalog)return;const property=propertyById(id);if(!property)return;
  const active=[...tickets.values()].findLast(t=>t.property===id);if(active)select(active.id);
  const landlord=catalog.world.landlords.find(l=>l.id===property.landlord_id);
  const body=showDialog('MEET YOUR NEIGHBOUR',property.tenant);body.append(el('p','',`${property.address} · ${property.type}`));
  body.append(el('div','notice',`${property.occupants}. Landlord: ${landlord.name}. Standing spend cap: £${landlord.spend_cap_gbp}.${property.vulnerable?' Extra care: this resident has mobility needs.':''}`));
  if(active)body.append(button('Follow this home’s story ↗','button secondary',()=>{select(active.id);closeDialog();showView('village');}));
  body.append(button('View all cases for this home →','text-button',()=>openHomeCases(id)));
  const actions=el('div','dialog-actions');actions.append(button('Watch a scenario','button secondary',showScenarios),button('Report an issue','button primary',()=>showLaunch(null,property)));body.append(actions);
}
function openHomeCases(id){caseFilter='all';caseQuery=id;$('case-filter').value='all';$('case-search').value=id;closeDialog();showView('cases');}
function renderHomes(){
  const all=homeRows(catalog.world,[...tickets.values()]),rows=filterHomes(all,{query:$('home-search').value,landlord:$('home-landlord').value,status:$('home-status').value});
  $('home-count').textContent=`${rows.length} of ${all.length} homes · ${all.reduce((n,p)=>n+p.active,0)} active cases`;
  $('home-list').replaceChildren(...rows.map(p=>{
    const card=el('article','home-card');card.append(el('span','tag',`${p.id} · ${p.type}`),el('h2','',p.address),el('p','',`Tenant: ${p.tenant}`),el('p','',`Landlord: ${p.landlord.name}`),el('p','muted',p.occupants));
    const counts=el('div','home-counts');counts.append(el('span','',`${p.active} active`),el('span','',`${p.waiting} waiting for you`),el('span','',`${p.cases.length} total cases`));card.append(counts);
    const actions=el('div','directory-actions');actions.append(button('View home','button secondary',()=>showProperty(p.id)),button('Cases →','text-button',()=>openHomeCases(p.id)),button('+ Report issue','text-button',()=>showLaunch(null,p)));card.append(actions);return card;
  }));
  if(!rows.length)$('home-list').append(el('p','notice','No homes match these filters. Try a name, address or property ID, or clear the filters.'));
}
function showPerson(person){
  const body=showDialog(LABELS[person.role].toUpperCase(),person.name);body.append(el('p','',person.detail));
  const homes=el('div','directory-actions');for(const id of person.homes)homes.append(button(`${id} · ${propertyById(id)?.address||'Home'}`,'button secondary',()=>showProperty(id)));body.append(homes);
  body.append(el('h3','','Case assignments'));
  for(const a of person.assignments){const card=el('div','case-row');card.append(el('p','',`${a.title} · ${a.property} · ${a.control==='human'?'You':a.control==='ai'?'AI':a.control==='recorded'?'Recorded':'Control not recorded'} · ${a.active?'Active':'Finished'}`),button('Open case →','text-button',()=>{closeDialog();showView('village');select(a.id);}));body.append(card);}
  if(!person.assignments.length)body.append(el('p','notice','No assigned cases. A contractor or operator joins when the workflow needs them.'));
  body.append(button('Back to people','button secondary',showPeople));
}
function showPeople(initial={}){
  const body=showDialog('THE PEOPLE BEHIND THE TICKETS','Find your people.');
  body.append(el('p','','Search names, trades, addresses or home IDs. Residents and businesses are synthetic.'));
  const toolbar=el('div','directory-toolbar'),searchLabel=el('label','field','Find a person'),search=el('input');search.type='search';search.placeholder='Name, trade or home…';searchLabel.append(search);
  const role=field('Role',[['all','All roles'],...ROLES.map(r=>[r,LABELS[r]])]),home=field('Home',[['all','All homes'],...catalog.world.properties.map(p=>[p.id,`${p.id} · ${p.address.split(',')[0]}`])]),control=field('Control in case',[['all','Any control'],['ai','AI'],['human','You'],['recorded','Recorded'],['unassigned','No assigned cases']]);
  if(ROLES.includes(initial.role))role.select.value=initial.role;
  const count=el('p','directory-count'),list=el('div','people-list');count.setAttribute('role','status');
  const refresh=()=>{
    const all=peopleRows(catalog.world,[...tickets.values()]),rows=filterPeople(all,{query:search.value,role:role.select.value,home:home.select.value,control:control.select.value});
    count.textContent=`${rows.length} of ${all.length} people and teams`;
    list.replaceChildren(...rows.map(p=>{const card=button('','person',()=>showPerson(p)),copy=el('div');
      const assignments=p.assignments.filter(a=>home.select.value==='all'||a.property===home.select.value);
      const counts=[['ai','AI'],['human','You'],['recorded','Recorded']].map(([key,label])=>{const n=assignments.filter(a=>a.control===key).length;return n?`${label}: ${n}`:'';}).filter(Boolean);
      copy.append(el('b','',p.name),el('small','',p.detail===LABELS[p.role]?p.detail:`${LABELS[p.role]} · ${p.detail}`),el('small','',p.homes.join(' · ')||'Joins a home when assigned'),el('small','',counts.join(' · ')||'No control assignment'));
      card.append(el('div',`avatar ${{tenant:'gold',landlord:'rose',contractor:'blue',operator:'sage'}[p.role]}`,p.role==='operator'?'D':p.role[0].toUpperCase()),copy);return card;}));
    if(!rows.length)list.append(el('p','notice','No people match. Change or clear the filters.'));
  };
  toolbar.append(searchLabel,role.wrapper,home.wrapper,control.wrapper,button('Clear filters','text-button',()=>{search.value='';for(const input of [role,home,control])input.select.value='all';refresh();}));
  body.append(toolbar,el('p','muted','AI / You belongs to a case, not permanently to a person. Recorded sessions have no player control. Future contractor roles appear after assignment.'),count,list);
  search.addEventListener('input',refresh);for(const input of [role,home,control])input.select.addEventListener('change',refresh);peopleRefresh=refresh;refresh();
}
function showHelp(){const body=showDialog('WELCOME TO LETTINGS VILLAGE','Watch. Play. Follow the evidence.');const list=el('ol','help-list');for(const text of ['Start the village launches three public-case simulations and a fraud scenario. A green success appears only after all closure checks.','Cases shows active, waiting, successful and finished sessions. Browser simulations persist across reloads; server live sessions reconnect while that server is running.','New case lets you choose a home and set Tenant, Landlord, Contractor and Dwelly operator independently to AI or You. You can play several roles in one browser.','Simulation AI is scripted and calls no API. Choose explicit decisions for manual turns: declining approval or reporting incomplete work keeps a case open.','Stories also contains four authentic recorded agent decisions. The real LLM mode is available when its server is connected. These evidence types stay separate in Intelligence.','Use Space to pause simulations/replays, 1 / 2 / 4 to change speed and ↠ for the next turn. Export saves an event journal; imported journals play back without restoring player control.'])list.append(el('li','',text));body.append(list);}

async function api(path,body){const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const result=await response.json();if(!response.ok)throw new Error(result.error || 'The office could not complete this request.');return result;}
async function startLive(config,scenario){const result=await api('/api/sessions',config);if(!tickets.has(result.id))tickets.set(result.id,createTicket(result.id,'live',scenario || {title:config.issue,property:config.property,color:'sage'}));const ticket=tickets.get(result.id);ticket.controls=config.controls;select(result.id);closeDialog();toast('The report is in. The real agent is taking a look.');}
async function connectLive(){
  const response=await fetch('/api/sessions');if(!response.ok)return;const snapshot=await response.json();
  for(const raw of snapshot.sessions){const ticket=tickets.get(raw.id) || createTicket(raw.id,'live',scenarioById(raw.config.scenario) || {title:raw.config.issue,property:raw.config.property});ticket.controls=raw.config.controls;tickets.set(raw.id,ticket);for(const event of raw.events)handleEvent(ticket,event,false);}
  stream?.close();stream=new EventSource(`/api/events?after=${snapshot.cursor}`);
  stream.onmessage=message=>{try{const event=JSON.parse(message.data);if(event.t==='workspace_reset'){for(const id of event.session_ids)if(tickets.get(id)?.mode==='live')tickets.delete(id);if(!tickets.has(selectedId))selectedId=[...tickets.keys()][0]||null;render();return;}let ticket=tickets.get(event.session);if(!ticket){ticket=createTicket(event.session,'live',{title:event.issue,property:event.property});tickets.set(event.session,ticket);}handleEvent(ticket,event);}catch(error){showError(error);}};
  stream.addEventListener('reset',()=>{stream.close();connectLive().catch(showError);});
  stream.onerror=()=>{$('connection').textContent='Reconnecting to the office…';};
  stream.onopen=()=>{$('connection').replaceChildren(el('i'),document.createTextNode('Real agent connected'));$('connection').classList.add('live');};
  render();
}
function exportRecording(){const ticket=selected();if(!ticket)return;const content=ticket.events.map(e=>JSON.stringify(e)).join('\n')+'\n';const url=URL.createObjectURL(new Blob([content],{type:'application/x-ndjson'}));const a=el('a');a.href=url;a.download=`lettings-village-${ticket.id}.jsonl`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Recording exported. Import it with Replay to watch offline.');}
async function importRecording(file){if(!file)return;if(file.size>2_000_000)throw new Error('Please choose a recording under 2 MB.');const events=parseReplay(await file.text());const key=crypto.randomUUID();const scenario={id:key,title:events[0].issue || 'Imported recording',property:events[0].property,color:'blue'};recordings.set(key,events);await startReplay(scenario);showView('village');toast('Imported recording · source supplied by the file');}
function showReplay(error=''){
  const body=showDialog('REPLAY STUDIO','Watch a recorded case.');body.append(el('p','','Replay follows an existing event journal. It does not run the agent, call an API or let you change past decisions.'));
  if(error){const notice=el('p','error-notice',error);notice.setAttribute('role','alert');body.append(notice);}
  body.append(el('h3','','Load your recording'),el('p','','Choose a .jsonl or .ndjson file exported with “Export this session” in the village. Maximum 2 MB. Simulation exports also play as recordings; they do not resume interactive control.'),button('Choose recording file…','button primary',()=>$('replay-file').click()));
  body.append(el('h3','cast-title','Or watch a built-in recording'));
  const list=el('div','scenario-grid');for(const s of catalog.scenarios.filter(s=>s.replay)){const card=button('','scenario-choice',()=>startReplay(s).then(()=>showView('village')).catch(e=>showReplay(e.message)));card.append(el('span','tag','RECORDED AGENT RUN'),el('h3','',s.title),el('p','',s.description));list.append(card);}body.append(list);
  body.append(el('p','muted','A BI evidence ledger (.json) belongs in Intelligence → Import ledger, not Replay.'));
}
function localWorkspaceSnapshot(includeBI){
  return {simulations:[...simulations.values()].map(sim=>sim.snapshot()),
    replays:[...tickets.values()].filter(t=>t.mode==='replay').map(t=>({id:t.id,scenario:t.scenario,events:t.events,recording:t.recording,position:t.position,playhead:t.playhead,running:t.running,ended:t.ended,endReason:t.endReason,progress:t.progress})),
    selectedId,bi:includeBI?intelligence?.snapshot?.()||null:null};
}
function clearLocalWorkspace(){
  simulations.clear();for(const [id,t] of tickets)if(t.mode!=='live')tickets.delete(id);
  recordings.clear();selectedId=[...tickets.keys()][0]||null;storageWarning=false;storageBlocked=false;
  village.particles=[];$('player-card').dataset.prompt='';$('safety-banner').hidden=true;$('toast').hidden=true;
  clearTimeout(toastTimeout);clearTimeout(bannerTimeout);caseFilter='all';caseQuery='';$('case-filter').value='all';$('case-search').value='';
  $('home-search').value='';$('home-landlord').value='all';$('home-status').value='all';speed=1;$('speed').value='1';$('world-clock').textContent='SAT, 10 OCT · 09:00';
}
async function undoReset(){
  const backup=readResetBackup(localStorage);if(!backup)throw new Error('There is no reset to undo.');
  const additions=[];
  for(const raw of backup.workspace.simulations){
    if(tickets.has(raw.config.id))continue;
    const events=parseReplay(raw.events.map(e=>JSON.stringify(e)).join('\n')),ticket=createTicket(raw.config.id,'sim',raw.config.scenario);
    const sim=new Simulation(raw.config,e=>handleEvent(ticket,e),{...raw,events});events.forEach(e=>reduceEvent(ticket,e));ticket.pending=sim.pending;ticket.ended=sim.finished;ticket.progress=sim.index/sim.plan.length;ticket.simCountdown=1000;additions.push({ticket,sim});
  }
  for(const raw of backup.workspace.replays){
    if(tickets.has(raw.id))continue;
    const recording=parseReplay(raw.recording.map(e=>JSON.stringify(e)).join('\n')),ticket=createTicket(raw.id,'replay',raw.scenario);
    raw.events.forEach(e=>reduceEvent(ticket,e));Object.assign(ticket,{recording,position:raw.position,playhead:raw.playhead,running:raw.running,ended:raw.ended,endReason:raw.endReason,progress:raw.progress});additions.push({ticket});
  }
  if(tickets.size+additions.length>32)throw new Error('Restoring would exceed 32 cases. Export and clear some local cases first. Your backup is intact.');
  const bi=backup.workspace.bi||(REVIEW_KEY in backup.values?{reviews:JSON.parse(backup.values[REVIEW_KEY]||'{}')}:null);
  if(bi&&!intelligence){intelligencePromise=createIntelligence($('intelligence'),{getTickets:()=>[...tickets.values()],openTicket:id=>{showView('village');select(id);},dialog:showDialog}).then(result=>intelligence=result);await intelligencePromise;}
  if(bi&&!intelligence?.restore)throw new Error('Intelligence could not load. The undo backup is intact; retry when its data is available.');
  restoreLocal(localStorage,backup);
  for(const {ticket,sim} of additions){tickets.set(ticket.id,ticket);if(sim)simulations.set(ticket.id,sim);}
  if(bi)intelligence.restore(bi);
  selectedId=tickets.has(backup.workspace.selectedId)?backup.workspace.selectedId:[...tickets.keys()][0]||null;
  storageWarning=false;storageBlocked=false;paused=true;if(!persistSimulations())throw new Error('Restored sessions are in memory, but could not be saved. The undo backup is still available.');localStorage.removeItem(RESET_KEY);closeDialog();showView('cases');render();
}
function showReset(){
  const body=showDialog('START FRESH','Reset this demo.');const locals=[...tickets.values()].filter(t=>t.mode!=='live');
  body.append(el('p','',`Clear ${simulations.size} saved simulations and ${locals.filter(t=>t.mode==='replay').length} replay sessions from this browser. Homes, people, public cases and built-in recordings stay available.`));
  const scope=field('Reset scope',[['sessions','Sessions only · keep BI data'],['all','Sessions + BI reviews, imports and settings']]);body.append(scope.wrapper);
  const liveLabel=el('label','reset-check'),stopLive=el('input');stopLive.type='checkbox';liveLabel.append(stopLive,document.createTextNode('Also stop and clear sessions on the connected live server (affects other viewers).'));liveLabel.hidden=!live;body.append(liveLabel);
  body.append(el('p','notice','A local undo backup is saved before clearing anything. Undo restores browser sessions and selected BI data; live execution cannot be resumed. Server journals are kept. A later reset replaces the previous undo backup.'));
  const error=el('p','error-notice');error.hidden=true;error.setAttribute('role','alert');body.append(error);
  const actions=el('div','dialog-actions');const reset=button('Reset demo','button primary',async()=>{
    if(resetInProgress)return;resetInProgress=true;reset.disabled=true;const wasPaused=paused;let cleared=false,failed=false;paused=true;
    try{
      await intelligencePromise;
      const includeBI=scope.select.value==='all';resetLocal(localStorage,localWorkspaceSnapshot(includeBI),includeBI);
      clearLocalWorkspace();cleared=true;if(includeBI)intelligence?.reset?.();render();
      if(stopLive.checked){const result=await api('/api/reset',{confirm:true});for(const id of result.cleared)if(tickets.get(id)?.mode==='live')tickets.delete(id);selectedId=[...tickets.keys()][0]||null;}
      closeDialog();showView('village');render();showResetDone();
    }catch(e){failed=true;error.textContent=cleared?`${e.message} Local data was reset; live reset could not be confirmed. Use Undo to recover local data.`:e.message;error.hidden=false;if(cleared)body.append(button('Undo local reset','button secondary',()=>undoReset().catch(dialogError)));}
    finally{paused=wasPaused;reset.disabled=cleared&&failed;resetInProgress=false;}
  });
  actions.append(button('Cancel','button secondary',closeDialog),reset);body.append(actions);
  try{const backup=readResetBackup(localStorage);if(backup){body.append(el('p','muted',`Undo available from ${new Date(backup.created_at).toLocaleString()}. Existing new cases are kept; restored BI settings replace current BI settings.`),button('Undo last local reset','button secondary',()=>undoReset().catch(e=>{error.textContent=e.message;error.hidden=false;})));}}
  catch(e){error.textContent=e.message;error.hidden=false;reset.disabled=true;}
}
function showResetDone(){const body=showDialog('READY FOR A NEW DEMO','Your workspace is reset.');body.append(el('p','','Start a fresh story, or undo the local reset. Undo opens restored sessions paused. Stopped live sessions remain stopped.'),button('Undo local reset','button secondary',()=>undoReset().catch(dialogError)),button('Start a new case','button primary',()=>showLaunch(null,propertyById('P-001'))));}

$('close-dialog').addEventListener('click',closeDialog);$('dialog').addEventListener('click',event=>{if(event.target===$('dialog')){const r=$('dialog').getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeDialog();}});
$('start-village').addEventListener('click',startVillage);for(const id of ['new-ticket','browse-stories','choose-story','nav-stories'])$(id).addEventListener('click',showScenarios);
$('nav-village').addEventListener('click',()=>{showView('village');$('village').scrollIntoView({behavior:'smooth',block:'center'});});$('nav-people').addEventListener('click',showPeople);$('help').addEventListener('click',showHelp);
for(const view of ['village','cases','homes','intelligence'])$(`view-${view}`).addEventListener('click',()=>showView(view));
$('nav-cases').addEventListener('click',()=>showView('cases'));
$('nav-homes').addEventListener('click',()=>showView('homes'));
$('open-people').addEventListener('click',showPeople);
for(const id of ['nav-reset','open-reset'])$(id).addEventListener('click',showReset);
for(const id of ['import','open-replay'])$(id).addEventListener('click',()=>showReplay());
for(const id of ['home-search','home-landlord','home-status'])$(id).addEventListener(id==='home-search'?'input':'change',renderHomes);
$('home-clear').addEventListener('click',()=>{$('home-search').value='';$('home-landlord').value='all';$('home-status').value='all';renderHomes();});
$('nav-intelligence').addEventListener('click',()=>showView('intelligence'));
$('pause').addEventListener('click',()=>{paused=!paused;updatePlayback();renderPresenter();});$('speed').addEventListener('change',()=>{speed=Number($('speed').value);renderPresenter();});$('skip').addEventListener('click',skip);$('export').addEventListener('click',exportRecording);
$('dismiss-safety').addEventListener('click',()=>$('safety-banner').hidden=true);
$('presenter').addEventListener('click',()=>{const on=document.body.classList.toggle('presenting');$('presenter-panel').hidden=!on;renderPresenter();});
$('expand-map').addEventListener('click',()=>toggleMap().catch(showError));
for(const name of ['story','status'])$(`tab-${name}`).addEventListener('click',()=>{for(const tab of ['story','status']){$(`${tab}-tab`).hidden=tab!==name;$(`tab-${tab}`).classList.toggle('active',tab===name);$(`tab-${tab}`).setAttribute('aria-selected',String(tab===name));}});
$('reply-form').addEventListener('submit',async event=>{event.preventDefault();const ticket=selected(),prompt=ticket?.pending;if(!prompt)return;const submit=$('reply-form').querySelector('button');submit.disabled=true;try{if(ticket.mode==='sim'){simulations.get(ticket.id).answer(prompt.role,prompt.prompt_id,$('player-decision').value,$('player-reply').value);persistSimulations();}else await api(`/api/sessions/${ticket.id}/message`,{role:prompt.role,prompt_id:prompt.prompt_id,body:$('player-reply').value});ticket.pending=null;render();}catch(error){showError(error);}finally{submit.disabled=false;}});
$('stop-ticket').addEventListener('click',async()=>{const ticket=selected();if(!ticket)return;try{if(ticket.mode==='live')await api(`/api/sessions/${ticket.id}/cancel`,{});else if(ticket.mode==='sim'){simulations.get(ticket.id).close('cancelled');persistSimulations();}else{ticket.running=false;ticket.ended=true;ticket.endReason='Playback stopped by presenter';}render();}catch(error){showError(error);}});
$('replay-file').addEventListener('change',()=>{importRecording($('replay-file').files[0]).catch(e=>showReplay(`Could not load this recording: ${e.message}`));$('replay-file').value='';});
document.addEventListener('keydown',event=>{if(['INPUT','TEXTAREA','SELECT','BUTTON'].includes(event.target.tagName)||$('dialog').open)return;if(event.code==='Space'){event.preventDefault();$('pause').click();}if(['1','2','4'].includes(event.key)){speed=Number(event.key);$('speed').value=event.key;renderPresenter();}});

async function boot(){
  try{
    const response=await fetch('/catalog.json');if(!response.ok)throw new Error('Village data could not be loaded. Refresh or start make game-replay.');catalog=await response.json();
    const sources=await fetch('/public-scenarios.json');if(!sources.ok)throw new Error('Public scenario data is unavailable.');publicScenarios=(await sources.json()).scenarios;
    restoreSimulations();
    $('actor-count').textContent=`${catalog.world.properties.length+catalog.world.landlords.length+catalog.world.contractors.length+catalog.world.operators.length} neighbours`;
    $('property-list').replaceChildren(...catalog.world.properties.map(p=>button(`${p.id} · ${p.address.split(',')[0]}`,'',()=>showProperty(p.id))));
    for(const l of catalog.world.landlords){const option=el('option','',l.name);option.value=l.id;$('home-landlord').append(option);}
    render();
    if(['#intelligence','#cases','#homes'].includes(location.hash))showView(location.hash.slice(1));
    try{const response=await fetch('/api/health');if(response.ok){const health=await response.json();live=health.live;if(live)await connectLive();}}catch{/* Static/offline hosting intentionally has no live API. */}
    if(params.get('presenter')==='1')$('presenter').click();
    const replay=params.get('replay');if(replay){const id=replay.replace(/\.jsonl$/,'');const scenario=scenarioById(id);if(scenario)await startReplay(scenario);else toast('Unknown bundled replay. Use Replay to import a local JSONL file.');}
    $('connection').replaceChildren(el('i'),document.createTextNode(live?'Real agent connected':'Simulation ready · API off'));
    if('serviceWorker' in navigator){try{await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;$('offline-status').textContent='Offline village available on this device';}catch{$('offline-status').textContent='Local files ready · browser caching unavailable';}}
  }catch(error){$('ticket-empty').replaceChildren(el('h2','','The village could not open.'),el('p','',error.message),button('Try again','button primary',()=>location.reload()));}
}
$('case-source').addEventListener('click',()=>showSource(selected()?.scenario));
$('case-new').addEventListener('click',()=>showLaunch(null,propertyById('P-001')));
$('case-filter').addEventListener('change',()=>{caseFilter=$('case-filter').value;renderCases();});
$('case-search').addEventListener('input',()=>{caseQuery=$('case-search').value;renderCases();});
$('clear-finished').addEventListener('click',()=>{for(const [id,sim] of simulations)if(sim.finished){simulations.delete(id);tickets.delete(id);}if(!tickets.has(selectedId))selectedId=[...tickets.keys()][0]||null;persistSimulations();render();});
boot();
