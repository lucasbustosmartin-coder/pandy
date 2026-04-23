-- Diagnóstico rápido de volumen CC / pendientes (Fase 0 — docs/PLAN_MEJORA_PERFORMANCE_SYNC_CC.md)
-- Ejecutar en Supabase SQL Editor para dimensionar lentitud de carga CC vs sync por orden.
-- Si los totales son del orden de cientos/miles y la app igual se siente lenta, el cuello suele ser
-- red + JS + RPC (ver sección «Baseline producción» en el plan), no el volumen de filas leídas.

SELECT 'movimientos_cuenta_corriente' AS tabla, count(*)::bigint AS filas FROM public.movimientos_cuenta_corriente
UNION ALL
SELECT 'movimientos_cuenta_corriente_intermediario', count(*)::bigint FROM public.movimientos_cuenta_corriente_intermediario
UNION ALL
SELECT 'transacciones_pendiente', count(*)::bigint FROM public.transacciones WHERE lower(trim(estado)) = 'pendiente'
UNION ALL
SELECT 'reglas_de_negocio', count(*)::bigint FROM public.reglas_de_negocio;

-- Cuántas órdenes dispara el sync global (una RPC sync_cc_caja_orden por orden tras filtrar anuladas en app)
SELECT 'ordenes_distintas_instrumentacion' AS tabla, count(DISTINCT orden_id)::bigint AS filas FROM public.instrumentacion;
SELECT 'ordenes_inst_sin_anulada' AS tabla, count(DISTINCT i.orden_id)::bigint AS filas
FROM public.instrumentacion i
JOIN public.ordenes o ON o.id = i.orden_id
WHERE lower(trim(o.estado)) IS DISTINCT FROM 'anulada';
