-- Dev / prueba: corregir día contable UTC→Argentina (30/03/2026 → 29/03/2026).
-- Ajusta órdenes, transacciones ejecutadas, CC (cliente e intermediario), caja.
-- Orden: CC → caja → transacciones → órdenes (misma idea que util_prueba_sync_fechas_ayer_ejecutar.sql).
--
-- Antes de COMMIT: revisá los SELECT de verificación al final (descomentá si querés).
-- Solo en Supabase SQL Editor o psql con rol que pueda UPDATE en public.

BEGIN;

DROP TABLE IF EXISTS _tmp_restaurar_fechas;
CREATE TEMP TABLE _tmp_restaurar_fechas (desde date NOT NULL, hasta date NOT NULL);

-- Día mal grabado (UTC) → día correcto (Argentina)
INSERT INTO _tmp_restaurar_fechas (desde, hasta) VALUES (DATE '2026-03-30', DATE '2026-03-29');

-- 1) CC cliente — derivados de orden (no manual)
WITH c AS (SELECT * FROM _tmp_restaurar_fechas)
UPDATE movimientos_cuenta_corriente m
SET
  fecha = c.hasta,
  estado_fecha = make_timestamptz(
    EXTRACT(YEAR FROM c.hasta)::int,
    EXTRACT(MONTH FROM c.hasta)::int,
    EXTRACT(DAY FROM c.hasta)::int,
    12, 0, 0,
    'America/Argentina/Buenos_Aires'
  )
FROM c
WHERE COALESCE(m.es_movimiento_manual, false) = false
  AND (
    m.fecha = c.desde
    OR (
      m.estado_fecha IS NOT NULL
      AND (m.estado_fecha AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = c.desde
    )
  );

-- 1b) CC cliente — movimientos manuales (misma corrección de día)
WITH c AS (SELECT * FROM _tmp_restaurar_fechas)
UPDATE movimientos_cuenta_corriente m
SET
  fecha = c.hasta,
  estado_fecha = make_timestamptz(
    EXTRACT(YEAR FROM c.hasta)::int,
    EXTRACT(MONTH FROM c.hasta)::int,
    EXTRACT(DAY FROM c.hasta)::int,
    12, 0, 0,
    'America/Argentina/Buenos_Aires'
  )
FROM c
WHERE COALESCE(m.es_movimiento_manual, false) = true
  AND (
    m.fecha = c.desde
    OR (
      m.estado_fecha IS NOT NULL
      AND (m.estado_fecha AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = c.desde
    )
  );

-- 2) CC intermediario (todas las filas con día «desde»; incluye manual si aplica)
WITH c AS (SELECT * FROM _tmp_restaurar_fechas)
UPDATE movimientos_cuenta_corriente_intermediario m
SET
  fecha = c.hasta,
  estado_fecha = make_timestamptz(
    EXTRACT(YEAR FROM c.hasta)::int,
    EXTRACT(MONTH FROM c.hasta)::int,
    EXTRACT(DAY FROM c.hasta)::int,
    12, 0, 0,
    'America/Argentina/Buenos_Aires'
  )
FROM c
WHERE (
    m.fecha = c.desde
    OR (
      m.estado_fecha IS NOT NULL
      AND (m.estado_fecha AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = c.desde
    )
  );

-- 3) Caja vinculada a orden / transacción (sin tipo_movimiento_id = manual)
WITH c AS (SELECT * FROM _tmp_restaurar_fechas)
UPDATE movimientos_caja m
SET
  fecha = c.hasta,
  estado_fecha = make_timestamptz(
    EXTRACT(YEAR FROM c.hasta)::int,
    EXTRACT(MONTH FROM c.hasta)::int,
    EXTRACT(DAY FROM c.hasta)::int,
    12, 0, 0,
    'America/Argentina/Buenos_Aires'
  )
FROM c
WHERE m.tipo_movimiento_id IS NULL
  AND (
    m.fecha = c.desde
    OR (
      m.estado_fecha IS NOT NULL
      AND (m.estado_fecha AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = c.desde
    )
  );

-- 3b) Caja manual (tipo_movimiento_id NOT NULL)
WITH c AS (SELECT * FROM _tmp_restaurar_fechas)
UPDATE movimientos_caja m
SET
  fecha = c.hasta,
  estado_fecha = make_timestamptz(
    EXTRACT(YEAR FROM c.hasta)::int,
    EXTRACT(MONTH FROM c.hasta)::int,
    EXTRACT(DAY FROM c.hasta)::int,
    12, 0, 0,
    'America/Argentina/Buenos_Aires'
  )
FROM c
WHERE m.tipo_movimiento_id IS NOT NULL
  AND (
    m.fecha = c.desde
    OR (
      m.estado_fecha IS NOT NULL
      AND (m.estado_fecha AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = c.desde
    )
  );

-- 4) Transacciones ejecutadas (fecha_ejecucion o updated_at calendario AR = desde)
WITH c AS (SELECT * FROM _tmp_restaurar_fechas),
cand_t AS (
  SELECT t.id
  FROM transacciones t
  CROSS JOIN c
  WHERE t.estado = 'ejecutada'
    AND (
      t.fecha_ejecucion = c.desde
      OR (t.updated_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = c.desde
    )
)
UPDATE transacciones t
SET
  fecha_ejecucion = c.hasta,
  updated_at = make_timestamptz(
    EXTRACT(YEAR FROM c.hasta)::int,
    EXTRACT(MONTH FROM c.hasta)::int,
    EXTRACT(DAY FROM c.hasta)::int,
    12, 0, 0,
    'America/Argentina/Buenos_Aires'
  )
FROM c
WHERE t.id IN (SELECT id FROM cand_t);

-- 5) Órdenes
WITH c AS (SELECT * FROM _tmp_restaurar_fechas)
UPDATE ordenes o
SET
  fecha = c.hasta,
  updated_at = make_timestamptz(
    EXTRACT(YEAR FROM c.hasta)::int,
    EXTRACT(MONTH FROM c.hasta)::int,
    EXTRACT(DAY FROM c.hasta)::int,
    12, 0, 0,
    'America/Argentina/Buenos_Aires'
  )
FROM c
WHERE o.fecha = c.desde;

-- Verificación (opcional: ejecutar antes de COMMIT cambiando a ROLLBACK arriba, o como queries sueltas)
-- SELECT 'ordenes' AS t, count(*) FROM ordenes WHERE fecha = DATE '2026-03-30';
-- SELECT 'transacciones' AS t, count(*) FROM transacciones WHERE estado = 'ejecutada' AND fecha_ejecucion = DATE '2026-03-30';
-- SELECT 'cc_cliente' AS t, count(*) FROM movimientos_cuenta_corriente WHERE fecha = DATE '2026-03-30';
-- SELECT 'cc_int' AS t, count(*) FROM movimientos_cuenta_corriente_intermediario WHERE fecha = DATE '2026-03-30';
-- SELECT 'caja' AS t, count(*) FROM movimientos_caja WHERE fecha = DATE '2026-03-30';

COMMIT;
