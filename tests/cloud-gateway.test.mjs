import test from 'node:test';
import assert from 'node:assert/strict';
import { MODEL, REQUEST_RESERVE, BUDGET_MICRO_USD, issueCookie, authenticated, samePassword, sameOrigin, validateMessage, usageCharge, boundedText } from '../deploy/cloudflare/gateway.js';

const password = 'synthetic-test-password-only';
const origin = 'https://village.example';
const now = 1791648000000;
test('cookie is signed, origin-bound, expires and becomes invalid after password rotation', async()=>{
  const cookie=await issueCookie(password,origin,now);
  assert.match(cookie,/HttpOnly; Secure; SameSite=Strict/);
  assert.ok(!cookie.includes(password));
  const request=new Request(origin,{headers:{cookie:cookie.split(';')[0]}});
  assert.equal(await authenticated(request,password,origin,now),true);
  assert.equal(await authenticated(request,'another-password',origin,now),false);
  assert.equal(await authenticated(request,password,'https://elsewhere.example',now),false);
  assert.equal(await authenticated(request,password,origin,now+28800000),false);
  const tampered=new Request(origin,{headers:{cookie:cookie.split(';')[0].replace(/.$/,'x')}});
  assert.equal(await authenticated(tampered,password,origin,now),false);
  assert.equal(await samePassword(password,password),true);
  assert.equal(await samePassword('wrong',password),false);
});
test('cookie-authenticated mutations require an exact Origin',()=>{
  assert.equal(sameOrigin(new Request(origin,{headers:{origin}}),origin),true);
  assert.equal(sameOrigin(new Request(origin),origin),false);
  assert.equal(sameOrigin(new Request(origin,{headers:{origin:'https://evil.example'}}),origin),false);
});
test('proxy cannot select another model, expand output or enable separately charged tools',()=>{
  const body={model:MODEL,max_tokens:8000,messages:[{role:'user',content:'test'}]};
  assert.equal(validateMessage(body),body);
  for(const change of [{model:'another-model'},{max_tokens:8001},{max_tokens:true},{stream:true},{service_tier:'auto'},{tools:[{type:'web_search_20250305',name:'web_search'}]}])assert.throws(()=>validateMessage({...body,...change}));
  assert.doesNotThrow(()=>validateMessage({...body,tools:[{name:'read_record',input_schema:{type:'object'}}]}));
});
test('reservation covers cache writes at the highest allowed tariff and keeps unknown costs reserved',()=>{
  assert.equal(usageCharge({input_tokens:0,cache_creation_input_tokens:200000,output_tokens:8000}),REQUEST_RESERVE);
  assert.equal(usageCharge({input_tokens:1000,cache_read_input_tokens:10000,output_tokens:500}),4500);
  for(const usage of [null,{}, {input_tokens:-1,output_tokens:0},{input_tokens:200001,output_tokens:0},{input_tokens:1,output_tokens:8001}])assert.equal(usageCharge(usage),null);
  assert.equal(Math.floor(BUDGET_MICRO_USD/REQUEST_RESERVE),11);
});
test('body limit counts bytes and handles streamed requests without Content-Length',async()=>{
  assert.equal(await boundedText(new Request(origin,{method:'POST',body:'hello'}),5),'hello');
  await assert.rejects(boundedText(new Request(origin,{method:'POST',body:'привет'}),6),/too large/);
});
