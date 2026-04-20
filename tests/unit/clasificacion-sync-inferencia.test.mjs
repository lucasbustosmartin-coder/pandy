/**
 * Réplica de la inferencia previa a `sync_cc_caja_orden` en `main.js` (~3682–3810).
 * Si cambiás reglas ahí, actualizá este archivo en el mismo PR.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const MOVIMIENTO_CLASIFICACION = {
  LEGACY_SIN_CLASIFICAR: 'LEGACY_SIN_CLASIFICAR',
  CC_FLUJO_OPERATIVO_TRX: 'CC_FLUJO_OPERATIVO_TRX',
  CC_COMISION_ACUERDO: 'CC_COMISION_ACUERDO',
  CC_COMPENSACION: 'CC_COMPENSACION',
  CC_COMISION_SINTETICA_SIN_TRX: 'CC_COMISION_SINTETICA_SIN_TRX',
  REGULA_B_MONR_MONE_PRESTAMO: 'REGULA_B_MONR_MONE_PRESTAMO',
  CIERRE_ORDEN_MULTIMONEDA: 'CIERRE_ORDEN_MULTIMONEDA',
  CC_RESULTADO_ECONOMICO_COMPENSATORIO: 'CC_RESULTADO_ECONOMICO_COMPENSATORIO',
  CANCELACION_CONTRAPARTE: 'CANCELACION_CONTRAPARTE',
  SALDO_INICIAL_VOLCADO: 'SALDO_INICIAL_VOLCADO',
  MANUAL_EXPLICITO: 'MANUAL_EXPLICITO',
  CAJA_FLUJO_OPERATIVO: 'CAJA_FLUJO_OPERATIVO',
  CAJA_COMISION_ACUERDO: 'CAJA_COMISION_ACUERDO',
  EXCEPCION_NETEO_USD_USD_CON_INTERMEDIARIO: 'EXCEPCION_NETEO_USD_USD_CON_INTERMEDIARIO',
};

function conceptoCcEsCompensacionSaldoFlipConcepto(concepto) {
  const c = String(concepto || '');
  return (
    c.includes('Compensación parcial en cuenta corriente-') ||
    c.includes('Compensación total en cuenta corriente-') ||
    c.includes('Compensación parcial o total')
  );
}

function conceptoEsComisionAcuerdoLineaGp(concepto) {
  const t = String(concepto || '').trim().toLowerCase();
  return t !== '' && (t.startsWith('comisión del acuerdo') || t.startsWith('comision del acuerdo'));
}

function conceptoEsComisionCajaOrdenesGp(concepto) {
  const t = String(concepto || '').trim();
  if (!t) return false;
  return /^Comisión del acuerdo\./i.test(t) || /^Comision del acuerdo\./i.test(t);
}

function inferClasificacionMovimientoCuentaCorrienteRow(row, esIntermediario) {
  const c = String(row && row.concepto != null ? row.concepto : '');
  const cl = c.toLowerCase();
  if (row && row.es_movimiento_manual === true) return MOVIMIENTO_CLASIFICACION.MANUAL_EXPLICITO;
  if (conceptoCcEsCompensacionSaldoFlipConcepto(c)) return MOVIMIENTO_CLASIFICACION.CC_COMPENSACION;
  if (cl.includes('cancelación de deuda') || cl.includes('cancelacion de deuda') || c.includes('Contraparte cancelación') || cl.includes('contraparte cancelación')) {
    return MOVIMIENTO_CLASIFICACION.CANCELACION_CONTRAPARTE;
  }
  if (cl.startsWith('trazabilidad transacción anulada') || cl.startsWith('trazabilidad transaccion anulada')) {
    return MOVIMIENTO_CLASIFICACION.CC_FLUJO_OPERATIVO_TRX;
  }
  if (cl.startsWith('cierre orden ')) return MOVIMIENTO_CLASIFICACION.CIERRE_ORDEN_MULTIMONEDA;
  if (
    cl.includes('préstamo al cliente') ||
    cl.includes('prestamo al cliente') ||
    (cl.includes('cobertura pandy') && cl.includes('moneda recibida'))
  ) {
    return MOVIMIENTO_CLASIFICACION.REGULA_B_MONR_MONE_PRESTAMO;
  }
  if (conceptoEsComisionAcuerdoLineaGp(c)) {
    if (!row || !row.transaccion_id) return MOVIMIENTO_CLASIFICACION.CC_COMISION_SINTETICA_SIN_TRX;
    return MOVIMIENTO_CLASIFICACION.CC_COMISION_ACUERDO;
  }
  if (cl.startsWith('saldo inicial')) return MOVIMIENTO_CLASIFICACION.SALDO_INICIAL_VOLCADO;
  if (
    cl.startsWith('cobro realizado') ||
    cl.startsWith('pago realizado') ||
    cl.startsWith('compromiso de pago') ||
    cl.startsWith('compromiso a cobrar') ||
    cl.startsWith('contra cobro (entrega pendiente)') ||
    cl.startsWith('movimiento - orden ') ||
    cl.startsWith('cobro por') ||
    cl.startsWith('deuda por') ||
    cl.startsWith('pago por')
  ) {
    return MOVIMIENTO_CLASIFICACION.CC_FLUJO_OPERATIVO_TRX;
  }
  if (esIntermediario) {
    if (
      c.includes('Comisión Intermediario') ||
      c.includes('Comision Intermediario') ||
      c.includes('Pandy a Intermediario') ||
      c.includes('Intermediario debe a Pandy') ||
      c.includes('Pago Intermediario a Pandy')
    ) {
      return MOVIMIENTO_CLASIFICACION.CC_FLUJO_OPERATIVO_TRX;
    }
  }
  if (row && (row.orden_id || row.transaccion_id)) return MOVIMIENTO_CLASIFICACION.CC_FLUJO_OPERATIVO_TRX;
  return MOVIMIENTO_CLASIFICACION.LEGACY_SIN_CLASIFICAR;
}

function inferClasificacionMovimientoCajaRowSync(row) {
  const c = String(row && row.concepto != null ? row.concepto : '');
  const cl = c.toLowerCase();
  if (row && row.tipo_movimiento_id != null && String(row.tipo_movimiento_id).trim() !== '') {
    return MOVIMIENTO_CLASIFICACION.MANUAL_EXPLICITO;
  }
  if (conceptoEsComisionCajaOrdenesGp(c)) return MOVIMIENTO_CLASIFICACION.CAJA_COMISION_ACUERDO;
  if (cl.startsWith('ganancia del acuerdo') || cl.startsWith('ingreso de ') || cl.startsWith('egreso de ')) {
    return MOVIMIENTO_CLASIFICACION.CAJA_FLUJO_OPERATIVO;
  }
  if (row && (row.orden_id || row.transaccion_id)) return MOVIMIENTO_CLASIFICACION.CAJA_FLUJO_OPERATIVO;
  return MOVIMIENTO_CLASIFICACION.LEGACY_SIN_CLASIFICAR;
}

function enriquecerFilasSyncConClasificacionMovimiento(rowsCcCliente, rowsCcInt, rowsCaja) {
  (rowsCcCliente || []).forEach((r) => {
    if (!r || typeof r !== 'object') return;
    r.clasificacion_movimiento = inferClasificacionMovimientoCuentaCorrienteRow(r, false);
  });
  (rowsCcInt || []).forEach((r) => {
    if (!r || typeof r !== 'object') return;
    r.clasificacion_movimiento = inferClasificacionMovimientoCuentaCorrienteRow(r, true);
  });
  (rowsCaja || []).forEach((r) => {
    if (!r || typeof r !== 'object') return;
    r.clasificacion_movimiento = inferClasificacionMovimientoCajaRowSync(r);
  });
}

function inferClasificacionTransaccionDesdePayload(_tr) {
  return MOVIMIENTO_CLASIFICACION.CC_FLUJO_OPERATIVO_TRX;
}

function asegurarClasificacionTransaccionEnPayload(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  payload.clasificacion_transaccion = inferClasificacionTransaccionDesdePayload(payload);
  return payload;
}

test('CC cliente: manual, compensación, cancelación, cierre, préstamo, saldo inicial', () => {
  assert.equal(inferClasificacionMovimientoCuentaCorrienteRow({ concepto: 'x', es_movimiento_manual: true, orden_id: 'o1' }, false), MOVIMIENTO_CLASIFICACION.MANUAL_EXPLICITO);
  assert.equal(
    inferClasificacionMovimientoCuentaCorrienteRow({ concepto: 'Compensación parcial en cuenta corriente- Orden 1 y Trans 2', orden_id: 'o1' }, false),
    MOVIMIENTO_CLASIFICACION.CC_COMPENSACION,
  );
  assert.equal(inferClasificacionMovimientoCuentaCorrienteRow({ concepto: 'Cancelación de deuda x', orden_id: 'o1' }, false), MOVIMIENTO_CLASIFICACION.CANCELACION_CONTRAPARTE);
  assert.equal(inferClasificacionMovimientoCuentaCorrienteRow({ concepto: 'Cierre orden 5 multimoneda', orden_id: 'o1' }, false), MOVIMIENTO_CLASIFICACION.CIERRE_ORDEN_MULTIMONEDA);
  assert.equal(
    inferClasificacionMovimientoCuentaCorrienteRow({ concepto: 'Préstamo al cliente (algo)', orden_id: 'o1' }, false),
    MOVIMIENTO_CLASIFICACION.REGULA_B_MONR_MONE_PRESTAMO,
  );
  assert.equal(inferClasificacionMovimientoCuentaCorrienteRow({ concepto: 'Saldo inicial USD', orden_id: 'o1' }, false), MOVIMIENTO_CLASIFICACION.SALDO_INICIAL_VOLCADO);
});

test('CC: comisión acuerdo con y sin transaccion_id', () => {
  assert.equal(
    inferClasificacionMovimientoCuentaCorrienteRow({ concepto: 'Comisión del acuerdo · 1', transaccion_id: 't1', orden_id: 'o1' }, false),
    MOVIMIENTO_CLASIFICACION.CC_COMISION_ACUERDO,
  );
  assert.equal(
    inferClasificacionMovimientoCuentaCorrienteRow({ concepto: 'comision del acuerdo x', orden_id: 'o1' }, false),
    MOVIMIENTO_CLASIFICACION.CC_COMISION_SINTETICA_SIN_TRX,
  );
});

test('CC: leyendas flujo operativo y catch-all con orden_id', () => {
  assert.equal(inferClasificacionMovimientoCuentaCorrienteRow({ concepto: 'Compromiso de Pago - Orden 1', orden_id: 'o1' }, false), MOVIMIENTO_CLASIFICACION.CC_FLUJO_OPERATIVO_TRX);
  assert.equal(inferClasificacionMovimientoCuentaCorrienteRow({ concepto: 'Algo no catalogado', orden_id: 'o1' }, false), MOVIMIENTO_CLASIFICACION.CC_FLUJO_OPERATIVO_TRX);
  assert.equal(inferClasificacionMovimientoCuentaCorrienteRow({ concepto: 'Huérfano' }, false), MOVIMIENTO_CLASIFICACION.LEGACY_SIN_CLASIFICAR);
});

test('CC intermediario: texto frecuente → flujo solo con bandera intermediario', () => {
  assert.equal(
    inferClasificacionMovimientoCuentaCorrienteRow({ concepto: 'Comisión Intermediario x', orden_id: 'o1' }, true),
    MOVIMIENTO_CLASIFICACION.CC_FLUJO_OPERATIVO_TRX,
  );
  assert.equal(
    inferClasificacionMovimientoCuentaCorrienteRow({ concepto: 'Comisión Intermediario x' }, true),
    MOVIMIENTO_CLASIFICACION.CC_FLUJO_OPERATIVO_TRX,
  );
  assert.equal(
    inferClasificacionMovimientoCuentaCorrienteRow({ concepto: 'Comisión Intermediario x' }, false),
    MOVIMIENTO_CLASIFICACION.LEGACY_SIN_CLASIFICAR,
  );
});

test('Caja: manual por tipo_movimiento_id, comisión, ganancia, catch-all', () => {
  assert.equal(inferClasificacionMovimientoCajaRowSync({ concepto: 'x', tipo_movimiento_id: 'uuid-1', orden_id: 'o1' }), MOVIMIENTO_CLASIFICACION.MANUAL_EXPLICITO);
  assert.equal(inferClasificacionMovimientoCajaRowSync({ concepto: 'Comisión del acuerdo. ARS nro 1', orden_id: 'o1' }), MOVIMIENTO_CLASIFICACION.CAJA_COMISION_ACUERDO);
  assert.equal(inferClasificacionMovimientoCajaRowSync({ concepto: 'Ganancia del acuerdo · ARS', orden_id: 'o1' }), MOVIMIENTO_CLASIFICACION.CAJA_FLUJO_OPERATIVO);
  assert.equal(inferClasificacionMovimientoCajaRowSync({ concepto: 'Otro', orden_id: 'o1', transaccion_id: 't1' }), MOVIMIENTO_CLASIFICACION.CAJA_FLUJO_OPERATIVO);
  assert.equal(inferClasificacionMovimientoCajaRowSync({ concepto: 'Sin refs' }), MOVIMIENTO_CLASIFICACION.LEGACY_SIN_CLASIFICAR);
});

test('enriquecerFilasSyncConClasificacionMovimiento muta las tres listas', () => {
  const cc = [{ concepto: 'Compromiso a Cobrar - O1', orden_id: 'o1' }];
  const ci = [{ concepto: 'Pandy a Intermediario x', orden_id: 'o1' }];
  const cj = [{ concepto: 'Ingreso de USD', orden_id: 'o1', transaccion_id: 't1' }];
  enriquecerFilasSyncConClasificacionMovimiento(cc, ci, cj);
  assert.equal(cc[0].clasificacion_movimiento, MOVIMIENTO_CLASIFICACION.CC_FLUJO_OPERATIVO_TRX);
  assert.equal(ci[0].clasificacion_movimiento, MOVIMIENTO_CLASIFICACION.CC_FLUJO_OPERATIVO_TRX);
  assert.equal(cj[0].clasificacion_movimiento, MOVIMIENTO_CLASIFICACION.CAJA_FLUJO_OPERATIVO);
});

test('enriquecer ignora null y no objeto en arrays', () => {
  const cc = [null, { concepto: 'Compromiso de Pago - x', orden_id: 'o' }];
  enriquecerFilasSyncConClasificacionMovimiento(cc, [], []);
  assert.equal(cc[1].clasificacion_movimiento, MOVIMIENTO_CLASIFICACION.CC_FLUJO_OPERATIVO_TRX);
});

test('asegurarClasificacionTransaccionEnPayload', () => {
  const p = { monto: 1 };
  asegurarClasificacionTransaccionEnPayload(p);
  assert.equal(p.clasificacion_transaccion, MOVIMIENTO_CLASIFICACION.CC_FLUJO_OPERATIVO_TRX);
  assert.equal(asegurarClasificacionTransaccionEnPayload(null), null);
});
