// @ts-check

const USD_ARS_INT_FIJOS = {
  cotizacion: '1000',
  mrUsd: 5000,
  meArs: 5000000,
};

const ARS_USD_INT_FIJOS = {
  cotizacion: '1000',
  mrArs: 5000000,
  meUsd: 5000,
};

/**
 * @type {Array<{ id: string, tx1: 'P'|'E', tx2: 'P'|'E', saldoCliUSD: number, saldoCliARS: number, saldoIntUSD: number, saldoIntARS: number, detalleCli: number[], detalleInt: number[], cajaUSD: number, cajaARS: number }>}
 */
const COMBINACIONES_USD_ARS_INT_INVERSA = [
  { id: 'P,P', tx1: 'P', tx2: 'P', saldoCliUSD: 0, saldoCliARS: 0, saldoIntUSD: 0, saldoIntARS: 0, detalleCli: [], detalleInt: [], cajaUSD: 0, cajaARS: 0 },
  // E,P: Tx1 ejecutada (cliente pagó su parte en USD al intermediario) → en CC cliente se refleja el par −5k/+5k USD (neto USD 0). Tx2 pendiente (Pandy debe al cliente en ARS) → −5M ARS en CC cliente. No confundir moneda de saldo: la deuda operativa del escenario es ARS −5M, no USD −5k.
  { id: 'E,P', tx1: 'E', tx2: 'P', saldoCliUSD: 0, saldoCliARS: -5000000, saldoIntUSD: 5000, saldoIntARS: 0, detalleCli: [-5000000, -5000, 5000], detalleInt: [5000], cajaUSD: 0, cajaARS: 0 },
  // P,E: Tx1 ingreso Cliente→Intermediario pendiente (USD); Tx2 egreso Pandy→Cliente ejecutado (ARS). ARS: −me + +me → saldo 0. USD: −mr (debe 5000). Caja: solo egreso ejecutado en ARS.
  { id: 'P,E', tx1: 'P', tx2: 'E', saldoCliUSD: -5000, saldoCliARS: 0, saldoIntUSD: 0, saldoIntARS: 0, detalleCli: [-5000000, -5000, 5000000], detalleInt: [], cajaUSD: 0, cajaARS: -5000000 },
  { id: 'E,E', tx1: 'E', tx2: 'E', saldoCliUSD: 0, saldoCliARS: 0, saldoIntUSD: 5000, saldoIntARS: 0, detalleCli: [-5000000, -5000, 5000, 5000000], detalleInt: [5000], cajaUSD: 0, cajaARS: -5000000 },
];

/**
 * @type {Array<{ id: string, tx1: 'P'|'E', tx2: 'P'|'E', saldoCliUSD: number, saldoCliARS: number, saldoIntUSD: number, saldoIntARS: number, detalleCli: number[], detalleInt: number[], cajaUSD: number, cajaARS: number }>}
 */
const COMBINACIONES_ARS_USD_INT_INVERSA = [
  { id: 'P,P', tx1: 'P', tx2: 'P', saldoCliUSD: 0, saldoCliARS: 0, saldoIntUSD: 0, saldoIntARS: 0, detalleCli: [], detalleInt: [], cajaUSD: 0, cajaARS: 0 },
  // E,P: par −mr/+mr en ARS (no en USD como USD-ARS); −me USD abierto. Detalle ordenado: −5M, −5k, +5M (no +5k en el tercer ítem).
  { id: 'E,P', tx1: 'E', tx2: 'P', saldoCliUSD: -5000, saldoCliARS: 0, saldoIntUSD: 0, saldoIntARS: 5000000, detalleCli: [-5000000, -5000, 5000000], detalleInt: [5000000], cajaUSD: 0, cajaARS: 0 },
  // P,E: espejo de USD-ARS P,E (ingreso pendiente + egreso ejecutado en USD): saldo ARS −5M; caja USD −5k.
  { id: 'P,E', tx1: 'P', tx2: 'E', saldoCliUSD: 0, saldoCliARS: -5000000, saldoIntUSD: 0, saldoIntARS: 0, detalleCli: [-5000000, -5000, 5000], detalleInt: [], cajaUSD: -5000, cajaARS: 0 },
  { id: 'E,E', tx1: 'E', tx2: 'E', saldoCliUSD: 0, saldoCliARS: 0, saldoIntUSD: 0, saldoIntARS: 5000000, detalleCli: [-5000000, -5000, 5000, 5000000], detalleInt: [5000000], cajaUSD: -5000, cajaARS: 0 },
];

/** USD-EUR+int inversa: ARS→EUR en saldos/caja cliente e intermediario. */
function mapUsdEurIntDesdeUsdArs(rows) {
  return rows.map((r) => ({
    ...r,
    saldoCliEUR: r.saldoCliARS,
    saldoCliARS: 0,
    saldoIntEUR: r.saldoIntARS,
    saldoIntARS: 0,
    cajaEUR: r.cajaARS,
    cajaARS: 0,
    detalleCli: [...(r.detalleCli || [])],
    detalleInt: [...(r.detalleInt || [])],
  }));
}

/** EUR-USD+int inversa. */
function mapEurUsdIntDesdeArsUsd(rows) {
  return rows.map((r) => ({
    ...r,
    saldoCliEUR: r.saldoCliARS,
    saldoCliARS: 0,
    saldoIntEUR: r.saldoIntARS,
    saldoIntARS: 0,
    cajaEUR: r.cajaARS,
    cajaARS: 0,
    detalleCli: [...(r.detalleCli || [])],
    detalleInt: [...(r.detalleInt || [])],
  }));
}

/** EUR-ARS+int inversa (espejo USD-ARS+int: USD→EUR). */
function mapEurArsIntDesdeUsdArs(rows) {
  return rows.map((r) => ({
    ...r,
    saldoCliEUR: r.saldoCliUSD,
    saldoCliUSD: 0,
    saldoIntEUR: r.saldoIntUSD,
    saldoIntUSD: 0,
    cajaEUR: r.cajaUSD,
    cajaUSD: 0,
    detalleCli: [...(r.detalleCli || [])],
    detalleInt: [...(r.detalleInt || [])],
  }));
}

/** ARS-EUR+int inversa (espejo ARS-USD+int: USD→EUR). */
function mapArsEurIntDesdeArsUsd(rows) {
  return rows.map((r) => ({
    ...r,
    saldoCliEUR: r.saldoCliUSD,
    saldoCliUSD: 0,
    saldoIntEUR: r.saldoIntUSD,
    saldoIntUSD: 0,
    cajaEUR: r.cajaUSD,
    cajaUSD: 0,
    detalleCli: [...(r.detalleCli || [])],
    detalleInt: [...(r.detalleInt || [])],
  }));
}

const USD_EUR_INT_FIJOS = { ...USD_ARS_INT_FIJOS };
const EUR_USD_INT_FIJOS = { ...ARS_USD_INT_FIJOS };
const EUR_ARS_INT_FIJOS = {
  cotizacion: '1000',
  mrEur: 5000,
  meArs: 5000000,
};
const ARS_EUR_INT_FIJOS = {
  cotizacion: '1000',
  mrArs: 5000000,
  meEur: 5000,
};

const COMBINACIONES_USD_EUR_INT_INVERSA = mapUsdEurIntDesdeUsdArs(COMBINACIONES_USD_ARS_INT_INVERSA);
const COMBINACIONES_EUR_USD_INT_INVERSA = mapEurUsdIntDesdeArsUsd(COMBINACIONES_ARS_USD_INT_INVERSA);
const COMBINACIONES_EUR_ARS_INT_INVERSA = mapEurArsIntDesdeUsdArs(COMBINACIONES_USD_ARS_INT_INVERSA);
const COMBINACIONES_ARS_EUR_INT_INVERSA = mapArsEurIntDesdeArsUsd(COMBINACIONES_ARS_USD_INT_INVERSA);

module.exports = {
  USD_ARS_INT_FIJOS,
  ARS_USD_INT_FIJOS,
  USD_EUR_INT_FIJOS,
  EUR_USD_INT_FIJOS,
  EUR_ARS_INT_FIJOS,
  ARS_EUR_INT_FIJOS,
  COMBINACIONES_USD_ARS_INT_INVERSA,
  COMBINACIONES_ARS_USD_INT_INVERSA,
  COMBINACIONES_USD_EUR_INT_INVERSA,
  COMBINACIONES_EUR_USD_INT_INVERSA,
  COMBINACIONES_EUR_ARS_INT_INVERSA,
  COMBINACIONES_ARS_EUR_INT_INVERSA,
};

