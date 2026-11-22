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
import re, colorsys
def _warm(r, g, b):
    hh, l, sat = colorsys.rgb_to_hls(r/255, g/255, b/255)
    if not (185 <= hh*360 <= 275) or sat < 0.05: return None
    if sat > 0.45: ns, nh = 0.62, 43
    elif l < 0.3: ns, nh = 0.22 + (0.3-l)*0.1, 38
    else: ns, nh = min(sat, 0.16), 40
    return tuple(int(x*255) for x in colorsys.hls_to_rgb(nh/360, l, ns))
def _hx(m):
    c = m.group(1); c = ''.join(x*2 for x in c) if len(c) == 3 else c
    w = _warm(int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16))
    return m.group(0) if not w else '#%02x%02x%02x' % w
def _rg(m):
    w = _warm(int(m.group(2)), int(m.group(3)), int(m.group(4)))
    return m.group(0) if not w else '%s(%d,%d,%d' % ((m.group(1),) + w)
# todo tono azulado/frío pasa a negro cálido con oro (sin azul en ninguna parte)
h = re.sub(r'#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b', _hx, h)
h = re.sub(r'(rgba?)\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)', _rg, h)
open(f'{R}/index.html', 'w', encoding='utf-8').write(h)
shutil.copy(f'{R}/tools/v2/sw.js', f'{R}/sw.js')
shutil.copy(f'{R}/tools/v2/manifest.json', f'{R}/manifest.json')
# /v2 ya no es una versión aparte: manda al link principal y borra el service worker viejo
os.makedirs(f'{R}/v2', exist_ok=True)
open(f'{R}/v2/index.html', 'w').write('<!doctype html><meta charset="utf-8"><title>Pay Win</title><script>try{navigator.serviceWorker&&navigator.serviceWorker.getRegistrations().then(function(r){r.forEach(function(x){if(x.scope.indexOf("/v2/")>0)x.unregister()})})}catch(e){}location.replace("/"+(location.search||""))</script><a href="/">Abrir Pay Win</a>')
open(f'{R}/v2/sw.js', 'w').write("self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil((async()=>{for(const k of await caches.keys())await caches.delete(k);await self.registration.unregister();const c=await self.clients.matchAll();c.forEach(x=>x.navigate('/'));})()));")
if os.path.exists(f'{R}/v2/manifest.json'): os.remove(f'{R}/v2/manifest.json')
print('listo:', len(h) // 1024, 'KB')
