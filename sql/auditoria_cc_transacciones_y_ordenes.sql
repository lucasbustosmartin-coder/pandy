-- Auditoría: posibles fugas entre transacciones / órdenes y movimientos de cuenta corriente
-- Ejecutar en Supabase SQL Editor (prod o dev). Revisar resultados: algunos casos pueden ser
-- válidos por reglas de negocio (transacción que no genera CC en ningún libro); el valor está
-- en listar candidatos y contrastar con la orden en la app (sync / reglas).
-- Consultas 1 y 1b incluyen tipo_operacion_codigo y pag/cob para cruzar con `reglas_de_negocio`.
--
-- Órdenes en estado **anulada:** no se tratan como “fuga” en §1, §1b ni §2 (las transacciones
-- anuladas no entran ahí). El modelo vigente en la app: tras anular orden debe correr el sync
-- por orden y quedar filas CC con estado **anulado** (visibles, no suman al saldo). La **§3b**
-- lista anuladas con trx pero 0 CC (legado o sync fallido). La §5 lista todas las órdenes con trx;
-- la §5a excluye anuladas para la vista «solo vigentes».
--
-- Tablas: ordenes, instrumentacion, transacciones,
--         movimientos_cuenta_corriente (cliente), movimientos_cuenta_corriente_intermediario.

-- =============================================================================
-- 1) Transacciones NO anuladas (pendiente o ejecutada) sin NINGUNA fila CC
--    (ni en libro cliente ni en libro intermediario), por transaccion_id.
--    Excluye orden en estado **anulada** (no es fuga de sync).
--    Candidatas a “nunca se persistió CC para esta pata”.
--    Columnas extra: tipo de operación, pag/cob/moneda/monto/concepto, MC manual
--    (para contrastar con reglas_de_negocio y con la app tras Refrescar CC).
-- =============================================================================
SELECT
  t.id AS transaccion_id,
  t.numero AS transaccion_numero,
  t.estado AS transaccion_estado,
  t.tipo,
  t.pagador,
  t.cobrador,
  t.moneda,
  t.monto,
  left(coalesce(t.concepto, ''), 120) AS concepto_prefijo,
  top.codigo AS tipo_operacion_codigo,
  coalesce(top.usa_intermediario, false) AS catalogo_usa_intermediario,
  coalesce(i.multicontraparte_manual, false) AS multicontraparte_manual,
  o.numero AS orden_numero,
  o.id AS orden_id,
  o.estado AS orden_estado,
  o.fecha AS orden_fecha
FROM public.transacciones t
JOIN public.instrumentacion i ON i.id = t.instrumentacion_id
JOIN public.ordenes o ON o.id = i.orden_id
LEFT JOIN public.tipos_operacion top ON top.id = o.tipo_operacion_id
WHERE t.estado IN ('pendiente', 'ejecutada')
  AND COALESCE(lower(o.estado), '') <> 'anulada'
  AND NOT EXISTS (
    SELECT 1 FROM public.movimientos_cuenta_corriente m
    WHERE m.transaccion_id = t.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.movimientos_cuenta_corriente_intermediario mi
    WHERE mi.transaccion_id = t.id
  )
ORDER BY o.numero DESC NULLS LAST, t.numero;

-- =============================================================================
-- 1b) Igual que (1) pero solo órdenes donde YA hay al menos un movimiento CC
--     en cliente o intermediario (hueco parcial: una pata quedó afuera).
--     Excluye orden **anulada** (mismo criterio que §1).
-- =============================================================================
SELECT
  t.id AS transaccion_id,
  t.numero AS transaccion_numero,
  t.estado AS transaccion_estado,
  t.tipo,
  t.pagador,
  t.cobrador,
  t.moneda,
  t.monto,
  left(coalesce(t.concepto, ''), 120) AS concepto_prefijo,
  top.codigo AS tipo_operacion_codigo,
  coalesce(i.multicontraparte_manual, false) AS multicontraparte_manual,
  o.numero AS orden_numero,
  o.id AS orden_id,
  o.estado AS orden_estado
FROM public.transacciones t
JOIN public.instrumentacion i ON i.id = t.instrumentacion_id
JOIN public.ordenes o ON o.id = i.orden_id
LEFT JOIN public.tipos_operacion top ON top.id = o.tipo_operacion_id
WHERE t.estado IN ('pendiente', 'ejecutada')
  AND COALESCE(lower(o.estado), '') <> 'anulada'
  AND NOT EXISTS (
    SELECT 1 FROM public.movimientos_cuenta_corriente m
    WHERE m.transaccion_id = t.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.movimientos_cuenta_corriente_intermediario mi
    WHERE mi.transaccion_id = t.id
  )
  AND (
    EXISTS (SELECT 1 FROM public.movimientos_cuenta_corriente m2 WHERE m2.orden_id = o.id)
    OR EXISTS (SELECT 1 FROM public.movimientos_cuenta_corriente_intermediario mi2 WHERE mi2.orden_id = o.id)
  )
ORDER BY o.numero DESC NULLS LAST, t.numero;

-- =============================================================================
-- 2) Misma idea agrupada por ORDEN: órdenes con al menos una trx no anulada
--    y cero movimientos CC en ambos libros (suma por orden_id).
--    Excluye orden **anulada**.
-- =============================================================================
SELECT
  o.numero AS orden_numero,
  o.id AS orden_id,
  o.estado AS orden_estado,
  o.fecha AS orden_fecha,
  COUNT(*) FILTER (WHERE t.estado IN ('pendiente', 'ejecutada')) AS trx_no_anuladas,
  (SELECT COUNT(*) FROM public.movimientos_cuenta_corriente m WHERE m.orden_id = o.id) AS mov_cc_cliente,
  (SELECT COUNT(*) FROM public.movimientos_cuenta_corriente_intermediario mi WHERE mi.orden_id = o.id) AS mov_cc_intermediario
FROM public.ordenes o
JOIN public.instrumentacion i ON i.orden_id = o.id
JOIN public.transacciones t ON t.instrumentacion_id = i.id
WHERE COALESCE(lower(o.estado), '') <> 'anulada'
GROUP BY o.id, o.numero, o.estado, o.fecha
HAVING COUNT(*) FILTER (WHERE t.estado IN ('pendiente', 'ejecutada')) > 0
   AND (SELECT COUNT(*) FROM public.movimientos_cuenta_corriente m WHERE m.orden_id = o.id) = 0
   AND (SELECT COUNT(*) FROM public.movimientos_cuenta_corriente_intermediario mi WHERE mi.orden_id = o.id) = 0
ORDER BY o.numero DESC NULLS LAST;

-- =============================================================================
-- 3) Orden ANULADA: transacciones ya anuladas pero movimientos CC que NO están anulados
--    (incoherencia si el sync debería haber marcado CC como anulado).
--    Ajustar nombre de estado CC si tu CHECK usa otro valor (p. ej. 'anulada').
-- =============================================================================
SELECT
  m.id AS mov_cc_id,
  'cliente' AS libro,
  m.orden_id,
  o.numero AS orden_numero,
  m.transaccion_id,
  m.transaccion_numero,
  m.estado AS estado_mov_cc,
  t.estado AS estado_transaccion
FROM public.movimientos_cuenta_corriente m
JOIN public.ordenes o ON o.id = m.orden_id
LEFT JOIN public.transacciones t ON t.id = m.transaccion_id
WHERE o.estado = 'anulada'
  AND COALESCE(lower(m.estado), '') NOT IN ('anulado', 'anulada')
  AND COALESCE(m.es_movimiento_manual, false) = false

UNION ALL

SELECT
  mi.id,
  'intermediario',
  mi.orden_id,
  o.numero,
  mi.transaccion_id,
  mi.transaccion_numero,
  mi.estado,
  t.estado
FROM public.movimientos_cuenta_corriente_intermediario mi
JOIN public.ordenes o ON o.id = mi.orden_id
LEFT JOIN public.transacciones t ON t.id = mi.transaccion_id
WHERE o.estado = 'anulada'
  AND COALESCE(lower(mi.estado), '') NOT IN ('anulado', 'anulada')
  AND COALESCE(mi.es_movimiento_manual, false) = false;

-- =============================================================================
-- 3b) Orden **anulada** con al menos una transacción pero **cero** filas CC
--     en cliente e intermediario (legado: anulación sin sync, o sync bloqueado).
--     Corregir: Refrescar en Cuenta corriente (sync global) o revisar reglas/instrumentación.
-- =============================================================================
SELECT
  o.numero AS orden_numero,
  o.id AS orden_id,
  o.estado AS orden_estado,
  o.fecha AS orden_fecha,
  (SELECT COUNT(*) FROM public.transacciones t2 JOIN public.instrumentacion i2 ON i2.id = t2.instrumentacion_id WHERE i2.orden_id = o.id) AS trx_total
FROM public.ordenes o
JOIN public.instrumentacion i ON i.orden_id = o.id
WHERE COALESCE(lower(o.estado), '') = 'anulada'
  AND EXISTS (SELECT 1 FROM public.transacciones t WHERE t.instrumentacion_id = i.id)
  AND NOT EXISTS (SELECT 1 FROM public.movimientos_cuenta_corriente m WHERE m.orden_id = o.id)
  AND NOT EXISTS (SELECT 1 FROM public.movimientos_cuenta_corriente_intermediario mi WHERE mi.orden_id = o.id)
ORDER BY o.numero DESC NULLS LAST;

-- =============================================================================
-- 4) Transacción en estado 'anulada' pero sigue existiendo movimiento CC
--    no anulado ligado a esa transacción.
-- =============================================================================
SELECT
  m.id AS mov_cc_id,
  'cliente' AS libro,
  m.transaccion_id,
  t.numero AS transaccion_numero,
  m.estado AS estado_mov_cc,
  t.estado AS estado_transaccion,
  m.orden_id,
  o.numero AS orden_numero
FROM public.movimientos_cuenta_corriente m
JOIN public.transacciones t ON t.id = m.transaccion_id
JOIN public.instrumentacion i ON i.id = t.instrumentacion_id
JOIN public.ordenes o ON o.id = i.orden_id
WHERE t.estado = 'anulada'
  AND COALESCE(lower(m.estado), '') NOT IN ('anulado', 'anulada')
  AND COALESCE(m.es_movimiento_manual, false) = false

UNION ALL

SELECT
  mi.id,
  'intermediario',
  mi.transaccion_id,
  t.numero,
  mi.estado,
  t.estado,
  mi.orden_id,
  o.numero
FROM public.movimientos_cuenta_corriente_intermediario mi
JOIN public.transacciones t ON t.id = mi.transaccion_id
JOIN public.instrumentacion i ON i.id = t.instrumentacion_id
JOIN public.ordenes o ON o.id = i.orden_id
WHERE t.estado = 'anulada'
  AND COALESCE(lower(mi.estado), '') NOT IN ('anulado', 'anulada')
  AND COALESCE(mi.es_movimiento_manual, false) = false;

-- =============================================================================
-- 5) Resumen por orden: cuántas trx (por estado) vs cuántas filas CC con
--    transaccion_id de esa orden (útil para ver huecos por número de orden).
-- =============================================================================
SELECT
  o.numero AS orden_numero,
  o.id AS orden_id,
  o.estado AS orden_estado,
  COUNT(*) FILTER (WHERE t.estado = 'pendiente') AS trx_pendiente,
  COUNT(*) FILTER (WHERE t.estado = 'ejecutada') AS trx_ejecutada,
  COUNT(*) FILTER (WHERE t.estado = 'anulada') AS trx_anulada,
  (SELECT COUNT(*) FROM public.movimientos_cuenta_corriente m WHERE m.orden_id = o.id) AS filas_cc_cliente,
  (SELECT COUNT(*) FROM public.movimientos_cuenta_corriente_intermediario mi WHERE mi.orden_id = o.id) AS filas_cc_int,
  (
    SELECT COUNT(DISTINCT m.transaccion_id)
    FROM public.movimientos_cuenta_corriente m
    WHERE m.orden_id = o.id AND m.transaccion_id IS NOT NULL
  ) AS trx_distintas_en_cc_cliente,
  (
    SELECT COUNT(DISTINCT mi.transaccion_id)
    FROM public.movimientos_cuenta_corriente_intermediario mi
    WHERE mi.orden_id = o.id AND mi.transaccion_id IS NOT NULL
  ) AS trx_distintas_en_cc_int
FROM public.ordenes o
LEFT JOIN public.instrumentacion i ON i.orden_id = o.id
LEFT JOIN public.transacciones t ON t.instrumentacion_id = i.id
GROUP BY o.id, o.numero, o.estado
HAVING COUNT(t.id) > 0
ORDER BY o.numero DESC NULLS LAST
LIMIT 200;

-- =============================================================================
-- 5a) Igual que (5) pero excluye órdenes en estado **anulada** (vista “solo vigentes”;
--     evita confundir 0 CC en anuladas con un hueco de sync).
-- =============================================================================
SELECT
  o.numero AS orden_numero,
  o.id AS orden_id,
  o.estado AS orden_estado,
  COUNT(*) FILTER (WHERE t.estado = 'pendiente') AS trx_pendiente,
  COUNT(*) FILTER (WHERE t.estado = 'ejecutada') AS trx_ejecutada,
  COUNT(*) FILTER (WHERE t.estado = 'anulada') AS trx_anulada,
  (SELECT COUNT(*) FROM public.movimientos_cuenta_corriente m WHERE m.orden_id = o.id) AS filas_cc_cliente,
  (SELECT COUNT(*) FROM public.movimientos_cuenta_corriente_intermediario mi WHERE mi.orden_id = o.id) AS filas_cc_int,
  (
    SELECT COUNT(DISTINCT m.transaccion_id)
    FROM public.movimientos_cuenta_corriente m
    WHERE m.orden_id = o.id AND m.transaccion_id IS NOT NULL
  ) AS trx_distintas_en_cc_cliente,
  (
    SELECT COUNT(DISTINCT mi.transaccion_id)
    FROM public.movimientos_cuenta_corriente_intermediario mi
    WHERE mi.orden_id = o.id AND mi.transaccion_id IS NOT NULL
  ) AS trx_distintas_en_cc_int
FROM public.ordenes o
LEFT JOIN public.instrumentacion i ON i.orden_id = o.id
LEFT JOIN public.transacciones t ON t.instrumentacion_id = i.id
WHERE COALESCE(lower(o.estado), '') <> 'anulada'
GROUP BY o.id, o.numero, o.estado
HAVING COUNT(t.id) > 0
ORDER BY o.numero DESC NULLS LAST
LIMIT 200;

-- (Opcional) Acotar por rango de número de orden:
-- ... AND o.numero BETWEEN 30 AND 45

-- =============================================================================
-- 6) Diagnóstico por orden_id: tipo de operación, intermediario, MC manual,
--    y cuántas filas hay en reglas_de_negocio para (codigo, con/sin int).
--    Sustituí los UUID por los de tus órdenes sospechosas (ej. 41, 16, 23).
-- =============================================================================
SELECT
  o.numero AS orden_nro,
  o.id AS orden_id,
  o.estado AS orden_estado,
  top.codigo AS tipo_operacion_codigo,
  COALESCE(top.usa_intermediario, false) AS catalogo_usa_intermediario,
  (o.intermediario_id IS NOT NULL) AS orden_tiene_intermediario_id,
  COALESCE(i.multicontraparte_manual, false) AS instrumentacion_multicontraparte_manual,
  (SELECT COUNT(*)::int FROM public.reglas_de_negocio r WHERE r.tipo_operacion_codigo = top.codigo AND r.usa_intermediario = false) AS reglas_count_usa_int_false,
  (SELECT COUNT(*)::int FROM public.reglas_de_negocio r WHERE r.tipo_operacion_codigo = top.codigo AND r.usa_intermediario = true) AS reglas_count_usa_int_true
FROM public.ordenes o
LEFT JOIN public.tipos_operacion top ON top.id = o.tipo_operacion_id
LEFT JOIN public.instrumentacion i ON i.orden_id = o.id
WHERE o.id IN (
  '1ad7591e-ccbb-49ef-aef5-76a25ddedd26'::uuid, -- ejemplo: orden 41
  'b79603e6-2d6b-40f3-96aa-8f4b6efd3adf'::uuid, -- ejemplo: orden 16
  'a3ab0e91-338d-4148-91f2-ac9aa07d09dc'::uuid  -- ejemplo: orden 23
);

-- Detalle de transacciones de una orden (para contrastar la 66 vs el resto):
-- SELECT t.numero, t.tipo, t.estado, t.pagador, t.cobrador, t.moneda, t.monto, t.id
-- FROM public.transacciones t
-- JOIN public.instrumentacion i ON i.id = t.instrumentacion_id
-- WHERE i.orden_id = 'a3ab0e91-338d-4148-91f2-ac9aa07d09dc'::uuid
-- ORDER BY t.numero NULLS LAST;
