-- =============================================================================
-- RPC limpiar_base_e2e: para ambiente de desarrollo / E2E.
-- Ejecutar SOLO en el proyecto Supabase de desarrollo (Pandy-Dev), nunca en producción:
-- trunca órdenes/transacciones/CC/caja y borra clientes/intermediarios E2E.
-- Tu .env.test (SUPABASE_URL + service_role) debe ser del mismo proyecto donde corrés este SQL.
-- Ejecutar este archivo en Supabase SQL Editor una vez por proyecto.
-- Tras truncar, se insertan movimientos de caja «E2E seed» (Ajuste ingreso) alineados a tests/e2e/e2e-caja-seed-saldos.js.
-- 1) Trunca transaccionalidad en el mismo orden que truncar_ordenes_transacciones.sql
--    (incluye CC/caja manuales vinculados a las mismas tablas), staging contingencia si existe,
--    y resetea secuencias ordenes_numero_seq y transacciones_numero_seq.
-- 2) Borra clientes e intermediarios creados por los tests (DESPUÉS de los TRUNCATE, igual que el bloque
--    OPCIONAL en truncar_ordenes_transacciones.sql; evita FKs / filas colgantes si DELETE va primero):
--    clientes: nombre LIKE 'E2E %'
--    intermediarios: nombre LIKE 'E2E Int %' o 'E2E CC TiposActivos Int'.
-- El test (o scripts/limpiar-base-e2e.js) puede invocar esta RPC antes de correr E2E.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.limpiar_base_e2e()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1) Truncar transaccionalidad: misma secuencia que truncar_ordenes_transacciones.sql
  --    (sin auditoria_app: el script manual tampoco la toca; paridad = mismo efecto que pegar ese archivo + DELETE E2E).
  TRUNCATE TABLE public.movimientos_cuenta_corriente CASCADE;
  TRUNCATE TABLE public.movimientos_cuenta_corriente_intermediario CASCADE;
  TRUNCATE TABLE public.movimientos_caja CASCADE;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'orden_comisiones_generadas') THEN
    EXECUTE 'TRUNCATE TABLE public.orden_comisiones_generadas CASCADE';
  END IF;

  TRUNCATE TABLE public.transacciones CASCADE;
  TRUNCATE TABLE public.comisiones_orden CASCADE;
  TRUNCATE TABLE public.instrumentacion CASCADE;
  TRUNCATE TABLE public.ordenes CASCADE;

  IF EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'ordenes_numero_seq') THEN
    PERFORM setval('public.ordenes_numero_seq', 1, false);
  ELSIF (SELECT pg_get_serial_sequence('public.ordenes', 'numero')) IS NOT NULL THEN
    PERFORM setval(pg_get_serial_sequence('public.ordenes', 'numero'), 1, false);
  END IF;

  IF EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'transacciones_numero_seq') THEN
    PERFORM setval('public.transacciones_numero_seq', 1, false);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'contingencia_import_batch'
  ) THEN
    EXECUTE 'TRUNCATE TABLE public.contingencia_import_batch CASCADE';
  END IF;

  -- 2) Borrar datos E2E tras vaciar órdenes/transacciones (ver comentario en truncar_ordenes_transacciones.sql)
  DELETE FROM public.clientes WHERE nombre LIKE 'E2E %';
  DELETE FROM public.intermediarios
  WHERE nombre LIKE 'E2E Int %'
     OR nombre = 'E2E CC TiposActivos Int';

  -- Semilla de caja para E2E: tras TRUNCATE no queda saldo; los egresos validan contra movimientos cerrados.
  -- Tipo: ingreso manual de ajuste; nombre en catálogo puede ser «Ajuste ingreso» o «Ajuste Ingreso» → ILIKE.
  -- Montos alineados con tests/e2e/e2e-caja-seed-saldos.js (re-ejecutar esta función en Supabase dev tras cambiar montos).
  INSERT INTO public.movimientos_caja (moneda, monto, tipo_movimiento_id, concepto, fecha, caja_tipo, estado)
  SELECT 'ARS', 500000000::numeric, t.id, 'E2E seed caja tras limpiar_base_e2e', public.fecha_hoy_argentina(), 'efectivo', 'cerrado'
  FROM public.tipos_movimiento_caja t
  WHERE trim(t.nombre) ILIKE 'Ajuste ingreso' AND lower(trim(t.direccion)) = 'ingreso'
  LIMIT 1;
  INSERT INTO public.movimientos_caja (moneda, monto, tipo_movimiento_id, concepto, fecha, caja_tipo, estado)
  SELECT 'USD', 50000000::numeric, t.id, 'E2E seed caja tras limpiar_base_e2e', public.fecha_hoy_argentina(), 'efectivo', 'cerrado'
  FROM public.tipos_movimiento_caja t
  WHERE trim(t.nombre) ILIKE 'Ajuste ingreso' AND lower(trim(t.direccion)) = 'ingreso'
  LIMIT 1;
  INSERT INTO public.movimientos_caja (moneda, monto, tipo_movimiento_id, concepto, fecha, caja_tipo, estado)
  SELECT 'EUR', 50000000::numeric, t.id, 'E2E seed caja tras limpiar_base_e2e', public.fecha_hoy_argentina(), 'efectivo', 'cerrado'
  FROM public.tipos_movimiento_caja t
  WHERE trim(t.nombre) ILIKE 'Ajuste ingreso' AND lower(trim(t.direccion)) = 'ingreso'
  LIMIT 1;
  INSERT INTO public.movimientos_caja (moneda, monto, tipo_movimiento_id, concepto, fecha, caja_tipo, estado)
  SELECT 'USD', 50000000::numeric, t.id, 'E2E seed caja tras limpiar_base_e2e', public.fecha_hoy_argentina(), 'banco', 'cerrado'
  FROM public.tipos_movimiento_caja t
  WHERE trim(t.nombre) ILIKE 'Ajuste ingreso' AND lower(trim(t.direccion)) = 'ingreso'
  LIMIT 1;
  INSERT INTO public.movimientos_caja (moneda, monto, tipo_movimiento_id, concepto, fecha, caja_tipo, estado)
  SELECT 'ARS', 500000000::numeric, t.id, 'E2E seed caja tras limpiar_base_e2e', public.fecha_hoy_argentina(), 'banco', 'cerrado'
  FROM public.tipos_movimiento_caja t
  WHERE trim(t.nombre) ILIKE 'Ajuste ingreso' AND lower(trim(t.direccion)) = 'ingreso'
  LIMIT 1;
  INSERT INTO public.movimientos_caja (moneda, monto, tipo_movimiento_id, concepto, fecha, caja_tipo, estado)
  SELECT 'ARS', 500000000::numeric, t.id, 'E2E seed caja tras limpiar_base_e2e', public.fecha_hoy_argentina(), 'cheque', 'cerrado'
  FROM public.tipos_movimiento_caja t
  WHERE trim(t.nombre) ILIKE 'Ajuste ingreso' AND lower(trim(t.direccion)) = 'ingreso'
  LIMIT 1;
END;
$$;

COMMENT ON FUNCTION public.limpiar_base_e2e() IS 'Limpieza para E2E: trunca órdenes/transacciones/CC/caja, borra clientes/intermediarios E2E, inserta semilla de caja (ingresos manuales por moneda/tipo). Solo desarrollo.';

-- Solo service_role (scripts E2E). Sin PUBLIC/anon/authenticated → Security Advisor 0028.
REVOKE ALL ON FUNCTION public.limpiar_base_e2e() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.limpiar_base_e2e() FROM anon;
REVOKE ALL ON FUNCTION public.limpiar_base_e2e() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.limpiar_base_e2e() TO service_role;
