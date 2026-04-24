-- Inventario: órdenes en el **mismo patrón de instrumentación ci_pc** que el motor
-- trata con `inyeccionCompromisoUnaLineaCiPcEgresoPandy` en `main.js`:
-- **USD-USD**, **USD-ARS** y **ARS-USD** + intermediario + ingreso Cliente→Intermediario
-- (sin ingreso Cliente→Pandy) + egreso Pandy→Cliente.
--
-- **Qué cambia según tipo (importante):**
-- - **USD-USD** (misma moneda mr/me): el fix reciente reinyecta **+mr / −me** y, si el egreso
--   está **ejecutado**, también **«Pago Realizado» +me** — es el caso que corregiste en UI.
-- - **USD-ARS / ARS-USD**: comparten colapso/inyección de **compromiso_pago** en egreso P→C
--   pero el motor usa **una línea +|monto_transacción|** (mr/me en monedas distintas); no
--   aplica el trío +mr/−me/+me en la misma forma que USD-USD. Igual pueden **regenerarse**
--   filas CC al resincronizar si tocás esa rama del motor.
--
-- Otros códigos (EUR-*, CHEQUE-*, etc.) **no** entran en `inyeccionCompromisoUnaLineaCiPcEgresoPandy`
-- con el mismo `codOp`; si hubiera ci_pc instrumentado, sería por reglas genéricas distintas.
--
-- Columna `spread_mr_menos_me`: resta numérica `monto_recibido − monto_entregado` en la orden;
-- en **USD-ARS / ARS-USD** suele mezclar **unidades distintas** (solo referencia, no “spread en USD”).
--
-- **Comisión intermediario (CC intermediario):** el importe sale de `comisiones_orden`
-- (filas con `beneficiario = 'intermediario'`). En la matriz `reglas_de_negocio`, la fila
-- `es_comision` / `monto_origen = comision_intermediario` (egreso Pandy→Intermediario,
-- entidad_cc intermediario) es la que **cambia de signo** al alinear con negocio (p. ej.
-- `sql/ejecutar_supabase_cc_int_cp_ic_comision_y_regenerar_eur.sql`); el listado incluye
-- el **signo actual** en BD de esa regla para el **mismo** `tipo_operacion_codigo` de la orden.
--
-- Solo lectura. Ejecutar en producción (SQL editor) para dimensionar impacto.
--
-- Limitación (raro): `main.js` infiere **ci_pc** excluyendo un ingreso C→Pandy «chico»
-- de comisión frente a `monto_recibido`; esta consulta usa solo
-- «no existe ningún ingreso C→Pandy». Si hubiera C→Pandy + C→I en la misma
-- instrumentación, la orden aparecería aquí pero el motor podría clasificar **cp_ic**.

WITH tx_ord AS (
  SELECT
    i.orden_id,
    t.id AS transaccion_id,
    t.numero AS transaccion_numero,
    lower(trim(coalesce(t.tipo, ''))) AS tipo,
    lower(trim(coalesce(t.pagador, ''))) AS pagador,
    lower(trim(coalesce(t.cobrador, ''))) AS cobrador,
    lower(trim(coalesce(t.estado, ''))) AS estado_trx
  FROM public.transacciones t
  JOIN public.instrumentacion i ON i.id = t.instrumentacion_id
),
ci_pc_ordenes AS (
  SELECT DISTINCT o.id AS orden_id
  FROM public.ordenes o
  JOIN public.tipos_operacion tp ON tp.id = o.tipo_operacion_id
  WHERE upper(trim(tp.codigo)) IN ('USD-USD', 'USD-ARS', 'ARS-USD')
    AND o.intermediario_id IS NOT NULL
    AND lower(trim(coalesce(o.estado, ''))) <> 'anulada'
    AND EXISTS (
      SELECT 1
      FROM tx_ord x
      WHERE x.orden_id = o.id
        AND x.tipo = 'ingreso'
        AND x.pagador = 'cliente'
        AND x.cobrador = 'intermediario'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM tx_ord x
      WHERE x.orden_id = o.id
        AND x.tipo = 'ingreso'
        AND x.pagador = 'cliente'
        AND x.cobrador = 'pandy'
    )
    AND EXISTS (
      SELECT 1
      FROM tx_ord x
      WHERE x.orden_id = o.id
        AND x.tipo = 'egreso'
        AND x.pagador = 'pandy'
        AND x.cobrador = 'cliente'
    )
),
egreso_pc AS (
  SELECT DISTINCT x.orden_id, x.transaccion_id, x.transaccion_numero, x.estado_trx
  FROM tx_ord x
  WHERE x.tipo = 'egreso'
    AND x.pagador = 'pandy'
    AND x.cobrador = 'cliente'
),
comision_inter_por_orden AS (
  SELECT
    co.orden_id,
    SUM(co.monto)::numeric AS comision_intermediario_monto_total,
    string_agg(
      upper(trim(co.moneda)) || ' ' || trim(to_char(co.monto, 'FM9999999999990.0099')),
      ' · '
      ORDER BY upper(trim(co.moneda))
    ) AS comision_intermediario_desglose,
    COUNT(*)::int AS n_filas_comisiones_orden_intermediario
  FROM public.comisiones_orden co
  WHERE lower(trim(coalesce(co.beneficiario, 'pandy'))) = 'intermediario'
  GROUP BY co.orden_id
)
SELECT
  o.id AS orden_id,
  o.numero AS orden_numero,
  upper(trim(tp.codigo)) AS tipo_operacion_codigo,
  (upper(trim(tp.codigo)) = 'USD-USD') AS motor_dual_mr_me_y_pago_realizado_usd_usd,
  o.estado AS orden_estado,
  o.cliente_id,
  o.intermediario_id,
  o.monto_recibido::numeric AS mr,
  o.monto_entregado::numeric AS me,
  upper(trim(coalesce(o.moneda_recibida, ''))) AS moneda_recibida,
  upper(trim(coalesce(o.moneda_entregada, ''))) AS moneda_entregada,
  (o.monto_recibido::numeric - o.monto_entregado::numeric) AS spread_mr_menos_me,
  EXISTS (
    SELECT 1
    FROM egreso_pc e
    WHERE e.orden_id = o.id
      AND e.estado_trx = 'ejecutada'
  ) AS tiene_egreso_pandy_cliente_ejecutado,
  (
    SELECT COUNT(*)::int
    FROM public.movimientos_cuenta_corriente m
    WHERE m.orden_id = o.id
      AND COALESCE(m.es_movimiento_manual, false) = false
  ) AS n_filas_cc_cliente_no_manual,
  (
    SELECT COUNT(*)::int
    FROM public.movimientos_cuenta_corriente m
    JOIN egreso_pc e ON e.orden_id = m.orden_id AND e.transaccion_id = m.transaccion_id
    WHERE m.orden_id = o.id
      AND COALESCE(m.es_movimiento_manual, false) = false
      AND m.concepto ILIKE 'Pago Realizado%'
  ) AS n_pago_realizado_en_trx_egreso_pc,
  com.comision_intermediario_monto_total,
  com.comision_intermediario_desglose,
  com.n_filas_comisiones_orden_intermediario,
  ms.matriz_signo_cc_comision_intermediario
FROM public.ordenes o
JOIN public.tipos_operacion tp ON tp.id = o.tipo_operacion_id
JOIN ci_pc_ordenes c ON c.orden_id = o.id
LEFT JOIN comision_inter_por_orden com ON com.orden_id = o.id
LEFT JOIN LATERAL (
  SELECT MIN(r.signo)::int AS matriz_signo_cc_comision_intermediario
  FROM public.reglas_de_negocio r
  WHERE r.tipo_operacion_codigo = upper(trim(tp.codigo))
    AND r.usa_intermediario IS TRUE
    AND lower(trim(coalesce(r.entidad_cc, ''))) = 'intermediario'
    AND r.es_comision IS TRUE
    AND lower(trim(coalesce(r.pagador, ''))) = 'pandy'
    AND lower(trim(coalesce(r.cobrador, ''))) = 'intermediario'
    AND lower(trim(coalesce(r.tipo_transaccion, ''))) = 'egreso'
    AND lower(trim(coalesce(r.monto_origen, ''))) = 'comision_intermediario'
) ms ON true
ORDER BY upper(trim(tp.codigo)), o.numero;

-- ---------------------------------------------------------------------------
-- Resumen por estado de orden (misma base ci_pc)
-- ---------------------------------------------------------------------------
WITH tx_ord AS (
  SELECT i.orden_id,
    lower(trim(coalesce(t.tipo, ''))) AS tipo,
    lower(trim(coalesce(t.pagador, ''))) AS pagador,
    lower(trim(coalesce(t.cobrador, ''))) AS cobrador
  FROM public.transacciones t
  JOIN public.instrumentacion i ON i.id = t.instrumentacion_id
),
ci_pc_ordenes AS (
  SELECT DISTINCT o.id AS orden_id
  FROM public.ordenes o
  JOIN public.tipos_operacion tp ON tp.id = o.tipo_operacion_id
  WHERE upper(trim(tp.codigo)) IN ('USD-USD', 'USD-ARS', 'ARS-USD')
    AND o.intermediario_id IS NOT NULL
    AND lower(trim(coalesce(o.estado, ''))) <> 'anulada'
    AND EXISTS (SELECT 1 FROM tx_ord x WHERE x.orden_id = o.id AND x.tipo = 'ingreso'
      AND x.pagador = 'cliente' AND x.cobrador = 'intermediario')
    AND NOT EXISTS (SELECT 1 FROM tx_ord x WHERE x.orden_id = o.id AND x.tipo = 'ingreso'
      AND x.pagador = 'cliente' AND x.cobrador = 'pandy')
    AND EXISTS (SELECT 1 FROM tx_ord x WHERE x.orden_id = o.id AND x.tipo = 'egreso'
      AND x.pagador = 'pandy' AND x.cobrador = 'cliente')
)
SELECT upper(trim(tp.codigo)) AS tipo_operacion_codigo, o.estado, COUNT(*)::int AS ordenes
FROM public.ordenes o
JOIN public.tipos_operacion tp ON tp.id = o.tipo_operacion_id
JOIN ci_pc_ordenes c ON c.orden_id = o.id
GROUP BY upper(trim(tp.codigo)), o.estado
ORDER BY tipo_operacion_codigo, ordenes DESC;
