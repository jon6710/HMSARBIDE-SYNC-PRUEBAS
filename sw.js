const CACHE='hmsarbide-supabase-piloto-v1';
const ASSETS=[
  './','./index.html','./styles.css','./app.js','./offline-sync.js','./manifest.json',
  './supabase-sync.js','./piloto-documentos.js', './approved-backgrounds/AUTOCLAVE_HOJA_SERVICIO_APROBADA.png', './approved-backgrounds/AUTOCLAVE_ALBARAN_APROBADO.png', './approved-backgrounds/AUTOCLAVE_FACTURA_APROBADA.png', './approved-backgrounds/MOBILIARIO_HOJA_SERVICIO_REFERENCIA.png', './approved-backgrounds/MOBILIARIO_ALBARAN_REFERENCIA.png', './approved-backgrounds/MOBILIARIO_FACTURA_REFERENCIA.png', './icons/icon-180.png','./icons/icon-192.png','./icons/icon-512.png'
];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('hmsarbide-supabase-piloto-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET') return;
  if(e.request.mode==='navigate'){
    e.respondWith(fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r;}).catch(()=>caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.match(e.request).then(cached=>cached||fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r;})));
});
