-- Verificación: egreso Pandy→Cliente `ci_pc`, E,E (ejecutada + contrapartida_ejecutada true), líneas 0 y 1.
-- En **localhost** debe coincidir la URL del proyecto con la de Supabase donde corrías las migraciones (`.env` / Vite).
--
-- Esperado por tipo (moneda línea 1 = moneda **recibida** del acuerdo; signo +1; monto_origen mr_prorrateado):
--   USD-ARS → línea 1 moneda USD
--   ARS-USD → línea 1 moneda ARS
--   USD-EUR → USD ; EUR-USD → EUR ; EUR-ARS → EUR ; ARS-EUR → ARS
--
-- Si línea 1 sigue en la moneda **entregada** (p. ej. USD-ARS con ARS en línea 1), el invariante de CC puede fallar con residual −me.

SELECT
  id,
  tipo_operacion_codigo,
  usa_intermediario,
  entidad_cc,
  estado_transaccion,
  contrapartida_ejecutada,
  linea,
  moneda,
  signo,
  monto_origen,
  concepto_leyenda
FROM public.reglas_de_negocio
WHERE usa_intermediario IS TRUE
  AND COALESCE(entidad_cc, 'cliente') = 'cliente'
  AND pagador = 'pandy'
  AND cobrador = 'cliente'
  AND tipo_transaccion = 'egreso'
  AND es_comision IS FALSE
  AND lower(trim(estado_transaccion::text)) = 'ejecutada'
  AND contrapartida_ejecutada IS TRUE
  AND linea IN (0, 1)
  AND tipo_operacion_codigo IN ('USD-ARS', 'ARS-USD', 'USD-EUR', 'EUR-USD', 'EUR-ARS', 'ARS-EUR')
ORDER BY tipo_operacion_codigo, linea;
