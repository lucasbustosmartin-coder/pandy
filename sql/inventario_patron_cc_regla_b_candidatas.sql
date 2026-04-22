-- Inventario: órdenes (≠ CHEQUE-ARS, **≠ anulada**) con patrón «ingreso Pandy→cliente acuerdo en MonR» + «egreso MonE pagador Pandy o Intermediario → cobrador cliente»
-- (cobrador_cliente_id = cliente de la orden O NULL con pagador pandy|intermediario — cubre huecos históricos p. ej. orden 68).
-- Solo lectura: ejecutar en SQL Editor (prod o dev).
--
-- Listado por orden + flags. Para saldos agregados por entidad CC: `inventario_patron_cc_saldos_por_entidad_ordenes_patron.sql`.

WITH ord_base AS (
  SELECT
    o.id,
    o.numero,
    o.cliente_id,
    o.intermediario_id,
    o.estado AS estado_orden,
    o.moneda_recibida,
    o.moneda_entregada,
    o.monto_recibido,
    o.monto_entregado,
    upper(trim(t.codigo)) AS tipo_codigo
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
      OR (
        tx.cobrador_cliente_id IS NULL
        AND lower(coalesce(tx.pagador, '')) IN ('pandy', 'intermediario')
      )
    )
    AND lower(coalesce(tx.pagador, '')) IN ('pandy', 'intermediario')
),
patron AS (
  SELECT ob.*
  FROM ord_base ob
  WHERE EXISTS (SELECT 1 FROM ins WHERE ins.orden_id = ob.id)
    AND EXISTS (SELECT 1 FROM eg WHERE eg.orden_id = ob.id)
)
SELECT
  p.numero AS orden_numero,
  p.tipo_codigo,
  p.estado_orden,
  p.cliente_id,
  p.intermediario_id,
  p.moneda_recibida,
  p.moneda_entregada,
  p.monto_recibido,
  p.monto_entregado,
  EXISTS (
    SELECT 1
    FROM public.transacciones tx
    JOIN public.instrumentacion i ON i.id = tx.instrumentacion_id
    WHERE i.orden_id = p.id
      AND lower(tx.tipo) = 'egreso'
      AND lower(coalesce(tx.pagador, '')) = 'intermediario'
      AND lower(coalesce(tx.cobrador, '')) = 'cliente'
      AND upper(trim(tx.moneda)) = upper(trim(p.moneda_entregada))
  ) AS tiene_egreso_int_a_cliente_mone,
  EXISTS (
    SELECT 1
    FROM public.transacciones tx
    JOIN public.instrumentacion i ON i.id = tx.instrumentacion_id
    WHERE i.orden_id = p.id
      AND lower(tx.tipo) = 'egreso'
      AND lower(coalesce(tx.cobrador, '')) = 'cliente'
      AND lower(coalesce(tx.pagador, '')) IN ('pandy', 'intermediario')
      AND tx.cobrador_cliente_id IS NULL
  ) AS tiene_trx_cobrador_cliente_sin_uuid
FROM patron p
ORDER BY p.numero NULLS LAST;
