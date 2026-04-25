-- Ejecutar en Supabase SQL Editor (solo PostgreSQL). No confundir con
-- `scripts/export-gp-operativa-detalle-bolsas-excel.mjs` (Node → `npm run excel:gp-bolsas`).
-- Aplanado de las 7 bolsas G/P + `ganancia_devengada_orden` usando solo `gp_operativa_detalle` (misma lógica que el panel).
-- Export Excel (montos numéricos): `npm run excel:gp-bolsas` → `docs/GP_OPERATIVA_DETALLE_BOLSAS_HISTORIA_COMPLETA.xlsx`
-- (script `scripts/export-gp-operativa-detalle-bolsas-excel.mjs`, mismo RPC que consultarías vía MCP).
-- Fechas NULL = toda la historia (equivalente a `gp_operativa_resumen(NULL, NULL)`).
-- Pensado para export MCP → Excel (montos como numeric en SQL).

SELECT *
FROM (
  SELECT
    'caja_manual'::text AS bolsa,
    'movimientos_caja'::text AS fuente_tabla,
    (e->>'id')::text AS registro_id,
    (e->>'fecha')::date AS fecha,
    NULLIF(trim(e->>'moneda'), '') AS moneda,
    (e->>'monto')::numeric AS monto_contribuye_gp,
    (e->>'monto')::numeric AS monto_en_tabla,
    COALESCE(e->>'concepto', '') AS concepto,
    NULLIF(trim(e->>'tipo_movimiento'), '') AS tipo_movimiento_caja,
    COALESCE(e->>'modo_pago', '') AS modo_pago,
    NULLIF(trim(e->>'orden_numero'), '') AS orden_numero_txt,
    NULLIF(trim(e->>'transaccion_numero'), '') AS transaccion_numero_txt,
    NULLIF(trim(e->>'entidad'), '') AS entidad_nombre,
    COALESCE(e->>'cc_estado', '') AS cc_estado_o_sim,
    (COALESCE(e->>'es_movimiento_manual', 'false'))::boolean AS es_movimiento_manual
  FROM jsonb_array_elements(public.gp_operativa_detalle(NULL::date, NULL::date, 'caja_manual')) AS e
  UNION ALL
  SELECT
    'caja_ordenes'::text,
    'movimientos_caja'::text,
    (e->>'id')::text,
    (e->>'fecha')::date,
    NULLIF(trim(e->>'moneda'), ''),
    (e->>'monto')::numeric,
    (e->>'monto')::numeric,
    COALESCE(e->>'concepto', ''),
    NULLIF(trim(e->>'tipo_movimiento'), ''),
    COALESCE(e->>'modo_pago', ''),
    NULLIF(trim(e->>'orden_numero'), ''),
    NULLIF(trim(e->>'transaccion_numero'), ''),
    NULLIF(trim(e->>'entidad'), ''),
    COALESCE(e->>'cc_estado', ''),
    (COALESCE(e->>'es_movimiento_manual', 'false'))::boolean
  FROM jsonb_array_elements(public.gp_operativa_detalle(NULL::date, NULL::date, 'caja_ordenes')) AS e
  UNION ALL
  SELECT
    'cc_cliente'::text,
    'movimientos_cuenta_corriente'::text,
    (e->>'id')::text,
    (e->>'fecha')::date,
    NULLIF(trim(e->>'moneda'), ''),
    (e->>'monto')::numeric,
    (e->>'monto')::numeric,
    COALESCE(e->>'concepto', ''),
    NULLIF(trim(e->>'tipo_movimiento'), ''),
    COALESCE(e->>'modo_pago', ''),
    NULLIF(trim(e->>'orden_numero'), ''),
    NULLIF(trim(e->>'transaccion_numero'), ''),
    NULLIF(trim(e->>'entidad'), ''),
    COALESCE(e->>'cc_estado', ''),
    (COALESCE(e->>'es_movimiento_manual', 'false'))::boolean
  FROM jsonb_array_elements(public.gp_operativa_detalle(NULL::date, NULL::date, 'cc_cliente')) AS e
  UNION ALL
  SELECT
    'cc_intermediario'::text,
    'movimientos_cuenta_corriente_intermediario'::text,
    (e->>'id')::text,
    (e->>'fecha')::date,
    NULLIF(trim(e->>'moneda'), ''),
    (e->>'monto')::numeric,
    (e->>'monto')::numeric,
    COALESCE(e->>'concepto', ''),
    NULLIF(trim(e->>'tipo_movimiento'), ''),
    COALESCE(e->>'modo_pago', ''),
    NULLIF(trim(e->>'orden_numero'), ''),
    NULLIF(trim(e->>'transaccion_numero'), ''),
    NULLIF(trim(e->>'entidad'), ''),
    COALESCE(e->>'cc_estado', ''),
    (COALESCE(e->>'es_movimiento_manual', 'false'))::boolean
  FROM jsonb_array_elements(public.gp_operativa_detalle(NULL::date, NULL::date, 'cc_intermediario')) AS e
  UNION ALL
  SELECT
    'cc_resultado_economico_compensatorio'::text,
    'movimientos_cuenta_corriente / intermediario'::text,
    (e->>'id')::text,
    (e->>'fecha')::date,
    NULLIF(trim(e->>'moneda'), ''),
    (e->>'monto')::numeric,
    (e->>'monto')::numeric,
    COALESCE(e->>'concepto', ''),
    NULLIF(trim(e->>'tipo_movimiento'), ''),
    COALESCE(e->>'modo_pago', ''),
    NULLIF(trim(e->>'orden_numero'), ''),
    NULLIF(trim(e->>'transaccion_numero'), ''),
    NULLIF(trim(e->>'entidad'), ''),
    COALESCE(e->>'cc_estado', ''),
    (COALESCE(e->>'es_movimiento_manual', 'false'))::boolean
  FROM jsonb_array_elements(public.gp_operativa_detalle(NULL::date, NULL::date, 'cc_resultado_economico_compensatorio')) AS e
  UNION ALL
  SELECT
    'comisiones_acuerdo_pandy'::text,
    CASE WHEN (e->>'id') LIKE 'co-%' THEN 'comisiones_orden'::text ELSE 'movimientos_cuenta_corriente'::text END,
    (e->>'id')::text,
    (e->>'fecha')::date,
    NULLIF(trim(e->>'moneda'), ''),
    (e->>'monto')::numeric,
    (e->>'monto')::numeric,
    COALESCE(e->>'concepto', ''),
    NULLIF(trim(e->>'tipo_movimiento'), ''),
    COALESCE(e->>'modo_pago', ''),
    NULLIF(trim(e->>'orden_numero'), ''),
    NULLIF(trim(e->>'transaccion_numero'), ''),
    NULLIF(trim(e->>'entidad'), ''),
    COALESCE(e->>'cc_estado', ''),
    (COALESCE(e->>'es_movimiento_manual', 'false'))::boolean
  FROM jsonb_array_elements(public.gp_operativa_detalle(NULL::date, NULL::date, 'comisiones_acuerdo_pandy')) AS e
  UNION ALL
  SELECT
    'comisiones_acuerdo_intermediario'::text,
    CASE WHEN (e->>'id') LIKE 'co-%' THEN 'comisiones_orden'::text ELSE 'movimientos_cuenta_corriente_intermediario'::text END,
    (e->>'id')::text,
    (e->>'fecha')::date,
    NULLIF(trim(e->>'moneda'), ''),
    (e->>'monto')::numeric,
    abs((e->>'monto')::numeric),
    COALESCE(e->>'concepto', ''),
    NULLIF(trim(e->>'tipo_movimiento'), ''),
    COALESCE(e->>'modo_pago', ''),
    NULLIF(trim(e->>'orden_numero'), ''),
    NULLIF(trim(e->>'transaccion_numero'), ''),
    NULLIF(trim(e->>'entidad'), ''),
    COALESCE(e->>'cc_estado', ''),
    (COALESCE(e->>'es_movimiento_manual', 'false'))::boolean
  FROM jsonb_array_elements(public.gp_operativa_detalle(NULL::date, NULL::date, 'comisiones_acuerdo_intermediario')) AS e
  UNION ALL
  SELECT
    'ganancia_devengada_orden'::text,
    'comisiones_orden (neto pandy vs intermediario)'::text,
    (e->>'id')::text,
    (e->>'fecha')::date,
    NULLIF(trim(e->>'moneda'), ''),
    (e->>'monto')::numeric,
    (e->>'monto')::numeric,
    COALESCE(e->>'concepto', ''),
    NULLIF(trim(e->>'tipo_movimiento'), ''),
    COALESCE(e->>'modo_pago', ''),
    NULLIF(trim(e->>'orden_numero'), ''),
    NULLIF(trim(e->>'transaccion_numero'), ''),
    NULLIF(trim(e->>'entidad'), ''),
    COALESCE(e->>'cc_estado', ''),
    (COALESCE(e->>'es_movimiento_manual', 'false'))::boolean
  FROM jsonb_array_elements(public.gp_operativa_detalle(NULL::date, NULL::date, 'ganancia_devengada_orden')) AS e
) AS flat
ORDER BY bolsa, moneda, fecha DESC NULLS LAST, registro_id;
