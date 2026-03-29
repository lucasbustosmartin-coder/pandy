-- Utilidad de prueba (desarrollo): poner en “ayer” (calendario Argentina) transacciones
-- ejecutadas, órdenes (fecha calendario), movimientos de cuenta corriente (cliente e
-- intermediario) y movimientos de caja que hoy figuran con fecha / día de estado_fecha
-- en hoy — siempre que estén ligados a esas órdenes o transacciones y no sean manuales.
--
-- Así podés ver en CC/caja “ayer” sin depender solo del próximo sync, y además comprobar
-- que un sync posterior sigue respetando fecha_ejecucion/updated_at de la trx (opción 1).
--
-- Uso: 1) Ejecutá los SELECT de “Vista previa”. 2) Ejecutá los UPDATE en orden: CC cliente,
--     CC intermediario, caja, transacciones, órdenes. 3) Opcional: sync en la app y verificá
--     que las fechas siguen en ayer (fuente = trx).
--
-- Ojo: solo dev / copia; no producción.

-- ========== Vista previa ==========
WITH hoy_ar AS (
  SELECT (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS d
),
ayer_ar AS (
  SELECT (h.d - interval '1 day')::date AS d FROM hoy_ar h
)
SELECT 'hoy_ar' AS ref, d::text AS valor FROM hoy_ar
UNION ALL
SELECT 'ayer_ar', d::text FROM ayer_ar;

-- Transacciones candidatas (ejecutadas con fecha de ejecución hoy en AR, o updated_at “hoy” en AR)
WITH hoy_ar AS (
  SELECT (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS d
),
cand_t AS (
  SELECT t.id
  FROM transacciones t
  JOIN instrumentacion i ON i.id = t.instrumentacion_id
  CROSS JOIN hoy_ar h
  WHERE t.estado = 'ejecutada'
    AND (
      t.fecha_ejecucion = h.d
      OR (t.updated_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = h.d
    )
)
SELECT t.id, t.numero, t.estado, t.fecha_ejecucion, t.updated_at, o.id AS orden_id, o.numero AS orden_numero
FROM transacciones t
JOIN instrumentacion i ON i.id = t.instrumentacion_id
JOIN ordenes o ON o.id = i.orden_id
WHERE t.id IN (SELECT id FROM cand_t)
ORDER BY o.numero NULLS LAST, t.numero NULLS LAST;

-- Órdenes con fecha calendario = hoy (Argentina)
WITH hoy_ar AS (
  SELECT (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS d
)
SELECT o.id, o.numero, o.fecha, o.estado, o.updated_at
FROM ordenes o
CROSS JOIN hoy_ar h
WHERE o.fecha = h.d
ORDER BY o.numero NULLS LAST;

-- Órdenes en alcance (trx candidatas + órdenes con fecha hoy): sirve para CC/caja
WITH hoy_ar AS (
  SELECT (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS d
),
cand_t AS (
  SELECT t.id
  FROM transacciones t
  JOIN instrumentacion i ON i.id = t.instrumentacion_id
  CROSS JOIN hoy_ar h
  WHERE t.estado = 'ejecutada'
    AND (
      t.fecha_ejecucion = h.d
      OR (t.updated_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = h.d
    )
),
cand_o AS (
  SELECT DISTINCT i.orden_id AS id
  FROM transacciones t
  JOIN instrumentacion i ON i.id = t.instrumentacion_id
  WHERE t.id IN (SELECT id FROM cand_t)
  UNION
  SELECT o.id
  FROM ordenes o
  CROSS JOIN hoy_ar h
  WHERE o.fecha = h.d
)
SELECT id FROM cand_o ORDER BY id;

-- Movimientos CC cliente que tocarían (hoy en fecha o en día de estado_fecha; no manual)
WITH hoy_ar AS (
  SELECT (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS d
),
cand_t AS (
  SELECT t.id
  FROM transacciones t
  JOIN instrumentacion i ON i.id = t.instrumentacion_id
  CROSS JOIN hoy_ar h
  WHERE t.estado = 'ejecutada'
    AND (
      t.fecha_ejecucion = h.d
      OR (t.updated_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = h.d
    )
),
cand_o AS (
  SELECT DISTINCT i.orden_id AS id
  FROM transacciones t
  JOIN instrumentacion i ON i.id = t.instrumentacion_id
  WHERE t.id IN (SELECT id FROM cand_t)
  UNION
  SELECT o.id
  FROM ordenes o
  CROSS JOIN hoy_ar h
  WHERE o.fecha = h.d
)
SELECT m.id, m.fecha, m.estado_fecha, m.orden_id, m.transaccion_id, left(m.concepto, 60) AS concepto
FROM movimientos_cuenta_corriente m
CROSS JOIN hoy_ar h
WHERE COALESCE(m.es_movimiento_manual, false) = false
  AND (
    m.transaccion_id IN (SELECT id FROM cand_t)
    OR m.orden_id IN (SELECT id FROM cand_o)
  )
  AND (
    m.fecha = h.d
    OR (m.estado_fecha AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = h.d
  );

-- Movimientos CC intermediario (mismo criterio)
WITH hoy_ar AS (
  SELECT (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS d
),
cand_t AS (
  SELECT t.id
  FROM transacciones t
  JOIN instrumentacion i ON i.id = t.instrumentacion_id
  CROSS JOIN hoy_ar h
  WHERE t.estado = 'ejecutada'
    AND (
      t.fecha_ejecucion = h.d
      OR (t.updated_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = h.d
    )
),
cand_o AS (
  SELECT DISTINCT i.orden_id AS id
  FROM transacciones t
  JOIN instrumentacion i ON i.id = t.instrumentacion_id
  WHERE t.id IN (SELECT id FROM cand_t)
  UNION
  SELECT o.id
  FROM ordenes o
  CROSS JOIN hoy_ar h
  WHERE o.fecha = h.d
)
SELECT m.id, m.fecha, m.estado_fecha, m.orden_id, m.transaccion_id, left(m.concepto, 60) AS concepto
FROM movimientos_cuenta_corriente_intermediario m
CROSS JOIN hoy_ar h
WHERE COALESCE(m.es_movimiento_manual, false) = false
  AND (
    m.transaccion_id IN (SELECT id FROM cand_t)
    OR m.orden_id IN (SELECT id FROM cand_o)
  )
  AND (
    m.fecha = h.d
    OR (m.estado_fecha AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = h.d
  );

-- Caja derivada de orden/sync (sin tipo_movimiento_id manual); fecha hoy en AR
WITH hoy_ar AS (
  SELECT (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS d
),
cand_t AS (
  SELECT t.id
  FROM transacciones t
  JOIN instrumentacion i ON i.id = t.instrumentacion_id
  CROSS JOIN hoy_ar h
  WHERE t.estado = 'ejecutada'
    AND (
      t.fecha_ejecucion = h.d
      OR (t.updated_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = h.d
    )
),
cand_o AS (
  SELECT DISTINCT i.orden_id AS id
  FROM transacciones t
  JOIN instrumentacion i ON i.id = t.instrumentacion_id
  WHERE t.id IN (SELECT id FROM cand_t)
  UNION
  SELECT o.id
  FROM ordenes o
  CROSS JOIN hoy_ar h
  WHERE o.fecha = h.d
)
SELECT m.id, m.fecha, m.estado_fecha, m.orden_id, m.transaccion_id, left(m.concepto, 50) AS concepto
FROM movimientos_caja m
CROSS JOIN hoy_ar h
WHERE m.tipo_movimiento_id IS NULL
  AND (
    m.transaccion_id IN (SELECT id FROM cand_t)
    OR m.orden_id IN (SELECT id FROM cand_o)
  )
  AND (
    m.fecha = h.d
    OR (
      m.estado_fecha IS NOT NULL
      AND (m.estado_fecha AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = h.d
    )
  );


-- ========== UPDATE (ejecutar en este orden) ==========
-- Importante: primero CC y caja, después transacciones. Si actualizás las trx antes, cand_t
-- deja de matchear “hoy” y los UPDATE de movimientos no encuentran filas.

-- 1a) CC cliente
WITH hoy_ar AS (
  SELECT (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS d
),
ayer_ar AS (
  SELECT (h.d - interval '1 day')::date AS d FROM hoy_ar h
),
cand_t AS (
  SELECT t.id
  FROM transacciones t
  JOIN instrumentacion i ON i.id = t.instrumentacion_id
  CROSS JOIN hoy_ar h
  WHERE t.estado = 'ejecutada'
    AND (
      t.fecha_ejecucion = h.d
      OR (t.updated_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = h.d
    )
),
cand_o AS (
  SELECT DISTINCT i.orden_id AS id
  FROM transacciones t
  JOIN instrumentacion i ON i.id = t.instrumentacion_id
  WHERE t.id IN (SELECT id FROM cand_t)
  UNION
  SELECT o.id
  FROM ordenes o
  CROSS JOIN hoy_ar h
  WHERE o.fecha = h.d
)
UPDATE movimientos_cuenta_corriente m
SET
  fecha = a.d,
  estado_fecha = make_timestamptz(
    EXTRACT(YEAR FROM a.d)::int,
    EXTRACT(MONTH FROM a.d)::int,
    EXTRACT(DAY FROM a.d)::int,
    12, 0, 0,
    'America/Argentina/Buenos_Aires'
  )
FROM ayer_ar a, hoy_ar h
WHERE COALESCE(m.es_movimiento_manual, false) = false
  AND (
    m.transaccion_id IN (SELECT id FROM cand_t)
    OR m.orden_id IN (SELECT id FROM cand_o)
  )
  AND (
    m.fecha = h.d
    OR (m.estado_fecha AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = h.d
  );

-- 1b) CC intermediario
WITH hoy_ar AS (
  SELECT (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS d
),
ayer_ar AS (
  SELECT (h.d - interval '1 day')::date AS d FROM hoy_ar h
),
cand_t AS (
  SELECT t.id
  FROM transacciones t
  JOIN instrumentacion i ON i.id = t.instrumentacion_id
  CROSS JOIN hoy_ar h
  WHERE t.estado = 'ejecutada'
    AND (
      t.fecha_ejecucion = h.d
      OR (t.updated_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = h.d
    )
),
cand_o AS (
  SELECT DISTINCT i.orden_id AS id
  FROM transacciones t
  JOIN instrumentacion i ON i.id = t.instrumentacion_id
  WHERE t.id IN (SELECT id FROM cand_t)
  UNION
  SELECT o.id
  FROM ordenes o
  CROSS JOIN hoy_ar h
  WHERE o.fecha = h.d
)
UPDATE movimientos_cuenta_corriente_intermediario m
SET
  fecha = a.d,
  estado_fecha = make_timestamptz(
    EXTRACT(YEAR FROM a.d)::int,
    EXTRACT(MONTH FROM a.d)::int,
    EXTRACT(DAY FROM a.d)::int,
    12, 0, 0,
    'America/Argentina/Buenos_Aires'
  )
FROM ayer_ar a, hoy_ar h
WHERE COALESCE(m.es_movimiento_manual, false) = false
  AND (
    m.transaccion_id IN (SELECT id FROM cand_t)
    OR m.orden_id IN (SELECT id FROM cand_o)
  )
  AND (
    m.fecha = h.d
    OR (m.estado_fecha AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = h.d
  );

-- 1c) Caja (solo filas de sync; excluye manuales con tipo_movimiento_id)
WITH hoy_ar AS (
  SELECT (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS d
),
ayer_ar AS (
  SELECT (h.d - interval '1 day')::date AS d FROM hoy_ar h
),
cand_t AS (
  SELECT t.id
  FROM transacciones t
  JOIN instrumentacion i ON i.id = t.instrumentacion_id
  CROSS JOIN hoy_ar h
  WHERE t.estado = 'ejecutada'
    AND (
      t.fecha_ejecucion = h.d
      OR (t.updated_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = h.d
    )
),
cand_o AS (
  SELECT DISTINCT i.orden_id AS id
  FROM transacciones t
  JOIN instrumentacion i ON i.id = t.instrumentacion_id
  WHERE t.id IN (SELECT id FROM cand_t)
  UNION
  SELECT o.id
  FROM ordenes o
  CROSS JOIN hoy_ar h
  WHERE o.fecha = h.d
)
UPDATE movimientos_caja m
SET
  fecha = a.d,
  estado_fecha = make_timestamptz(
    EXTRACT(YEAR FROM a.d)::int,
    EXTRACT(MONTH FROM a.d)::int,
    EXTRACT(DAY FROM a.d)::int,
    12, 0, 0,
    'America/Argentina/Buenos_Aires'
  )
FROM ayer_ar a, hoy_ar h
WHERE m.tipo_movimiento_id IS NULL
  AND (
    m.transaccion_id IN (SELECT id FROM cand_t)
    OR m.orden_id IN (SELECT id FROM cand_o)
  )
  AND (
    m.fecha = h.d
    OR (
      m.estado_fecha IS NOT NULL
      AND (m.estado_fecha AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = h.d
    )
  );

-- 2) Transacciones ejecutadas “de hoy” → fecha_ejecucion y updated_at al mediodía de ayer (AR)
WITH hoy_ar AS (
  SELECT (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS d
),
ayer_ar AS (
  SELECT (h.d - interval '1 day')::date AS d FROM hoy_ar h
),
cand_t AS (
  SELECT t.id
  FROM transacciones t
  JOIN instrumentacion i ON i.id = t.instrumentacion_id
  CROSS JOIN hoy_ar h
  WHERE t.estado = 'ejecutada'
    AND (
      t.fecha_ejecucion = h.d
      OR (t.updated_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = h.d
    )
)
UPDATE transacciones t
SET
  fecha_ejecucion = a.d,
  updated_at = make_timestamptz(
    EXTRACT(YEAR FROM a.d)::int,
    EXTRACT(MONTH FROM a.d)::int,
    EXTRACT(DAY FROM a.d)::int,
    12, 0, 0,
    'America/Argentina/Buenos_Aires'
  )
FROM ayer_ar a
WHERE t.id IN (SELECT id FROM cand_t);

-- 3) Órdenes con fecha = hoy (AR) → fecha y updated_at al mediodía de ayer (AR)
WITH hoy_ar AS (
  SELECT (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS d
),
ayer_ar AS (
  SELECT (h.d - interval '1 day')::date AS d FROM hoy_ar h
)
UPDATE ordenes o
SET
  fecha = a.d,
  updated_at = make_timestamptz(
    EXTRACT(YEAR FROM a.d)::int,
    EXTRACT(MONTH FROM a.d)::int,
    EXTRACT(DAY FROM a.d)::int,
    12, 0, 0,
    'America/Argentina/Buenos_Aires'
  )
FROM hoy_ar h, ayer_ar a
WHERE o.fecha = h.d;
