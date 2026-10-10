// Local workerd/SQLite integration check. Uses synthetic credentials, no provider calls.
import assert from 'node:assert/strict';
import {mkdtemp, mkdir} from 'node:fs/promises';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';

const origin='https://village.example',password='synthetic-test-password-only';
const result=await build({entryPoints:['deploy/cloudflare/worker.js'],bundle:true,write:false,format:'esm',external:['cloudflare:workers']});
await mkdir('artifacts/cloudflare-smoke',{recursive:true});
const persistence=await mkdtemp('artifacts/cloudflare-smoke/run-');
const options={workers:[{
  name:'gateway',modules:true,script:result.outputFiles[0].text,compatibilityDate:'2026-10-10',
  bindings:{PUBLIC_ORIGIN:origin,DEMO_PASSWORD:password},
  serviceBindings:{ASSETS:()=>new Response('PRIVATE ASSET')},
  ratelimits:{LOGIN_LIMITER:{namespace_id:'1',simple:{limit:10,period:60}}},
  durableObjects:{LEDGER:{className:'DemoLedger',useSQLite:true},VILLAGE:{className:'VillageContainer',useSQLite:true}}
},{
  name:'driver',modules:true,compatibilityDate:'2026-10-10',
  durableObjects:{LEDGER:{className:'DemoLedger',scriptName:'gateway',useSQLite:true}},
  script:`export default {async fetch(req,env){const s=env.LEDGER.getByName('shared-demo-v1'), b=await req.json(); return Response.json((await s[b.method](...(b.args||[]))) ?? null);}}`
}]};
const runtimeOptions={...convertV4MiniflareOptions(options),resourcePersistencePath:persistence};
let runtime=new Miniflare(runtimeOptions);
const dispatch=(url,init={})=>runtime.dispatchFetch(url,{...init,redirect:'manual'});
try {
  let response=await dispatch(origin+'/');
  assert.equal(response.status,303); assert.equal(response.headers.get('location'),'/login');
  response=await dispatch(origin+'/api/health');assert.equal(response.status,401);
  response=await dispatch(origin+'/login',{method:'POST',headers:{origin},body:'password=wrong'});assert.equal(response.status,401);
  response=await dispatch(origin+'/login',{method:'POST',headers:{origin},body:new URLSearchParams({password}).toString()});
  assert.equal(response.status,303);const cookie=response.headers.get('set-cookie').split(';')[0];
  response=await dispatch(origin+'/',{headers:{cookie}});assert.equal(await response.text(),'PRIVATE ASSET');assert.match(response.headers.get('cache-control'),/no-store/);
  response=await dispatch(origin+'/api/health',{headers:{cookie}});const health=await response.json();assert.equal(health.live,false);assert.equal(health.cloud,true);
  response=await dispatch(origin+'/api/reset',{method:'POST',headers:{cookie,origin:'https://evil.example'},body:'{}'});assert.equal(response.status,403);
  response=await dispatch(origin+'/journal',{method:'POST',headers:{cookie,origin},body:'{}'});assert.equal(response.status,404);
  let driver=await runtime.getWorker('driver');
  const rpc=async(method,...args)=>(await driver.fetch(origin,{method:'POST',body:JSON.stringify({method,args})})).json();
  const reservations=await Promise.all(Array.from({length:20},(_,i)=>rpc('reserve',`request-${i}`)));
  assert.equal(reservations.filter(Boolean).length,11);
  assert.equal((await rpc('budget')).remaining_micro_usd,160000);
  await rpc('settle','request-0',{input_tokens:1000,output_tokens:500});
  const settled=await rpc('budget');await rpc('settle','request-0',{input_tokens:0,output_tokens:0});
  assert.deepEqual(await rpc('budget'),settled);
  const event={session:'a'.repeat(32),seq:1,t:'ticket_opened',issue:'Synthetic persisted case'};
  await rpc('append',event);await rpc('append',event);
  assert.equal((await rpc('recordings'))[0].events,1);
  await runtime.dispose();runtime=new Miniflare(runtimeOptions);driver=await runtime.getWorker('driver');
  assert.deepEqual(await rpc('budget'),settled);
  assert.equal(await rpc('recording',event.session),JSON.stringify(event)+'\n');
  response=await dispatch(origin+'/api/recordings',{headers:{cookie}});assert.equal((await response.json())[0].title,event.issue);
  response=await dispatch(origin+'/logout',{method:'POST',headers:{cookie,origin}});assert.equal(response.status,303);assert.match(response.headers.get('set-cookie'),/Max-Age=0/);
  console.log('Cloud gateway smoke: PASS (login, asset/API protection, CSRF, budget concurrency, settlement idempotency, durable replay, logout). No model calls.');
} finally {await runtime.dispose();}
