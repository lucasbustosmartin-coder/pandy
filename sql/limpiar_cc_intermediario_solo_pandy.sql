-- Limpieza: dejar la cuenta corriente del intermediario solo con transacciones Pandy ↔ Intermediario
-- Borra movimientos de CC intermediario ligados a transacciones donde NO participa Pandy.
-- Ejecutar una sola vez si ya se generaron impactos incorrectos.

DELETE FROM public.movimientos_cuenta_corriente_intermediario m
USING public.transacciones t
WHERE m.transaccion_id = t.id
  AND m.transaccion_id IS NOT NULL
  AND NOT (
    (t.cobrador = 'pandy' AND t.pagador = 'intermediario')
    OR (t.cobrador = 'intermediario' AND t.pagador = 'pandy')
  );

