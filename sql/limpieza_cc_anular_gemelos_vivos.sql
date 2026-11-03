-- Limpieza puntual: anular (NO borrar) copias gemelas vivas de **CC** (cliente e intermediario).
-- Conserva la fila más antigua de cada clave lógica. Pensado para Pandy-Dev tras clonar prod
-- (órdenes 576, 28, 41, 42 y cualquier otro grupo). No ejecutar en producción sin acuerdo.
--
-- **Caja (`movimientos_caja`): no anular gemelos en una corrida futura.** En Dev el gemelo
-- de orden 41 (trx 101, +15.300 USD) ya quedó `anulado` por la corrida previa; el índice único
-- de vivos impide volver a `cerrado` mientras exista la copia original. No repetir el bloque
-- de caja en producción sin acuerdo: ahí siguen las dos filas vivas.

WITH dups_cli AS (
  SELECT m.id,
    row_number() OVER (
      PARTITION BY m.orden_id, m.cliente_id, m.transaccion_id, m.transaccion_numero, m.monto, m.moneda, m.clasificacion_movimiento, left(coalesce(m.concepto,''),72)
      ORDER BY m.created_at ASC NULLS LAST, m.id ASC
    ) AS rn
  FROM public.movimientos_cuenta_corriente m
  WHERE coalesce(m.es_movimiento_manual,false)=false
    AND coalesce(lower(m.estado),'') NOT IN ('anulado','anulada')
)
UPDATE public.movimientos_cuenta_corriente m
SET estado = 'anulado', estado_fecha = now()
FROM dups_cli d
WHERE m.id = d.id AND d.rn > 1;

WITH dups_int AS (
  SELECT m.id,
    row_number() OVER (
      PARTITION BY m.orden_id, m.intermediario_id, m.transaccion_id, m.transaccion_numero, m.monto, m.moneda, m.clasificacion_movimiento, left(coalesce(m.concepto,''),72)
      ORDER BY m.created_at ASC NULLS LAST, m.id ASC
    ) AS rn
  FROM public.movimientos_cuenta_corriente_intermediario m
  WHERE coalesce(m.es_movimiento_manual,false)=false
    AND coalesce(lower(m.estado),'') NOT IN ('anulado','anulada')
)
UPDATE public.movimientos_cuenta_corriente_intermediario m
SET estado = 'anulado', estado_fecha = now()
FROM dups_int d
WHERE m.id = d.id AND d.rn > 1;

-- Caja: bloque de anular gemelos retirado a propósito (no mover efectivo/banco).
