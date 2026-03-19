// @ts-check
/**
 * Expectativas por combinación (Tx1, Tx2) para tipos de operación sin intermediario con 2 transacciones.
 * Montos fijos enteros para control manual y Excel.
 *
 * Convención filas instrumentación (orden por número): Tx1 = ingreso Cliente→Pandy, Tx2 = egreso Pandy→Cliente.
 * saldoClienteUSD / saldoClienteARS: resumen CC (convención app; tolerancia ±1 en tests).
 * detalleCliente: montos en modal Ver detalle (todas las celdas USD/ARS con valor), ordenados ascendente.
 * cajaEfectivoUSD / cajaEfectivoARS: vista Cajas efectivo tras la combinación.
 *
 * Fuente de verdad: cc_modelo_reglas + sincronizarCcYCajaDesdeOrden (suma saldo = filas con cc_cliente_suma_saldo).
 * P,E: ingreso pendiente + egreso ejecutada → compromiso a cobrar en mr (moneda recibida) + compromiso de pago en me/transacción.
 */

/** ARS-USD: TC 1000, recibir 5.000.000 ARS, entregar 5.000 USD */
const ARS_USD_FIJOS = {
  cotizacion: '1000',
  montoRecibidoArs: '5000000',
  montoEntregadoUsd: 5000,
  mr: 5000000,
  me: 5000,
};

/** USD-ARS: TC 1000, recibir 5.000 USD, entregar 5.000.000 ARS */
const USD_ARS_FIJOS = {
  cotizacion: '1000',
  montoRecibidoUsd: '5000',
  montoEntregadoArs: 5000000,
  mr: 5000,
  me: 5000000,
};

/** USD-USD: importe 10.000 USD, tasa cliente 3% → entregar 9.700, comisión 300 */
const USD_USD_FIJOS = {
  importe: '10000',
  tasaCliente: '3',
  mr: 10000,
  me: 9700,
  comision: 300,
};

/**
 * @type {Array<{ id: string, tx1: string, tx2: string, saldoUSD: number, saldoARS: number, detalleCliente: number[], cajaUSD: number, cajaARS: number }>}
 */
const COMBINACIONES_ARS_USD = [
  { id: 'P,P', tx1: 'P', tx2: 'P', saldoUSD: 0, saldoARS: 0, detalleCliente: [], cajaUSD: 0, cajaARS: 0 },
  { id: 'E,P', tx1: 'E', tx2: 'P', saldoUSD: -5000, saldoARS: 0, detalleCliente: [-5000000, -5000], cajaUSD: 0, cajaARS: 5000000 },
  {
    id: 'P,E',
    tx1: 'P',
    tx2: 'E',
    saldoUSD: 5000,
    saldoARS: -5000000,
    detalleCliente: [-5000000, 5000, 5000000],
    cajaUSD: -5000,
    cajaARS: 0,
  },
  {
    id: 'E,E',
    tx1: 'E',
    tx2: 'E',
    saldoUSD: 0,
    saldoARS: 0,
    detalleCliente: [-5000000, -5000, 5000, 5000000],
    cajaUSD: -5000,
    cajaARS: 5000000,
  },
];

const COMBINACIONES_USD_ARS = [
  { id: 'P,P', tx1: 'P', tx2: 'P', saldoUSD: 0, saldoARS: 0, detalleCliente: [], cajaUSD: 0, cajaARS: 0 },
  { id: 'E,P', tx1: 'E', tx2: 'P', saldoUSD: 0, saldoARS: -5000000, detalleCliente: [-5000000, -5000], cajaUSD: 5000, cajaARS: 0 },
  {
    id: 'P,E',
    tx1: 'P',
    tx2: 'E',
    saldoUSD: -5000,
    saldoARS: 5000000,
    detalleCliente: [-5000, 5000, 5000000],
    cajaUSD: 0,
    cajaARS: -5000000,
  },
  {
    id: 'E,E',
    tx1: 'E',
    tx2: 'E',
    saldoUSD: 0,
    saldoARS: 0,
    detalleCliente: [-5000000, -5000, 5000, 5000000],
    cajaUSD: 5000,
    cajaARS: -5000000,
  },
];

const COMBINACIONES_USD_USD = [
  { id: 'P,P', tx1: 'P', tx2: 'P', saldoUSD: 0, saldoARS: 0, detalleCliente: [], cajaUSD: 0, cajaARS: 0 },
  // E,P: Tx1 cobró 10.000 (caja +10.000). CC muestra cobro bruto en monto_transaccion (−10.000); la comisión (+300) se incorpora al saldo cuando el par queda cerrado (E,E).
  { id: 'E,P', tx1: 'E', tx2: 'P', saldoUSD: -10000, saldoARS: 0, detalleCliente: [-10000], cajaUSD: 10000, cajaARS: 0 },
  {
    id: 'P,E',
    tx1: 'P',
    tx2: 'E',
    saldoUSD: -300,
    saldoARS: 0,
    detalleCliente: [-10000, 9700],
    cajaUSD: -9700,
    cajaARS: 0,
  },
  {
    id: 'E,E',
    tx1: 'E',
    tx2: 'E',
    saldoUSD: 0,
    saldoARS: 0,
    detalleCliente: [-10000, 300, 9700],
    cajaUSD: 300,
    cajaARS: 0,
  },
];

/** Catálogo activo (sync con tipos_operacion activo en Supabase) */
const TIPOS_ACTIVOS_CATALOGO = [
  { codigo: 'ARS-USD', activo: true, nTx: 2, intermediario: false },
  { codigo: 'CHEQUE-ARS', activo: true, nTx: 4, intermediario: true },
  { codigo: 'USD-USD', activo: true, nTx: 2, intermediario: false },
  { codigo: 'USD-ARS', activo: true, nTx: 2, intermediario: false },
];

module.exports = {
  ARS_USD_FIJOS,
  USD_ARS_FIJOS,
  USD_USD_FIJOS,
  COMBINACIONES_ARS_USD,
  COMBINACIONES_USD_ARS,
  COMBINACIONES_USD_USD,
  TIPOS_ACTIVOS_CATALOGO,
};
