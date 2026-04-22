/**
 * Paridad lógica con `sql/inventario_nueva_regla_diff_monr_mone_cliente_prod.sql` (patrón amplio).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  esPatronAmplioCcMonrMoneNuevaRegla,
  esOrdenChequeArsDesdeOrdenPatron,
  monedaCatalogoParaOrdenPatron,
  NUEVA_REGLA_CC_ROLLOUT_EXCLUIR_NUMEROS_ORDEN_SALDO_4_4,
  ordenNumeroExcluidoRolloutNuevaReglaCc,
  nuevaReglaCcRolloutActivoParaOrden,
} from '../../utils/cc-patron-nueva-regla-monr-mone.mjs';

const clienteId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function ordenBase(over = {}) {
  return {
    id: 'ord-1',
    estado: 'pendiente_instrumentacion',
    cliente_id: clienteId,
    moneda_recibida: 'USD',
    moneda_entregada: 'ARS',
    tipo_operacion_codigo: 'USD-ARS',
    ...over,
  };
}

function trxIngMonR(over = {}) {
  return {
    id: 'tx-in',
    tipo: 'ingreso',
    estado: 'pendiente',
    pagador: 'pandy',
    cobrador: 'cliente',
    cobrador_cliente_id: clienteId,
    moneda: 'USD',
    monto: 100,
    ...over,
  };
}

function trxEgMonE(over = {}) {
  return {
    id: 'tx-eg',
    tipo: 'egreso',
    estado: 'pendiente',
    pagador: 'intermediario',
    cobrador: 'cliente',
    cobrador_cliente_id: null,
    moneda: 'ARS',
    monto: 50000,
    ...over,
  };
}

test('CHEQUE-ARS: patrón no aplica', () => {
  const orden = ordenBase({
    tipo_operacion_codigo: 'CHEQUE-ARS',
    moneda_recibida: 'ARS',
    moneda_entregada: 'ARS',
  });
  assert.equal(esOrdenChequeArsDesdeOrdenPatron(orden), true);
  assert.equal(esPatronAmplioCcMonrMoneNuevaRegla(orden, [trxIngMonR(), trxEgMonE({ moneda: 'ARS' })]), false);
});

test('orden anulada: false', () => {
  const orden = ordenBase({ estado: 'anulada' });
  assert.equal(esPatronAmplioCcMonrMoneNuevaRegla(orden, [trxIngMonR(), trxEgMonE()]), false);
});

test('sin cliente_id: false', () => {
  const orden = ordenBase({ cliente_id: null });
  assert.equal(esPatronAmplioCcMonrMoneNuevaRegla(orden, [trxIngMonR(), trxEgMonE()]), false);
});

test('solo ingreso MonR sin egreso MonE: false', () => {
  const orden = ordenBase();
  assert.equal(esPatronAmplioCcMonrMoneNuevaRegla(orden, [trxIngMonR()]), false);
});

test('ingreso sin cobrador_cliente_id explícito acuerdo: false', () => {
  const orden = ordenBase();
  const ing = trxIngMonR({ cobrador_cliente_id: null });
  assert.equal(esPatronAmplioCcMonrMoneNuevaRegla(orden, [ing, trxEgMonE()]), false);
});

test('patrón amplio USD-ARS + int: ingreso P→C monR + egreso Int→C monE con cobrador_cliente_id null: true', () => {
  const orden = ordenBase();
  const txs = [trxIngMonR(), trxEgMonE()];
  assert.equal(esPatronAmplioCcMonrMoneNuevaRegla(orden, txs), true);
});

test('egreso MonE con cobrador_cliente_id = acuerdo: true', () => {
  const orden = ordenBase();
  const txs = [trxIngMonR(), trxEgMonE({ cobrador_cliente_id: clienteId, pagador: 'pandy' })];
  assert.equal(esPatronAmplioCcMonrMoneNuevaRegla(orden, txs), true);
});

test('CHEQUE en catálogo orden → monR catálogo ARS', () => {
  assert.equal(monedaCatalogoParaOrdenPatron('CHEQUE'), 'ARS');
});

test('trx anulada no cuenta para el patrón', () => {
  const orden = ordenBase();
  const txs = [trxIngMonR({ estado: 'anulada' }), trxEgMonE()];
  assert.equal(esPatronAmplioCcMonrMoneNuevaRegla(orden, txs), false);
});

test('rollout: orden 68 (§4.4) excluida aunque el patrón sea true', () => {
  const orden = ordenBase({ numero: 68 });
  const txs = [trxIngMonR(), trxEgMonE()];
  assert.equal(esPatronAmplioCcMonrMoneNuevaRegla(orden, txs), true);
  assert.equal(ordenNumeroExcluidoRolloutNuevaReglaCc(orden), true);
  assert.equal(nuevaReglaCcRolloutActivoParaOrden(orden, txs), false);
});

test('rollout: orden 14 (post-deploy prod) excluida aunque el patrón sea true', () => {
  const orden = ordenBase({ numero: 14 });
  const txs = [trxIngMonR(), trxEgMonE()];
  assert.equal(esPatronAmplioCcMonrMoneNuevaRegla(orden, txs), true);
  assert.equal(nuevaReglaCcRolloutActivoParaOrden(orden, txs), false);
});

test('rollout: orden número 999 no excluida → activo si patrón true', () => {
  const orden = ordenBase({ numero: 999 });
  const txs = [trxIngMonR(), trxEgMonE()];
  assert.equal(nuevaReglaCcRolloutActivoParaOrden(orden, txs), true);
});

test('rollout: sin numero de orden → no activo', () => {
  const orden = ordenBase({ numero: null });
  const txs = [trxIngMonR(), trxEgMonE()];
  assert.equal(esPatronAmplioCcMonrMoneNuevaRegla(orden, txs), true);
  assert.equal(nuevaReglaCcRolloutActivoParaOrden(orden, txs), false);
});

test('lista exclusión rollout tiene 15 números (§4.4 + post-deploy prod)', () => {
  assert.equal(NUEVA_REGLA_CC_ROLLOUT_EXCLUIR_NUMEROS_ORDEN_SALDO_4_4.length, 15);
});
