-- Detalle por orden de las filas que afectan el TOTAL de P&L (devengado) en el panel.
-- Usa exclusivamente las 6 bolsas que componen el total del panel:
--   caja_ordenes, cc_cliente, cc_intermediario, cc_resultado_economico_compensatorio,
--   comisiones_acuerdo_pandy, comisiones_acuerdo_intermediario.
--
-- Opcional: filtrar por una o más órdenes editando el array en params. Si queda NULL, trae todas.
-- Ejemplos:
--   ARRAY[5,8,104]::int[]   -- solo esas órdenes
--   NULL::int[]             -- todas
-- Casos testigo habituales (prod, 2026): 4, 5, 8, 19, 58, 81, 85, 104 — **no** incluir la 89 (orden anulada; excluir de verificaciones futuras).

WITH params AS (
  SELECT NULL::int[] AS ordenes
),
bolsas AS (
  SELECT unnest(ARRAY[
    'caja_ordenes',
    'cc_cliente',
    'cc_intermediario',
    'cc_resultado_economico_compensatorio',
    'comisiones_acuerdo_pandy',
    'comisiones_acuerdo_intermediario'
  ]) AS bolsa
),
filas AS (
  SELECT
    b.bolsa,
    (e->>'id')::text AS registro_id,
    (e->>'fecha')::date AS fecha,
    (e->>'orden_numero')::int AS orden_numero,
    NULLIF(trim(e->>'transaccion_numero'), '')::int AS transaccion_numero,
    upper(COALESCE(NULLIF(trim(e->>'moneda'), ''), 'USD')) AS moneda,
    (e->>'monto')::numeric AS monto,
    COALESCE(e->>'concepto', '') AS concepto,
    COALESCE(e->>'entidad', '') AS entidad,
    COALESCE(e->>'cc_estado', '') AS cc_estado,
    COALESCE(e->>'modo_pago', '') AS modo_pago
  FROM bolsas b
  CROSS JOIN LATERAL jsonb_array_elements(public.gp_operativa_detalle(NULL::date, NULL::date, b.bolsa)) e
),
detalle AS (
  SELECT
    f.bolsa,
    f.registro_id,
    f.fecha,
    f.orden_numero,
    f.transaccion_numero,
    f.moneda,
    f.monto,
    f.concepto,
    f.entidad,
    f.cc_estado,
    f.modo_pago,
    o.id AS orden_id,
    o.tipo_operacion_id,
    COALESCE(t.codigo, '') AS tipo_operacion_codigo,
    COALESCE(t.moneda_in, '') AS tipo_moneda_in,
    COALESCE(t.moneda_out, '') AS tipo_moneda_out,
    COALESCE(t.usa_intermediario, false) AS tipo_usa_intermediario,
    (o.intermediario_id IS NOT NULL) AS tiene_intermediario
  FROM filas f
  LEFT JOIN public.ordenes o ON o.numero = f.orden_numero
  LEFT JOIN public.tipos_operacion t ON t.id = o.tipo_operacion_id
  CROSS JOIN params p
  WHERE f.orden_numero IS NOT NULL
    AND (p.ordenes IS NULL OR f.orden_numero = ANY(p.ordenes))
)
SELECT
  bolsa,
  registro_id,
  fecha,
  orden_numero,
  transaccion_numero,
  moneda,
  monto,
  concepto,
  entidad,
  cc_estado,
  modo_pago,
  tipo_operacion_id,
  tipo_operacion_codigo,
  CASE
    WHEN COALESCE(tipo_operacion_codigo, '') = '' THEN ''
    ELSE
      tipo_operacion_codigo ||
      CASE
        WHEN COALESCE(tipo_usa_intermediario, false) THEN ' con intermediario'
        ELSE ' sin intermediario'
      END
  END AS tipo_operacion_orden,
  tipo_moneda_in,
  tipo_moneda_out,
  tipo_usa_intermediario,
  tiene_intermediario
FROM detalle
ORDER BY orden_numero, moneda, bolsa, fecha DESC NULLS LAST, registro_id;

-- Resumen por orden + moneda (aporte al total P&L del panel):
WITH params AS (
  SELECT NULL::int[] AS ordenes
),
bolsas AS (
  SELECT unnest(ARRAY[
    'caja_ordenes',
    'cc_cliente',
    'cc_intermediario',
    'cc_resultado_economico_compensatorio',
    'comisiones_acuerdo_pandy',
    'comisiones_acuerdo_intermediario'
  ]) AS bolsa
),
filas AS (
  SELECT
    b.bolsa,
    (e->>'orden_numero')::int AS orden_numero,
    upper(COALESCE(NULLIF(trim(e->>'moneda'), ''), 'USD')) AS moneda,
    (e->>'monto')::numeric AS monto
  FROM bolsas b
  CROSS JOIN LATERAL jsonb_array_elements(public.gp_operativa_detalle(NULL::date, NULL::date, b.bolsa)) e
),
res AS (
  SELECT
    f.orden_numero,
    f.moneda,
    ROUND(SUM(f.monto)::numeric, 6) AS aporte_total_6_bolsas,
    ROUND(SUM(CASE WHEN f.bolsa = 'caja_ordenes' THEN f.monto ELSE 0 END)::numeric, 6) AS caja_ordenes,
    ROUND(SUM(CASE WHEN f.bolsa = 'cc_cliente' THEN f.monto ELSE 0 END)::numeric, 6) AS cc_cliente,
    ROUND(SUM(CASE WHEN f.bolsa = 'cc_intermediario' THEN f.monto ELSE 0 END)::numeric, 6) AS cc_intermediario,
    ROUND(SUM(CASE WHEN f.bolsa = 'cc_resultado_economico_compensatorio' THEN f.monto ELSE 0 END)::numeric, 6) AS cc_resultado,
    ROUND(SUM(CASE WHEN f.bolsa = 'comisiones_acuerdo_pandy' THEN f.monto ELSE 0 END)::numeric, 6) AS comisiones_pandy,
    ROUND(SUM(CASE WHEN f.bolsa = 'comisiones_acuerdo_intermediario' THEN f.monto ELSE 0 END)::numeric, 6) AS comisiones_intermediario
  FROM filas f
  CROSS JOIN params p
  WHERE f.orden_numero IS NOT NULL
    AND (p.ordenes IS NULL OR f.orden_numero = ANY(p.ordenes))
  GROUP BY f.orden_numero, f.moneda
)
SELECT *
FROM (
  SELECT
    r.*,
    o.tipo_operacion_id,
    COALESCE(t.codigo, '') AS tipo_operacion_codigo,
    CASE
      WHEN COALESCE(t.codigo, '') = '' THEN ''
      ELSE t.codigo ||
        CASE
          WHEN COALESCE(t.usa_intermediario, false) THEN ' con intermediario'
          ELSE ' sin intermediario'
        END
    END AS tipo_operacion_orden,
    COALESCE(t.moneda_in, '') AS tipo_moneda_in,
    COALESCE(t.moneda_out, '') AS tipo_moneda_out,
    COALESCE(t.usa_intermediario, false) AS tipo_usa_intermediario,
    (o.intermediario_id IS NOT NULL) AS tiene_intermediario
  FROM res r
  LEFT JOIN public.ordenes o ON o.numero = r.orden_numero
  LEFT JOIN public.tipos_operacion t ON t.id = o.tipo_operacion_id
) x
ORDER BY orden_numero, moneda;
