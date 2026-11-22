#!/usr/bin/env python3
"""Genera index.html (Pay Win Premium, el link principal) a partir de src/panel.html + tools/v2/premium.css y premium.js.
Editar SIEMPRE src/panel.html y luego correr:  python3 tools/build-v2.py"""
import os, shutil
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
h = open(f'{R}/src/panel.html', encoding='utf-8').read()
css = open(f'{R}/tools/v2/premium.css', encoding='utf-8').read()
js = open(f'{R}/tools/v2/premium.js', encoding='utf-8').read()
def sub(a, b):
    global h
    assert a in h, a
    h = h.replace(a, b, 1)
sub('<link rel="manifest" href="/manifest.json">', '<link rel="manifest" href="/manifest.json">\n<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link href="https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700&display=swap" rel="stylesheet">')
sub('<meta name="theme-color" content="#0D1117">', '<meta name="theme-color" content="#06080C">')
i = h.rindex('</script>')
h = h[:i] + '</script>\n<script>\n' + js + '\n</script>\n<style id="premium">\n' + css + '\n</style>' + h[i + len('</script>'):]
open(f'{R}/index.html', 'w', encoding='utf-8').write(h)
shutil.copy(f'{R}/tools/v2/sw.js', f'{R}/sw.js')
shutil.copy(f'{R}/tools/v2/manifest.json', f'{R}/manifest.json')
# /v2 ya no es una versión aparte: manda al link principal y borra el service worker viejo
os.makedirs(f'{R}/v2', exist_ok=True)
open(f'{R}/v2/index.html', 'w').write('<!doctype html><meta charset="utf-8"><title>Pay Win</title><script>try{navigator.serviceWorker&&navigator.serviceWorker.getRegistrations().then(function(r){r.forEach(function(x){if(x.scope.indexOf("/v2/")>0)x.unregister()})})}catch(e){}location.replace("/"+(location.search||""))</script><a href="/">Abrir Pay Win</a>')
open(f'{R}/v2/sw.js', 'w').write("self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil((async()=>{for(const k of await caches.keys())await caches.delete(k);await self.registration.unregister();const c=await self.clients.matchAll();c.forEach(x=>x.navigate('/'));})()));")
if os.path.exists(f'{R}/v2/manifest.json'): os.remove(f'{R}/v2/manifest.json')
print('listo:', len(h) // 1024, 'KB')
