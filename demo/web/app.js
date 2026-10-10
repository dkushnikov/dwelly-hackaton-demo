import {Village} from './village.js';
import {createTicket, reduceEvent, metrics, parseReplay, shouldShow, humanize, LABELS, STAGES} from './model.js';
import {createIntelligence} from './insights.js';

const $=id=>document.getElementById(id);
function el(tag,cls,text){const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=String(text);return node;}
function button(text,cls,action){const node=el('button',cls,text);node.type='button';node.addEventListener('click',action);return node;}
const tickets=new Map(), recordings=new Map();
let catalog,selectedId=null,paused=false,speed=1,live=false,stream=null,toastTimeout,bannerTimeout,renderScheduled=false;
let intelligence,intelligencePromise;
const params=new URLSearchParams(location.search);
const symbols={routine:'⌁',approval:'£',fraud:'◇',vulnerable:'✳'};
const village=new Village($('village'),showProperty);

function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>$('toast').hidden=true,4500);}
function showError(error){toast(error.message || String(error));}
function showDialog(kicker,title){$('dialog-kicker').textContent=kicker;$('dialog-content').replaceChildren(el('h2','',title));if(!$('dialog').open)$('dialog').showModal();return $('dialog-content');}
function closeDialog(){$('dialog').close();}
function openText(text){const body=showDialog('EVENT DETAILS','A closer look');body.append(el('p','',text));}
function scenarioById(id){return catalog.scenarios.find(s=>s.id===id);}
function propertyById(id){return catalog.world.properties.find(p=>p.id===id);}
function selected(){return tickets.get(selectedId);}
function showView(name){
  const bi=name==='intelligence';$('village-view').hidden=bi;$('intelligence').hidden=!bi;
  for(const view of ['village','intelligence']){$(`view-${view}`).classList.toggle('active',view===name);$(`view-${view}`).setAttribute('aria-current',view===name?'page':'false');$(`nav-${view}`).classList.toggle('selected',view===name);}
  history.replaceState(null,'',bi?'#intelligence':location.pathname+location.search);
  if(bi&&!intelligencePromise)intelligencePromise=createIntelligence($('intelligence'),{getTickets:()=>[...tickets.values()],openTicket:id=>{showView('village');select(id);},dialog:showDialog}).then(result=>intelligence=result);
  intelligence?.refreshOps();
}
function select(id){selectedId=id;render();}
function scheduleRender(){if(!renderScheduled){renderScheduled=true;requestAnimationFrame(()=>{renderScheduled=false;render();});}}
function ownerName(ticket){
  const property=propertyById(ticket.property);
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
  if(event.t==='awaiting_player' && ticket.mode==='live'){select(ticket.id);toast(`Your turn as ${event.role}`);}
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
async function startVillage(){
  try{
    await Promise.all(catalog.scenarios.map(loadReplay));
    for(let i=0;i<catalog.scenarios.length;i++)await startReplay(catalog.scenarios[i],i===0,i*1600);
    toast('Four stories. One village. Click any ticket to follow it.');
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
  }}
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
function updatePlayback(){
  $('pause').textContent=paused?'▶':'Ⅱ';$('pause').setAttribute('aria-label',paused?'Resume playback':'Pause playback');
  const ticket=selected();$('mode-badge').textContent=ticket?.mode==='live'?'LIVE AGENT':'REPLAY STUDIO';
  $('playback-description').textContent=ticket?.mode==='live'?'Real agent connected · mock world':paused?'Playback paused · Space to resume':'Real recordings · compressed timing';
  $('skip').disabled=ticket?.mode==='live';
}
function skip(){const ticket=selected();if(!ticket?.recording || !ticket.running)return;let next=ticket.position;while(next<ticket.recording.length-1&&!shouldShow(ticket.recording[next]))next++;ticket.playhead=ticket.recording[next].at_ms;while(ticket.position<=next)handleEvent(ticket,ticket.recording[ticket.position++]);ticket.progress=ticket.position/ticket.recording.length;render();}

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
    const state=ticket.pending?'Your turn':ticket.ended?'Run finished':ticket.events.length?'With '+ownerName(ticket):'Starting soon';
    copy.append(el('span','tile-badge',`${ticket.mode==='replay'?'↺ REPLAY':'● LIVE'} · ${state}`));tile.append(copy);
    const progress=el('div','tile-progress'),bar=el('span');bar.style.width=`${Math.round((ticket.mode==='replay'?ticket.progress:ticket.ended?1:.35)*100)}%`;progress.append(bar);tile.append(progress);return tile;
  }));
  const ticket=selected();$('ticket-empty').hidden=!!ticket;$('ticket-detail').hidden=!ticket;$('export').disabled=!ticket;
  if(ticket){renderTicket(ticket);const sim=ticket.events.at(-1)?.sim_time;if(sim){const date=new Date(sim);if(!Number.isNaN(date.valueOf()))$('world-clock').textContent=date.toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/London'}).toUpperCase();}}
  village.update(values,ticket);updatePlayback();renderPresenter();intelligence?.refreshOps();
}
function timelineItem(event){
  const row=el('div',`timeline-item ${event.t} ${event.verdict || ''}`);
  const icons={actor_message:'✉',playbook:'▤',effect:'↗',withheld:'◇',status:'✓',error:'!',episode_end:'·',awaiting_player:'?',gate:'◇',time_passes:'◷'};
  row.append(el('span','timeline-dot',icons[event.t] || '·'));
  const titles={actor_message:LABELS[event.role] || event.role,playbook:'Playbook selected',effect:humanize(event.op),withheld:'Action withheld by the agent',status:'Decision recorded',error:'The office needs attention',episode_end:'Run complete',awaiting_player:'Your turn',gate:humanize(event.tool),time_passes:`${event.hours} hours later`};
  const label=el('div','timeline-label');label.append(el('b','',titles[event.t] || humanize(event.t)),el('span','',`#${String(event.seq).padStart(2,'0')}`));row.append(label);
  let body=event.body || event.summary || event.reason || event.prompt || event.recap || event.message || (event.t==='playbook'?`${event.name} · ${event.urgency}`:'');
  if(typeof body==='object')body=event.reason || 'Decision recorded';
  body=String(body);
  if(body.length>180){row.append(el('p','',body.slice(0,177)+'…'));row.append(button('Read full detail ↗','text-button',()=>openText(body)));}
  else if(body)row.append(el('p','',body));
  if(event.t==='gate'){const chip=el('span','verdict',`${humanize(event.verdict).toUpperCase()}${event.rules?.length?' · '+event.rules.join(', '):''}`);row.append(chip);}
  if(event.t==='effect')row.append(el('span','verdict',event.deduplicated?'EXISTING EFFECT · NOT REPEATED':'CONFIRMED WRITE'));
  if(event.t==='withheld')row.append(el('span','verdict','AGENT REFUSAL · NO TOOL ATTEMPT'));
  if(event.source && event.t==='actor_message')row.append(el('span','verdict',event.source.toUpperCase()));
  return row;
}
function renderTicket(ticket){
  $('ticket-id').textContent=ticket.events[0]?.ticket || 'NEW TICKET';$('ticket-mode').textContent=ticket.mode==='replay'?'↺ Recorded agent run':'● Real agent · mock world';
  $('ticket-title').textContent=ticket.scenario.title || ticket.issue || 'A new story';$('ticket-address').textContent=propertyById(ticket.property)?.address || ticket.property;
  $('owner-name').textContent=ownerName(ticket);$('owner-avatar').textContent={agency:'D',tenant:'T',landlord:'L',contractor:'C',operator:'O'}[ticket.owner] || 'D';
  $('owner-note').textContent=ticket.pending?'Waiting for your reply':ticket.ended?'Next owner at the end of this recording':ticket.owner==='agency'?'Reading, checking, taking care':'The next step is with this person';
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
  $('provenance').textContent=ticket.provenance?`${ticket.provenance.source}\n${ticket.provenance.case}\nState SHA-256: ${ticket.provenance.state_sha256}\nTrace SHA-256: ${ticket.provenance.trace_sha256}\n${ticket.provenance.timing}`:'Live session. Recorded in order by the server. Imported files retain the provenance they contain; imports are not independently verified.';
  $('ticket-footer-text').textContent=ticket.ended?'Run finished. Follow the recorded ticket status.':'Every action has a receipt.';
  $('stop-ticket').hidden=ticket.ended;
  const prompt=ticket.mode==='live'?ticket.pending:null;$('player-card').hidden=!prompt;
  if(prompt && $('player-card').dataset.prompt!==prompt.prompt_id){$('player-card').dataset.prompt=prompt.prompt_id;$('player-title').textContent=`Reply as ${prompt.role}`;$('player-prompt').textContent=prompt.prompt;$('player-reply').value='';$('player-suggestions').replaceChildren(...(prompt.suggested || []).map(text=>button(text.slice(0,90)+(text.length>90?'…':''),'',()=>{$('player-reply').value=text;})));}
}
function renderPresenter(){
  const ticket=selected();if(!$('presenter-panel').hidden){const usage=ticket?.events.filter(e=>['agent_thinking','director_usage'].includes(e.t)).reduce((sum,e)=>sum+(e.usage?.input||0)+(e.usage?.output||0),0) || 0;$('presenter-panel').textContent=`SESSION ${ticket?.id || '—'}  |  API ${ticket?.mode==='live'?'ON':'OFF'}  |  TICK ${ticket?.events.at(-1)?.tick || 0}  |  EVENTS ${ticket?.events.length || 0}  |  TOKENS ${usage.toLocaleString()}  |  ${paused?'PAUSED':speed+'×'}`;}
}

function showScenarios(){
  const body=showDialog('CHOOSE A STORY','A day in the village.');body.append(el('p','','Start with a real recorded decision, or connect the live agent and step into a role.'));
  const grid=el('div','scenario-grid');catalog.scenarios.forEach(s=>{const card=button('','scenario-choice',()=>showLaunch(s));card.append(el('span',`tile-icon ${s.color}`,symbols[s.id]),el('span','tag',s.tag),el('h3','',s.title),el('p','',s.description));grid.append(card);});body.append(grid);
}
function field(label,options){const wrapper=el('label','field',label),select=document.createElement('select');for(const [value,text] of options){const option=el('option','',text);option.value=value;select.append(option);}wrapper.append(select);return {wrapper,select};}
function showLaunch(scenario,property=null){
  const free=!scenario,body=showDialog(free?'A NEW STORY':'TAKE YOUR PLACE',scenario?.title || 'What is happening at home?');
  body.append(el('p','',scenario?.description || `${property.tenant} · ${property.address}`));
  const form=el('form'),grid=el('div','form-grid');
  const mode=field('Experience',live?[['live','Live agent · interactive'],['replay','Recorded run · offline']]:[['replay','Recorded run · offline']]);
  if(!free)mode.select.value='replay';
  const role=field('Play as',[['watch','Watch the story'],['tenant','Tenant'],['landlord','Landlord'],['contractor','Contractor'],['operator','Dwelly operator']]);
  const director=field('Other participants',[['scripted','Conservative scripted personas'],['improvise','AI director · additional API calls']]);
  const rounds=field('Maximum agent rounds',[['4','4 rounds'],['1','1 round'],['8','8 rounds']]);
  const sync=()=>{const replay=mode.select.value==='replay';role.select.disabled=replay;director.select.disabled=replay;rounds.select.disabled=replay;};mode.select.addEventListener('change',sync);sync();
  grid.append(mode.wrapper,role.wrapper,director.wrapper,rounds.wrapper);form.append(grid);
  let issue;
  if(free){const label=el('label','field','Tell the agency what happened');issue=el('textarea');issue.maxLength=4000;issue.required=true;issue.placeholder='Boiler not working, I’m 82 and it’s cold…';label.append(issue);form.append(label);const presets=el('div','suggestions');for(const text of ['Boiler not working','Window handle fell off','I can smell gas'])presets.append(button(text,'',()=>issue.value=text));form.append(presets);role.select.value='tenant';}
  form.append(el('div','notice',live?'Every live decision comes from CaseAgent and the real policy gate. Role replies become untrusted ticket evidence. Each ticket has its own mock world.':'Live play needs the separately running agent and its runtime credentials. The four recorded runs are available now and never call an API.'));
  const actions=el('div','dialog-actions');actions.append(button('Back','button secondary',showScenarios));const start=el('button','button primary',free?'Send the report ↗':'Begin this story →');start.type='submit';if(free&&!live){start.disabled=true;form.append(el('p','error-notice','Reporting a new issue requires live mode. Choose a recorded story to explore the real agent’s earlier decisions.'));}actions.append(start);form.append(actions);
  form.addEventListener('submit',async event=>{event.preventDefault();start.disabled=true;try{if(mode.select.value==='replay')await startReplay(scenario);else await startLive({scenario:scenario?.id || 'free',property:property?.id || scenario.property,issue:issue?.value || '',role:role.select.value,director:director.select.value,max_ticks:Number(rounds.select.value)},scenario);}catch(error){showError(error);start.disabled=false;}});body.append(form);
}
function showProperty(id){
  if(!catalog)return;const property=propertyById(id);if(!property)return;
  const active=[...tickets.values()].findLast(t=>t.property===id);if(active)select(active.id);
  const landlord=catalog.world.landlords.find(l=>l.id===property.landlord_id);
  const body=showDialog('MEET YOUR NEIGHBOUR',property.tenant);body.append(el('p','',`${property.address} · ${property.type}`));
  body.append(el('div','notice',`${property.occupants}. Landlord: ${landlord.name}. Standing spend cap: £${landlord.spend_cap_gbp}.${property.vulnerable?' Extra care: this resident has mobility needs.':''}`));
  if(active)body.append(button('Follow this home’s story ↗','button secondary',()=>{select(active.id);closeDialog();}));
  const actions=el('div','dialog-actions');actions.append(button('Watch a scenario','button secondary',showScenarios),button('Report an issue','button primary',()=>showLaunch(null,property)));body.append(actions);
}
function showPeople(){const body=showDialog('THE PEOPLE BEHIND THE TICKETS','A whole village, connected.');body.append(el('p','','Each ticket brings a tenant, a landlord, a contractor and a Dwelly operator into the same story. Residents and businesses are synthetic.'));const list=el('div','people-list');const people=[...catalog.world.properties.map(p=>({name:p.tenant,role:'Tenant · '+p.id,initial:'T',color:'gold'})),...catalog.world.landlords.map(l=>({name:l.name,role:'Landlord',initial:'L',color:'rose'})),...catalog.world.contractors.map(c=>({name:c.name,role:humanize(c.trade),initial:'C',color:'blue'})),...catalog.world.operators.map(name=>({name,role:'Dwelly',initial:'D',color:'sage'}))];for(const person of people){const item=el('div','person'),copy=el('div');copy.append(el('b','',person.name),el('small','',person.role));item.append(el('div',`avatar ${person.color}`,person.initial),copy);list.append(item);}body.append(list);}
function showHelp(){const body=showDialog('WELCOME TO LETTINGS VILLAGE','Big picture. Human detail.');body.append(el('p','','A playable view of a lettings operations agent. Start several stories together, then zoom into the one that matters.'));const list=el('ol','help-list');for(const text of ['Start the village to run four real recordings in parallel. Select a ticket to inspect its full timeline.','Click a home to meet its residents. In live mode, report a problem and choose a role to play.','Letters are confirmed messages; a van moves only when a work order was recorded. A refusal is shown separately from a policy gate block.','Use Space to pause replays, 1 / 2 / 4 to change speed, and ↠ to jump to the next meaningful event. Live decisions continue on the server.','Presenter view enlarges the detail and shows session, API, tick and usage. Export ↓ saves a JSONL recording; Replay in the rail opens it without API calls.','These bundled recordings are authentic single-decision runs from an earlier agent version. Their missing workflow stages and checklists are shown as unrecorded.'])list.append(el('li','',text));body.append(list);}

async function api(path,body){const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const result=await response.json();if(!response.ok)throw new Error(result.error || 'The office could not complete this request.');return result;}
async function startLive(config,scenario){const result=await api('/api/sessions',config);if(!tickets.has(result.id))tickets.set(result.id,createTicket(result.id,'live',scenario || {title:config.issue,property:config.property,color:'sage'}));select(result.id);closeDialog();toast('The report is in. The real agent is taking a look.');}
async function connectLive(){
  const response=await fetch('/api/sessions');if(!response.ok)return;const snapshot=await response.json();
  for(const raw of snapshot.sessions){const ticket=tickets.get(raw.id) || createTicket(raw.id,'live',scenarioById(raw.config.scenario) || {title:raw.config.issue,property:raw.config.property});tickets.set(raw.id,ticket);for(const event of raw.events)handleEvent(ticket,event,false);}
  stream?.close();stream=new EventSource(`/api/events?after=${snapshot.cursor}`);
  stream.onmessage=message=>{try{const event=JSON.parse(message.data);let ticket=tickets.get(event.session);if(!ticket){ticket=createTicket(event.session,'live',{title:event.issue,property:event.property});tickets.set(event.session,ticket);}handleEvent(ticket,event);}catch(error){showError(error);}};
  stream.addEventListener('reset',()=>{stream.close();connectLive().catch(showError);});
  stream.onerror=()=>{$('connection').textContent='Reconnecting to the office…';};
  stream.onopen=()=>{$('connection').replaceChildren(el('i'),document.createTextNode('Real agent connected'));$('connection').classList.add('live');};
  render();
}
function exportRecording(){const ticket=selected();if(!ticket)return;const content=ticket.events.map(e=>JSON.stringify(e)).join('\n')+'\n';const url=URL.createObjectURL(new Blob([content],{type:'application/x-ndjson'}));const a=el('a');a.href=url;a.download=`lettings-village-${ticket.id}.jsonl`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Recording exported. Import it with Replay to watch offline.');}
async function importRecording(file){if(!file)return;if(file.size>2_000_000)throw new Error('Please choose a recording under 2 MB.');const events=parseReplay(await file.text());const key=crypto.randomUUID();const scenario={id:key,title:events[0].issue || 'Imported recording',property:events[0].property,color:'blue'};recordings.set(key,events);await startReplay(scenario);toast('Imported recording · source supplied by the file');}

$('close-dialog').addEventListener('click',closeDialog);$('dialog').addEventListener('click',event=>{if(event.target===$('dialog')){const r=$('dialog').getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeDialog();}});
$('start-village').addEventListener('click',startVillage);for(const id of ['new-ticket','browse-stories','choose-story','nav-stories'])$(id).addEventListener('click',showScenarios);
$('nav-village').addEventListener('click',()=>{showView('village');$('village').scrollIntoView({behavior:'smooth',block:'center'});});$('nav-people').addEventListener('click',showPeople);$('help').addEventListener('click',showHelp);
for(const view of ['village','intelligence'])$(`view-${view}`).addEventListener('click',()=>showView(view));
$('nav-intelligence').addEventListener('click',()=>showView('intelligence'));
$('pause').addEventListener('click',()=>{paused=!paused;updatePlayback();renderPresenter();});$('speed').addEventListener('change',()=>{speed=Number($('speed').value);renderPresenter();});$('skip').addEventListener('click',skip);$('export').addEventListener('click',exportRecording);
$('dismiss-safety').addEventListener('click',()=>$('safety-banner').hidden=true);
$('presenter').addEventListener('click',()=>{const on=document.body.classList.toggle('presenting');$('presenter-panel').hidden=!on;renderPresenter();});
for(const name of ['story','status'])$(`tab-${name}`).addEventListener('click',()=>{for(const tab of ['story','status']){$(`${tab}-tab`).hidden=tab!==name;$(`tab-${tab}`).classList.toggle('active',tab===name);$(`tab-${tab}`).setAttribute('aria-selected',String(tab===name));}});
$('reply-form').addEventListener('submit',async event=>{event.preventDefault();const ticket=selected(),prompt=ticket?.pending;if(!prompt)return;const submit=$('reply-form').querySelector('button');submit.disabled=true;try{await api(`/api/sessions/${ticket.id}/message`,{role:prompt.role,prompt_id:prompt.prompt_id,body:$('player-reply').value});ticket.pending=null;render();}catch(error){showError(error);}finally{submit.disabled=false;}});
$('stop-ticket').addEventListener('click',async()=>{const ticket=selected();if(!ticket)return;try{if(ticket.mode==='live')await api(`/api/sessions/${ticket.id}/cancel`,{});else{ticket.running=false;ticket.ended=true;ticket.endReason='Playback stopped by presenter';}render();}catch(error){showError(error);}});
$('import').addEventListener('click',()=>$('replay-file').click());$('replay-file').addEventListener('change',()=>{importRecording($('replay-file').files[0]).catch(showError);$('replay-file').value='';});
document.addEventListener('keydown',event=>{if(['INPUT','TEXTAREA','SELECT','BUTTON'].includes(event.target.tagName)||$('dialog').open)return;if(event.code==='Space'){event.preventDefault();$('pause').click();}if(['1','2','4'].includes(event.key)){speed=Number(event.key);$('speed').value=event.key;renderPresenter();}});

async function boot(){
  try{
    const response=await fetch('/catalog.json');if(!response.ok)throw new Error('Village data could not be loaded. Refresh or start make game-replay.');catalog=await response.json();
    $('actor-count').textContent=`${catalog.world.properties.length+catalog.world.landlords.length+catalog.world.contractors.length+catalog.world.operators.length} neighbours`;
    $('property-list').replaceChildren(...catalog.world.properties.map(p=>button(`${p.id} · ${p.address.split(',')[0]}`,'',()=>showProperty(p.id))));
    render();
    if(location.hash==='#intelligence')showView('intelligence');
    try{const response=await fetch('/api/health');if(response.ok){const health=await response.json();live=health.live;if(live)await connectLive();}}catch{/* Static/offline hosting intentionally has no live API. */}
    if(params.get('presenter')==='1')$('presenter').click();
    const replay=params.get('replay');if(replay){const id=replay.replace(/\.jsonl$/,'');const scenario=scenarioById(id);if(scenario)await startReplay(scenario);else toast('Unknown bundled replay. Use Replay to import a local JSONL file.');}
    if('serviceWorker' in navigator){try{await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;$('offline-status').textContent='Offline village available on this device';}catch{$('offline-status').textContent='Local files ready · browser caching unavailable';}}
  }catch(error){$('ticket-empty').replaceChildren(el('h2','','The village could not open.'),el('p','',error.message),button('Try again','button primary',()=>location.reload()));}
}
boot();
