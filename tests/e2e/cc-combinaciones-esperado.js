// @ts-check
/**
 * Datos fijos y expectativas por combinación de estados (Tx1, Tx2, Tx3, Tx4)
 * para ARS-ARS con intermediario. Mismo acuerdo: 200k, 195k, 197k, 5k, 3k.
 * Excluidas: P,P,E,P y P,E,E,E (validación app); y todo patrón Tx1=P y Tx3=E
 * (P,P,E,E y P,E,E,P), porque no puede darse que el cliente no haya cobrado y el
 * intermediario ya haya recibido. Quedan 12 combinaciones.
 *
 * Referencia: sql/cc_modelo_reglas_todas_combinaciones.sql
 * Derivación por combinación: docs/CC_COMBINACIONES_ESPERADO_DERIVACION.md
 */

/** Montos fijos del acuerdo de prueba (mismo que usamos en manual). */
const DATOS_FIJOS = {
  montoRecibido: 200000,      // Tx1 Cliente→Pandy
  montoEntregado: 195000,     // Tx2 Pandy→Cliente
  montoEfectivoInt: 197000,   // Tx4 Int→Pandy (con tasa)
  comisionPandy: 5000,
  comisionInt: 3000,
};

/**
 * Expectativas por combinación. tx1..tx4: 'E' | 'P'.
 * Solo combinaciones que pueden darse (sin Tx1=P y Tx3=E; sin P,P,E,P ni P,E,E,E).
 */
const COMBINACIONES_ESPERADO = [
  // 1. P,P,P,P (todo pendiente = nadie le debe a nadie → saldo 0 ambos)
  { id: 'P,P,P,P', tx1: 'P', tx2: 'P', tx3: 'P', tx4: 'P', saldoClienteARS: 0, saldoIntARS: 0, detalleCliente: [], detalleInt: [] },
  // 2. P,P,P,E
  { id: 'P,P,P,E', tx1: 'P', tx2: 'P', tx3: 'P', tx4: 'E', saldoClienteARS: 0, saldoIntARS: -197000, detalleCliente: [], detalleInt: [-200000, 3000] },
  // 3. P,E,P,P (Tx3 y Tx4 ambas P → no se escribe nada en int; saldo int 0)
  { id: 'P,E,P,P', tx1: 'P', tx2: 'E', tx3: 'P', tx4: 'P', saldoClienteARS: 200000, saldoIntARS: 0, detalleCliente: [195000, 5000], detalleInt: [] },
  // 4. P,E,P,E
  { id: 'P,E,P,E', tx1: 'P', tx2: 'E', tx3: 'P', tx4: 'E', saldoClienteARS: 200000, saldoIntARS: -197000, detalleCliente: [195000, 5000], detalleInt: [-200000, 3000] },
  // 5. E,P,P,P (par_cliente pendiente → sin 5k cliente; Tx3/Tx4 P → int 0)
  { id: 'E,P,P,P', tx1: 'E', tx2: 'P', tx3: 'P', tx4: 'P', saldoClienteARS: -200000, saldoIntARS: 0, detalleCliente: [-200000], detalleInt: [] },
  // 6. E,P,P,E (par_cliente pendiente → sin 5k cliente)
  { id: 'E,P,P,E', tx1: 'E', tx2: 'P', tx3: 'P', tx4: 'E', saldoClienteARS: -200000, saldoIntARS: -197000, detalleCliente: [-200000], detalleInt: [-200000, 3000] },
  // 7. E,P,E,P (par_cliente pendiente → sin 5k cliente)
  { id: 'E,P,E,P', tx1: 'E', tx2: 'P', tx3: 'E', tx4: 'P', saldoClienteARS: -200000, saldoIntARS: -197000, detalleCliente: [-200000], detalleInt: [-200000, 3000] },
  // 8. E,P,E,E (par_cliente pendiente → sin 5k cliente)
  { id: 'E,P,E,E', tx1: 'E', tx2: 'P', tx3: 'E', tx4: 'E', saldoClienteARS: -200000, saldoIntARS: 0, detalleCliente: [-200000], detalleInt: [-200000, 197000, 3000] },
  // 9. E,E,P,P (Tx3 y Tx4 ambas P → int 0, sin detalle int)
  { id: 'E,E,P,P', tx1: 'E', tx2: 'E', tx3: 'P', tx4: 'P', saldoClienteARS: 0, saldoIntARS: 0, detalleCliente: [-200000, 195000, 5000], detalleInt: [] },
  // 10. E,E,P,E
  { id: 'E,E,P,E', tx1: 'E', tx2: 'E', tx3: 'P', tx4: 'E', saldoClienteARS: 0, saldoIntARS: -197000, detalleCliente: [-200000, 195000, 5000], detalleInt: [-200000, 3000] },
  // 11. E,E,E,P
  { id: 'E,E,E,P', tx1: 'E', tx2: 'E', tx3: 'E', tx4: 'P', saldoClienteARS: 0, saldoIntARS: -197000, detalleCliente: [-200000, 195000, 5000], detalleInt: [-200000, 3000] },
  // 12. E,E,E,E
  { id: 'E,E,E,E', tx1: 'E', tx2: 'E', tx3: 'E', tx4: 'E', saldoClienteARS: 0, saldoIntARS: 0, detalleCliente: [-200000, 195000, 5000], detalleInt: [-200000, 197000, 3000] },
];

module.exports = {
  DATOS_FIJOS,
  COMBINACIONES_ESPERADO,
};
