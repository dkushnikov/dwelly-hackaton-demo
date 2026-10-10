const CACHE='lettings-village-v2';
const FILES=['/','/index.html','/style.css','/app.js','/model.js','/village.js','/favicon.svg','/catalog.json','/insights.css','/insights.js','/insights-model.js','/insights-rules.json','/insights-corpus.json','/insights-lab.json','/replays/routine.jsonl','/replays/approval.jsonl','/replays/fraud.jsonl','/replays/vulnerable.jsonl'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('lettings-village-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
  if(!FILES.includes(url.pathname))return;
  event.respondWith(fetch(event.request).then(response=>{
    if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(url.pathname,copy)));}
    return response;
  }).catch(()=>caches.match(url.pathname)));
});
