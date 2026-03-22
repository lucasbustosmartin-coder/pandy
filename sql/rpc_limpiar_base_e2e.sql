-- =============================================================================
-- RPC limpiar_base_e2e: para ambiente de desarrollo / E2E.
-- Ejecutar este archivo en Supabase SQL Editor una vez.
-- 1) Borra clientes e intermediarios creados por los tests:
--    clientes: nombre LIKE 'E2E %'
--    intermediarios: nombre LIKE 'E2E Int %' (p. ej. E2E Int 1739…) o nombre fijo del spec 02 (E2E CC TiposActivos Int).
-- 2) Trunca transaccionalidad en el mismo orden que truncar_ordenes_transacciones.sql
--    y resetea secuencias ordenes_numero_seq y transacciones_numero_seq.
-- El test (o scripts/limpiar-base-e2e.js) puede invocar esta RPC antes de correr E2E.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.limpiar_base_e2e()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1) Borrar datos creados por tests E2E (no incrementar suciedad en la base)
  DELETE FROM public.clientes WHERE nombre LIKE 'E2E %';
  DELETE FROM public.intermediarios
  WHERE nombre LIKE 'E2E Int %'
     OR nombre = 'E2E CC TiposActivos Int';

  -- 2) Truncar transaccionalidad (mismo orden que truncar_ordenes_transacciones.sql)
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
END;
$$;

COMMENT ON FUNCTION public.limpiar_base_e2e() IS 'Limpieza para E2E: borra clientes/intermediarios E2E y trunca órdenes/transacciones/CC/caja. Solo desarrollo.';

-- Permitir llamada desde service_role (script con SUPABASE_SERVICE_ROLE_KEY)
GRANT EXECUTE ON FUNCTION public.limpiar_base_e2e() TO service_role;
