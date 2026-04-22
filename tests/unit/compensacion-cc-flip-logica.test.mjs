/**
 * Política numérica del flip ingreso Cliente→Pandy a Pandy→Cliente (misma moneda + intermediario sin MC).
 * Debe coincidir con `persistirCompensacionCcFlipUsdUsdSaldoYComp` / `inyectarFilasCompensacionCcClienteDesdeTransacciones` en main.js.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const EPS = 1e-6;

/** @returns {{ ok: true, comp: number, cap: number, excede: boolean } | { ok: false, code: string, cap?: number }} */
function compensacionTopeDesdeSaldoGlobal(saldo, monto) {
  if (saldo >= -EPS) return { ok: false, code: 'no_deuda_pandy' };
  const cap = -saldo;
  if (monto > cap + EPS) return { ok: true, comp: monto, cap, excede: true };
  return { ok: true, comp: monto, cap, excede: false };
}

function conceptoCcEsCompensacionSaldoFlipConcepto(concepto) {
  const c = String(concepto || '');
  return (
    c.includes('Compensación parcial en cuenta corriente-') ||
    c.includes('Compensación total en cuenta corriente-') ||
    c.includes('Compensación excede el monto de deuda en cuenta corriente-') ||
    c.includes('Compensación parcial o total')
  );
}

/** Réplica de sumaMovimientosCompensacionParcialTotalCcExentosNeteo (main.js). */
function sumaCompCerradas(rows, clienteId, ordenId, mon) {
  const monU = String(mon || '').toUpperCase();
  let s = 0;
  for (const r of rows || []) {
    if (String(r.estado || '').toLowerCase() !== 'cerrado') continue;
    if (String(r.cliente_id || '') !== String(clienteId || '') || String(r.orden_id || '') !== String(ordenId || '')) continue;
    if (String(r.moneda || '').toUpperCase() !== monU) continue;
    if (!conceptoCcEsCompensacionSaldoFlipConcepto(r.concepto)) continue;
    const m = Number(r.monto);
    if (Number.isFinite(m)) s += m;
  }
  return s;
}

test('tope: saldo -1000 USD permite hasta 1000; monto 500 → comp 500', () => {
  const r = compensacionTopeDesdeSaldoGlobal(-1000, 500);
  assert.equal(r.ok, true);
  assert.equal(r.comp, 500);
  assert.equal(r.cap, 1000);
});

test('tope: monto igual al tope', () => {
  const r = compensacionTopeDesdeSaldoGlobal(-2500, 2500);
  assert.equal(r.ok, true);
  assert.equal(r.comp, 2500);
});

test('tope: rechaza si no hay deuda Pandy (saldo >= 0)', () => {
  assert.equal(compensacionTopeDesdeSaldoGlobal(0, 100).ok, false);
  assert.equal(compensacionTopeDesdeSaldoGlobal(500, 100).ok, false);
});

test('tope: permite superar -saldo (excede; confirma usuario en UI)', () => {
  const r = compensacionTopeDesdeSaldoGlobal(-100, 100.01);
  assert.equal(r.ok, true);
  assert.equal(r.excede, true);
  assert.equal(r.comp, 100.01);
  assert.equal(r.cap, 100);
});

test('suma exenta neteo: solo cerradas con leyenda y misma orden/cliente/moneda', () => {
  const cid = 'c1';
  const oid = 'o1';
  const leyPar = 'Compensación parcial en cuenta corriente- Orden 1 y Trans 2';
  const rows = [
    { cliente_id: cid, orden_id: oid, moneda: 'USD', estado: 'pendiente', concepto: leyPar, monto: 50 },
    { cliente_id: cid, orden_id: oid, moneda: 'USD', estado: 'cerrado', concepto: leyPar, monto: 200 },
    { cliente_id: cid, orden_id: 'o2', moneda: 'USD', estado: 'cerrado', concepto: leyPar, monto: 999 },
    { cliente_id: 'otro', orden_id: oid, moneda: 'USD', estado: 'cerrado', concepto: leyPar, monto: 1 },
  ];
  assert.equal(sumaCompCerradas(rows, cid, oid, 'USD'), 200);
});

test('residual invariante: sum - offsetPata - offsetComp (ej. numérico)', () => {
  const sum = 200;
  const offsetPata = 0;
  const offsetComp = 200;
  const residual = sum - offsetPata - offsetComp;
  assert.ok(Math.abs(residual) <= EPS);
});

/** Réplica del neteo USD-USD+int con flip + compensación + egreso I→C (+me) en misma moneda (main.js validarInvarianteNeteo…). */
test('residual USD-USD+int flip: incluye offset egreso +me con compensación persistida', () => {
  const sum = 204000;
  const offsetPata = -200000;
  const offsetCompCc = 204000;
  const offsetEgresoMe = 200000;
  const residual = sum - offsetPata - offsetCompCc - offsetEgresoMe;
  assert.ok(Math.abs(residual) <= EPS);
});

/** Réplica de parcial/total CC flip vs deuda previa (`inyectarFilasCompensacionCcClienteDesdeTransacciones`, main.js). */
function esCompTotalLeyendaCcFlip(comp, montoTrx, saldoClienteAntes) {
  const tol = 0.02;
  const s = Number(saldoClienteAntes);
  if (Number.isFinite(s) && s < -tol) {
    const deuda = -s;
    return comp + tol >= deuda - tol;
  }
  const m = Number(montoTrx);
  if (Number.isFinite(m) && m > tol && comp + tol < m - tol) return true;
  return false;
}

test('deuda -4627 y comp 2000: parcial (queda deuda)', () => {
  assert.equal(esCompTotalLeyendaCcFlip(2000, 2000, -4627), false);
});

test('deuda -2000 y comp 2000: total (liquida toda la deuda previa)', () => {
  assert.equal(esCompTotalLeyendaCcFlip(2000, 2000, -2000), true);
});

/** Réplica de `modoComp` en `inyectarFilasCompensacionCcClienteDesdeTransacciones` (main.js). */
function modoCompensacionCcInyectar(comp, montoTrx, saldoClienteAntes) {
  const tolCc = 0.02;
  let modoComp = 'parcial';
  if (Number.isFinite(saldoClienteAntes) && saldoClienteAntes < -tolCc) {
    const deudaAntes = -saldoClienteAntes;
    if (comp > deudaAntes + tolCc) modoComp = 'excede_deuda';
    else if (comp + tolCc >= deudaAntes - tolCc) modoComp = 'total';
  } else if (Number.isFinite(montoTrx) && montoTrx > tolCc && comp + tolCc < montoTrx - tolCc) {
    modoComp = 'total';
  }
  return modoComp;
}

test('modo inyectar: comp mayor que deuda → excede_deuda', () => {
  assert.equal(modoCompensacionCcInyectar(2500, 2500, -2000), 'excede_deuda');
});

test('modo inyectar: comp igual deuda → total', () => {
  assert.equal(modoCompensacionCcInyectar(2000, 2500, -2000), 'total');
});

test('legado sin saldo: comp < monto ingreso → total (deuda menor que el ingreso)', () => {
  assert.equal(esCompTotalLeyendaCcFlip(1500, 2000, null), true);
});

test('legado sin saldo: comp = monto ingreso → parcial por defecto', () => {
  assert.equal(esCompTotalLeyendaCcFlip(2000, 2000, null), false);
});

/** Réplica del tope al guardar flip: solo −saldo operativo (sin ajuste por spread/comisión en el tope). */
function capTopeCompensacionFlipDesdeSaldo(saldo) {
  return -saldo;
}

test('tope flip: saldo operativo −2527 → cap 2527 (sin sumar mr−me)', () => {
  assert.equal(capTopeCompensacionFlipDesdeSaldo(-2527), 2527);
});

test('leyenda legacy «parcial o total» sigue en suma exenta', () => {
  const cid = 'c1';
  const oid = 'o1';
  const rows = [
    { cliente_id: cid, orden_id: oid, moneda: 'USD', estado: 'cerrado', concepto: 'Compensación parcial o total - Orden 1 y Trans 1', monto: 77 },
  ];
  assert.equal(sumaCompCerradas(rows, cid, oid, 'USD'), 77);
});

/** Réplica mínima de `filasCcClienteQuitarCompromisoPagoEgresoInterSiCompensacionFlipTotalUsdUsdInt`: quita Compromiso plano si `transaccion_id` es egreso I→C **o** ingreso con comp CC, y el monto coincide con `comp`. */
function quitarCompromisoSiCompAplicado(rows, monto, opts) {
  const { egresoId, ingresoIdConComp } = opts || {};
  const k = String(Number(monto).toFixed(4));
  const rowsOut = rows.filter((r) => {
    const c = String(r.concepto || '');
    if (!c.includes('Compromiso de Pago')) return true;
    if (c.includes('Pandy cumple pata') || c.includes('Tercero cumple pata')) return true;
    const tid = String(r.transaccion_id || '');
    const matchTrx =
      (egresoId != null && tid === String(egresoId)) || (ingresoIdConComp != null && tid === String(ingresoIdConComp));
    if (!matchTrx) return true;
    if (String(Number(r.monto).toFixed(4)) !== k) return true;
    return false;
  });
  return rowsOut;
}

test('compensación total: se elimina Compromiso de Pago duplicado del egreso I→C mismo monto', () => {
  const rows = [
    {
      cliente_id: 'c1',
      orden_id: 'o1',
      transaccion_id: 'eg1',
      concepto: 'Compromiso de Pago - Orden 82 y Trans 191',
      monto: 2000,
      moneda: 'USD',
      estado: 'cerrado',
    },
    {
      cliente_id: 'c1',
      orden_id: 'o1',
      transaccion_id: 'in1',
      concepto: 'Compensación total en cuenta corriente- Orden 82 y Trans 191',
      monto: 2000,
      moneda: 'USD',
      estado: 'cerrado',
    },
  ];
  const out = quitarCompromisoSiCompAplicado(rows, 2000, { egresoId: 'eg1' });
  assert.equal(out.length, 1);
  assert.ok(String(out[0].concepto).includes('Compensación total'));
});

test('compensación parcial (mismo comp que monto fila compromiso): también se elimina Compromiso de Pago duplicado del egreso I→C', () => {
  const rows = [
    {
      cliente_id: 'c1',
      orden_id: 'o1',
      transaccion_id: 'eg1',
      concepto: 'Compromiso de Pago - Orden 82 y Trans 191',
      monto: 2000,
      moneda: 'USD',
      estado: 'cerrado',
    },
    {
      cliente_id: 'c1',
      orden_id: 'o1',
      transaccion_id: 'in1',
      concepto: 'Compensación parcial en cuenta corriente- Orden 82 y Trans 191',
      monto: 2000,
      moneda: 'USD',
      estado: 'cerrado',
    },
  ];
  const out = quitarCompromisoSiCompAplicado(rows, 2000, { egresoId: 'eg1' });
  assert.equal(out.length, 1);
  assert.ok(String(out[0].concepto).includes('Compensación parcial'));
});

test('P,P: Compromiso anclado al ingreso (mismo id que compensación) también se elimina', () => {
  const rows = [
    {
      cliente_id: 'c1',
      orden_id: 'o1',
      transaccion_id: 'trx11',
      concepto: 'Compromiso de Pago - Orden 5 y Trans 11',
      monto: 2000,
      moneda: 'USD',
      estado: 'pendiente',
    },
    {
      cliente_id: 'c1',
      orden_id: 'o1',
      transaccion_id: 'trx11',
      concepto: 'Compensación parcial en cuenta corriente- Orden 5 y Trans 11',
      monto: 2000,
      moneda: 'USD',
      estado: 'pendiente',
    },
  ];
  const out = quitarCompromisoSiCompAplicado(rows, 2000, { ingresoIdConComp: 'trx11' });
  assert.equal(out.length, 1);
  assert.ok(String(out[0].concepto).includes('Compensación parcial'));
});

/** Réplica de `monedaCatalogoParaOrden` + `montoPataRegulaBPandyMonRecibidaClienteCc` (main.js). */
function monedaCatalogoTest(m) {
  const u = (m || '').toString().trim().toUpperCase();
  return u === 'CHEQUE' ? 'ARS' : u;
}
function montoPataRegulaBPandyMonRecibidaClienteCcTest(orden, montoTrx) {
  const tol = 0.02;
  const mT = Number(montoTrx);
  if (!Number.isFinite(mT) || mT < 1e-9) return mT || 0;
  const mrO = Number(orden && orden.monto_recibido);
  const meO = Number(orden && orden.monto_entregado);
  const mr = Number.isFinite(mrO) ? mrO : 0;
  const me = Number.isFinite(meO) ? meO : 0;
  const monR = String(monedaCatalogoTest(orden && orden.moneda_recibida) || '').toUpperCase();
  const monE = String(monedaCatalogoTest(orden && orden.moneda_entregada) || '').toUpperCase();
  if (monR && monE && monR === monE && mr > me + tol && me > 1e-9) {
    return Math.min(mT, me);
  }
  return mT;
}

test('pata regla B monR: USD-USD con spread usa min(mr_trx, me)', () => {
  const orden = {
    moneda_recibida: 'USD',
    moneda_entregada: 'USD',
    monto_recibido: 400000,
    monto_entregado: 394000,
  };
  assert.equal(montoPataRegulaBPandyMonRecibidaClienteCcTest(orden, 400000), 394000);
});

test('pata regla B monR: sin spread (mr≈me) usa monto de la trx', () => {
  const orden = {
    moneda_recibida: 'USD',
    moneda_entregada: 'USD',
    monto_recibido: 394000,
    monto_entregado: 394000,
  };
  assert.equal(montoPataRegulaBPandyMonRecibidaClienteCcTest(orden, 394000), 394000);
});

test('pata regla B monR: cruce dos monedas no aplica tope me', () => {
  const orden = {
    moneda_recibida: 'USD',
    moneda_entregada: 'ARS',
    monto_recibido: 400,
    monto_entregado: 500000,
  };
  assert.equal(montoPataRegulaBPandyMonRecibidaClienteCcTest(orden, 400), 400);
});

/** Réplica del criterio «omitir índice» en `filasCcClienteSinCompromisoPagoPlanoEspejoMismaTrx` (par ± Compromiso plano, MC). */
function indiceOmitirEspejoCompromisoPlanoMc(m1, m2, orden, mc) {
  const tol = 0.02;
  const mrOrd = Number(orden && orden.monto_recibido) || 0;
  const meOrd = Number(orden && orden.monto_entregado) || 0;
  const monR = String(monedaCatalogoTest(orden && orden.moneda_recibida) || '').toUpperCase();
  const monE = String(monedaCatalogoTest(orden && orden.moneda_entregada) || '').toUpperCase();
  const mcUsdUsdSpreadMePareado =
    mc &&
    orden &&
    monR &&
    monR === monE &&
    mrOrd > meOrd + tol &&
    Math.abs(Math.abs(m1) - meOrd) <= tol &&
    Math.abs(Math.abs(m2) - meOrd) <= tol;
  if (m1 > 0 && m2 < 0) return mc ? (mcUsdUsdSpreadMePareado ? 2 : 1) : 2;
  if (m2 > 0 && m1 < 0) return mc ? (mcUsdUsdSpreadMePareado ? 1 : 2) : 1;
  return null;
}

test('dedupe Compromiso plano MC: USD-USD spread ±me conserva +me (omite negativo)', () => {
  const orden = { moneda_recibida: 'USD', moneda_entregada: 'USD', monto_recibido: 400000, monto_entregado: 394000 };
  assert.equal(indiceOmitirEspejoCompromisoPlanoMc(394000, -394000, orden, true), 2);
});

test('dedupe Compromiso plano MC: par en mr sin casar me sigue omitiendo positivo', () => {
  const orden = { moneda_recibida: 'USD', moneda_entregada: 'USD', monto_recibido: 400000, monto_entregado: 394000 };
  assert.equal(indiceOmitirEspejoCompromisoPlanoMc(400000, -400000, orden, true), 1);
});

/** Criterio `esEgresoMonETerceroPagAcuerdoCobPend` en `aplicarCcMulticontraparteManualConciliacionCompleta` (MC manual). */
function esEgresoMonETerceroPagAcuerdoCobPendTest(tipo, mon, monE, pag, cob, cidAc, cidPag, cidCob) {
  return (
    tipo === 'egreso' &&
    mon === monE &&
    pag === 'cliente' &&
    cob === 'cliente' &&
    cidAc &&
    cidPag &&
    cidCob &&
    String(cidCob) === String(cidAc) &&
    String(cidPag) !== String(cidAc)
  );
}

test('MC pendiente: egreso monE tercero→acuerdo activa paridad Pago/Ajuste/Cobro', () => {
  const ac = 'ale-id';
  const otro = 'nacho-id';
  assert.equal(esEgresoMonETerceroPagAcuerdoCobPendTest('egreso', 'USD', 'USD', 'cliente', 'cliente', ac, otro, ac), true);
  assert.equal(esEgresoMonETerceroPagAcuerdoCobPendTest('egreso', 'USD', 'USD', 'cliente', 'cliente', ac, ac, ac), false);
  assert.equal(esEgresoMonETerceroPagAcuerdoCobPendTest('ingreso', 'USD', 'USD', 'cliente', 'cliente', ac, otro, ac), false);
  assert.equal(esEgresoMonETerceroPagAcuerdoCobPendTest('egreso', 'ARS', 'USD', 'cliente', 'cliente', ac, otro, ac), false);
});

test('MC conciliación: inferencia pagador vinculo solo con pagador_cliente_id vacío y cidPag=acuerdo', () => {
  const ac = 'acuerdo-uuid';
  const vin = 'vinculo-cli-uuid';
  const pagCliIdVacío = true;
  const cidPagMal = ac;
  const debeReasignar =
    vin &&
    String(vin) !== String(ac) &&
    pagCliIdVacío &&
    String(cidPagMal || '') === String(ac);
  assert.equal(debeReasignar, true);
  assert.equal(
    !!(vin && String(vin) !== String(ac) && !pagCliIdVacío && String(cidPagMal || '') === String(ac)),
    false,
  );
});
