-- Ci_pc (cruce dos monedas + intermediario): egresos Pandy→Cliente en CC cliente.
-- Si monto_origen = me, cada transacción usaba el total monto_entregado del acuerdo.
-- Con varias entregas en moneda entregada (ej. efectivo Pandy + transferencia intermediario)
-- el compromiso quedaba duplicado y el saldo del cliente no cerraba al ejecutar todo.
-- Corregir a monto_transaccion (monto de esa transacción), alineado a reglas_de_negocio_tabla.sql.
--
-- Ejecutar en Supabase SQL Editor en prod/dev cuando ya existan filas en reglas_de_negocio.

UPDATE public.reglas_de_negocio
SET monto_origen = 'monto_transaccion'
WHERE usa_intermediario IS TRUE
  AND entidad_cc = 'cliente'
  AND LOWER(TRIM(BOTH FROM pagador::text)) = 'pandy'
  AND LOWER(TRIM(BOTH FROM cobrador::text)) = 'cliente'
  AND LOWER(TRIM(BOTH FROM tipo_transaccion::text)) = 'egreso'
  AND COALESCE(es_comision, false) = false
  AND LOWER(TRIM(BOTH FROM estado_transaccion::text)) = 'ejecutada'
  AND monto_origen = 'me'
  AND LOWER(TRIM(BOTH FROM concepto_leyenda::text)) = 'compromiso_pago'
  AND tipo_operacion_codigo::text IN (
    'USD-ARS', 'ARS-USD', 'EUR-USD', 'USD-EUR', 'EUR-ARS', 'ARS-EUR'
  );
