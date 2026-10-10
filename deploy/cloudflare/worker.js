import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers';
import { MODEL, BUDGET_MICRO_USD, REQUEST_RESERVE, COOKIE, json, samePassword, issueCookie, authenticated, sameOrigin, validateMessage, usageCharge, boundedText, loginPage } from './gateway.js';

const ledger = env => env.LEDGER.getByName('shared-demo-v1');
const village = env => env.VILLAGE.getByName('shared-demo-v1');
const SID = /^[a-f0-9]{32}$/;
const containerRequest = (input, init) => {
  const source = new Request(input,init), url = new URL(source.url);
  url.protocol = 'http:';
  return new Request(url,source);
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.origin !== env.PUBLIC_ORIGIN) return json({error:'Unrecognised origin'}, 403);
    if (!env.DEMO_PASSWORD || env.DEMO_PASSWORD.length < 12) return json({error:'Owner setup required: configure a demo password of at least 12 characters.'}, 503);
    if (url.pathname === '/login') {
      if (request.method === 'GET') return loginPage();
      if (request.method !== 'POST' || !sameOrigin(request, url.origin)) return json({error:'Use the sign-in form'}, 403);
      const allowed = await env.LOGIN_LIMITER.limit({key:request.headers.get('cf-connecting-ip') || 'unknown'});
      if (!allowed.success) return json({error:'Too many sign-in attempts. Try again in a minute.'}, 429);
      let form;
      try { form = new URLSearchParams(await boundedText(request, 2048)); } catch { return json({error:'Invalid sign-in request'},400); }
      if (!await samePassword(form.get('password') || '', env.DEMO_PASSWORD)) return new Response(loginPage('Password not recognised.').body, {status:401,headers:loginPage().headers});
      return new Response(null, {status:303,headers:{location:'/', 'cache-control':'no-store','set-cookie':await issueCookie(env.DEMO_PASSWORD,url.origin)}});
    }
    if (!await authenticated(request, env.DEMO_PASSWORD, url.origin)) {
      return url.pathname.startsWith('/api/') ? json({error:'Sign in again at /login'},401) : new Response(null,{status:303,headers:{location:'/login','cache-control':'no-store'}});
    }
    if (!['GET','HEAD','POST'].includes(request.method)) return json({error:'Method not allowed'},405);
    if (request.method === 'POST' && !sameOrigin(request,url.origin)) return json({error:'Use a same-origin request'},403);
    if (url.pathname === '/logout' && request.method === 'POST') return new Response(null,{status:303,headers:{location:'/login','cache-control':'no-store','set-cookie':`${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,'clear-site-data':'"cache"'}});
    if (url.pathname === '/api/health' && request.method === 'GET') {
      const budget = await ledger(env).budget();
      return json({ok:true,live:!!env.ANTHROPIC_API_KEY && budget.remaining_micro_usd >= REQUEST_RESERVE,cloud:true,protocol:1,max_sessions:1,budget});
    }
    if (url.pathname === '/api/recordings' && request.method === 'GET') return json(await ledger(env).recordings());
    const recording = url.pathname.match(/^\/api\/sessions\/([a-f0-9]{32})\/recording$/);
    if (recording && request.method === 'GET') {
      const content = await ledger(env).recording(recording[1]);
      return content ? new Response(content,{headers:{'content-type':'application/x-ndjson','cache-control':'no-store','content-disposition':`attachment; filename="${recording[1]}.jsonl"`}}) : json({error:'Recording not found'},404);
    }
    if (url.pathname.startsWith('/api/')) {
      if (!/^\/api\/(sessions(?:\/[a-f0-9]{32}\/(message|cancel))?|events|reset)$/.test(url.pathname)) return json({error:'Not found'},404);
      if (request.method === 'POST') {
        if (!request.headers.get('content-type')?.startsWith('application/json')) return json({error:'Use JSON'},400);
        try { request = new Request(request,{body:await boundedText(request,8192)}); } catch { return json({error:'Request too large'},413); }
      }
      try { return await village(env).fetch(request); } catch { return json({error:'The live agent is unavailable. Try again; persisted recordings are still available.'},503); }
    }
    // Hosted access must always go through the password gate, including static assets.
    if (!['GET','HEAD'].includes(request.method)) return json({error:'Not found'},404);
    if (url.pathname === '/sw.js') return new Response('self.addEventListener("install",()=>self.skipWaiting());self.addEventListener("activate",event=>event.waitUntil(Promise.all([self.registration.unregister(),caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith("lettings-")).map(k=>caches.delete(k))))])));',{headers:{'content-type':'text/javascript','cache-control':'no-store'}});
    const asset = await env.ASSETS.fetch(request);
    const response = new Response(asset.body,asset);
    response.headers.set('cache-control','private, no-store');
    response.headers.set('x-content-type-options','nosniff');
    response.headers.set('referrer-policy','same-origin');
    response.headers.set('content-security-policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    return response;
  }
};

export class VillageContainer extends DurableObject {
  constructor(ctx,env) {
    super(ctx,env);
    if (ctx.container?.running) ctx.blockConcurrencyWhile(() => ctx.container.setInactivityTimeout(120000));
  }
  async ready() {
    if (!this.starting) this.starting = this.start().finally(() => {this.starting = null;});
    return this.starting;
  }
  async start() {
    const container = this.ctx.container;
    if (!container.running) {
      container.start({image:container.images.agent,instance:'lite',enableInternet:false,env:{
        VILLAGE_PUBLIC_ORIGIN:this.env.PUBLIC_ORIGIN,ANTHROPIC_BASE_URL:'http://village-internal/provider',
        ANTHROPIC_API_KEY:'internal-proxy-placeholder',LOA_MODEL:MODEL,LOA_MAX_STEPS:'4',LOA_CASE_TIMEOUT_S:'180',
        LOA_RETRY_BUDGET:'0',LOA_TPM_BUDGET:'30000',LOA_REVIEWER:'rules'
      }});
      await this.ctx.storage.setAlarm(Date.now() + 30 * 60000);
    }
    await container.interceptOutboundHttp('village-internal',this.ctx.exports.InternalServices({props:{}}));
    await container.setInactivityTimeout(120000);
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        const response = await container.getTcpPort(8787).fetch(containerRequest(`${this.env.PUBLIC_ORIGIN}/api/health`,{signal:AbortSignal.timeout(1000)}));
        if (response.ok) { await response.body?.cancel(); return; }
        await response.body?.cancel();
      } catch { /* Cold start: retry readiness, never a session POST. */ }
      await new Promise(resolve => setTimeout(resolve,200));
    }
    throw new Error('Container did not become ready');
  }
  async fetch(request) {
    const path = new URL(request.url).pathname;
    const creates = path === '/api/sessions' && request.method === 'POST';
    if (creates && (!this.env.ANTHROPIC_API_KEY || (await ledger(this.env).budget()).remaining_micro_usd < REQUEST_RESERVE)) return json({error:'The shared live-agent budget is unavailable. Simulation remains available.'},503);
    if (!this.ctx.container.running && !creates) {
      if (path === '/api/sessions' && request.method === 'GET') return json({sessions:[],cursor:0,container_running:false});
      if (path === '/api/events' && request.method === 'GET') return new Response(null,{status:204});
      if (path === '/api/reset' && request.method === 'POST') {
        try { if ((await request.json()).confirm !== true) return json({error:'Confirm stopping and clearing the live sessions'},400); }
        catch { return json({error:'Use a JSON reset request'},400); }
        return json({ok:true,cleared:[],journals_preserved:true});
      }
      return json({error:'This live session ended when the container stopped. Download its journal from Replay.'},410);
    }
    await this.ready();
    const headers = new Headers(request.headers);
    headers.delete('cookie'); headers.delete('authorization');
    return this.ctx.container.getTcpPort(8787).fetch(containerRequest(request,{headers}));
  }
  async alarm() {
    // A left-open SSE tab must not keep paid compute running indefinitely.
    if (this.ctx.container.running) {
      try {
        const response = await this.ctx.container.getTcpPort(8787).fetch(containerRequest(`${this.env.PUBLIC_ORIGIN}/api/reset`,{method:'POST',headers:{'content-type':'application/json',origin:this.env.PUBLIC_ORIGIN},body:'{"confirm":true}',signal:AbortSignal.timeout(15000)}));
        await response.body?.cancel();
      } finally { await this.ctx.container.destroy(); }
    }
  }
}

export class DemoLedger extends DurableObject {
  constructor(ctx,env) {
    super(ctx,env);
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS events (session TEXT, seq INTEGER, data TEXT NOT NULL, PRIMARY KEY(session,seq))');
    this.sql.exec('CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY, charge INTEGER NOT NULL, settled INTEGER NOT NULL DEFAULT 0)');
  }
  budget() {
    const spent = this.sql.exec('SELECT COALESCE(SUM(charge),0) AS amount FROM requests').one().amount;
    return {limit_micro_usd:BUDGET_MICRO_USD,reserved_or_charged_micro_usd:spent,remaining_micro_usd:BUDGET_MICRO_USD-spent,model:MODEL};
  }
  reserve(id) {
    // Synchronous SQLite operations cannot interleave with another reservation.
    if (this.budget().remaining_micro_usd < REQUEST_RESERVE) return false;
    this.sql.exec('INSERT INTO requests (id,charge) VALUES (?,?)',id,REQUEST_RESERVE);
    return true;
  }
  settle(id,usage) {
    const charge = usageCharge(usage);
    if (charge !== null) this.sql.exec('UPDATE requests SET charge = ?, settled = 1 WHERE id = ? AND settled = 0',charge,id);
  }
  append(event) {
    if (!SID.test(event.session) || !Number.isSafeInteger(event.seq) || event.seq < 1 || event.seq > 20000) throw new Error('Invalid journal event');
    const data = JSON.stringify(event);
    if (data.length > 262144) throw new Error('Journal event too large');
    const existing = this.sql.exec('SELECT data FROM events WHERE session = ? AND seq = ?',event.session,event.seq).toArray()[0];
    if (existing && existing.data !== data) throw new Error('Conflicting journal sequence');
    if (!existing && this.sql.exec('SELECT COALESCE(SUM(length(CAST(data AS BLOB))) + COUNT(*),0) AS size FROM events WHERE session = ?',event.session).one().size + new TextEncoder().encode(data).length + 1 > 2_000_000) throw new Error('Journal is full');
    this.sql.exec('INSERT OR IGNORE INTO events VALUES (?,?,?)',event.session,event.seq,data);
    return true;
  }
  recordings() {
    return this.sql.exec('SELECT session AS id, COUNT(*) AS events FROM events GROUP BY session ORDER BY MAX(rowid) DESC LIMIT 100').toArray().map(row => {
      const first = this.sql.exec('SELECT data FROM events WHERE session = ? ORDER BY seq LIMIT 1',row.id).one();
      return {...row,title:JSON.parse(first.data).issue || 'Recorded live case'};
    });
  }
  recording(id) {
    if (!SID.test(id)) return null;
    const rows = this.sql.exec('SELECT data FROM events WHERE session = ? ORDER BY seq',id).toArray();
    return rows.length ? rows.map(row => row.data).join('\n') + '\n' : null;
  }
}

// Private container egress, never dispatched by the public Worker.
export class InternalServices extends WorkerEntrypoint {
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (request.method !== 'POST') return json({error:'Method not allowed'},405);
    let body;
    try { body = JSON.parse(await boundedText(request,1_500_000)); } catch { return json({error:'Invalid request'},400); }
    if (path === '/journal') {
      try { await ledger(this.env).append(body); return json({ok:true}); } catch { return json({error:'Journal write failed'},503); }
    }
    if (path !== '/provider/v1/messages') return json({error:'Not found'},404);
    try { validateMessage(body); } catch { return json({type:'error',error:{type:'invalid_request_error',message:'Unsupported model request'}},400); }
    if (!this.env.ANTHROPIC_API_KEY) return json({error:'Owner setup required'},503);
    const id = crypto.randomUUID();
    if (!await ledger(this.env).reserve(id)) return json({type:'error',error:{type:'permission_error',message:'Shared demo budget exhausted'}},403);
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'content-type':'application/json','anthropic-version':'2023-06-01','x-api-key':this.env.ANTHROPIC_API_KEY},body:JSON.stringify(body),signal:AbortSignal.timeout(120000)});
      const content = await response.text();
      if (response.ok) {
        try { await ledger(this.env).settle(id,JSON.parse(content).usage); } catch { /* Keep the full reservation if the receipt cannot be verified. */ }
      }
      return new Response(content,{status:response.status,headers:{'content-type':'application/json','cache-control':'no-store'}});
    } catch { return json({type:'error',error:{type:'api_error',message:'Model request failed; its budget reservation is retained'}},502); }
  }
}
