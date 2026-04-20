-- P,P sin intermediario (USD-ARS / ARS-USD y cruces EUR derivados): la fila de ingreso
-- pendiente con `contrapartida_ejecutada = false` y `concepto_leyenda = compromiso_cobrar`
-- debe usar **signo +1** (igual que la rama pendiente+true), para que en CC cliente el saldo
-- sea positivo = «pendiente de cobro». Con −1 el ARS-USD P,P mostraba −mr y «pendiente de pago» erróneo.
-- Idempotente (UPDATE por clave natural de `reglas_de_negocio`).

UPDATE public.reglas_de_negocio SET signo = 1
WHERE tipo_operacion_codigo = 'USD-ARS' AND usa_intermediario = false
  AND entidad_cc = 'cliente' AND pagador = 'cliente' AND cobrador = 'pandy'
  AND tipo_transaccion = 'ingreso' AND es_comision = false
  AND estado_transaccion = 'pendiente' AND contrapartida_ejecutada = false AND linea = 0
  AND moneda = 'USD' AND concepto_leyenda = 'compromiso_cobrar';

UPDATE public.reglas_de_negocio SET signo = 1
WHERE tipo_operacion_codigo = 'ARS-USD' AND usa_intermediario = false
  AND entidad_cc = 'cliente' AND pagador = 'cliente' AND cobrador = 'pandy'
  AND tipo_transaccion = 'ingreso' AND es_comision = false
  AND estado_transaccion = 'pendiente' AND contrapartida_ejecutada = false AND linea = 0
  AND moneda = 'ARS' AND concepto_leyenda = 'compromiso_cobrar';

UPDATE public.reglas_de_negocio SET signo = 1
WHERE tipo_operacion_codigo = 'USD-EUR' AND usa_intermediario = false
  AND entidad_cc = 'cliente' AND pagador = 'cliente' AND cobrador = 'pandy'
  AND tipo_transaccion = 'ingreso' AND es_comision = false
  AND estado_transaccion = 'pendiente' AND contrapartida_ejecutada = false AND linea = 0
  AND moneda = 'USD' AND concepto_leyenda = 'compromiso_cobrar';

UPDATE public.reglas_de_negocio SET signo = 1
WHERE tipo_operacion_codigo = 'EUR-USD' AND usa_intermediario = false
  AND entidad_cc = 'cliente' AND pagador = 'cliente' AND cobrador = 'pandy'
  AND tipo_transaccion = 'ingreso' AND es_comision = false
  AND estado_transaccion = 'pendiente' AND contrapartida_ejecutada = false AND linea = 0
  AND moneda = 'EUR' AND concepto_leyenda = 'compromiso_cobrar';

-- Espejos ARS-EUR / EUR-ARS (misma clave lógica que ARS-USD / USD-ARS en P,P).
UPDATE public.reglas_de_negocio SET signo = 1
WHERE tipo_operacion_codigo = 'ARS-EUR' AND usa_intermediario = false
  AND entidad_cc = 'cliente' AND pagador = 'cliente' AND cobrador = 'pandy'
  AND tipo_transaccion = 'ingreso' AND es_comision = false
  AND estado_transaccion = 'pendiente' AND contrapartida_ejecutada = false AND linea = 0
  AND moneda = 'ARS' AND concepto_leyenda = 'compromiso_cobrar';

UPDATE public.reglas_de_negocio SET signo = 1
WHERE tipo_operacion_codigo = 'EUR-ARS' AND usa_intermediario = false
  AND entidad_cc = 'cliente' AND pagador = 'cliente' AND cobrador = 'pandy'
  AND tipo_transaccion = 'ingreso' AND es_comision = false
  AND estado_transaccion = 'pendiente' AND contrapartida_ejecutada = false AND linea = 0
  AND moneda = 'EUR' AND concepto_leyenda = 'compromiso_cobrar';

-- Bases cargadas desde un `migracion_reglas_todos_cruces_*` antiguo: ingreso pendiente+true con −1 (desalineado de `reglas_de_negocio_tabla.sql`).
UPDATE public.reglas_de_negocio SET signo = 1
WHERE tipo_operacion_codigo = 'USD-ARS' AND usa_intermediario = false
  AND entidad_cc = 'cliente' AND pagador = 'cliente' AND cobrador = 'pandy'
  AND tipo_transaccion = 'ingreso' AND es_comision = false
  AND estado_transaccion = 'pendiente' AND contrapartida_ejecutada = true AND linea = 0
  AND moneda = 'USD' AND concepto_leyenda = 'compromiso_cobrar';

UPDATE public.reglas_de_negocio SET signo = 1
WHERE tipo_operacion_codigo = 'ARS-USD' AND usa_intermediario = false
  AND entidad_cc = 'cliente' AND pagador = 'cliente' AND cobrador = 'pandy'
  AND tipo_transaccion = 'ingreso' AND es_comision = false
  AND estado_transaccion = 'pendiente' AND contrapartida_ejecutada = true AND linea = 0
  AND moneda = 'ARS' AND concepto_leyenda = 'compromiso_cobrar';
