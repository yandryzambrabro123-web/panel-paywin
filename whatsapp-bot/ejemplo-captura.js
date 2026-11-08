// Mini chat animado de WhatsApp que muestra, como ejemplo, cómo debe verse la captura.
// Sin comillas dobles, saltos de línea, backticks ni backslashes: se incrusta dentro de las páginas.
const CSS = [
  '.ej{margin:0 0 12px;border-radius:12px;overflow:hidden;border:1px solid #3a3f4d;background:#e7dfd2;position:relative}',
  '.ej-t{background:#1f2a2e;color:#cfe3dc;font-size:11.5px;padding:6px 10px;display:flex;justify-content:space-between}',
  '.ej-t b{color:#f2d27a}',
  '.ej-c{padding:10px 10px 12px;height:292px;position:relative;overflow:hidden}',
  '.ej-m{position:absolute;left:10px;right:10px;max-width:84%;padding:7px 9px;border-radius:9px;font-size:13px;line-height:1.3;color:#1b1b1b;box-shadow:0 1px 1px rgba(0,0,0,.15);opacity:0;animation-duration:12s;animation-iteration-count:infinite;animation-timing-function:ease-out}',
  '.ej-m.l{background:#fff;left:10px;right:auto}',
  '.ej-m.r{background:#d9fdd3;right:10px;left:auto}',
  '.ej-m small{display:block;text-align:right;font-size:10px;color:#667781;margin-top:2px}',
  '.ej-rc{width:200px;text-align:center;padding:8px 6px;background:#eef2fb;border-radius:6px}',
  '.ej-rc .ok{display:inline-block;width:22px;height:22px;line-height:22px;border-radius:50%;background:#2fa66a;color:#fff;font-size:14px}',
  '.ej-rc .t{font-weight:700;color:#14305e;font-size:13px;margin-top:3px}',
  '.ej-rc .m{font-size:26px;font-weight:800;color:#111;margin:2px 0}',
  '.ej-rc .d{font-size:11.5px;color:#444;line-height:1.35}',
  '.ej-lk{display:flex;gap:8px;align-items:center;width:230px}',
  '.ej-lk i{font-style:normal;font-size:28px;background:#eee;border-radius:8px;width:44px;height:44px;line-height:44px;text-align:center;flex:none}',
  '.ej-lk span{font-size:12.5px}.ej-lk span u{text-decoration:none;color:#667781;display:block;font-size:11.5px}',
  '@keyframes ejA{0%,4%{opacity:0;transform:translateY(8px)}9%,90%{opacity:1;transform:none}96%,100%{opacity:0}}',
  '@keyframes ejB{0%,24%{opacity:0;transform:translateY(8px)}29%,90%{opacity:1;transform:none}96%,100%{opacity:0}}',
  '@keyframes ejC{0%,44%{opacity:0;transform:translateY(8px)}49%,90%{opacity:1;transform:none}96%,100%{opacity:0}}',
  '@keyframes ejD{0%,62%{opacity:0;transform:translateY(8px)}67%,90%{opacity:1;transform:none}96%,100%{opacity:0}}',
  '.ej-m.a1{animation-name:ejA}.ej-m.a2{animation-name:ejB}.ej-m.a3{animation-name:ejC}.ej-m.a4{animation-name:ejD}',
  '@media (prefers-reduced-motion:reduce){.ej-m{animation:none;opacity:1}}',
].join('');

const recibo = (titulo, fecha) => "<div class='ej-rc'><span class='ok'>✓</span><div class='t'>" + titulo + "</div><div class='m'>$ 20,00</div><div class='d'>" + fecha + "<br>N. de comprobante 00012345</div></div>";

function chat(tipo) {
  let ms;
  if (tipo === 'stake') {
    ms = [
      "<div class='ej-m l a1' style='top:10px'>" + recibo('¡Transferencia exitosa!', 'Fecha: HOY') + "<small>12:43 p. m.</small></div>",
      "<div class='ej-m l a2' style='top:178px'>Ya pagué 👍<small>12:48 p. m.</small></div>",
      "<div class='ej-m r a3' style='top:216px'>Ya te paso el acceso<small>12:50 p. m. ✓✓</small></div>",
      "<div class='ej-m r a4' style='top:262px'><div class='ej-lk'><i>💸</i><span><b>STAKE DE PAGO</b><u>Invitación a la comunidad</u></span></div></div>",
    ];
  } else {
    ms = [
      "<div class='ej-m r a1' style='top:10px'>" + recibo('¡Recarga exitosa!', 'Fecha: HOY') + "<small>12:43 p. m. ✓✓</small></div>",
      "<div class='ej-m l a2' style='top:178px'>Gracias, ya me llegó 🙌<small>12:48 p. m.</small></div>",
    ];
  }
  const titulo = tipo === 'stake' ? 'Así debe verse tu captura (ejemplo)' : 'Así debe verse tu captura (ejemplo)';
  return "<div class='ej'><div class='ej-t'><b>EJEMPLO</b><span>" + titulo + "</span></div><div class='ej-c' style='height:" + (tipo === 'stake' ? 352 : 250) + "px'>" + ms.join('') + "</div></div>";
}

module.exports = { CSS, chat };
