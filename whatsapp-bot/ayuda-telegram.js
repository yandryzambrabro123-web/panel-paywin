// Bloque "Necesitas Telegram" para las páginas de registro (stake, regalito, VIP).
// Botones de descarga oficiales (App Store / Play Store), guía de 3 pasos y tutoriales en español.
// Detecta el celular: en iPhone solo sale App Store, en Android solo Play Store (en computadora, las dos).
// "Ya tengo Telegram" lo achica a una línea para que no estorbe a quien ya lo usa (se puede volver a abrir tocando el título).
const APP_STORE = 'https://apps.apple.com/es/app/telegram-messenger/id686449807';
const PLAY_STORE = 'https://play.google.com/store/apps/details?id=org.telegram.messenger';
const GUIA_INSTALAR = 'https://www.xataka.com/basics/como-instalar-telegram-movil-ordenador';
const GUIA_CUENTA = 'https://internetpasoapaso.com/crear-cuenta-telegram-messenger/';

const CSS = `
.tg{margin-top:16px;border:1px solid rgba(52,152,219,.45);background:linear-gradient(180deg,#10202e,#0f1a25);border-radius:14px;padding:14px 16px}
.tg .tg-t{font-weight:700;font-size:15px;color:#e8f4ff;cursor:pointer}
.tg .tg-p{color:#a9bfd1;font-size:13.5px;line-height:1.45;margin:6px 0 0}
.tg .tg-b{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}
.tg .tg-b a{flex:1;min-width:140px;text-align:center;padding:12px 10px;border-radius:10px;background:#2aabee;color:#fff;font-weight:700;font-size:14.5px;text-decoration:none}
.tg details{margin-top:12px;color:#cfe3f3;font-size:13.5px}.tg summary{cursor:pointer;color:#7cc8f5;font-weight:600}
.tg ol{margin:10px 0 6px;padding-left:20px;line-height:1.55}.tg ol li{margin-bottom:4px}
.tg .tg-l{margin:8px 0 0;font-size:12.5px;color:#a9bfd1}.tg .tg-l a{color:#7cc8f5}
.tg button.tg-ok{display:block;width:auto;margin:12px 0 0;padding:9px 14px;border:1px solid #2f6f99;border-radius:10px;background:transparent;color:#9ed3f5;font-size:13px;font-weight:600;cursor:pointer}
.tg.mini{padding:10px 16px}.tg.mini>*:not(.tg-t){display:none}.tg.mini .tg-t:after{content:" ▾";color:#7cc8f5}
`;

const HTML = `<div class="tg" id="tgAyuda">
<div class="tg-t">📲 Necesitas Telegram para entrar</div>
<p class="tg-p">Tu acceso llega por Telegram. Es gratis y se instala en 1 minuto. ¿Aún no lo tienes? Descárgalo aquí:</p>
<div class="tg-b"><a id="tgIos" href="${APP_STORE}" target="_blank" rel="noopener">🍎 iPhone · App Store</a><a id="tgAnd" href="${PLAY_STORE}" target="_blank" rel="noopener">🤖 Android · Play Store</a></div>
<details><summary>¿Cómo lo instalo? Guía en 3 pasos</summary>
<ol><li>Toca tu botón de arriba y pulsa <b>Instalar</b> (o <b>Obtener</b> en iPhone).</li>
<li>Abre Telegram, pulsa <b>Comenzar</b> y escribe tu número de celular. Te llega un código por SMS (o dentro de la misma app): escríbelo.</li>
<li>Pon tu nombre y listo. Vuelve a esta página y sigue con tu registro.</li></ol>
<p class="tg-l">¿Prefieres verlo con fotos? <a href="${GUIA_INSTALAR}" target="_blank" rel="noopener">Guía para instalarlo</a> · <a href="${GUIA_CUENTA}" target="_blank" rel="noopener">Guía para crear tu cuenta</a></p></details>
<button type="button" class="tg-ok" id="tgYa">Ya tengo Telegram ✓</button>
</div>
<script>(function(){var el=document.getElementById('tgAyuda');if(!el)return;var ua=navigator.userAgent||'';var a=document.getElementById('tgIos'),b=document.getElementById('tgAnd');
if(/iPhone|iPad|iPod/i.test(ua)&&b)b.style.display='none';else if(/Android/i.test(ua)&&a)a.style.display='none';
try{if(localStorage.getItem('tgOk')==='1')el.classList.add('mini')}catch(e){}
var ya=document.getElementById('tgYa');if(ya)ya.onclick=function(){try{localStorage.setItem('tgOk','1')}catch(e){}el.classList.add('mini')};
var t=el.querySelector('.tg-t');if(t)t.onclick=function(){el.classList.toggle('mini')};})();</script>`;

// Consejo corto para la pantalla de "aprobado": entrar, y de paso dejar el canal listo (de a poco, un hábito a la vez).
const TIP_APROBADO = `<p style="font-size:13px;color:#9aa3b2;margin-top:16px">¿No te abre? Instala Telegram (gratis) y vuelve a tocar el botón.<br>🔔 Ya adentro, toca el nombre del canal (arriba) y activa las <b>notificaciones</b> para no perderte ninguna apuesta.</p>`;

module.exports = { CSS, HTML, TIP_APROBADO, APP_STORE, PLAY_STORE, GUIA_INSTALAR, GUIA_CUENTA };
