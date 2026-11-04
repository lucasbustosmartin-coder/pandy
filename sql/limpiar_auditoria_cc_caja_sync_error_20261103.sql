-- Borrar rastro en auditoría del error de sync del 2026-11-03 (plan A).
-- No toca movimientos de CC/caja. Solo `auditoria_app` categoría `cc_caja_sync`.
-- Incluye: ping-pong anulado↔cerrado (misma fila); alta+anular de caja inventada 439 y 577;
--          rastro de congeladas 23/28/41/42/106 (no debían sincronizarse).
-- Excluye: 576 (arreglo pedido), 1140/1141/1143 (operación del día), 788.
-- Ejecutar en Pandy y Pandy-Dev (idempotente si ya no hay filas).

WITH ping AS (
  SELECT (a.metadata->>'registro_id')::uuid AS rid
  FROM public.auditoria_app a
  WHERE a.categoria = 'cc_caja_sync'
    AND a.accion = 'anular'
    AND a.creado_en >= timestamptz '2026-11-03 00:00:00-03'
    AND a.creado_en < timestamptz '2026-11-04 00:00:00-03'
    AND NULLIF(a.metadata->>'orden_numero', '')::int IS DISTINCT FROM 576
  INTERSECT
  SELECT (a.metadata->>'registro_id')::uuid
  FROM public.auditoria_app a
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(a.metadata->'cambios', '[]'::jsonb)) c
  WHERE a.categoria = 'cc_caja_sync'
    AND a.accion = 'editar'
    AND a.creado_en >= timestamptz '2026-11-03 00:00:00-03'
    AND a.creado_en < timestamptz '2026-11-04 00:00:00-03'
    AND c->>'campo' = 'Estado'
    AND lower(COALESCE(c->>'anterior', '')) IN ('anulado', 'anulada')
    AND lower(COALESCE(c->>'nuevo', '')) NOT IN ('anulado', 'anulada')
    AND NULLIF(a.metadata->>'orden_numero', '')::int IS DISTINCT FROM 576
),
borrar AS (
  SELECT a.id
  FROM public.auditoria_app a
  WHERE a.categoria = 'cc_caja_sync'
    AND a.creado_en >= timestamptz '2026-11-03 00:00:00-03'
    AND a.creado_en < timestamptz '2026-11-04 00:00:00-03'
    AND NULLIF(a.metadata->>'orden_numero', '')::int NOT IN (576, 788, 1140, 1141, 1143)
    AND (
      (NULLIF(trim(COALESCE(a.metadata->>'registro_id', '')), '') <> ''
        AND (a.metadata->>'registro_id')::uuid IN (SELECT rid FROM ping))
      OR (
        a.accion IN ('alta', 'anular')
        AND a.metadata->>'entidad' = 'caja'
        AND NULLIF(a.metadata->>'orden_numero', '')::int IN (439, 577)
      )
      OR (
        a.accion = 'anular'
        AND NULLIF(a.metadata->>'orden_numero', '')::int IN (28, 41, 42)
      )
      OR NULLIF(a.metadata->>'orden_numero', '')::int IN (23, 106)
    )
)
DELETE FROM public.auditoria_app x
WHERE x.id IN (SELECT id FROM borrar);
