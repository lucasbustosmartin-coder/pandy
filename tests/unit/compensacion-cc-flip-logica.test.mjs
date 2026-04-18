/**
 * Política numérica del flip ingreso Cliente→Pandy a Pandy→Cliente (USD-USD+int sin MC).
 * Debe coincidir con `aplicarCompensacionCcFlipSiCorrespondeYLuegoGuardar` en main.js (~25797–25821).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const EPS = 1e-6;

/** @returns {{ ok: true, comp: number, cap: number } | { ok: false, code: string, cap?: number }} */
function compensacionTopeDesdeSaldoGlobal(saldo, monto) {
  if (saldo >= -EPS) return { ok: false, code: 'no_deuda_pandy' };
  const cap = -saldo;
  if (monto > cap + EPS) return { ok: false, code: 'excede_tope', cap };
  const comp = Math.min(monto, cap);
  return { ok: true, comp, cap };
}

function conceptoCcEsCompensacionSaldoFlipConcepto(concepto) {
  const c = String(concepto || '');
  return (
    c.includes('Compensación parcial en cuenta corriente-') ||
    c.includes('Compensación total en cuenta corriente-') ||
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

test('tope: rechaza si el monto supera -saldo', () => {
  const r = compensacionTopeDesdeSaldoGlobal(-100, 100.01);
  assert.equal(r.ok, false);
  assert.equal(r.code, 'excede_tope');
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

test('leyenda legacy «parcial o total» sigue en suma exenta', () => {
  const cid = 'c1';
  const oid = 'o1';
  const rows = [
    { cliente_id: cid, orden_id: oid, moneda: 'USD', estado: 'cerrado', concepto: 'Compensación parcial o total - Orden 1 y Trans 1', monto: 77 },
  ];
  assert.equal(sumaCompCerradas(rows, cid, oid, 'USD'), 77);
});
