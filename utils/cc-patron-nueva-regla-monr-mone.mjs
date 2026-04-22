/**
 * Detección del patrón amplio MonR + MonE alineado a
 * `sql/inventario_nueva_regla_diff_monr_mone_cliente_prod.sql` (CTE `patron` / `ord_base`).
 * Usa la misma convención que `main.js` para roles vacíos: `transaccionNormalizarPagCobVacios` + `pagCobEfectivosTransaccionSync`.
 *
 * @see docs/NUEVA_REGLA_CC_PATA_MONR_MONE.md
 */

/** @param {string|null|undefined} m */
export function monedaCatalogoParaOrdenPatron(m) {
  const u = (m || '').toString().trim().toUpperCase();
  return u === 'CHEQUE' ? 'ARS' : u;
}

/** @param {string|null|undefined} codigo @param {string|null|undefined} monedaIn @param {string|null|undefined} monedaOut */
export function esTipoOperacionChequeArsPatron(codigo, monedaIn, monedaOut) {
  const c = (codigo || '').toString().trim().toUpperCase();
  if (c.includes('CHEQUE')) return true;
  const mi = (monedaIn || '').toString().trim().toUpperCase();
  const mo = (monedaOut || '').toString().trim().toUpperCase();
  return (mi === 'CHEQUE' && mo === 'ARS') || (mi === 'ARS' && mo === 'CHEQUE');
}

/**
 * @param {object|null|undefined} orden
 * @returns {{ codigo?: string, moneda_in?: string, moneda_out?: string }|null}
 */
export function tiposOperacionMetaDesdeOrdenPatron(orden) {
  if (!orden || typeof orden !== 'object') return null;
  const nested = orden.tipos_operacion && (Array.isArray(orden.tipos_operacion) ? orden.tipos_operacion[0] : orden.tipos_operacion);
  if (nested && (nested.codigo != null || nested.moneda_in != null || nested.moneda_out != null)) {
    return {
      codigo: nested.codigo != null ? String(nested.codigo) : '',
      moneda_in: nested.moneda_in != null ? String(nested.moneda_in) : '',
      moneda_out: nested.moneda_out != null ? String(nested.moneda_out) : '',
    };
  }
  if (orden.tipo_operacion_codigo != null && String(orden.tipo_operacion_codigo).trim() !== '') {
    return {
      codigo: String(orden.tipo_operacion_codigo).trim(),
      moneda_in: orden.tipo_moneda_in != null ? String(orden.tipo_moneda_in) : '',
      moneda_out: orden.tipo_moneda_out != null ? String(orden.tipo_moneda_out) : '',
    };
  }
  return null;
}

/** @param {object|null|undefined} orden */
export function esOrdenChequeArsDesdeOrdenPatron(orden) {
  const t = tiposOperacionMetaDesdeOrdenPatron(orden);
  return esTipoOperacionChequeArsPatron(t && t.codigo, t && t.moneda_in, t && t.moneda_out);
}

/** @param {object|null|undefined} trx */
export function transaccionEstadoTextoNormalizadoPatron(trx) {
  return String(trx == null || trx.estado == null ? '' : trx.estado).trim().toLowerCase();
}

/** @param {object} t */
export function transaccionNormalizarPagCobVaciosPatron(t) {
  if (!t || typeof t !== 'object') return t;
  const o = { ...t };
  if (o.pagador != null && String(o.pagador).trim() === '') o.pagador = null;
  if (o.cobrador != null && String(o.cobrador).trim() === '') o.cobrador = null;
  if (o.estado != null && typeof o.estado === 'string') o.estado = o.estado.trim();
  return o;
}

/** @param {object} t */
export function pagCobEfectivosTransaccionSyncPatron(t) {
  const tipoL = (t.tipo || '').toString().toLowerCase();
  const cob = String(t.cobrador != null ? t.cobrador : (tipoL === 'ingreso' ? 'pandy' : 'cliente')).toLowerCase();
  const pag = String(t.pagador != null ? t.pagador : (tipoL === 'egreso' ? 'pandy' : 'cliente')).toLowerCase();
  return { pag, cob };
}

/**
 * Réplica de `multicontraparteEsCobradorClienteDelAcuerdoExplicito` (main.js): cobrador cliente = cliente del acuerdo por UUID.
 * @param {object} t
 * @param {object} orden
 */
export function multicontraparteEsCobradorClienteDelAcuerdoExplicitoPatron(t, orden) {
  const o = orden || {};
  const cidAc = o.cliente_id != null && String(o.cliente_id).trim() !== '' ? String(o.cliente_id).trim() : '';
  if (!cidAc) return false;
  const tn = transaccionNormalizarPagCobVaciosPatron(t);
  const { cob } = pagCobEfectivosTransaccionSyncPatron(tn);
  if (cob !== 'cliente') return false;
  const cobId =
    tn.cobrador_cliente_id != null && String(tn.cobrador_cliente_id).trim() !== '' ? String(tn.cobrador_cliente_id).trim() : '';
  return cobId === cidAc;
}

/**
 * True si la orden (no anulada, con cliente, no CHEQUE-ARS) tiene al menos un ingreso MonR explícito al acuerdo
 * y al menos un egreso MonE amplio hacia el cliente del acuerdo, con trx en pendiente o ejecutada.
 *
 * @param {object|null|undefined} orden
 * @param {object[]|null|undefined} transacciones
 * @returns {boolean}
 */
export function esPatronAmplioCcMonrMoneNuevaRegla(orden, transacciones) {
  if (!orden || typeof orden !== 'object') return false;
  if (String(orden.estado || '').toLowerCase() === 'anulada') return false;
  const cid = orden.cliente_id != null && String(orden.cliente_id).trim() !== '' ? String(orden.cliente_id).trim() : '';
  if (!cid) return false;
  if (esOrdenChequeArsDesdeOrdenPatron(orden)) return false;

  const monRCat = String(monedaCatalogoParaOrdenPatron(orden.moneda_recibida) || '').toUpperCase();
  const monECat = String(monedaCatalogoParaOrdenPatron(orden.moneda_entregada) || '').toUpperCase();
  if (!monRCat || !monECat) return false;

  let hayIns = false;
  let hayEg = false;

  for (const tRaw of transacciones || []) {
    if (!tRaw || (tRaw.concepto || '').toString().includes('Ganancia del acuerdo')) continue;
    const t = transaccionNormalizarPagCobVaciosPatron(tRaw);
    const st = transaccionEstadoTextoNormalizadoPatron(t);
    if (st !== 'ejecutada' && st !== 'pendiente') continue;
    const tipo = (t.tipo || '').toLowerCase();
    const mon = String(t.moneda || '').toUpperCase();
    const { pag, cob } = pagCobEfectivosTransaccionSyncPatron(t);

    if (tipo === 'ingreso' && pag === 'pandy' && cob === 'cliente' && mon === monRCat) {
      if (multicontraparteEsCobradorClienteDelAcuerdoExplicitoPatron(t, orden)) hayIns = true;
    }

    if (
      tipo === 'egreso' &&
      mon === monECat &&
      cob === 'cliente' &&
      (pag === 'pandy' || pag === 'intermediario')
    ) {
      const cobId =
        t.cobrador_cliente_id != null && String(t.cobrador_cliente_id).trim() !== ''
          ? String(t.cobrador_cliente_id).trim()
          : '';
      const okCob = cobId === cid || (cobId === '' && (pag === 'pandy' || pag === 'intermediario'));
      if (okCob) hayEg = true;
    }
  }

  return hayIns && hayEg;
}

/**
 * Números de orden (`ordenes.numero`) excluidos del rollout:
 * - §4.4 (2026-04-17): saldo CC cliente **afectado** por heurística diff vs legacy.
 * - Post-deploy prod (2026-04-22): órdenes **14, 22, 44, 52, 69, 70, 71** que habían tomado el motor nuevo y se excluyen para volver a **legacy** al re-sincronizar (convivencia de lotes / decisión de producto).
 * @see docs/NUEVA_REGLA_CC_PATA_MONR_MONE.md §1.3.3 y §4.4
 */
export const NUEVA_REGLA_CC_ROLLOUT_EXCLUIR_NUMEROS_ORDEN_SALDO_4_4 = Object.freeze([
  14, 17, 22, 44, 45, 52, 57, 64, 68, 69, 70, 71, 81, 87, 91,
]);

const _exclSet = new Set(NUEVA_REGLA_CC_ROLLOUT_EXCLUIR_NUMEROS_ORDEN_SALDO_4_4);

/**
 * @param {object|null|undefined} orden
 * @returns {number|null} entero `ordenes.numero` o null si ausente / no numérico (`Number(null)` no debe ser 0).
 */
function ordenNumeroEnteroPatron(orden) {
  const raw = orden && orden.numero;
  if (raw == null || String(raw).trim() === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return n;
}

/**
 * @param {object|null|undefined} orden
 * @returns {boolean} true si `orden.numero` está en la lista §4.4 (no debe correr el motor nuevo).
 */
export function ordenNumeroExcluidoRolloutNuevaReglaCc(orden) {
  const n = ordenNumeroEnteroPatron(orden);
  if (n == null) return false;
  return _exclSet.has(n);
}

/**
 * IN controlado: patrón amplio **y** orden **no** en la exclusión por saldo (§4.4).
 * Si falta `numero` válido, **no** activa rollout (evita motor nuevo sin identificación de orden).
 *
 * @param {object|null|undefined} orden
 * @param {object[]|null|undefined} transacciones
 * @returns {boolean}
 */
export function nuevaReglaCcRolloutActivoParaOrden(orden, transacciones) {
  if (!esPatronAmplioCcMonrMoneNuevaRegla(orden, transacciones)) return false;
  const n = ordenNumeroEnteroPatron(orden);
  if (n == null) return false;
  if (_exclSet.has(n)) return false;
  return true;
}
