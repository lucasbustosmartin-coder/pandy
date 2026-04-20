// @ts-check
const { E2E_CAJA_SEED, withSeedCajaTipo2tx } = require('./e2e-caja-seed-saldos');

/**
 * Expectativas por combinación (Tx1, Tx2) para tipos de operación con 2 transacciones (sin intermediario y USD-USD con intermediario).
 * Montos fijos enteros para control manual y Excel.
 *
 * Convención filas instrumentación (orden por número): Tx1 = ingreso Cliente→Pandy; Tx2 = egreso Pandy→Cliente (sin int.) o egreso Intermediario→Cliente (USD-USD con intermediario).
 * saldoClienteUSD / saldoClienteARS: resumen CC (convención app; tolerancia ±1 en tests).
 * detalleCliente: montos en modal Ver detalle (todas las celdas USD/ARS con valor), ordenados ascendente.
 * cajaEfectivoUSD / cajaEfectivoARS: vista Cajas efectivo tras la combinación.
 *
 * Fuente de verdad: sync. USD-ARS, ARS-USD y USD-USD sin int → `reglas_de_negocio` (comisión implícita mr−me en USD-USD; ver docs/USD_USD_SIN_INTERMEDIARIO.md).
 * **Saldo resumen CC (cliente):** suma algebraica de movimientos **pendiente y cerrado** (no anulados), misma regla que `ccMovimientoIncluirEnSaldoResumen` en `main.js`: lo pendiente **sí** entra en el saldo, no es un subconjunto aparte.
 * **USD-USD fixture (`USD_USD_FIJOS`):** el **margen del acuerdo** es siempre **mr − me = comisión (318)**. Eso **no** implica que el **saldo USD de la fila cliente** sea 318 en **todas** las combinaciones P/E: según qué patas estén pendientes o ejecutadas, el neto es distinto (p. ej. P,P → 318; E,P → 0 con cobro **−me**, comisión **−318** cerrada y compromiso **+mr** pendiente; P,E → +mr; E,E → 0). El test fija por combinación los valores coherentes con la tabla de reglas y el motor; ver `docs/USD_USD_SIN_INTERMEDIARIO.md` § Invariante fixture E2E.
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

/** USD-USD: importe 5.300 USD, tasa cliente 6% → me = 5300×0,94 = 4982, comisión 318 */
const USD_USD_FIJOS = {
  importe: '5300',
  tasaCliente: '6',
  mr: 5300,
  me: 4982,
  comision: 318,
};

/**
 * @type {Array<{ id: string, tx1: string, tx2: string, saldoUSD: number, saldoARS: number, detalleCliente: number[], cajaUSD: number, cajaARS: number }>}
 */
const COMBINACIONES_ARS_USD_RAW = [
  {
    id: 'P,P',
    tx1: 'P',
    tx2: 'P',
    saldoUSD: -5000,
    saldoARS: 5000000,
    // Modal «Ver detalle»: todas las celdas con valor (USD + ARS + EUR) por fila, orden asc.; P,P = −me USD y +mr ARS.
    detalleCliente: [-5000, 5000000],
    cajaUSD: 0,
    cajaARS: 0,
  },
  { id: 'E,P', tx1: 'E', tx2: 'P', saldoUSD: -5000, saldoARS: 0, detalleCliente: [-5000000, -5000, 5000000], cajaUSD: 0, cajaARS: 5000000 },
  {
    id: 'P,E',
    tx1: 'P',
    tx2: 'E',
    // Tres líneas en detalle: dos USD −me/+me anulan el egreso ejecutado en CC; una ARS +mr es el «Compromiso a Cobrar» pendiente (ingreso Tx1). Saldo neto USD 0, ARS +mr (pendiente de cobro). Ver docs/CC_NETEO_USD_ARS_VS_ARS_USD.md.
    saldoUSD: 0,
    saldoARS: 5000000,
    detalleCliente: [-5000, 5000, 5000000],
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

const COMBINACIONES_USD_ARS_RAW = [
  {
    id: 'P,P',
    tx1: 'P',
    tx2: 'P',
    saldoUSD: 5000,
    saldoARS: -5000000,
    detalleCliente: [-5000000, 5000],
    cajaUSD: 0,
    cajaARS: 0,
  },
  { id: 'E,P', tx1: 'E', tx2: 'P', saldoUSD: 0, saldoARS: -5000000, detalleCliente: [-5000000, -5000, 5000], cajaUSD: 5000, cajaARS: 0 },
  {
    id: 'P,E',
    tx1: 'P',
    tx2: 'E',
    // Espejo ARS-USD P,E: egreso ejecutado dos líneas ARS −/+ monto_transacción anulan en CC; queda «Compromiso a Cobrar» USD pendiente (Tx1) con signo +me (pendiente de cobro).
    saldoUSD: 5000,
    saldoARS: 0,
    detalleCliente: [-5000000, 5000, 5000000],
    cajaUSD: 0,
    cajaARS: -5000000,
  },
  {
    id: 'E,E',
    tx1: 'E',
    tx2: 'E',
    // Par cerrado: 2 movimientos CC por trx × 2 monedas → 4 líneas que netean (saldo 0). Ver docs/MODELO_CC_USD_ARS_TEORICO.md.
    saldoUSD: 0,
    saldoARS: 0,
    detalleCliente: [-5000000, -5000, 5000, 5000000],
    cajaUSD: 5000,
    cajaARS: -5000000,
  },
];

/** Combinaciones Tx1/Tx2 para USD-USD (sin int. en catálogo). `saldoUSD` = resumen cliente post-sync; el spread del acuerdo sigue siendo `USD_USD_FIJOS.comision` (= mr−me) en todas. */
const COMBINACIONES_USD_USD_RAW = [
  /** P,P: solo pendientes + comisión; neto cliente = 318 (= mr−me). */
  {
    id: 'P,P',
    tx1: 'P',
    tx2: 'P',
    saldoUSD: 318,
    saldoARS: 0,
    detalleCliente: [318, 4982, -4982],
    cajaUSD: 0,
    cajaARS: 0,
  },
  // E,P: cobro cerrado −me; comisión acuerdo cerrada −318; compromiso entrega pendiente +mr → saldo neto 0.
  { id: 'E,P', tx1: 'E', tx2: 'P', saldoUSD: 0, saldoARS: 0, detalleCliente: [-4982, -318, 5300], cajaUSD: 5300, cajaARS: 0 },
  // P,E: compromiso cobrar +mr; pago Pandy anulado en CC (−me/+me); saldo +mr.
  {
    id: 'P,E',
    tx1: 'P',
    tx2: 'E',
    saldoUSD: 5300,
    saldoARS: 0,
    detalleCliente: [-4982, 4982, 5300],
    cajaUSD: -4982,
    cajaARS: 0,
  },
  {
    id: 'E,E',
    tx1: 'E',
    tx2: 'E',
    saldoUSD: 0,
    saldoARS: 0,
    detalleCliente: [-5300, 318, 4982],
    cajaUSD: 318,
    cajaARS: 0,
  },
];

const COMBINACIONES_ARS_USD = COMBINACIONES_ARS_USD_RAW.map(withSeedCajaTipo2tx);
const COMBINACIONES_USD_ARS = COMBINACIONES_USD_ARS_RAW.map(withSeedCajaTipo2tx);
const COMBINACIONES_USD_USD = COMBINACIONES_USD_USD_RAW.map(withSeedCajaTipo2tx);

/**
 * USD-USD con intermediario: mismas expectativas **cliente** / detalle que sin int (`reglas_de_negocio` cliente + mr_menos_me).
 * **Caja:** con patrón cp_ic (Tx2 = Intermediario→Cliente), el egreso del intermediario **no** mueve la caja de Pandy; solo cuenta el ingreso Cliente→Pandy cuando está ejecutado (E,E → +mr; P,E → 0; E,P → +mr).
 * CC intermediario (**cp_ic**): con **E,E** o **P,E** (Int→Cliente ejecutado), saldo USD = −(me + comisión int.). Con **P,P**, el motor agrega el espejo **+|me|** al **−|me|** del egreso pendiente → el resumen netea el par y queda **−comisión int.** Comisión int.: **min(mr×tasa%, mr−me)** como al guardar la orden (`pandiBuildComisionesOrdenOutboxRows`); con mr=5300 y 1,5% → 79,5.
 */
const COMISION_USD_USD_INT_INTERMEDIARIO = Math.min(
  USD_USD_FIJOS.mr * 0.015,
  Math.max(0, USD_USD_FIJOS.mr - USD_USD_FIJOS.me),
);
/** Negativo en resumen = Pandy debe al intermediario (suma movimientos CC int). */
const SALDO_INT_USD_USD_EE = -(USD_USD_FIJOS.me + COMISION_USD_USD_INT_INTERMEDIARIO);
const COMBINACIONES_USD_USD_INT = COMBINACIONES_USD_USD.map((c) => {
  const base = {
    ...c,
    saldoIntermediarioUSD:
      c.id === 'E,E' || c.id === 'P,E'
        ? SALDO_INT_USD_USD_EE
        : c.id === 'P,P'
          ? -COMISION_USD_USD_INT_INTERMEDIARIO
          : 0,
  };
  const seedUsd = E2E_CAJA_SEED.efectivoUSD;
  if (c.id === 'E,E') return { ...base, cajaUSD: USD_USD_FIJOS.mr + seedUsd };
  if (c.id === 'P,E') return { ...base, cajaUSD: seedUsd };
  return base;
});

/** EUR-USD: mismo esquema numérico que ARS-USD (TC 1000; 5.000.000 / 5.000); reglas espejo ARS→EUR. */
const EUR_USD_FIJOS = {
  cotizacion: '1000',
  montoRecibidoEur: '5000000',
  montoEntregadoUsd: 5000,
  mr: 5000000,
  me: 5000,
};

/** USD-EUR: espejo USD-ARS. */
const USD_EUR_FIJOS = {
  cotizacion: '1000',
  montoRecibidoUsd: '5000',
  montoEntregadoEur: 5000000,
  mr: 5000,
  me: 5000000,
};

/** EUR-ARS: espejo USD-ARS (rec EUR, ent ARS). */
const EUR_ARS_FIJOS = {
  cotizacion: '1000',
  montoRecibidoEur: '5000',
  montoEntregadoArs: 5000000,
  mr: 5000,
  me: 5000000,
};

/** ARS-EUR: espejo ARS-USD. */
const ARS_EUR_FIJOS = {
  cotizacion: '1000',
  montoRecibidoArs: '5000000',
  montoEntregadoEur: 5000,
  mr: 5000000,
  me: 5000,
};

/** @param {typeof COMBINACIONES_ARS_USD[0]} c */
function comboEurUsdDesdeArsUsd(c) {
  return {
    ...c,
    saldoEUR: c.saldoARS,
    saldoARS: 0,
    cajaEUR: c.cajaARS,
    // Columna ARS en Cajas sigue mostrando la semilla E2E aunque este tipo no opere en ARS.
    cajaARS: E2E_CAJA_SEED.efectivoARS,
    detalleCliente: [...(c.detalleCliente || [])],
  };
}

/** @param {typeof COMBINACIONES_USD_ARS[0]} c */
function comboUsdEurDesdeUsdArs(c) {
  return {
    ...c,
    saldoEUR: c.saldoARS,
    saldoARS: 0,
    cajaEUR: c.cajaARS,
    cajaARS: E2E_CAJA_SEED.efectivoARS,
    detalleCliente: [...(c.detalleCliente || [])],
  };
}

/** @param {typeof COMBINACIONES_USD_ARS[0]} c */
function comboEurArsDesdeUsdArs(c) {
  return {
    ...c,
    saldoEUR: c.saldoUSD,
    saldoUSD: 0,
    cajaEUR: c.cajaUSD,
    cajaUSD: E2E_CAJA_SEED.efectivoUSD,
    detalleCliente: [...(c.detalleCliente || [])],
  };
}

/** @param {typeof COMBINACIONES_ARS_USD[0]} c */
function comboArsEurDesdeArsUsd(c) {
  return {
    ...c,
    saldoEUR: c.saldoUSD,
    saldoUSD: 0,
    cajaEUR: c.cajaUSD,
    cajaUSD: E2E_CAJA_SEED.efectivoUSD,
    detalleCliente: [...(c.detalleCliente || [])],
  };
}

const COMBINACIONES_EUR_USD = COMBINACIONES_ARS_USD.map(comboEurUsdDesdeArsUsd);
const COMBINACIONES_USD_EUR = COMBINACIONES_USD_ARS.map(comboUsdEurDesdeUsdArs);
const COMBINACIONES_EUR_ARS = COMBINACIONES_USD_ARS.map(comboEurArsDesdeUsdArs);
const COMBINACIONES_ARS_EUR = COMBINACIONES_ARS_USD.map(comboArsEurDesdeArsUsd);

/** Catálogo activo (sync con tipos_operacion activo en Supabase). Puede haber dos filas mismo codigo (usa_intermediario distinto). */
const TIPOS_ACTIVOS_CATALOGO = [
  { codigo: 'ARS-USD', activo: true, nTx: 2, intermediario: false },
  { codigo: 'CHEQUE-ARS', activo: true, nTx: 4, intermediario: true },
  { codigo: 'USD-USD', activo: true, nTx: 2, intermediario: false },
  { codigo: 'USD-USD', activo: true, nTx: 2, intermediario: true },
  { codigo: 'USD-ARS', activo: true, nTx: 2, intermediario: false },
  { codigo: 'USD-ARS', activo: true, nTx: 4, intermediario: true },
  { codigo: 'EUR-USD', activo: true, nTx: 2, intermediario: false },
  { codigo: 'USD-EUR', activo: true, nTx: 2, intermediario: false },
  { codigo: 'EUR-ARS', activo: true, nTx: 2, intermediario: false },
  { codigo: 'ARS-EUR', activo: true, nTx: 2, intermediario: false },
];

module.exports = {
  ARS_USD_FIJOS,
  USD_ARS_FIJOS,
  USD_USD_FIJOS,
  EUR_USD_FIJOS,
  USD_EUR_FIJOS,
  EUR_ARS_FIJOS,
  ARS_EUR_FIJOS,
  COMBINACIONES_ARS_USD,
  COMBINACIONES_USD_ARS,
  COMBINACIONES_USD_USD,
  COMISION_USD_USD_INT_INTERMEDIARIO,
  SALDO_INT_USD_USD_EE,
  COMBINACIONES_USD_USD_INT,
  COMBINACIONES_EUR_USD,
  COMBINACIONES_USD_EUR,
  COMBINACIONES_EUR_ARS,
  COMBINACIONES_ARS_EUR,
  TIPOS_ACTIVOS_CATALOGO,
};
