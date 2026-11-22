// Pay Win: caché de la parte visual (HTML, fuentes, gráficos). Los DATOS nunca se guardan aquí: van directo a Google Sheets.
const V = 'paywin-shell-4';
const ESTATICO = /^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net)\//;
self.addEventListener('install', (e)=>{ self.skipWaiting(); });
self.addEventListener('activate', (e)=>{ e.waitUntil((async()=>{ for(const k of await caches.keys()) if(k !== V) await caches.delete(k); await self.clients.claim(); })()); });
self.addEventListener('fetch', (e)=>{
  const r = e.request, u = new URL(r.url);
  if(r.method !== 'GET') return;
  const esPagina = r.mode === 'navigate' && u.origin === location.origin && (u.pathname === '/' || u.pathname === '/index.html');
  const esLogo = u.origin === location.origin && (u.pathname === '/logo-paywin.png' || u.pathname === '/manifest.json');
  if(!(esPagina || esLogo || ESTATICO.test(r.url))) return; // todo lo demás (Sheets, /api) va directo a la red
  e.respondWith((async()=>{
    const c = await caches.open(V), hit = await c.match(esPagina ? '/' : r, { ignoreSearch:esPagina });
    const red = fetch(r).then((resp)=>{ if(resp && (resp.ok || resp.type === 'opaque')) c.put(esPagina ? '/' : r, resp.clone()); return resp; }).catch(()=>hit);
    return hit || red; // si ya hay copia sale al instante y se actualiza detrás
  })());
});
