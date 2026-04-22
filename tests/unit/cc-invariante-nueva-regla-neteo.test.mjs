/**
 * Paridad con funciones del invariante CC cliente en main.js:
 * - `sumaMovimientosPataMonRExentosNeteo` / `sumaMovimientosPataMonEExentosNeteo` (~11841–12145)
 * - `sumaMovimientosCompensacionParcialTotalCcExentosNeteo` (~11440)
 * - `sumaMovimientosCompromisoPagoEgresoIntermediarioClienteExentoNeteoUsdUsdConCompensacionTrx` (~12222)
 * - `filasCcClienteSinCompromisoPagoPlanoEspejoMismaTrx` (~11659)
 * Si se modifica el invariante allí, actualizar estas réplicas (o extraer a `utils/` compartido).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const SUBSTRING_LEYENDA_CC_REGLA_B_PANDY_PATA_MONR = 'Pandy cumple pata en moneda recibida';
const SUBSTRING_LEYENDA_CC_TERcERO_PATA_MONR = 'Tercero cumple pata en moneda recibida';
const SUBSTRING_LEYENDA_CC_PRESTAMO_PANDY_REGULA_B_MONR = 'cobertura Pandy — moneda recibida';
const SUBSTRING_LEYENDA_CC_NUEVA_REGLA_EMPRESA_ASUME_MONR = 'La empresa asume el compromiso de pago del cliente ( Afecta CC Cliente ).';

const SUBSTRING_LEYENDA_CC_REGLA_B_PANDY_PATA_MONE = 'Pandy cumple pata en moneda entregada';
const SUBSTRING_CONCEPTO_CC_NUEVA_REGLA_MONE_COMPROMISO = 'Compromiso de pago hacia el cliente - ';
const SUBSTRING_CONCEPTO_CC_NUEVA_REGLA_MONE_PAGO = 'Pago hacia el cliente - ';

/** Réplica de main.js `sumaMovimientosPataMonRExentosNeteo`. */
function sumaMovimientosPataMonRExentosNeteo(rowsCliente, clienteId, ordenId, monR) {
  const mon = String(monR || '').toUpperCase();
  let s = 0;
  const subP = SUBSTRING_LEYENDA_CC_REGLA_B_PANDY_PATA_MONR;
  const subT = SUBSTRING_LEYENDA_CC_TERcERO_PATA_MONR;
  const subLoan = SUBSTRING_LEYENDA_CC_PRESTAMO_PANDY_REGULA_B_MONR;
  const subNuevaMonR = SUBSTRING_LEYENDA_CC_NUEVA_REGLA_EMPRESA_ASUME_MONR;
  for (const r of rowsCliente || []) {
    if (!r || String(r.estado || '').toLowerCase() !== 'cerrado') continue;
    if (String(r.cliente_id || '') !== String(clienteId || '') || String(r.orden_id || '') !== String(ordenId || '')) continue;
    if (String(r.moneda || '').toUpperCase() !== mon) continue;
    const c = String(r.concepto || '');
    if (!c.includes(subP) && !c.includes(subT) && !c.includes(subLoan) && !c.includes(subNuevaMonR)) continue;
    const m = Number(r.monto);
    if (Number.isFinite(m)) s += m;
  }
  return s;
}

/** Réplica de main.js `sumaMovimientosPataMonEExentosNeteo`. */
function sumaMovimientosPataMonEExentosNeteo(rowsCliente, clienteId, ordenId, monE) {
  const mon = String(monE || '').toUpperCase();
  const subP = SUBSTRING_LEYENDA_CC_REGLA_B_PANDY_PATA_MONE;
  const tids = new Set();
  const tnums = new Set();
  for (const r of rowsCliente || []) {
    if (!r || String(r.estado || '').toLowerCase() !== 'cerrado') continue;
    if (String(r.cliente_id || '') !== String(clienteId || '') || String(r.orden_id || '') !== String(ordenId || '')) continue;
    if (String(r.moneda || '').toUpperCase() !== mon) continue;
    if (!String(r.concepto || '').includes(subP)) continue;
    const tid = r.transaccion_id != null && String(r.transaccion_id).trim() !== '' ? String(r.transaccion_id) : '';
    const tn = r.transaccion_numero != null && String(r.transaccion_numero).trim() !== '' ? String(r.transaccion_numero) : '';
    if (tid) tids.add(tid);
    if (tn) tnums.add(tn);
  }
  let s = 0;
  for (const r of rowsCliente || []) {
    if (!r || String(r.estado || '').toLowerCase() !== 'cerrado') continue;
    if (String(r.cliente_id || '') !== String(clienteId || '') || String(r.orden_id || '') !== String(ordenId || '')) continue;
    if (String(r.moneda || '').toUpperCase() !== mon) continue;
    const c = String(r.concepto || '');
    if (c.includes(subP)) {
      const m = Number(r.monto);
      if (Number.isFinite(m)) s += m;
      continue;
    }
    if (c.includes(SUBSTRING_CONCEPTO_CC_NUEVA_REGLA_MONE_COMPROMISO) || c.includes(SUBSTRING_CONCEPTO_CC_NUEVA_REGLA_MONE_PAGO)) {
      const m = Number(r.monto);
      if (Number.isFinite(m)) s += m;
      continue;
    }
    if (!tids.size && !tnums.size) continue;
    if (!c.includes('Ajuste libro acuerdo')) continue;
    const tid = r.transaccion_id != null && String(r.transaccion_id).trim() !== '' ? String(r.transaccion_id) : '';
    const tn = r.transaccion_numero != null && String(r.transaccion_numero).trim() !== '' ? String(r.transaccion_numero) : '';
    const linked = (tid && tids.has(tid)) || (tn && tnums.has(tn));
    if (!linked) continue;
    const m = Number(r.monto);
    if (Number.isFinite(m)) s += m;
  }
  return s;
}

function conceptoPlantillaMonE(esCompromiso, ordenNumero, transNumero, suf) {
  const ord = ordenNumero != null && ordenNumero !== '' ? String(ordenNumero) : '?';
  const tr = transNumero != null && transNumero !== '' ? String(transNumero) : '?';
  const tituloCatalogo = esCompromiso ? 'Compromiso de Pago' : 'Pago hacia el cliente';
  const frag = esCompromiso ? SUBSTRING_CONCEPTO_CC_NUEVA_REGLA_MONE_COMPROMISO : SUBSTRING_CONCEPTO_CC_NUEVA_REGLA_MONE_PAGO;
  const cuerpo = String(frag || '').trim() + ' ' + String(suf || '').trim();
  return tituloCatalogo + ' - Orden ' + ord + ' y Trans ' + tr + ' (' + cuerpo + ')';
}

test('MonR exento: incluye leyenda §1.3.4 nueva regla', () => {
  const cid = 'cli-ac';
  const oid = 'ord-1';
  const rows = [
    {
      cliente_id: cid,
      orden_id: oid,
      moneda: 'USD',
      estado: 'cerrado',
      concepto: 'Compromiso de Pago - Orden 40 y Trans 7 (La empresa asume el compromiso de pago del cliente ( Afecta CC Cliente ).)',
      monto: 1500,
    },
  ];
  assert.equal(sumaMovimientosPataMonRExentosNeteo(rows, cid, oid, 'USD'), 1500);
});

test('MonE exento: par plantilla §1.2.1 compromiso + pago netea 0 (sin fila legacy subP)', () => {
  const cid = 'cli-ac';
  const oid = 'ord-1';
  const tid = 'trx-eg-1';
  const nro = '100';
  const rows = [
    {
      cliente_id: cid,
      orden_id: oid,
      transaccion_id: tid,
      transaccion_numero: nro,
      moneda: 'USD',
      estado: 'cerrado',
      concepto: conceptoPlantillaMonE(true, 40, nro, 'ejecutado'),
      monto: -200,
    },
    {
      cliente_id: cid,
      orden_id: oid,
      transaccion_id: tid,
      transaccion_numero: nro,
      moneda: 'USD',
      estado: 'cerrado',
      concepto: conceptoPlantillaMonE(false, 40, nro, 'ejecutado'),
      monto: 200,
    },
  ];
  assert.equal(sumaMovimientosPataMonEExentosNeteo(rows, cid, oid, 'USD'), 0);
});

test('MonE exento: legacy «Pandy cumple pata» + Ajuste libro misma trx netea 0', () => {
  const cid = 'cli-ac';
  const oid = 'ord-1';
  const tid = 't1';
  const rows = [
    {
      cliente_id: cid,
      orden_id: oid,
      transaccion_id: tid,
      moneda: 'ARS',
      estado: 'cerrado',
      concepto: 'Pago realizado — Orden 1 (Pandy cumple pata en moneda entregada)',
      monto: -5000,
    },
    {
      cliente_id: cid,
      orden_id: oid,
      transaccion_id: tid,
      moneda: 'ARS',
      estado: 'cerrado',
      concepto: 'Ajuste libro acuerdo — Orden 1 · Trans 9',
      monto: 5000,
    },
  ];
  assert.equal(sumaMovimientosPataMonEExentosNeteo(rows, cid, oid, 'ARS'), 0);
});

test('MonR exento: suma pata B + préstamo + nueva leyenda en misma moneda', () => {
  const cid = 'c';
  const oid = 'o';
  const rows = [
    { cliente_id: cid, orden_id: oid, moneda: 'USD', estado: 'cerrado', concepto: 'x (' + SUBSTRING_LEYENDA_CC_REGLA_B_PANDY_PATA_MONR + ')', monto: 100 },
    { cliente_id: cid, orden_id: oid, moneda: 'USD', estado: 'cerrado', concepto: 'Préstamo (' + SUBSTRING_LEYENDA_CC_PRESTAMO_PANDY_REGULA_B_MONR + ')', monto: -100 },
    { cliente_id: cid, orden_id: oid, moneda: 'USD', estado: 'cerrado', concepto: '(' + SUBSTRING_LEYENDA_CC_NUEVA_REGLA_EMPRESA_ASUME_MONR + ')', monto: 50 },
  ];
  assert.equal(sumaMovimientosPataMonRExentosNeteo(rows, cid, oid, 'USD'), 50);
});

test('residual bruto moneda E: sumRaw − offsetMonE ≈ 0 con solo plantilla nueva regla', () => {
  const EPS = 1e-6;
  const cid = 'cli-ac';
  const oid = 'ord-1';
  const tid = 't2';
  const rows = [
    {
      cliente_id: cid,
      orden_id: oid,
      transaccion_id: tid,
      moneda: 'EUR',
      estado: 'cerrado',
      concepto: conceptoPlantillaMonE(true, 5, '3', 'ejecutado'),
      monto: -80,
    },
    {
      cliente_id: cid,
      orden_id: oid,
      transaccion_id: tid,
      moneda: 'EUR',
      estado: 'cerrado',
      concepto: conceptoPlantillaMonE(false, 5, '3', 'ejecutado'),
      monto: 80,
    },
  ];
  const sumRaw = -80 + 80;
  const offsetMonE = sumaMovimientosPataMonEExentosNeteo(rows, cid, oid, 'EUR');
  assert.ok(Math.abs(sumRaw - offsetMonE) <= EPS);
});

// --- A: compensación CC (exenta neteo) — réplica main.js ~3704 + ~11440

function conceptoCcEsCompensacionSaldoFlipConcepto(concepto) {
  const c = String(concepto || '');
  return (
    c.includes('Compensación parcial en cuenta corriente-') ||
    c.includes('Compensación total en cuenta corriente-') ||
    c.includes('Compensación excede el monto de deuda en cuenta corriente-') ||
    c.includes('Compensación parcial o total')
  );
}

/** Réplica de `sumaMovimientosCompensacionParcialTotalCcExentosNeteo`. */
function sumaMovimientosCompensacionParcialTotalCcExentosNeteo(rowsCliente, clienteId, ordenId, mon) {
  const monU = String(mon || '').toUpperCase();
  let s = 0;
  for (const r of rowsCliente || []) {
    if (!r || r.es_movimiento_manual === true) continue;
    if (String(r.estado || '').toLowerCase() !== 'cerrado') continue;
    if (String(r.cliente_id || '') !== String(clienteId || '') || String(r.orden_id || '') !== String(ordenId || '')) continue;
    if (String(r.moneda || '').toUpperCase() !== monU) continue;
    if (!conceptoCcEsCompensacionSaldoFlipConcepto(r.concepto)) continue;
    const m = Number(r.monto);
    if (Number.isFinite(m)) s += m;
  }
  return s;
}

test('compensación exenta: suma solo cerradas, ignora manual y otra orden', () => {
  const cid = 'c1';
  const oid = 'o1';
  const ley = 'Compensación total en cuenta corriente- Orden 1 y Trans 9';
  const rows = [
    { cliente_id: cid, orden_id: oid, moneda: 'USD', estado: 'cerrado', concepto: ley, monto: 300, es_movimiento_manual: true },
    { cliente_id: cid, orden_id: oid, moneda: 'USD', estado: 'pendiente', concepto: ley, monto: 999 },
    { cliente_id: cid, orden_id: oid, moneda: 'USD', estado: 'cerrado', concepto: ley, monto: 300 },
    { cliente_id: cid, orden_id: 'o2', moneda: 'USD', estado: 'cerrado', concepto: ley, monto: 1 },
  ];
  assert.equal(sumaMovimientosCompensacionParcialTotalCcExentosNeteo(rows, cid, oid, 'USD'), 300);
});

test('compensación exenta: leyenda legacy «parcial o total»', () => {
  const cid = 'c1';
  const oid = 'o1';
  const rows = [
    { cliente_id: cid, orden_id: oid, moneda: 'USD', estado: 'cerrado', concepto: 'Compensación parcial o total - Orden 1 y Trans 1', monto: 77 },
  ];
  assert.equal(sumaMovimientosCompensacionParcialTotalCcExentosNeteo(rows, cid, oid, 'USD'), 77);
});

// --- B: offset Compromiso de Pago egreso I→C + compensación USD-USD — réplica main.js ~12222

function monedaCatalogoParaOrden(m) {
  const u = (m || '').toString().trim().toUpperCase();
  return u === 'CHEQUE' ? 'ARS' : u;
}

function transaccionEstadoNorm(t) {
  return String(t == null || t.estado == null ? '' : t.estado).trim().toLowerCase();
}

function pagCobEfectivosTransaccionSyncMin(t) {
  const tipoL = String(t.tipo || '').toLowerCase();
  const cob = String(t.cobrador != null ? t.cobrador : tipoL === 'ingreso' ? 'pandy' : 'cliente').toLowerCase();
  const pag = String(t.pagador != null ? t.pagador : tipoL === 'egreso' ? 'pandy' : 'cliente').toLowerCase();
  return { pag, cob };
}

/** Réplica de `sumaMovimientosCompromisoPagoEgresoIntermediarioClienteExentoNeteoUsdUsdConCompensacionTrx`. */
function sumaMovimientosCompromisoPagoEgresoIntermediarioClienteExentoNeteoUsdUsdConCompensacionTrx(
  rowsCliente,
  clienteId,
  ordenId,
  mon,
  transacciones,
  orden,
) {
  const monU = String(mon || '').toUpperCase();
  const monR = String(orden.moneda_recibida || '').toUpperCase();
  const monE = String(orden.moneda_entregada || '').toUpperCase();
  if (monU !== monR || monR !== monE || !orden.intermediario_id) return 0;
  const hayCompTrx = (transacciones || []).some((t) => Number(t && t.compensacion_cc_monto_aplicado) >= 1e-6);
  if (!hayCompTrx) return 0;
  const trxById = new Map((transacciones || []).filter((t) => t && t.id != null).map((t) => [String(t.id), t]));
  let s = 0;
  for (const r of rowsCliente || []) {
    if (!r || r.es_movimiento_manual === true) continue;
    if (String(r.estado || '').toLowerCase() !== 'cerrado') continue;
    if (String(r.cliente_id || '') !== String(clienteId || '') || String(r.orden_id || '') !== String(ordenId || '')) continue;
    if (String(r.moneda || '').toUpperCase() !== monU) continue;
    const c = String(r.concepto || '');
    if (!c.includes('Compromiso de Pago')) continue;
    if (
      c.includes(SUBSTRING_LEYENDA_CC_REGLA_B_PANDY_PATA_MONR) ||
      c.includes(SUBSTRING_LEYENDA_CC_TERcERO_PATA_MONR) ||
      c.includes(SUBSTRING_LEYENDA_CC_NUEVA_REGLA_EMPRESA_ASUME_MONR)
    ) {
      continue;
    }
    const tid = r.transaccion_id;
    if (tid == null || String(tid).trim() === '') continue;
    const t = trxById.get(String(tid));
    if (!t) continue;
    if (String(t.tipo || '').toLowerCase() !== 'egreso') continue;
    if (transaccionEstadoNorm(t) !== 'ejecutada') continue;
    const tn = t;
    const { pag, cob } = pagCobEfectivosTransaccionSyncMin(tn);
    if (pag !== 'intermediario' || cob !== 'cliente') continue;
    const m = Number(r.monto);
    if (Number.isFinite(m)) s += m;
  }
  return s;
}

test('offset I→C + compensación: suma Compromiso plano egreso I→C ejecutado', () => {
  const cid = 'cli';
  const oid = 'ord';
  const orden = { moneda_recibida: 'USD', moneda_entregada: 'USD', intermediario_id: 'int-1' };
  const trx = [
    { id: 'ing1', tipo: 'ingreso', estado: 'ejecutada', compensacion_cc_monto_aplicado: 2000, monto: 2000, pagador: 'cliente', cobrador: 'pandy' },
    { id: 'eg1', tipo: 'egreso', estado: 'ejecutada', monto: 2000, pagador: 'intermediario', cobrador: 'cliente' },
  ];
  const rows = [
    {
      cliente_id: cid,
      orden_id: oid,
      transaccion_id: 'eg1',
      moneda: 'USD',
      estado: 'cerrado',
      concepto: 'Compromiso de Pago - Orden 82 y Trans 191',
      monto: 2000,
    },
  ];
  assert.equal(
    sumaMovimientosCompromisoPagoEgresoIntermediarioClienteExentoNeteoUsdUsdConCompensacionTrx(rows, cid, oid, 'USD', trx, orden),
    2000,
  );
});

test('offset I→C: excluye fila con leyenda §1.3.4 aunque trx sea egreso I→C', () => {
  const cid = 'cli';
  const oid = 'ord';
  const orden = { moneda_recibida: 'USD', moneda_entregada: 'USD', intermediario_id: 'int-1' };
  const trx = [
    { id: 'ing1', tipo: 'ingreso', estado: 'ejecutada', compensacion_cc_monto_aplicado: 100, monto: 100 },
    { id: 'eg1', tipo: 'egreso', estado: 'ejecutada', monto: 100, pagador: 'intermediario', cobrador: 'cliente' },
  ];
  const rows = [
    {
      cliente_id: cid,
      orden_id: oid,
      transaccion_id: 'eg1',
      moneda: 'USD',
      estado: 'cerrado',
      concepto: 'Compromiso de Pago - Orden 1 (' + SUBSTRING_LEYENDA_CC_NUEVA_REGLA_EMPRESA_ASUME_MONR + ')',
      monto: 100,
    },
  ];
  assert.equal(
    sumaMovimientosCompromisoPagoEgresoIntermediarioClienteExentoNeteoUsdUsdConCompensacionTrx(rows, cid, oid, 'USD', trx, orden),
    0,
  );
});

test('offset I→C: sin compensación en trx → 0', () => {
  const orden = { moneda_recibida: 'USD', moneda_entregada: 'USD', intermediario_id: 'x' };
  const trx = [{ id: 'eg1', tipo: 'egreso', estado: 'ejecutada', monto: 1, pagador: 'intermediario', cobrador: 'cliente' }];
  const rows = [
    {
      cliente_id: 'c',
      orden_id: 'o',
      transaccion_id: 'eg1',
      moneda: 'USD',
      estado: 'cerrado',
      concepto: 'Compromiso de Pago - Orden 1 y Trans 1',
      monto: 50,
    },
  ];
  assert.equal(sumaMovimientosCompromisoPagoEgresoIntermediarioClienteExentoNeteoUsdUsdConCompensacionTrx(rows, 'c', 'o', 'USD', trx, orden), 0);
});

// --- C: dedupe «Compromiso de Pago» plano espejo — réplica main.js ~11659

function ordenEsCruceDosMonedasDistintas(orden) {
  const mr = String((orden && orden.moneda_recibida) || '').toUpperCase().trim();
  const me = String((orden && orden.moneda_entregada) || '').toUpperCase().trim();
  return !!(mr && me && mr !== me);
}

/** Réplica de `filasCcClienteSinCompromisoPagoPlanoEspejoMismaTrx`. */
function filasCcClienteSinCompromisoPagoPlanoEspejoMismaTrx(rowsCcCliente, ordenId, usarMulticontraparteManual, orden) {
  const tol = 0.02;
  const plainComp = (c) => {
    const x = String(c || '');
    return (
      x.includes('Compromiso de Pago') &&
      !x.includes(SUBSTRING_LEYENDA_CC_REGLA_B_PANDY_PATA_MONR) &&
      !x.includes(SUBSTRING_LEYENDA_CC_TERcERO_PATA_MONR) &&
      !x.includes(SUBSTRING_LEYENDA_CC_NUEVA_REGLA_EMPRESA_ASUME_MONR)
    );
  };
  const list = rowsCcCliente || [];
  const idxPorClave = new Map();
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    if (!r || r.es_movimiento_manual === true) continue;
    if (String(r.orden_id || '') !== String(ordenId || '')) continue;
    if (!plainComp(r.concepto)) continue;
    const tid = r.transaccion_id != null && String(r.transaccion_id).trim() !== '' ? String(r.transaccion_id) : '';
    const tn = r.transaccion_numero != null && String(r.transaccion_numero).trim() !== '' ? String(r.transaccion_numero) : '';
    if (!tid && !tn) continue;
    const k = [String(r.cliente_id || ''), tid, tn, String(r.moneda || '').toUpperCase(), String(r.concepto || '').slice(0, 140)].join('\t');
    if (!idxPorClave.has(k)) idxPorClave.set(k, []);
    idxPorClave.get(k).push(i);
  }
  const omit = new Set();
  for (const [, idxs] of idxPorClave) {
    if (idxs.length !== 2) continue;
    const [i1, i2] = idxs;
    const a = list[i1];
    const b = list[i2];
    const m1 = Number(a.monto);
    const m2 = Number(b.monto);
    if (!Number.isFinite(m1) || !Number.isFinite(m2)) continue;
    if (Math.abs(m1 + m2) > tol) continue;
    if (ordenEsCruceDosMonedasDistintas(orden)) continue;
    const mc = !!usarMulticontraparteManual;
    const mrOrd = Number(orden && orden.monto_recibido) || 0;
    const meOrd = Number(orden && orden.monto_entregado) || 0;
    const monRCat = String(monedaCatalogoParaOrden(orden && orden.moneda_recibida) || '').toUpperCase();
    const monECat = String(monedaCatalogoParaOrden(orden && orden.moneda_entregada) || '').toUpperCase();
    const mcUsdUsdSpreadMePareado =
      mc &&
      orden &&
      monRCat &&
      monRCat === monECat &&
      mrOrd > meOrd + tol &&
      Math.abs(Math.abs(m1) - meOrd) <= tol &&
      Math.abs(Math.abs(m2) - meOrd) <= tol;
    if (m1 > 0 && m2 < 0) omit.add(mc ? (mcUsdUsdSpreadMePareado ? i2 : i1) : i2);
    else if (m2 > 0 && m1 < 0) omit.add(mc ? (mcUsdUsdSpreadMePareado ? i1 : i2) : i1);
  }
  if (omit.size === 0) return list;
  return list.filter((_, i) => !omit.has(i));
}

test('dedupe plano: dos Compromiso idénticos ± sin MC elimina el −m', () => {
  const oid = 'o1';
  const orden = { moneda_recibida: 'USD', moneda_entregada: 'USD' };
  const concepto = 'Compromiso de Pago - Orden 1 y Trans 5';
  const rows = [
    { cliente_id: 'c', orden_id: oid, transaccion_id: 't1', transaccion_numero: '5', moneda: 'USD', concepto, monto: 100 },
    { cliente_id: 'c', orden_id: oid, transaccion_id: 't1', transaccion_numero: '5', moneda: 'USD', concepto, monto: -100 },
  ];
  const out = filasCcClienteSinCompromisoPagoPlanoEspejoMismaTrx(rows, oid, false, orden);
  assert.equal(out.length, 1);
  assert.ok(out[0].monto > 0);
});

test('dedupe plano: cruce USD/ARS no elimina (orden distinta moneda)', () => {
  const oid = 'o1';
  const orden = { moneda_recibida: 'USD', moneda_entregada: 'ARS' };
  const c = 'Compromiso de Pago - Orden 1 y Trans 5';
  const rows = [
    { cliente_id: 'c', orden_id: oid, transaccion_id: 't1', transaccion_numero: '5', moneda: 'USD', concepto: c, monto: 100 },
    { cliente_id: 'c', orden_id: oid, transaccion_id: 't1', transaccion_numero: '5', moneda: 'USD', concepto: c, monto: -100 },
  ];
  const out = filasCcClienteSinCompromisoPagoPlanoEspejoMismaTrx(rows, oid, false, orden);
  assert.equal(out.length, 2);
});

test('dedupe: plantillas MonE §1.2.1 distintas (compromiso vs pago) no comparten clave → no borra', () => {
  const oid = 'o1';
  const orden = { moneda_recibida: 'USD', moneda_entregada: 'USD' };
  const nro = '9';
  const rows = [
    {
      cliente_id: 'c',
      orden_id: oid,
      transaccion_id: 'eg',
      transaccion_numero: nro,
      moneda: 'USD',
      concepto: conceptoPlantillaMonE(true, 1, nro, 'ejecutado'),
      monto: -50,
    },
    {
      cliente_id: 'c',
      orden_id: oid,
      transaccion_id: 'eg',
      transaccion_numero: nro,
      moneda: 'USD',
      concepto: conceptoPlantillaMonE(false, 1, nro, 'ejecutado'),
      monto: 50,
    },
  ];
  const out = filasCcClienteSinCompromisoPagoPlanoEspejoMismaTrx(rows, oid, false, orden);
  assert.equal(out.length, 2);
});

test('dedupe MC USD-USD spread: conserva +me y quita −me duplicado', () => {
  const oid = 'o1';
  const orden = {
    moneda_recibida: 'USD',
    moneda_entregada: 'USD',
    monto_recibido: 2000,
    monto_entregado: 1900,
  };
  const c = 'Compromiso de Pago - Orden 1 y Trans 5';
  const rows = [
    { cliente_id: 'c', orden_id: oid, transaccion_id: 't1', transaccion_numero: '5', moneda: 'USD', concepto: c, monto: 1900 },
    { cliente_id: 'c', orden_id: oid, transaccion_id: 't1', transaccion_numero: '5', moneda: 'USD', concepto: c, monto: -1900 },
  ];
  const out = filasCcClienteSinCompromisoPagoPlanoEspejoMismaTrx(rows, oid, true, orden);
  assert.equal(out.length, 1);
  assert.equal(out[0].monto, 1900);
});

// --- D: guardas explícitas (documentación ejecutable)

test('flip quitar compromiso: fila con §1.3.4 está protegida (criterio main.js 11595–11600)', () => {
  const c = 'Compromiso de Pago - Orden 1 (' + SUBSTRING_LEYENDA_CC_NUEVA_REGLA_EMPRESA_ASUME_MONR + ')';
  const protegida =
    c.includes(SUBSTRING_LEYENDA_CC_REGLA_B_PANDY_PATA_MONR) ||
    c.includes(SUBSTRING_LEYENDA_CC_TERcERO_PATA_MONR) ||
    c.includes(SUBSTRING_LEYENDA_CC_NUEVA_REGLA_EMPRESA_ASUME_MONR);
  assert.equal(protegida, true);
});

test('residual simulado: sumRaw − offsetMonR − offsetComp encaja (ej. con compensación)', () => {
  const EPS = 1e-6;
  const cid = 'c';
  const oid = 'o';
  const mon = 'USD';
  const rows = [
    { cliente_id: cid, orden_id: oid, moneda: mon, estado: 'cerrado', concepto: '(' + SUBSTRING_LEYENDA_CC_NUEVA_REGLA_EMPRESA_ASUME_MONR + ')', monto: 1000 },
    { cliente_id: cid, orden_id: oid, moneda: mon, estado: 'cerrado', concepto: 'Compensación total en cuenta corriente- Orden 1 y Trans 2', monto: 1000 },
  ];
  const sumRaw = 2000;
  const sumPrestGemelo = 0;
  const sum = sumRaw - sumPrestGemelo;
  const offsetMonR = sumaMovimientosPataMonRExentosNeteo(rows, cid, oid, mon);
  const offsetComp = sumaMovimientosCompensacionParcialTotalCcExentosNeteo(rows, cid, oid, mon);
  const residual = sum - offsetMonR - offsetComp;
  assert.ok(Math.abs(residual) <= EPS);
});
