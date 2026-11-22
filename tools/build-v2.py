#!/usr/bin/env python3
"""Genera v2/index.html (Pay Win Premium) a partir de index.html + tools/v2/premium.css y premium.js.
Cada vez que cambie index.html hay que volver a correr:  python3 tools/build-v2.py"""
import re, os, shutil
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
h = open(f'{R}/index.html', encoding='utf-8').read()
css = open(f'{R}/tools/v2/premium.css', encoding='utf-8').read()
js = open(f'{R}/tools/v2/premium.js', encoding='utf-8').read()
def sub(a, b, cnt=1):
    global h
    assert a in h, a
    h = h.replace(a, b, cnt)
sub('<title>Panel Administración Pay Win</title>', '<title>Pay Win Premium</title>')
sub('<link rel="manifest" href="/manifest.json">', '<link rel="manifest" href="/v2/manifest.json">\n<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link href="https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700&display=swap" rel="stylesheet">')
sub('<meta name="theme-color" content="#0D1117">', '<meta name="theme-color" content="#06080C">')
h = h.replace('src="logo-paywin.png"', 'src="/logo-paywin.png"')
sub("fetch('/index.html?chk='", "fetch('/v2/?chk='")
sub("'versión ' + PANEL_VERSION", "'premium · ' + PANEL_VERSION")
# CSS premium al final del <body>, JS premium justo después del script principal
i = h.rindex('</script>')
h = h[:i] + '</script>\n<script>\n' + js + '\n</script>\n<style id="premium">\n' + css + '\n</style>' + h[i + len('</script>'):]
os.makedirs(f'{R}/v2', exist_ok=True)
open(f'{R}/v2/index.html', 'w', encoding='utf-8').write(h)
shutil.copy(f'{R}/tools/v2/sw.js', f'{R}/v2/sw.js')
shutil.copy(f'{R}/tools/v2/manifest.json', f'{R}/v2/manifest.json')
print('v2 listo:', len(h) // 1024, 'KB')
