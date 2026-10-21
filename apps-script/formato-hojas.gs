/**
 * PAY WIN — Formato bonito para todo el Excel (Google Sheets)
 *
 * Qué hace, sin tocar ni un dato:
 *  - Crea una hoja "Inicio" (primera) con el logo, el índice de todas las hojas con enlace y un resumen.
 *  - A cada hoja le pone: encabezado oscuro con letras doradas, filas alternadas, filtros, primera fila
 *    congelada, columnas con ancho cómodo, montos en $, fechas dd/mm/aaaa, colores en resultados/estados,
 *    color de pestaña. Las columnas "técnicas" (id, fotos en base64, lines...) quedan ocultas, NO borradas.
 *  - NUNCA cambia los nombres de las hojas ni los encabezados (el panel los usa para leer/guardar).
 *
 * Cómo se instala (una sola vez):
 *  1. En tu Google Sheet: Extensiones → Apps Script.
 *  2. Crea un archivo nuevo (＋ → Script), llámalo "Formato", pega TODO este código y guarda (💾).
 *  3. Arriba elige la función  instalarFormatoAutomatico  y toca ▶ Ejecutar. Acepta los permisos.
 *     (Aplica el formato ahora y lo re-aplica solo cada 10 minutos, porque cuando el panel guarda
 *      datos puede borrar el formato de esa hoja.)
 *  4. Para aplicarlo a mano en cualquier momento: ejecuta  formatearTodo.
 *
 * Para mostrar de nuevo columnas ocultas: selecciona las letras de las columnas de al lado → clic
 * derecho → "Mostrar columnas".
 */

var LOGO_URL = 'https://panel-paywin.vercel.app/logo-paywin.png';

var COLOR = {
  fondoEncabezado: '#0F1626',
  textoEncabezado: '#D4AF6A',
  filaPar: '#F6F3EA',
  filaImpar: '#FFFFFF',
  borde: '#E2DCCB',
  texto: '#1B2233',
  verde: '#CDEFD6', verdeTxt: '#14532D',
  rojo: '#F8D4D4', rojoTxt: '#7F1D1D',
  ambar: '#FDEFC7', ambarTxt: '#7A4B00'
};

// Color de pestaña por hoja (si no está aquí, usa gris)
var PESTANA = {
  'VIPs': '#D4AF6A', 'VIPsArchivo': '#8A8A8A',
  'ApuestasGratis': '#4FA66A', 'ApuestasVIP': '#D4AF6A', 'ApuestasLive': '#C0392B',
  'Stakes': '#2E86C1', 'VentaStakes': '#2E86C1', 'SeccionesStakes': '#2E86C1',
  'Regalitos': '#9B59B6', 'CuadreMovimientos': '#16A085'
};

// Columnas que se ocultan (datos técnicos o pesados). Se comparan en minúsculas.
var COLUMNAS_OCULTAS = ['id', 'lines', 'base64', 'imagebase64', 'image', 'thumb', 'receiptimage', 'transferid', 'removidovip', 'sectionid'];
var COLUMNAS_DINERO = ['amount', 'stake', 'ganancia', 'returned', 'price', 'monto', 'saldo'];
var COLUMNAS_FECHA = ['date', 'joindate', 'day', 'createdat', 'archivedat', 'lastsentdate'];
var COLUMNAS_TEXTO_LARGO = ['notes', 'pick', 'description', 'event', 'note', 'caption', 'texto', 'name', 'nombre'];

function formatearTodo() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.getSheets().forEach(function (sh) {
    if (sh.getName() === 'Inicio') return;
    try { formatearHoja_(sh); } catch (e) { console.error('No pude formatear ' + sh.getName() + ': ' + e.message); }
  });
  try { crearInicio_(ss); } catch (e) { console.error('No pude armar Inicio: ' + e.message); }
  SpreadsheetApp.flush();
}

function instalarFormatoAutomatico() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'formatearTodo') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('formatearTodo').timeBased().everyMinutes(10).create();
  formatearTodo();
}

function quitarFormatoAutomatico() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'formatearTodo') ScriptApp.deleteTrigger(t);
  });
}

function formatearHoja_(sh) {
  var lastCol = sh.getLastColumn();
  var lastRow = Math.max(sh.getLastRow(), 2);
  if (lastCol < 1) return;

  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
  var low = headers.map(function (h) { return h.toLowerCase(); });
  var filas = 1000; // el formato cubre hasta aquí; las filas nuevas ya salen con el estilo
  if (sh.getMaxRows() < filas) sh.insertRowsAfter(sh.getMaxRows(), filas - sh.getMaxRows());

  var todo = sh.getRange(1, 1, filas, lastCol);
  todo.setFontFamily('Arial').setFontSize(10).setFontColor(COLOR.texto).setVerticalAlignment('middle');

  // Encabezado
  var enc = sh.getRange(1, 1, 1, lastCol);
  enc.setBackground(COLOR.fondoEncabezado).setFontColor(COLOR.textoEncabezado).setFontWeight('bold')
     .setFontSize(10).setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
  sh.setRowHeight(1, 34);
  sh.setFrozenRows(1);

  // Cuerpo
  var cuerpo = sh.getRange(2, 1, filas - 1, lastCol);
  cuerpo.setWrap(false).setBorder(false, false, true, false, false, false, COLOR.borde, SpreadsheetApp.BorderStyle.SOLID);

  // Formatos por tipo de columna + anchos
  headers.forEach(function (h, i) {
    var c = i + 1, k = low[i], col = sh.getRange(2, c, filas - 1, 1);
    var ancho = 120;
    if (COLUMNAS_DINERO.indexOf(k) >= 0) { col.setNumberFormat('$#,##0.00').setHorizontalAlignment('right'); ancho = 105; }
    else if (k === 'odds') { col.setNumberFormat('0.00').setHorizontalAlignment('center'); ancho = 80; }
    else if (COLUMNAS_FECHA.indexOf(k) >= 0) { col.setNumberFormat('dd/mm/yyyy').setHorizontalAlignment('center'); ancho = 105; }
    else if (k === 'result' || k === 'status') { col.setHorizontalAlignment('center'); ancho = 105; }
    else if (k === 'notes' || k === 'description' || k === 'caption' || k === 'texto') { col.setWrap(true); ancho = 280; }
    else if (k === 'pick' || k === 'event') { col.setWrap(true); ancho = 230; }
    else if (k === 'name' || k === 'nombre' || k === 'recipient') { ancho = 190; }
    else if (k === 'contact' || k === 'telefono' || k === 'phone' || k === 'cedula') { ancho = 125; }
    sh.setColumnWidth(c, ancho);
    if (COLUMNAS_OCULTAS.indexOf(k) >= 0) sh.hideColumns(c); else sh.showColumns(c);
  });

  // Reglas condicionales: filas alternadas + colores de resultado/estado
  var reglas = [];
  var rangoCuerpo = sh.getRange(2, 1, filas - 1, lastCol);
  reglas.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND($A2<>"",ISEVEN(ROW()))').setBackground(COLOR.filaPar).setRanges([rangoCuerpo]).build());
  var iRes = low.indexOf('result'), iSta = low.indexOf('status');
  [iRes, iSta].forEach(function (idx) {
    if (idx < 0) return;
    var r = sh.getRange(2, idx + 1, filas - 1, 1);
    var mapa = [
      ['won', COLOR.verde, COLOR.verdeTxt], ['active', COLOR.verde, COLOR.verdeTxt], ['paid', COLOR.verde, COLOR.verdeTxt],
      ['lost', COLOR.rojo, COLOR.rojoTxt], ['inactive', COLOR.rojo, COLOR.rojoTxt],
      ['pending', COLOR.ambar, COLOR.ambarTxt]
    ];
    mapa.forEach(function (m) {
      reglas.unshift(SpreadsheetApp.newConditionalFormatRule()
        .whenTextEqualTo(m[0]).setBackground(m[1]).setFontColor(m[2]).setBold(true).setRanges([r]).build());
    });
  });
  sh.setConditionalFormatRules(reglas);

  // Filtro (no choca con nada: se recrea)
  var f = sh.getFilter();
  if (f) f.remove();
  sh.getRange(1, 1, Math.max(sh.getLastRow(), 2), lastCol).createFilter();

  sh.setTabColor(PESTANA[sh.getName()] || '#6B7280');
  sh.setHiddenGridlines(true);
}

/** Hoja "Inicio": logo, título, índice con enlaces y resumen. */
function crearInicio_(ss) {
  var sh = ss.getSheetByName('Inicio');
  if (!sh) sh = ss.insertSheet('Inicio', 0); else ss.setActiveSheet(sh);
  ss.moveActiveSheet(1);
  sh.clear();
  sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).breakApart();
  sh.setHiddenGridlines(true);
  sh.setTabColor('#D4AF6A');
  sh.setColumnWidth(1, 110); sh.setColumnWidth(2, 260); sh.setColumnWidth(3, 130); sh.setColumnWidth(4, 130); sh.setColumnWidth(5, 40); sh.setColumnWidth(6, 260); sh.setColumnWidth(7, 130);
  sh.getRange('A1:G4').setBackground(COLOR.fondoEncabezado);
  sh.setRowHeight(1, 30); sh.setRowHeight(2, 30); sh.setRowHeight(3, 30); sh.setRowHeight(4, 18);

  sh.getRange('A1').setFormula('=IMAGE("' + LOGO_URL + '",4,90,90)');
  sh.getRange('A1:A3').merge();
  sh.getRange('B1').setValue('PANEL ADMINISTRACIÓN PAY WIN').setFontSize(20).setFontWeight('bold').setFontColor(COLOR.textoEncabezado);
  sh.getRange('B2').setValue('Base de datos del panel · NO cambies nombres de hojas ni de encabezados').setFontColor('#B9BFCC').setFontSize(10);
  sh.getRange('B3').setFormula('="Actualizado: "&TEXT(NOW(),"dd/mm/yyyy HH:mm")').setFontColor('#B9BFCC').setFontSize(10);
  sh.getRange('B1:B3').setVerticalAlignment('middle');

  // Índice
  var fila = 6;
  sh.getRange(fila, 1, 1, 4).setValues([['', 'HOJA', 'REGISTROS', 'IR']])
    .setBackground(COLOR.fondoEncabezado).setFontColor(COLOR.textoEncabezado).setFontWeight('bold').setHorizontalAlignment('center');
  fila++;
  ss.getSheets().forEach(function (h) {
    if (h.getName() === 'Inicio') return;
    var nombre = h.getName();
    sh.getRange(fila, 2).setValue(nombre).setFontWeight('bold');
    sh.getRange(fila, 3).setFormula("=MAX(0,COUNTA('" + nombre + "'!A:A)-1)").setHorizontalAlignment('center');
    sh.getRange(fila, 4).setFormula('=HYPERLINK("#gid=' + h.getSheetId() + '","Abrir →")').setHorizontalAlignment('center').setFontColor('#1A5FB4');
    var bg = (fila % 2 === 0) ? COLOR.filaPar : COLOR.filaImpar;
    sh.getRange(fila, 1, 1, 4).setBackground(bg).setBorder(false, false, true, false, false, false, COLOR.borde, SpreadsheetApp.BorderStyle.SOLID);
    fila++;
  });

  // Resumen rápido (a la derecha)
  var r = 6;
  sh.getRange(r, 6, 1, 2).setValues([['RESUMEN RÁPIDO', '']])
    .setBackground(COLOR.fondoEncabezado).setFontColor(COLOR.textoEncabezado).setFontWeight('bold');
  r++;
  var items = [
    ['Miembros VIP activos', cuenta_(ss, 'VIPs', 'status', 'active')],
    ['Miembros VIP inactivos', cuenta_(ss, 'VIPs', 'status', 'inactive')],
    ['Apuestas VIP ganadas', cuenta_(ss, 'ApuestasVIP', 'result', 'won')],
    ['Apuestas VIP perdidas', cuenta_(ss, 'ApuestasVIP', 'result', 'lost')],
    ['Apuestas VIP pendientes', cuenta_(ss, 'ApuestasVIP', 'result', 'pending')],
    ['Ganancia total apuestas VIP', suma_(ss, 'ApuestasVIP', 'ganancia')],
    ['Apuestas gratis ganadas', cuenta_(ss, 'ApuestasGratis', 'result', 'won')],
    ['Miembros archivados', "=MAX(0,COUNTA('VIPsArchivo'!A:A)-1)"]
  ];
  items.forEach(function (it) {
    sh.getRange(r, 6).setValue(it[0]);
    var c = sh.getRange(r, 7).setFormula(it[1]).setFontWeight('bold').setHorizontalAlignment('center');
    if (it[0].indexOf('Ganancia') === 0) c.setNumberFormat('$#,##0.00');
    sh.getRange(r, 6, 1, 2).setBackground(r % 2 === 0 ? COLOR.filaPar : COLOR.filaImpar)
      .setBorder(false, false, true, false, false, false, COLOR.borde, SpreadsheetApp.BorderStyle.SOLID);
    r++;
  });
  sh.getRange(1, 1, Math.max(fila, r) + 2, 7).setFontFamily('Arial');
}

function letraColumna_(ss, hoja, encabezado) {
  var sh = ss.getSheetByName(hoja);
  if (!sh || sh.getLastColumn() < 1) return null;
  var hs = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var i = hs.indexOf(encabezado.toLowerCase());
  if (i < 0) return null;
  var n = i + 1, s = '';
  while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
function cuenta_(ss, hoja, encabezado, valor) {
  var L = letraColumna_(ss, hoja, encabezado);
  return L ? "=COUNTIF('" + hoja + "'!" + L + ':' + L + ',"' + valor + '")' : '=0';
}
function suma_(ss, hoja, encabezado) {
  var L = letraColumna_(ss, hoja, encabezado);
  return L ? "=SUM('" + hoja + "'!" + L + ':' + L + ')' : '=0';
}
