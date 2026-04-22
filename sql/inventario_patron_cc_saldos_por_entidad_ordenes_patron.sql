-- Saldo neto (movimientos **cerrados**) por entidad CC y moneda, limitado a órdenes que cumplen el mismo patrón que
-- `inventario_patron_cc_regla_b_candidatas.sql` (≠ CHEQUE-ARS, ≠ orden anulada; ingreso P→C monR con UUID cobrador acuerdo; egreso MonE P|I→C).
-- Solo lectura. Ejecutar después del inventario de órdenes para dimensionar **qué CC** tienen carga en esas operaciones
-- (no es el saldo global del cliente en el sistema — solo el tramo atribuible a órdenes del patrón).

WITH ord_base AS (
  SELECT o.id, o.cliente_id, o.intermediario_id, o.moneda_recibida, o.moneda_entregada
  FROM public.ordenes o
  JOIN public.tipos_operacion t ON t.id = o.tipo_operacion_id
  WHERE upper(trim(t.codigo)) <> 'CHEQUE-ARS'
    AND o.cliente_id IS NOT NULL
    AND lower(trim(coalesce(o.estado, ''))) <> 'anulada'
),
ins AS (
  SELECT DISTINCT i.orden_id
  FROM public.transacciones tx
  JOIN public.instrumentacion i ON i.id = tx.instrumentacion_id
  JOIN ord_base ob ON ob.id = i.orden_id
  WHERE lower(tx.tipo) = 'ingreso'
    AND lower(coalesce(tx.pagador, '')) = 'pandy'
    AND lower(coalesce(tx.cobrador, '')) = 'cliente'
    AND tx.cobrador_cliente_id = ob.cliente_id
    AND upper(trim(tx.moneda)) = upper(trim(ob.moneda_recibida))
),
eg AS (
  SELECT DISTINCT i.orden_id
  FROM public.transacciones tx
  JOIN public.instrumentacion i ON i.id = tx.instrumentacion_id
  JOIN ord_base ob ON ob.id = i.orden_id
  WHERE lower(tx.tipo) = 'egreso'
    AND upper(trim(tx.moneda)) = upper(trim(ob.moneda_entregada))
    AND lower(coalesce(tx.cobrador, '')) = 'cliente'
    AND (
      tx.cobrador_cliente_id = ob.cliente_id
      OR (tx.cobrador_cliente_id IS NULL AND lower(coalesce(tx.pagador, '')) IN ('pandy', 'intermediario'))
    )
    AND lower(coalesce(tx.pagador, '')) IN ('pandy', 'intermediario')
),
ids AS (
  SELECT ob.id AS orden_id, ob.cliente_id, ob.intermediario_id
  FROM ord_base ob
  WHERE EXISTS (SELECT 1 FROM ins WHERE ins.orden_id = ob.id)
    AND EXISTS (SELECT 1 FROM eg WHERE eg.orden_id = ob.id)
)
SELECT 'cliente' AS entidad_cc, m.cliente_id AS entidad_id, m.moneda, sum(m.monto)::numeric AS saldo_neto_cerrado
FROM public.movimientos_cuenta_corriente m
JOIN ids ON ids.orden_id = m.orden_id AND m.cliente_id = ids.cliente_id
WHERE lower(coalesce(m.estado, '')) = 'cerrado'
GROUP BY m.cliente_id, m.moneda
UNION ALL
SELECT 'intermediario', m.intermediario_id, m.moneda, sum(m.monto)::numeric
FROM public.movimientos_cuenta_corriente_intermediario m
JOIN ids ON ids.orden_id = m.orden_id AND ids.intermediario_id IS NOT NULL AND m.intermediario_id = ids.intermediario_id
WHERE lower(coalesce(m.estado, '')) = 'cerrado'
GROUP BY m.intermediario_id, m.moneda
ORDER BY 1, 2, 3;

-- Cuántas cuentas CC distintas (por tipo de entidad) participan en al menos una orden del patrón
-- (útil para ver que el impacto de implementación no barre «todos» los clientes del sistema).
WITH ord_base AS (
  SELECT o.id, o.cliente_id, o.intermediario_id, o.moneda_recibida, o.moneda_entregada
  FROM public.ordenes o
  JOIN public.tipos_operacion t ON t.id = o.tipo_operacion_id
  WHERE upper(trim(t.codigo)) <> 'CHEQUE-ARS'
    AND o.cliente_id IS NOT NULL
    AND lower(trim(coalesce(o.estado, ''))) <> 'anulada'
),
ins AS (
  SELECT DISTINCT i.orden_id
  FROM public.transacciones tx
  JOIN public.instrumentacion i ON i.id = tx.instrumentacion_id
  JOIN ord_base ob ON ob.id = i.orden_id
  WHERE lower(tx.tipo) = 'ingreso'
    AND lower(coalesce(tx.pagador, '')) = 'pandy'
    AND lower(coalesce(tx.cobrador, '')) = 'cliente'
    AND tx.cobrador_cliente_id = ob.cliente_id
    AND upper(trim(tx.moneda)) = upper(trim(ob.moneda_recibida))
),
eg AS (
  SELECT DISTINCT i.orden_id
  FROM public.transacciones tx
  JOIN public.instrumentacion i ON i.id = tx.instrumentacion_id
  JOIN ord_base ob ON ob.id = i.orden_id
  WHERE lower(tx.tipo) = 'egreso'
    AND upper(trim(tx.moneda)) = upper(trim(ob.moneda_entregada))
    AND lower(coalesce(tx.cobrador, '')) = 'cliente'
    AND (
      tx.cobrador_cliente_id = ob.cliente_id
      OR (tx.cobrador_cliente_id IS NULL AND lower(coalesce(tx.pagador, '')) IN ('pandy', 'intermediario'))
    )
    AND lower(coalesce(tx.pagador, '')) IN ('pandy', 'intermediario')
),
ids AS (
  SELECT ob.id AS orden_id, ob.cliente_id, ob.intermediario_id
  FROM ord_base ob
  WHERE EXISTS (SELECT 1 FROM ins WHERE ins.orden_id = ob.id)
    AND EXISTS (SELECT 1 FROM eg WHERE eg.orden_id = ob.id)
)
SELECT
  count(*)::int AS ordenes_en_patron,
  count(DISTINCT cliente_id)::int AS clientes_acuerdo_distintos,
  count(DISTINCT intermediario_id) FILTER (WHERE intermediario_id IS NOT NULL)::int AS intermediarios_distintos
FROM ids;
