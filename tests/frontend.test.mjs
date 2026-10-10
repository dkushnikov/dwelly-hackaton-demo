import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createTicket,reduceEvent,metrics,parseReplay,shouldShow} from '../demo/web/model.js';

test('SSE redelivery cannot duplicate actions',()=>{
  const t=createTicket('one','live');const event={v:1,seq:1,t:'effect',op:'create_work_order'};
  assert.equal(reduceEvent(t,event),true);assert.equal(reduceEvent(t,event),false);assert.equal(metrics([t]).effects,1);
});
test('a resolved decision does not close the ticket without episode_end',()=>{
  const t=createTicket('one','live');reduceEvent(t,{v:1,seq:1,t:'status',stage:'visit_scheduling',owner:'contractor',disposition:'resolved'});
  assert.equal(t.ended,false);assert.equal(t.owner,'contractor');
});
test('player turn clears after reply and each session remains independent',()=>{
  const a=createTicket('a','live'),b=createTicket('b','live');
  reduceEvent(a,{v:1,seq:1,t:'awaiting_player',role:'landlord'});assert.equal(a.owner,'landlord');assert.equal(b.pending,null);
  reduceEvent(a,{v:1,seq:2,t:'actor_message',role:'landlord',body:'Decline'});assert.equal(a.pending,null);
});
test('all four golden recordings run to completion without fabricated gate blocks',()=>{
  for(const name of ['routine','approval','fraud','vulnerable']){
    const events=parseReplay(readFileSync(new URL(`../demo/web/replays/${name}.jsonl`,import.meta.url),'utf8'));
    const ticket=createTicket(name,'replay');events.forEach(e=>reduceEvent(ticket,e));assert.equal(ticket.ended,true);assert.equal(ticket.stage,'unknown');
    if(name==='fraud'){assert.ok(ticket.summary.withheld>0);assert.equal(ticket.summary.blocked,0);}
  }
});
test('malformed recording is rejected before playback',()=>{
  assert.throws(()=>parseReplay('{}'));
  assert.throws(()=>parseReplay(JSON.stringify({v:1,seq:1,t:'ticket_opened',at_ms:-4})));
  const opening={v:1,seq:1,t:'ticket_opened',at_ms:0};assert.throws(()=>parseReplay([opening,opening].map(JSON.stringify).join('\n')));
  assert.throws(()=>parseReplay([opening,{v:1,seq:2,t:'status',at_ms:1,red_flags:[null]}].map(JSON.stringify).join('\n')));
  assert.throws(()=>parseReplay([opening,{v:1,seq:2,t:'gate',at_ms:1,rules:'not-an-array'}].map(JSON.stringify).join('\n')));
  assert.throws(()=>parseReplay([opening,{v:1,seq:2,t:'participant_assigned',at_ms:1,role:'contractor'}].map(JSON.stringify).join('\n')));
  assert.throws(()=>parseReplay([opening,{v:1,seq:2,t:'participant_assigned',at_ms:1,role:'__proto__',actor_id:'bad',actor_name:'bad'}].map(JSON.stringify).join('\n')));
});
test('untrusted content stays literal and read gates do not clutter the timeline',()=>{
  const ticket=createTicket('a','replay');reduceEvent(ticket,{v:1,seq:1,t:'actor_message',body:'<img src=x onerror=alert(1)>'});
  assert.equal(ticket.events[0].body,'<img src=x onerror=alert(1)>');
  assert.equal(shouldShow({t:'gate',reason:'read'}),false);
  assert.equal(shouldShow({t:'withheld'}),true);
  assert.equal(/\.innerHTML\s*=/.test(readFileSync(new URL('../demo/web/app.js',import.meta.url),'utf8')),false);
});

test('recorded participant turns never count as a current human waiting on the village',()=>{
  const replay=createTicket('recording','replay');reduceEvent(replay,{v:1,seq:1,t:'awaiting_player',role:'tenant'});
  assert.equal(metrics([replay]).humans,0);
  const live=createTicket('live','live');reduceEvent(live,{v:1,seq:1,t:'awaiting_player',role:'operator'});
  assert.equal(metrics([replay,live]).humans,1);
  reduceEvent(live,{v:1,seq:2,t:'episode_end'});assert.equal(metrics([replay,live]).humans,0);
});
