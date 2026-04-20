/**
 * Paridad con `sql/migracion_gp_operativa_panel.sql`:
 * `gp_movimiento_cc_cuenta_es_linea_comision_gp` y `gp_movimiento_caja_ordenes_es_comision_gp`
 * (concepto legacy OR clasificacion_movimiento ENUM).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

/** Réplica de `public.gp_concepto_es_linea_comision_cc_gp`. */
function gpConceptoEsLineaComisionCcGp(concepto) {
  const t = String(concepto ?? '').trim();
  if (!t) return false;
  const lower = t.toLowerCase();
  return lower.startsWith('comisión del acuerdo') || lower.startsWith('comision del acuerdo');
}

/** Réplica de `public.gp_movimiento_cc_cuenta_es_linea_comision_gp`. */
function gpMovimientoCcCuentaEsLineaComisionGp(concepto, clasificacion) {
  return (
    gpConceptoEsLineaComisionCcGp(concepto) ||
    clasificacion === 'CC_COMISION_ACUERDO' ||
    clasificacion === 'CC_COMISION_SINTETICA_SIN_TRX'
  );
}

/** Réplica de `public.gp_concepto_es_comision_caja_ordenes_gp`. */
function gpConceptoEsComisionCajaOrdenesGp(concepto) {
  const t = String(concepto ?? '').trim();
  if (!t) return false;
  return /^Comisión del acuerdo\./i.test(t) || /^Comision del acuerdo\./i.test(t);
}

/** Réplica de `public.gp_movimiento_caja_ordenes_es_comision_gp`. */
function gpMovimientoCajaOrdenesEsComisionGp(concepto, clasificacion) {
  return gpConceptoEsComisionCajaOrdenesGp(concepto) || clasificacion === 'CAJA_COMISION_ACUERDO';
}

test('CC: texto comisión del acuerdo → línea comisión (sin depender del ENUM)', () => {
  assert.equal(gpMovimientoCcCuentaEsLineaComisionGp('Comisión del acuerdo · orden 1', 'CC_FLUJO_OPERATIVO_TRX'), true);
  assert.equal(gpMovimientoCcCuentaEsLineaComisionGp('comision del acuerdo x', 'LEGACY_SIN_CLASIFICAR'), true);
});

test('CC: ENUM comisión aunque el concepto no matchee el prefijo G/P', () => {
  assert.equal(gpMovimientoCcCuentaEsLineaComisionGp('Otro concepto', 'CC_COMISION_ACUERDO'), true);
  assert.equal(gpMovimientoCcCuentaEsLineaComisionGp('', 'CC_COMISION_SINTETICA_SIN_TRX'), true);
});

test('CC: flujo operativo sin texto de comisión → no es línea comisión', () => {
  assert.equal(gpMovimientoCcCuentaEsLineaComisionGp('Compromiso de Pago - Orden 1', 'CC_FLUJO_OPERATIVO_TRX'), false);
  assert.equal(gpMovimientoCcCuentaEsLineaComisionGp('', 'LEGACY_SIN_CLASIFICAR'), false);
});

test('CC: ENUM resultado económico compensatorio no entra al OR de comisión del helper', () => {
  assert.equal(
    gpMovimientoCcCuentaEsLineaComisionGp('Compensación parcial en cuenta corriente- Orden 1 y Trans 2', 'CC_RESULTADO_ECONOMICO_COMPENSATORIO'),
    false,
  );
});

test('Caja órdenes: patrón Comisión del acuerdo. → comisión', () => {
  assert.equal(gpMovimientoCajaOrdenesEsComisionGp('Comisión del acuerdo. ARS · nro 1', 'CAJA_FLUJO_OPERATIVO'), true);
});

test('Caja órdenes: ENUM CAJA_COMISION_ACUERDO sin texto típico', () => {
  assert.equal(gpMovimientoCajaOrdenesEsComisionGp('Egreso de USD', 'CAJA_COMISION_ACUERDO'), true);
});

test('Caja órdenes: ganancia / flujo → no comisión', () => {
  assert.equal(gpMovimientoCajaOrdenesEsComisionGp('Ganancia del acuerdo · ARS', 'CAJA_FLUJO_OPERATIVO'), false);
});
