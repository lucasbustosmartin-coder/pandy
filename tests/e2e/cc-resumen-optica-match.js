/**
 * Resumen CC (tabla Saldos): la app puede mostrar −E (cobro a favor de Pandy) o +E alineado al algebraico
 * cuando lo pendiente es pago desde Pandy. Los fixtures E2E guardan la suma algebraica E en DB.
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
