// Mini chat animado de WhatsApp que muestra, como ejemplo, cómo debe verse la captura.
// Sin comillas dobles, saltos de línea, backticks ni backslashes: se incrusta dentro de las páginas.
const CSS = [
  '.ej{margin:0 0 12px;border-radius:12px;overflow:hidden;border:1px solid #3a3f4d;background:#e7dfd2;position:relative}',
  '.ej-t{gap:8px;background:#1f2a2e;color:#cfe3dc;font-size:11.5px;padding:6px 10px;display:flex;justify-content:space-between}',
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
  '.ej-rp{width:236px;background:#f3e6ea;color:#1b1b1b;border-radius:6px;padding:10px 10px 8px;font-size:11.5px}',
  '.ej-rp .h{border:2px solid #222;display:flex;gap:6px;align-items:center;padding:6px}',
  '.ej-rp .h b{background:#222;color:#fff;border-radius:6px;padding:6px 7px;font-size:12px;line-height:1.1;text-align:center}',
  '.ej-rp .h span{font-weight:800;font-size:15px;line-height:1.1;text-align:center;flex:1;font-family:Georgia,serif}',
  '.ej-rp hr{border:0;border-top:1px solid #444;margin:8px 0}',
  '.ej-rp .f{display:flex;justify-content:space-between;gap:8px;margin:3px 0}.ej-rp .f i{font-style:normal;text-align:right}',
  '.ej-rp .p{text-align:center;font-weight:800;font-size:15px;margin-top:8px}',
  '.ej-st{width:112px;height:112px;border-radius:50%;background:radial-gradient(circle at 50% 40%,#2b3b66,#10162a);border:5px solid #b88a44;position:relative;box-shadow:0 1px 3px rgba(0,0,0,.3);color:#f2d27a;text-align:center}',
  '.ej-st .pw{position:absolute;top:22px;left:0;right:0;font-size:22px;font-weight:900;letter-spacing:1px}',
  '.ej-st .rb{position:absolute;bottom:14px;left:6px;right:6px;background:#1c1710;border:1px solid #b88a44;border-radius:5px;font-size:8.5px;font-weight:800;line-height:1.15;padding:3px 2px;color:#f6e7b8}',
  '@keyframes ejA{0%,4%{opacity:0;transform:translateY(8px)}9%,90%{opacity:1;transform:none}96%,100%{opacity:0}}',
  '@keyframes ejB{0%,24%{opacity:0;transform:translateY(8px)}29%,90%{opacity:1;transform:none}96%,100%{opacity:0}}',
  '@keyframes ejC{0%,44%{opacity:0;transform:translateY(8px)}49%,90%{opacity:1;transform:none}96%,100%{opacity:0}}',
  '@keyframes ejD{0%,62%{opacity:0;transform:translateY(8px)}67%,90%{opacity:1;transform:none}96%,100%{opacity:0}}',
  '.ej-m.a1{animation-name:ejA}.ej-m.a2{animation-name:ejB}.ej-m.a3{animation-name:ejC}.ej-m.a4{animation-name:ejD}',
  '@media (prefers-reduced-motion:reduce){.ej-m{animation:none;opacity:1}}',
].join('');

const recibo = (titulo, fecha, extra, monto) => "<div class='ej-rc'><span class='ok'>✓</span><div class='t'>" + titulo + "</div><div class='m'>$ " + (monto || '20,00') + "</div><div class='d'>" + (extra ? extra + '<br>' : '') + fecha + "<br>N. de comprobante 00012345</div></div>";

const recibo_casa = () => "<div class='ej-rp'><div class='h'><b>CASA DE<br>APUESTAS</b><span>RECIBO DE<br>RECARGA</span></div><hr><div class='f'>Recibo de Recarga No.<i>000123456</i></div><div class='f'>Fecha:<i>HOY 11:09:45</i></div><div class='f'>Punto de venta:<i>AG- TU AGENTE</i></div><div class='f'>No. de Cliente:<i>1234567</i></div><div class='f'>Nombre Cliente:<i>NOMBRE APELLIDO</i></div><div class='f'><b>Valor Recarga:</b><i>20</i></div><div class='p'>Disfruta el juego en vivo</div></div>";

function chat(tipo) {
  let ms, alto;
  if (tipo === 'vip') {
    ms = ["<div class='ej-m r a1' style='top:12px;right:auto;left:50%;margin-left:-100px'>" + recibo('¡Transferencia exitosa!', 'Fecha: HOY', '', '50,00') + "</div>"];
    alto = 170;
  } else if (tipo === 'stake') {
    ms = ["<div class='ej-m r a1' style='top:12px;right:auto;left:50%;margin-left:-100px'>" + recibo('¡Transferencia exitosa!', 'Fecha: HOY', '', '20,00') + "</div>"];
    alto = 170;
  } else {
    ms = [
      "<div class='ej-m l a1' style='top:10px'>" + recibo_casa() + "</div>",
      "<div class='ej-m l a2' style='top:262px;background:transparent;box-shadow:none;padding:0'><div class='ej-st'><div class='pw'>PAYWIN</div><div class='rb'>✔ RECARGA REALIZADA<br>PAYWIN</div></div></div>",
    ];
    alto = 390;
  }
  const titulo = tipo === 'regalito' ? 'Así debe verse (recarga)' : 'Así debe verse (transferencia)';
  return "<div class='ej'><div class='ej-t'><b>EJEMPLO</b><span>" + titulo + "</span></div><div class='ej-c' style='height:" + alto + "px'>" + ms.join('') + "</div></div>";
}

module.exports = { CSS, chat };
