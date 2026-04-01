// @ts-check
/**
 * Saldos base de caja tras `limpiar_base_e2e` (inserts en sql/rpc_limpiar_base_e2e.sql).
 * La RPC resuelve el tipo con `tipos_movimiento_caja` nombre ILIKE «Ajuste ingreso» y dirección ingreso
 * (p. ej. «Ajuste Ingreso» en Supabase dev).
 * Deben coincidir numéricamente con esos INSERT para que las expectativas E2E sigan cerrando.
 */
const E2E_CAJA_SEED = Object.freeze({
  efectivoUSD: 50_000_000,
  efectivoARS: 500_000_000,
  efectivoEUR: 50_000_000,
  bancoUSD: 50_000_000,
  bancoARS: 500_000_000,
  chequeARS: 500_000_000,
});

/**
 * Fila tipo 02/03: saldos de efectivo que lee el spec (tres monedas).
 * La vista Cajas muestra siempre USD / EUR / ARS; la semilla RPC ingresa las tres aunque el tipo de operación
 * solo use dos columnas en el fixture → hay que sumar seed a cada moneda (ausente = 0).
 */
function withSeedCajaTipo2tx(row) {
  const o = { ...row };
  const u = 'cajaUSD' in o && typeof o.cajaUSD === 'number' ? o.cajaUSD : 0;
  const a = 'cajaARS' in o && typeof o.cajaARS === 'number' ? o.cajaARS : 0;
  const e = 'cajaEUR' in o && typeof o.cajaEUR === 'number' ? o.cajaEUR : 0;
  o.cajaUSD = u + E2E_CAJA_SEED.efectivoUSD;
  o.cajaARS = a + E2E_CAJA_SEED.efectivoARS;
  o.cajaEUR = e + E2E_CAJA_SEED.efectivoEUR;
  return o;
}

/** Combinaciones CHEQUE-ARS (01): efectivo + cheque ARS. */
function withSeedCajaCheque(row) {
  return {
    ...row,
    saldoCajaEfectivoARS: (Number(row.saldoCajaEfectivoARS) || 0) + E2E_CAJA_SEED.efectivoARS,
    saldoCajaChequeARS: (Number(row.saldoCajaChequeARS) || 0) + E2E_CAJA_SEED.chequeARS,
  };
}

module.exports = {
  E2E_CAJA_SEED,
  withSeedCajaTipo2tx,
  withSeedCajaCheque,
};
