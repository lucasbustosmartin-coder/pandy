-- Limpieza única (o idempotente): fila «Cierre orden N» en **moneda entregada** y monto **negativo**
-- en CC **cliente** para acuerdos USD-ARS / ARS-USD con intermediario y patrón **cp_ic**
-- (ingreso Cliente→Pandy + egreso Intermediario→Cliente).
--
-- Antes del fix en main.js (v3.7.60) esa línea se persistía en el libro Pandy–cliente; el sync actual
-- ya no la envía y la RPC `sync_cc_caja_orden` la borraría como huérfana **al ejecutarse** un sync
-- con el cliente nuevo. Si solo se consultaba CC sin disparar sync, la fila vieja quedaba en BD.
--
-- Orden sugerida: 1) desplegar front con el fix; 2) opcional: ejecutar este DELETE en Supabase
-- (prod/dev según corresponda); 3) alternativa sin SQL: abrir la orden en la app (orden ejecutada /
-- instrumentación cerrada) dispara sync en segundo plano y aplica el diff.
--
-- Verificación previa (solo lectura):
-- SELECT m.id, o.numero, m.concepto, m.moneda, m.monto, o.id AS orden_id
-- FROM public.movimientos_cuenta_corriente m
-- JOIN public.ordenes o ON o.id = m.orden_id
-- JOIN public.tipos_operacion t ON t.id = o.tipo_operacion_id
-- WHERE m.cliente_id IS NOT NULL
--   AND COALESCE(m.es_movimiento_manual, false) = false
--   AND m.clasificacion_movimiento = 'CIERRE_ORDEN_MULTIMONEDA'::public.movimiento_clasificacion
--   AND left(trim(m.concepto), 12) = 'Cierre orden'
--   AND upper(trim(m.moneda::text)) = upper(trim(o.moneda_entregada::text))
--   AND m.monto < 0
--   AND upper(trim(t.codigo::text)) IN ('USD-ARS', 'ARS-USD')
--   AND o.intermediario_id IS NOT NULL
--   AND EXISTS (
--     SELECT 1 FROM public.transacciones tr
--     JOIN public.instrumentacion i ON i.id = tr.instrumentacion_id AND i.orden_id = o.id
--     WHERE lower(tr.tipo::text) = 'ingreso'
--       AND lower(trim(tr.pagador::text)) = 'cliente'
--       AND lower(trim(tr.cobrador::text)) = 'pandy'
--   )
--   AND EXISTS (
--     SELECT 1 FROM public.transacciones tr2
--     JOIN public.instrumentacion i2 ON i2.id = tr2.instrumentacion_id AND i2.orden_id = o.id
--     WHERE lower(tr2.tipo::text) = 'egreso'
--       AND lower(trim(tr2.pagador::text)) = 'intermediario'
--       AND lower(trim(tr2.cobrador::text)) = 'cliente'
--   );

DELETE FROM public.movimientos_cuenta_corriente m
USING public.ordenes o
JOIN public.tipos_operacion t ON t.id = o.tipo_operacion_id
WHERE m.orden_id = o.id
  AND m.cliente_id IS NOT NULL
  AND COALESCE(m.es_movimiento_manual, false) = false
  AND m.clasificacion_movimiento = 'CIERRE_ORDEN_MULTIMONEDA'::public.movimiento_clasificacion
  AND left(trim(m.concepto), 12) = 'Cierre orden'
  AND upper(trim(m.moneda::text)) = upper(trim(o.moneda_entregada::text))
  AND m.monto < 0
  AND upper(trim(t.codigo::text)) IN ('USD-ARS', 'ARS-USD')
  AND o.intermediario_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.transacciones tr
    JOIN public.instrumentacion i ON i.id = tr.instrumentacion_id AND i.orden_id = o.id
    WHERE lower(tr.tipo::text) = 'ingreso'
      AND lower(trim(tr.pagador::text)) = 'cliente'
      AND lower(trim(tr.cobrador::text)) = 'pandy'
  )
  AND EXISTS (
    SELECT 1
    FROM public.transacciones tr2
    JOIN public.instrumentacion i2 ON i2.id = tr2.instrumentacion_id AND i2.orden_id = o.id
    WHERE lower(tr2.tipo::text) = 'egreso'
      AND lower(trim(tr2.pagador::text)) = 'intermediario'
      AND lower(trim(tr2.cobrador::text)) = 'cliente'
  );
