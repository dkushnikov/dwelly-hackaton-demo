import test from 'node:test';
import assert from 'node:assert/strict';
import {homeSignal} from '../demo/web/village.js';

const ticket=(extra={})=>({property:'P-001',mode:'sim',ended:false,pending:null,...extra});
test('map status distinguishes an empty home, active work and confirmed success',()=>{
  assert.equal(homeSignal([],'P-001').label,'No cases');
  assert.equal(homeSignal([ticket({property:'P-002'})],'P-001').label,'No cases');
  const active=homeSignal([ticket(),ticket({ended:true,outcome:'success'})],'P-001');
  assert.equal(active.state,'active');assert.equal(active.label,'1 active');assert.match(active.detail,/2 total cases/);
  assert.equal(homeSignal([ticket({ended:true,outcome:'success'})],'P-001').state,'success');
});
test('manual turns and unresolved outcomes take priority over routine work',()=>{
  const pending=ticket({pending:{role:'landlord'}}),review=ticket({ended:true,outcome:'needs_review'});
  assert.equal(homeSignal([ticket(),pending,review],'P-001').label,'Your turn · 1');
  assert.equal(homeSignal([ticket(),review],'P-001').label,'Review · 1');
  assert.equal(homeSignal([review],'P-001').state,'attention');
});
test('recorded prompts are not playable and finished or stopped runs are not successes',()=>{
  const replay=ticket({mode:'replay',pending:{role:'tenant'}});
  assert.equal(homeSignal([replay],'P-001').state,'active');
  assert.match(homeSignal([replay],'P-001').detail,/0 waiting for you.*1 recorded runs/);
  for(const outcome of [undefined,'cancelled']){
    const result=homeSignal([ticket({ended:true,outcome,pending:{role:'tenant'}}),ticket({ended:true,outcome:'success'})],'P-001');
    assert.equal(result.state,'quiet');assert.equal(result.label,'2 finished');
  }
});
