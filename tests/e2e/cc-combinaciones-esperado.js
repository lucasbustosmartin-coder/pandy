// @ts-check
const { withSeedCajaCheque } = require('./e2e-caja-seed-saldos');

/**
 * Datos fijos y expectativas por combinación de estados (Tx1, Tx2, Tx3, Tx4)
 * para CHEQUE-ARS con intermediario (mismo flujo que ARS-ARS). Mismo acuerdo: 200k, 195k, 197k, 5k, 3k.
 * Excluidas: P,P,E,P y P,E,E,E (validación app); y todo patrón Tx1=P y Tx3=E
 * (P,P,E,E y P,E,E,P), porque no puede darse que el cliente no haya cobrado y el
 * intermediario ya haya recibido. Quedan 12 combinaciones.
 *
 * Referencia: sql/cc_modelo_reglas_todas_combinaciones.sql (histórico) / `reglas_de_negocio` canónico.
 * Derivación por combinación: docs/CC_COMBINACIONES_ESPERADO_DERIVACION.md
 *
 * Tx1–Tx2: Cliente↔Pandy (cheque / efectivo). Tx3–Tx4: circuito explícito Pandy↔Intermediario
 * en instrumentación (no son compensatorias automáticas al editar montos).
 */

/** Montos fijos del acuerdo de prueba (mismo que usamos en manual). */
const DATOS_FIJOS = {
  montoRecibido: 200000, // Tx1 Cliente→Pandy
  montoEntregado: 195000, // Tx2 Pandy→Cliente
  montoEfectivoInt: 197000, // Tx4 Int→Pandy (con tasa)
  /** En CC cliente, la fila «Comisión del acuerdo» debe ser el spread **mr − me** (5000), no la parte neta en `comisiones_orden` para beneficiario pandy (2000 si int. se lleva 3000). Ver `main.js` `comisionSpreadAcuerdoClienteCheque`. */
  comisionPandy: 5000,
  comisionInt: 3000,
};

/**
 * Expectativas por combinación. tx1..tx4: 'E' | 'P'.
 * saldoCajaEfectivoARS: solo movimientos efectivo (Tx2, Tx4). Tx1 y Tx3 son cheque.
 * saldoCajaChequeARS: Tx1 E = +200k (ingreso cheque), Tx3 E = -200k (Pandy entrega cheque al int).
 *
 * detalleInt: montos persistidos en CC intermediario (+cheque, −comisión; −197k en Tx4 al cerrar). saldoIntARS sigue en convención E2E (saldoResumenANumero con intermediario).
 */
const COMBINACIONES_ESPERADO_RAW = [
  // 1. P,P,P,P
  { id: 'P,P,P,P', tx1: 'P', tx2: 'P', tx3: 'P', tx4: 'P', saldoClienteARS: 0, saldoIntARS: 0, detalleCliente: [], detalleInt: [], saldoCajaEfectivoARS: 0, saldoCajaChequeARS: 0 },
  // 2. P,P,P,E
  { id: 'P,P,P,E', tx1: 'P', tx2: 'P', tx3: 'P', tx4: 'E', saldoClienteARS: 0, saldoIntARS: -197000, detalleCliente: [], detalleInt: [200000, -3000], saldoCajaEfectivoARS: 197000, saldoCajaChequeARS: 0 },
  // 3. P,E,P,P
  { id: 'P,E,P,P', tx1: 'P', tx2: 'E', tx3: 'P', tx4: 'P', saldoClienteARS: 200000, saldoIntARS: 0, detalleCliente: [195000, 5000], detalleInt: [], saldoCajaEfectivoARS: -195000, saldoCajaChequeARS: 0 },
  // 4. P,E,P,E
  { id: 'P,E,P,E', tx1: 'P', tx2: 'E', tx3: 'P', tx4: 'E', saldoClienteARS: 200000, saldoIntARS: -197000, detalleCliente: [195000, 5000], detalleInt: [200000, -3000], saldoCajaEfectivoARS: 2000, saldoCajaChequeARS: 0 },
  // 5. E,P,P,P — Tx1 E = ingreso cheque; comisión Pandy +5k en CC → saldo neto −195k (200k − comisión), detalle [−200k, +5k]
  { id: 'E,P,P,P', tx1: 'E', tx2: 'P', tx3: 'P', tx4: 'P', saldoClienteARS: -195000, saldoIntARS: 0, detalleCliente: [-200000, 5000], detalleInt: [], saldoCajaEfectivoARS: 0, saldoCajaChequeARS: 200000 },
  // 6. E,P,P,E
  { id: 'E,P,P,E', tx1: 'E', tx2: 'P', tx3: 'P', tx4: 'E', saldoClienteARS: -195000, saldoIntARS: -197000, detalleCliente: [-200000, 5000], detalleInt: [200000, -3000], saldoCajaEfectivoARS: 197000, saldoCajaChequeARS: 200000 },
  // 7. E,P,E,P — Tx1 +200k cheque, Tx3 -200k cheque (Pandy entrega) → saldo cheque 0
  { id: 'E,P,E,P', tx1: 'E', tx2: 'P', tx3: 'E', tx4: 'P', saldoClienteARS: -195000, saldoIntARS: -197000, detalleCliente: [-200000, 5000], detalleInt: [200000, -3000], saldoCajaEfectivoARS: 0, saldoCajaChequeARS: 0 },
  // 8. E,P,E,E
  { id: 'E,P,E,E', tx1: 'E', tx2: 'P', tx3: 'E', tx4: 'E', saldoClienteARS: -195000, saldoIntARS: 0, detalleCliente: [-200000, 5000], detalleInt: [200000, -197000, -3000], saldoCajaEfectivoARS: 197000, saldoCajaChequeARS: 0 },
  // 9. E,E,P,P — Tx1 cheque +200k, Tx2 efectivo -195k → efectivo -195000
  { id: 'E,E,P,P', tx1: 'E', tx2: 'E', tx3: 'P', tx4: 'P', saldoClienteARS: 0, saldoIntARS: 0, detalleCliente: [-200000, 195000, 5000], detalleInt: [], saldoCajaEfectivoARS: -195000, saldoCajaChequeARS: 200000 },
  // 10. E,E,P,E — Tx2 -195k + Tx4 +197k efectivo = 2000
  { id: 'E,E,P,E', tx1: 'E', tx2: 'E', tx3: 'P', tx4: 'E', saldoClienteARS: 0, saldoIntARS: -197000, detalleCliente: [-200000, 195000, 5000], detalleInt: [200000, -3000], saldoCajaEfectivoARS: 2000, saldoCajaChequeARS: 200000 },
  // 11. E,E,E,P — Tx2 efectivo -195k; Tx1/Tx3 cheque
  { id: 'E,E,E,P', tx1: 'E', tx2: 'E', tx3: 'E', tx4: 'P', saldoClienteARS: 0, saldoIntARS: -197000, detalleCliente: [-200000, 195000, 5000], detalleInt: [200000, -3000], saldoCajaEfectivoARS: -195000, saldoCajaChequeARS: 0 },
  // 12. E,E,E,E — Tx2 -195k + Tx4 +197k efectivo = 2000
  { id: 'E,E,E,E', tx1: 'E', tx2: 'E', tx3: 'E', tx4: 'E', saldoClienteARS: 0, saldoIntARS: 0, detalleCliente: [-200000, 195000, 5000], detalleInt: [200000, -197000, -3000], saldoCajaEfectivoARS: 2000, saldoCajaChequeARS: 0 },
];

const COMBINACIONES_ESPERADO = COMBINACIONES_ESPERADO_RAW.map(withSeedCajaCheque);

module.exports = {
  DATOS_FIJOS,
  COMBINACIONES_ESPERADO,
};
