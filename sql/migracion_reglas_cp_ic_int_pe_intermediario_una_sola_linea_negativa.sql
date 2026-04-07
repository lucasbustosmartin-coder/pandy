-- Pandi – CC intermediario, patrón **cp_ic** (egreso Intermediario→Cliente), P,E
-- =============================================================================
-- Problema: con ingreso Cliente→Pandy **pendiente** y egreso Int→Cliente **ejecutado**
-- (`estado_transaccion = ejecutada`, `contrapartida_ejecutada = false`), había **dos** filas
-- en `entidad_cc = intermediario` con la misma moneda y `monto_transaccion`: **+1** (linea 0)
-- y **−1** (linea 1) → saldo neto 0 y detalle confuso. **USD-USD+int** ya tenía una sola línea **−1**.
--
-- Solución: eliminar la pierna **+1** (linea 0) y dejar la **−1** en **linea 0** (misma clave única).
-- Criterio genérico: aplica a **todo** tipo con `usa_intermediario` que replique este patrón
-- (USD-ARS, ARS-USD y cruces EUR+int clonados desde ellos).
--
-- Idempotente: segunda ejecución no altera filas ya corregidas.
--
-- Tras aplicar: si usás **EUR-USD / USD-EUR / EUR-ARS / ARS-EUR** con intermediario,
-- volvé a ejecutar `sql/ejecutar_supabase_cc_int_cp_ic_comision_y_regenerar_eur.sql` para
-- reespejar desde USD-ARS/ARS-USD, **o** confiá en que este script ya normalizó las filas EUR
-- que cumplan el mismo patrón.
-- =============================================================================

-- 1) Quitar la pierna contable que sumaba (+1) en la misma moneda / trx.
DELETE FROM public.reglas_de_negocio
WHERE usa_intermediario = true
  AND entidad_cc = 'intermediario'
  AND pagador = 'intermediario'
  AND cobrador = 'cliente'
  AND tipo_transaccion = 'egreso'
  AND es_comision = false
  AND estado_transaccion = 'ejecutada'
  AND contrapartida_ejecutada = false
  AND linea = 0
  AND signo = 1
  AND monto_origen = 'monto_transaccion'
  AND concepto_leyenda = 'compromiso_pago';

-- 2) Promover la pierna −1 de linea 1 a linea 0 (libre tras el DELETE).
UPDATE public.reglas_de_negocio
SET linea = 0
WHERE usa_intermediario = true
  AND entidad_cc = 'intermediario'
  AND pagador = 'intermediario'
  AND cobrador = 'cliente'
  AND tipo_transaccion = 'egreso'
  AND es_comision = false
  AND estado_transaccion = 'ejecutada'
  AND contrapartida_ejecutada = false
  AND linea = 1
  AND signo = -1
  AND monto_origen = 'monto_transaccion'
  AND concepto_leyenda = 'compromiso_pago';
