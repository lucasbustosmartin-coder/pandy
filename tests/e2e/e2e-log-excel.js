// @ts-check
/** Log de prueba E2E a Excel: pasos generales y hoja Transacciones (tipo operación, nro, pagador, cobrador, etc.). */
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const { CC_COMBINACIONES_LOG } = require('./cc-combinaciones-log-workbook');

const HEADERS_PASOS = ['Tipo operación', 'Paso', 'Acción', 'Resultado esperado', 'Comprobación', 'Estado', 'Observaciones', 'Fecha/Hora', 'Nro orden interno', 'Nro transacción (interno)'];
const HEADERS_TRANSACCIONES = ['Tipo operación', 'Nro transacción', 'Pagador', 'Cobrador', 'Moneda', 'Modo pago', 'Monto', 'Saldo CC capturado (ARS)', 'Resultado', 'Fecha/Hora', 'Nro orden interno', 'Nro transacción (interno)'];

const HEADERS_CAJA = [
  'Tipo operación', 'Fecha/Hora', 'Nro orden interno', 'Nro transacción (interno)',
  'Saldo_Caja_EF_USD_Esp', 'Saldo_Caja_EF_USD_App', 'Resultado_Caja_EF_USD',
  'Saldo_Caja_EF_ARS_Esp', 'Saldo_Caja_EF_ARS_App', 'Resultado_Caja_EF_ARS',
  'Saldo_Caja_EF_EUR_Esp', 'Saldo_Caja_EF_EUR_App', 'Resultado_Caja_EF_EUR',
  'Saldo_Caja_BA_USD_Esp', 'Saldo_Caja_BA_USD_App', 'Resultado_Caja_BA_USD',
  'Saldo_Caja_BA_ARS_Esp', 'Saldo_Caja_BA_ARS_App', 'Resultado_Caja_BA_ARS',
  'Exp_Sdo_CE', 'Real_Sdo_CE', 'Saldo_CE_Rdo',
];

let logRows = [];
let transaccionesRows = [];
let cajaRows = [];
let tipoOperacionActual = '';
let nroOrdenInternoActual = '';

function ahora() {
  return new Date().toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    dateStyle: 'short',
    timeStyle: 'medium',
  });
}

/** Reinicia el log (llamar al inicio del test). @param {string} [tipoOperacion] - Ej: 'CHEQUE-ARS', 'USD-USD' para filtrar por caso de prueba. */
function initLog(tipoOperacion = '') {
  tipoOperacionActual = String(tipoOperacion || '').trim();
  nroOrdenInternoActual = '';
  logRows = [HEADERS_PASOS];
  transaccionesRows = [HEADERS_TRANSACCIONES];
  cajaRows = [HEADERS_CAJA];
}

/** Establece el nro de orden interno para las siguientes filas del log (se incorpora a Pasos y Transacciones). */
function setNroOrdenInterno(nro) {
  nroOrdenInternoActual = nro != null && nro !== '' ? String(nro) : '';
}

/**
 * Agrega una fila al log de pasos.
 * @param {string|number} [nroTransaccionInterno] - Número interno de transacción (transacciones.numero) para trazabilidad.
 */
function logStep(paso, accion, resultadoEsperado, comprobacion, estado, observaciones = '', saldoCapturado = '', nroTransaccionInterno = '') {
  const obs = saldoCapturado ? (observaciones ? `${observaciones}; Saldo: ${saldoCapturado}` : `Saldo: ${saldoCapturado}`) : observaciones;
  logRows.push([tipoOperacionActual, String(paso), accion, resultadoEsperado, comprobacion, estado, obs, ahora(), nroOrdenInternoActual, nroTransaccionInterno != null && nroTransaccionInterno !== '' ? String(nroTransaccionInterno) : '']);
}

/**
 * Agrega una fila a la hoja Transacciones (tipo operación, nro, pagador, cobrador, moneda, modo pago, monto, saldo capturado, resultado).
 * @param {number|string} nro - Número de transacción (1, 2, 3, 4).
 * @param {string} pagador - Quién paga (Cliente, Pandy, Intermediario).
 * @param {string} cobrador - Quién cobra (Cliente, Pandy, Intermediario).
 * @param {string} moneda - Moneda (ARS, USD, EUR).
 * @param {string} modoPago - Modo de pago (Cheque, Efectivo).
 * @param {string|number} monto - Monto de la transacción.
 * @param {string} saldoCapturado - Saldo en CC capturado tras ejecutar esta transacción.
 * @param {'OK'|'Fallo'} resultado - Resultado de la comprobación.
 * @param {string|number} [nroTransaccionInterno] - Número interno de transacción (transacciones.numero).
 */
function logTransaccion(nro, pagador, cobrador, moneda, modoPago, monto, saldoCapturado, resultado = 'OK', nroTransaccionInterno = '') {
  transaccionesRows.push([tipoOperacionActual, String(nro), pagador, cobrador, moneda, modoPago, String(monto), saldoCapturado, resultado, ahora(), nroOrdenInternoActual, nroTransaccionInterno != null && nroTransaccionInterno !== '' ? String(nroTransaccionInterno) : '']);
}

/**
 * Valor por moneda/caja para el log Caja: { esp, app, resultado }.
 * @typedef {{ esp?: string, app?: string, resultado?: 'OK'|'err' }} CajaCelda
 */

/**
 * Agrega una fila a la hoja Caja con columnas por moneda y tipo (Efectivo/Banco): Saldo_Esp, Saldo_App, Resultado (OK/err).
 * Control caja efectivo (resumen): Exp_Sdo_CE, Real_Sdo_CE, Saldo_CE_Rdo (Pass/Err). Por ahora se ignora caja banco en la validación.
 * @param {Object} opts
 * @param {{ USD?: CajaCelda, ARS?: CajaCelda, EUR?: CajaCelda }} opts.efectivo - Efectivo: USD, ARS, EUR (cada uno esp, app, resultado).
 * @param {{ USD?: CajaCelda, ARS?: CajaCelda }} opts.banco - Banco: USD, ARS.
 * @param {string|number} [opts.nroTransaccionInterno] - Número interno de transacción (transacciones.numero) para trazabilidad.
 * @param {string|number} [opts.expSdoCE] - Saldo caja efectivo esperado (para Exp_Sdo_CE).
 * @param {string|number} [opts.realSdoCE] - Saldo caja efectivo real (para Real_Sdo_CE).
 * @param {'PASS'|'ERR'} [opts.saldoCE_Rdo] - Resultado del control (Pass o Err).
 */
function logCajaControl(opts = {}) {
  const ef = opts.efectivo || {};
  const ba = opts.banco || {};
  const nroTrx = opts.nroTransaccionInterno != null && opts.nroTransaccionInterno !== '' ? String(opts.nroTransaccionInterno) : '';
  const celda = (c) => (c && typeof c === 'object' ? c : { esp: '', app: '', resultado: 'OK' });
  const row = [
    tipoOperacionActual,
    ahora(),
    nroOrdenInternoActual,
    nroTrx,
    (celda(ef.USD).esp ?? ''), (celda(ef.USD).app ?? ''), (celda(ef.USD).resultado ?? 'OK'),
    (celda(ef.ARS).esp ?? ''), (celda(ef.ARS).app ?? ''), (celda(ef.ARS).resultado ?? 'OK'),
    (celda(ef.EUR).esp ?? ''), (celda(ef.EUR).app ?? ''), (celda(ef.EUR).resultado ?? 'OK'),
    (celda(ba.USD).esp ?? ''), (celda(ba.USD).app ?? ''), (celda(ba.USD).resultado ?? 'OK'),
    (celda(ba.ARS).esp ?? ''), (celda(ba.ARS).app ?? ''), (celda(ba.ARS).resultado ?? 'OK'),
    opts.expSdoCE != null && opts.expSdoCE !== '' ? String(opts.expSdoCE) : '',
    opts.realSdoCE != null && opts.realSdoCE !== '' ? String(opts.realSdoCE) : '',
    opts.saldoCE_Rdo ?? '',
  ];
  cajaRows.push(row);
}

/**
 * Escribe el log a un archivo Excel (hojas Pasos, Transacciones y Caja).
 * Si el archivo ya existe, agrega las nuevas filas en la primera fila libre (no vacía ni regenera), para poder comparar prueba vs app.
 * Por defecto usa `test-results/cc-combinaciones-log.xlsx` y **conserva** otras hojas (p. ej. CC Combinaciones, CC Tipos 2tx).
 * @param {string} [filePath] - Ruta del archivo; si se omite, `cc-combinaciones-log.xlsx`.
 */
function writeLogToExcel(filePath) {
  const outPath = filePath || CC_COMBINACIONES_LOG;
  const dir = path.dirname(outPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const dataRowsPasos = logRows.slice(1);
  const dataRowsTransacciones = transaccionesRows.slice(1);
  const dataRowsCaja = cajaRows.slice(1);

  if (fs.existsSync(outPath)) {
    const wb = XLSX.readFile(outPath);
    if (!Array.isArray(wb.SheetNames)) wb.SheetNames = Object.keys(wb.Sheets || {});
    const wsPasos = wb.Sheets['Pasos'] || null;
    const wsTransacciones = wb.Sheets['Transacciones'] || null;
    const wsCaja = wb.Sheets['Caja'] || null;
    const toArray = (ws) => (ws ? XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) : []);
    const pasosData = toArray(wsPasos);
    const transData = toArray(wsTransacciones);
    const cajaData = toArray(wsCaja);
    const newPasos = pasosData.length ? pasosData.concat(dataRowsPasos) : logRows;
    const newTrans = transData.length ? transData.concat(dataRowsTransacciones) : transaccionesRows;
    const newCaja = (cajaData.length && cajaData[0] && cajaData[0].length === HEADERS_CAJA.length) ? cajaData.concat(dataRowsCaja) : cajaRows;
    const wsPasosNew = XLSX.utils.aoa_to_sheet(newPasos);
    const wsTransNew = XLSX.utils.aoa_to_sheet(newTrans);
    const wsCajaNew = XLSX.utils.aoa_to_sheet(newCaja);
    wb.Sheets['Pasos'] = wsPasosNew;
    wb.Sheets['Transacciones'] = wsTransNew;
    wb.Sheets['Caja'] = wsCajaNew;
    for (const n of ['Pasos', 'Transacciones', 'Caja']) {
      if (!wb.SheetNames.includes(n)) wb.SheetNames.push(n);
    }
    XLSX.writeFile(wb, outPath);
  } else {
    const wb = XLSX.utils.book_new();
    const wsPasos = XLSX.utils.aoa_to_sheet(logRows);
    const wsTransacciones = XLSX.utils.aoa_to_sheet(transaccionesRows);
    const wsCaja = XLSX.utils.aoa_to_sheet(cajaRows);
    XLSX.utils.book_append_sheet(wb, wsPasos, 'Pasos');
    XLSX.utils.book_append_sheet(wb, wsTransacciones, 'Transacciones');
    XLSX.utils.book_append_sheet(wb, wsCaja, 'Caja');
    XLSX.writeFile(wb, outPath);
  }
  return outPath;
}

module.exports = { initLog, setNroOrdenInterno, logStep, logTransaccion, logCajaControl, writeLogToExcel, HEADERS_PASOS, HEADERS_TRANSACCIONES, HEADERS_CAJA };
