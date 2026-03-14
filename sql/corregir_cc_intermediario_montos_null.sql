-- Rellena monto_usd, monto_ars, monto_eur en movimientos_cuenta_corriente_intermediario
-- cuando están en NULL (regla: monedas que participan siempre con valor, nunca null).
-- Ejecutar en Supabase SQL Editor.

UPDATE movimientos_cuenta_corriente_intermediario m
SET
  monto_usd = CASE WHEN m.moneda = 'USD' THEN COALESCE(m.monto_usd, m.monto) ELSE COALESCE(m.monto_usd, 0) END,
  monto_ars = CASE WHEN m.moneda = 'ARS' THEN COALESCE(m.monto_ars, m.monto) ELSE COALESCE(m.monto_ars, 0) END,
  monto_eur = CASE WHEN m.moneda = 'EUR' THEN COALESCE(m.monto_eur, m.monto) ELSE COALESCE(m.monto_eur, 0) END
WHERE m.monto_usd IS NULL OR m.monto_ars IS NULL OR m.monto_eur IS NULL;
