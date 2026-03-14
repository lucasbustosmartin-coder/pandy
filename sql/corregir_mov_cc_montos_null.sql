-- Corrige filas de movimientos_cuenta_corriente que tienen moneda y monto pero
-- monto_usd, monto_ars, monto_eur en NULL (rompen el saldo). Ejecutar una vez en Supabase SQL Editor.

UPDATE public.movimientos_cuenta_corriente
SET
  monto_usd = CASE WHEN moneda = 'USD' THEN monto ELSE NULL END,
  monto_ars = CASE WHEN moneda = 'ARS' THEN monto ELSE NULL END,
  monto_eur = CASE WHEN moneda = 'EUR' THEN monto ELSE NULL END
WHERE (monto_usd IS NULL AND monto_ars IS NULL AND monto_eur IS NULL)
  AND moneda IS NOT NULL
  AND monto IS NOT NULL;
