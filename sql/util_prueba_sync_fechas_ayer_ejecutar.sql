-- Solo UPDATE (dev): mover un día calendario → el día anterior en órdenes, trx, CC, caja.
-- Una sola fila de fechas abajo (sin now()).
--
-- CC y caja: solo filtran por fecha (y día de estado_fecha en AR), sin cand_t/cand_o.
-- Si no, al haber ya pasado trx/orden a `hasta`, cand queda vacío y los movimientos
-- siguen con fecha `desde` (tu caso: CC intermediario 29/03 con trx ya en 28/03).
--
-- Orden sugerido: CC cliente → CC intermediario → caja → transacciones → órdenes.

BEGIN;

DROP TABLE IF EXISTS _tmp_prueba_fechas;
CREATE TEMP TABLE _tmp_prueba_fechas (desde date NOT NULL, hasta date NOT NULL);

-- ▼▼▼ ÚNICO LUGAR A EDITAR ▼▼▼
INSERT INTO _tmp_prueba_fechas (desde, hasta) VALUES (DATE '2026-03-29', DATE '2026-03-28');
-- ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲

-- 1) CC cliente (todas las filas no manuales con fecha o estado_fecha “desde” en AR)
WITH c AS (SELECT * FROM _tmp_prueba_fechas)
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

-- 2) CC intermediario
WITH c AS (SELECT * FROM _tmp_prueba_fechas)
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
WHERE COALESCE(m.es_movimiento_manual, false) = false
  AND (
    m.fecha = c.desde
    OR (
      m.estado_fecha IS NOT NULL
      AND (m.estado_fecha AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = c.desde
    )
  );

-- 3) Caja (sync: sin tipo_movimiento_id)
WITH c AS (SELECT * FROM _tmp_prueba_fechas)
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

-- 4) Transacciones ejecutadas
WITH c AS (SELECT * FROM _tmp_prueba_fechas),
cand_t AS (
  SELECT t.id
  FROM transacciones t
  JOIN instrumentacion i ON i.id = t.instrumentacion_id
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
WITH c AS (SELECT * FROM _tmp_prueba_fechas)
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

COMMIT;
