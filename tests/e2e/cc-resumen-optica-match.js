/**
 * Resumen CC (tabla Saldos): el importe mostrado es la suma algebraica E (igual que Movimientos).
 * Se mantiene tolerancia min(|L+E|,|L−E|) por compatibilidad con datos/lectura UI heredados.
 * @param {number|string} leidoUI
 * @param {number|string} esperadoAlgebraico
 */
function ccResumenDisplayMatchAlgebraico(leidoUI, esperadoAlgebraico) {
  const L = Number(leidoUI) || 0;
  const E = Number(esperadoAlgebraico) || 0;
  if (Math.abs(L) <= 1 && Math.abs(E) <= 1) return true;
  return Math.abs(L + E) <= 1 || Math.abs(L - E) <= 1;
}

function ccResumenDisplayDiffAlgebraico(leidoUI, esperadoAlgebraico) {
  const L = Number(leidoUI) || 0;
  const E = Number(esperadoAlgebraico) || 0;
  if (Math.abs(L) <= 1 && Math.abs(E) <= 1) return 0;
  return Math.min(Math.abs(L + E), Math.abs(L - E));
}

module.exports = { ccResumenDisplayMatchAlgebraico, ccResumenDisplayDiffAlgebraico };
