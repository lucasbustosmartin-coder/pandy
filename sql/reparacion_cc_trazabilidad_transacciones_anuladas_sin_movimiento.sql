-- =============================================================================
-- Reparación: transacciones en estado `anulada` sin ninguna fila en CC cliente
-- ni intermediario (hueco frente a `control_calidad_informe.trans_anulada_sin_registro_cc`).
--
-- Contexto (no es un bug del control; es dato histórico o sync incompleto):
-- - Tras anular orden, el flujo canónico llama `sincronizarCcYCajaDesdeOrden` y debería
--   persistir líneas CC con estado anulado ligadas a cada transacción anulada.
-- - Si en su momento falló el sync, se anuló fuera de ese flujo, o el motor no
--   emitió filas para esa combinación reglas × trx anulada, puede quedar `transacciones.estado = anulada`
--   sin `movimientos_cuenta_corriente` / `movimientos_cuenta_corriente_intermediario` con ese `transaccion_id`.
--   Ver también `sql/auditoria_cc_transacciones_y_ordenes.sql` §3b.
--
-- Qué hace este script (idempotente):
-- - Inserta **una** fila marcadora por transacción candidata:
--   - `owner = intermediario` y la orden tiene `intermediario_id` → libro intermediario.
--   - En cualquier otro caso → libro cliente (incluye `owner` pandy/cliente).
-- - `monto` = 0 y columnas `monto_usd` / `monto_ars` / `monto_eur` = 0 → **no altera saldos**.
-- - `estado` = `anulado`, `es_movimiento_manual` = false (alineado al informe de calidad).
-- - `concepto` indica backfill para auditoría humana.
--
-- Uso en Supabase SQL Editor:
-- 1) Ejecutar solo el bloque «VISTA PREVIA» y revisar filas.
-- 2) Ejecutar el bloque «INSERT» (y opcionalmente «VERIFICACIÓN»).
--
-- Luego conviene **Refrescar** CC en la app o volver a correr sync por orden si querés
-- reemplazar estos marcadores por líneas generadas por el motor (opcional).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- VISTA PREVIA (solo lectura): mismas filas que insertaría el bloque siguiente
-- -----------------------------------------------------------------------------
SELECT
  t.id AS transaccion_id,
  t.numero AS transaccion_numero,
  t.owner,
  t.moneda,
  o.id AS orden_id,
  o.numero AS orden_numero,
  o.fecha AS fecha_orden,
  o.estado AS estado_orden,
  CASE
    WHEN lower(coalesce(t.owner, '')) = 'intermediario' AND o.intermediario_id IS NOT NULL
      THEN 'movimientos_cuenta_corriente_intermediario'
    ELSE 'movimientos_cuenta_corriente'
  END AS libro_destino
FROM public.transacciones t
JOIN public.instrumentacion i ON i.id = t.instrumentacion_id
JOIN public.ordenes o ON o.id = i.orden_id
WHERE lower(coalesce(t.estado, '')) = 'anulada'
  AND NOT EXISTS (
    SELECT 1 FROM public.movimientos_cuenta_corriente m WHERE m.transaccion_id = t.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.movimientos_cuenta_corriente_intermediario m WHERE m.transaccion_id = t.id
  )
  AND o.cliente_id IS NOT NULL
ORDER BY o.numero NULLS LAST, t.numero NULLS LAST;

-- -----------------------------------------------------------------------------
-- INSERT: libro cliente (mayoría de casos + owner pandy/cliente o int sin id)
-- -----------------------------------------------------------------------------
INSERT INTO public.movimientos_cuenta_corriente (
  cliente_id,
  moneda,
  monto,
  monto_usd,
  monto_ars,
  monto_eur,
  orden_id,
  transaccion_id,
  transaccion_numero,
  concepto,
  fecha,
  usuario_id,
  estado,
  estado_fecha,
  es_movimiento_manual
)
SELECT
  o.cliente_id,
  CASE
    WHEN upper(trim(coalesce(t.moneda, ''))) IN ('USD', 'EUR', 'ARS')
      THEN upper(trim(t.moneda))
    ELSE 'USD'
  END AS moneda,
  0::numeric(18, 4) AS monto,
  0::numeric(18, 4),
  0::numeric(18, 4),
  0::numeric(18, 4),
  o.id,
  t.id,
  t.numero,
  'Trazabilidad transacción anulada — Orden ' || o.numero::text || ', Trans. ' || t.numero::text
    || ' (backfill CC sin movimiento histórico)' AS concepto,
  COALESCE(t.fecha_ejecucion, o.fecha, public.fecha_hoy_argentina()) AS fecha,
  COALESCE(t.usuario_id, o.usuario_id) AS usuario_id,
  'anulado'::text,
  now(),
  false
FROM public.transacciones t
JOIN public.instrumentacion i ON i.id = t.instrumentacion_id
JOIN public.ordenes o ON o.id = i.orden_id
WHERE lower(coalesce(t.estado, '')) = 'anulada'
  AND o.cliente_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.movimientos_cuenta_corriente m WHERE m.transaccion_id = t.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.movimientos_cuenta_corriente_intermediario m WHERE m.transaccion_id = t.id
  )
  AND NOT (
    lower(coalesce(t.owner, '')) = 'intermediario'
    AND o.intermediario_id IS NOT NULL
  );

-- -----------------------------------------------------------------------------
-- INSERT: libro intermediario (solo owner intermediario con intermediario en orden)
-- -----------------------------------------------------------------------------
INSERT INTO public.movimientos_cuenta_corriente_intermediario (
  intermediario_id,
  moneda,
  monto,
  monto_usd,
  monto_ars,
  monto_eur,
  orden_id,
  transaccion_id,
  transaccion_numero,
  concepto,
  fecha,
  usuario_id,
  estado,
  estado_fecha,
  es_movimiento_manual
)
SELECT
  o.intermediario_id,
  CASE
    WHEN upper(trim(coalesce(t.moneda, ''))) IN ('USD', 'EUR', 'ARS')
      THEN upper(trim(t.moneda))
    ELSE 'USD'
  END AS moneda,
  0::numeric(18, 4) AS monto,
  0::numeric(18, 4),
  0::numeric(18, 4),
  0::numeric(18, 4),
  o.id,
  t.id,
  t.numero,
  'Trazabilidad transacción anulada — Orden ' || o.numero::text || ', Trans. ' || t.numero::text
    || ' (backfill CC sin movimiento histórico)' AS concepto,
  COALESCE(t.fecha_ejecucion, o.fecha, public.fecha_hoy_argentina()) AS fecha,
  COALESCE(t.usuario_id, o.usuario_id) AS usuario_id,
  'anulado'::text,
  now(),
  false
FROM public.transacciones t
JOIN public.instrumentacion i ON i.id = t.instrumentacion_id
JOIN public.ordenes o ON o.id = i.orden_id
WHERE lower(coalesce(t.estado, '')) = 'anulada'
  AND lower(coalesce(t.owner, '')) = 'intermediario'
  AND o.intermediario_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.movimientos_cuenta_corriente m WHERE m.transaccion_id = t.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.movimientos_cuenta_corriente_intermediario m WHERE m.transaccion_id = t.id
  );

-- -----------------------------------------------------------------------------
-- VERIFICACIÓN: debería devolver 0 filas si el hueco quedó cubierto
-- -----------------------------------------------------------------------------
SELECT
  t.id AS transaccion_id,
  t.numero AS transaccion_numero,
  o.numero AS orden_numero
FROM public.transacciones t
JOIN public.instrumentacion i ON i.id = t.instrumentacion_id
JOIN public.ordenes o ON o.id = i.orden_id
WHERE lower(coalesce(t.estado, '')) = 'anulada'
  AND NOT EXISTS (
    SELECT 1 FROM public.movimientos_cuenta_corriente m WHERE m.transaccion_id = t.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.movimientos_cuenta_corriente_intermediario m WHERE m.transaccion_id = t.id
  )
ORDER BY o.numero NULLS LAST, t.numero NULLS LAST;

-- Si la verificación aún devuelve filas con `orden` **sin** `cliente_id`, este script no las inserta;
-- descomentá y ejecutá aparte:
-- SELECT o.numero, o.id, t.id, t.numero
-- FROM public.transacciones t
-- JOIN public.instrumentacion i ON i.id = t.instrumentacion_id
-- JOIN public.ordenes o ON o.id = i.orden_id
-- WHERE lower(coalesce(t.estado, '')) = 'anulada'
--   AND o.cliente_id IS NULL
--   AND NOT EXISTS (SELECT 1 FROM public.movimientos_cuenta_corriente m WHERE m.transaccion_id = t.id)
--   AND NOT EXISTS (SELECT 1 FROM public.movimientos_cuenta_corriente_intermediario m WHERE m.transaccion_id = t.id);
