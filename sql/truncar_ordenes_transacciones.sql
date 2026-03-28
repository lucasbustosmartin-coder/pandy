-- =============================================================================
-- TRUNCATE: ejecutar TODO este archivo en Supabase SQL Editor.
-- Abrís sql/truncar_ordenes_transacciones.sql, copiás todo y pegás en el editor,
-- luego Run. Hacerlo antes del test E2E si querés arranque limpio (0 órdenes).
-- =============================================================================
--
-- Borrar toda la transaccionalidad para volver a probar de cero.
-- Se borran: movimientos CC (cliente e intermediario), movimientos_caja, orden_comisiones_generadas (si existe),
--   transacciones, comisiones_orden, instrumentacion, ordenes.
-- Incluye movimientos CC manuales (sin orden): mismas tablas; orden_id / transaccion_id pueden ser NULL (migración CC manual).
-- No se tocan: clientes, intermediarios, modos_pago, tipos_operacion, tipos_movimiento_caja, reglas_de_negocio,
--   app_empresa, app_config, usuarios/seguridad.
-- Staging contingencia: si existe, las filas con FK a ordenes/transacciones se truncan en cascada al truncar esas tablas;
--   el bloque OPCIONAL más abajo vacía también los lotes staging (batch + filas) por si querés 0 filas ahí.
-- Orden: de hijas a madres (quien referencia primero). Tras truncar se resetean ordenes_numero_seq y transacciones_numero_seq (próxima orden nº 1, próxima transacción nº 1).
--
-- E2E: si además querés borrar clientes/intermediarios creado por los tests, NO alcanza con este archivo:
--   ejecutá la RPC public.limpiar_base_e2e() (sql/rpc_limpiar_base_e2e.sql) o node scripts/limpiar-base-e2e.js
--   (misma secuencia TRUNCATE que este archivo + DELETE clientes E2E + DELETE intermediarios E2E; no trunca auditoria_app).
-- Bloque OPCIONAL al final de este archivo: mismo DELETE que la RPC, a ejecutar *después* de los TRUNCATE.

TRUNCATE TABLE public.movimientos_cuenta_corriente CASCADE;
TRUNCATE TABLE public.movimientos_cuenta_corriente_intermediario CASCADE;
TRUNCATE TABLE public.movimientos_caja CASCADE;
-- orden_comisiones_generadas (si existe) referencia transacciones y ordenes; debe vaciarse antes que ambas.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'orden_comisiones_generadas') THEN
    EXECUTE 'TRUNCATE TABLE public.orden_comisiones_generadas CASCADE';
  END IF;
END $$;
TRUNCATE TABLE public.transacciones CASCADE;
TRUNCATE TABLE public.comisiones_orden CASCADE;
TRUNCATE TABLE public.instrumentacion CASCADE;
TRUNCATE TABLE public.ordenes CASCADE;
-- Reset secuencia del número interno de orden (si existe) para que la próxima sea nº 1.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'ordenes_numero_seq') THEN
    PERFORM setval('public.ordenes_numero_seq', 1, false);
  ELSIF (SELECT pg_get_serial_sequence('public.ordenes', 'numero')) IS NOT NULL THEN
    PERFORM setval(pg_get_serial_sequence('public.ordenes', 'numero'), 1, false);
  END IF;
END $$;

-- Reset secuencia del número interno de transacción (si existe).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'transacciones_numero_seq') THEN
    PERFORM setval('public.transacciones_numero_seq', 1, false);
  END IF;
END $$;

-- =============================================================================
-- OPCIONAL — Staging importación contingencia (sql/migracion_contingencia_import_staging.sql)
-- TRUNCATE del batch en cascada vacía acuerdos/transacciones/comisiones en staging. Ejecutar si la tabla existe.
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'contingencia_import_batch'
  ) THEN
    EXECUTE 'TRUNCATE TABLE public.contingencia_import_batch CASCADE';
  END IF;
END $$;

-- =============================================================================
-- OPCIONAL — E2E / suciedad de tests (mismo criterio que public.limpiar_base_e2e)
-- Descomentá las dos líneas DELETE de abajo si corrés este script a mano y querés
-- eliminar también clientes e intermediarios creados por Playwright.
-- IMPORTANTE: debe ir DESPUÉS de los TRUNCATE (ya no hay órdenes que referencien esos ids).
-- =============================================================================
-- DELETE FROM public.clientes WHERE nombre LIKE 'E2E %';
-- DELETE FROM public.intermediarios WHERE nombre LIKE 'E2E Int %' OR nombre = 'E2E CC TiposActivos Int';