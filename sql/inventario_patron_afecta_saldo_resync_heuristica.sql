-- Impacto potencial al resync / nueva regla (patrón Regla B, ≠ CHEQUE-ARS).
--
-- 1) Órdenes del patrón **no anuladas** (`ordenes.estado <> 'anulada'`): instrumentación parcial o pendiente también puede
--    tener CC pendiente+cerrado y afectar el mismo “saldo” que muestra la app (ver `ccMovimientoIncluirEnSaldoResumen`).
--
-- 2) **Saldo como la app:** suma algebraica de movimientos CC cliente con `estado` distinto de `anulado`
--    (incluye **pendiente** y **cerrado**), excluye `es_movimiento_manual`, solo filas del `cliente_id` del acuerdo.
--
-- 3) **Garantía de “esta orden no mueve el saldo total”** (criterio pedido):
--    Si para esa orden el aporte neto por moneda es ~0 en USD, ARS y EUR (`orden_aporta_saldo_cc = false`),
--    entonces hoy **no** suma nada al saldo consolidado del cliente (ni tampoco al total agregado multi-moneda por filas
--    de esa orden). Si la nueva regla mantiene el mismo neto por orden y moneda, tampoco lo haría después.
--
-- 4) **Pata MonE (egreso):** `net_cc_cli_monE_egreso_tx` = suma de CC cliente enlazadas por `transaccion_id` a las
--    transacciones **egreso** en `moneda_entregada` con pagador pandy|intermediario y cobrador cliente (mismo criterio
--    de patrón). Si |net| ~ 0, la pata ya **netea a cero** en CC como suele pretender la regla nueva para MonE;
--    si |net| >> 0, hay desvío / líneas que no cierran en esa pata.
--
-- 5) **MonR + MonE misma moneda (p. ej. USD-USD):** no se puede separar solo por `moneda`; `net_cc_cli_monE_egreso_tx`
--    sigue siendo por transacciones **egreso**; para ingreso MonR usar `net_cc_cli_monR_ingreso_tx`.
--
-- 6) Flags estructurales previos (préstamo, compensación, spread misma moneda, pata MonR fuera de mr/min) siguen
--    marcando **riesgo** aunque el neto por orden sea 0 (puede haber compensaciones que se cancelan en suma).
--
-- Ejecutar en SQL Editor (prod / dev).

WITH ord_base AS (
  SELECT o.id, o.numero, o.cliente_id, o.intermediario_id, o.estado AS estado_orden,
         o.moneda_recibida, o.moneda_entregada, o.monto_recibido, o.monto_entregado,
         upper(trim(t.codigo)) AS tipo_codigo
  FROM public.ordenes o
  JOIN public.tipos_operacion t ON t.id = o.tipo_operacion_id
  WHERE upper(trim(t.codigo)) <> 'CHEQUE-ARS'
    AND o.cliente_id IS NOT NULL
    AND lower(trim(coalesce(o.estado, ''))) <> 'anulada'
),
ins AS (
  SELECT DISTINCT i.orden_id FROM public.transacciones tx
  JOIN public.instrumentacion i ON i.id = tx.instrumentacion_id
  JOIN ord_base ob ON ob.id = i.orden_id
  WHERE lower(tx.tipo) = 'ingreso' AND lower(coalesce(tx.pagador, '')) = 'pandy' AND lower(coalesce(tx.cobrador, '')) = 'cliente'
    AND tx.cobrador_cliente_id = ob.cliente_id AND upper(trim(tx.moneda)) = upper(trim(ob.moneda_recibida))
),
eg AS (
  SELECT DISTINCT i.orden_id FROM public.transacciones tx
  JOIN public.instrumentacion i ON i.id = tx.instrumentacion_id
  JOIN ord_base ob ON ob.id = i.orden_id
  WHERE lower(tx.tipo) = 'egreso' AND upper(trim(tx.moneda)) = upper(trim(ob.moneda_entregada))
    AND lower(coalesce(tx.cobrador, '')) = 'cliente'
    AND (tx.cobrador_cliente_id = ob.cliente_id OR (tx.cobrador_cliente_id IS NULL AND lower(coalesce(tx.pagador, '')) IN ('pandy', 'intermediario')))
    AND lower(coalesce(tx.pagador, '')) IN ('pandy', 'intermediario')
),
patron AS (
  SELECT ob.* FROM ord_base ob
  WHERE EXISTS (SELECT 1 FROM ins WHERE ins.orden_id = ob.id) AND EXISTS (SELECT 1 FROM eg WHERE eg.orden_id = ob.id)
),
tx_ing_monr AS (
  SELECT tx.id AS trans_id, i.orden_id
  FROM public.transacciones tx
  JOIN public.instrumentacion i ON i.id = tx.instrumentacion_id
  JOIN patron p ON p.id = i.orden_id
  WHERE lower(tx.tipo) = 'ingreso'
    AND lower(coalesce(tx.pagador, '')) = 'pandy' AND lower(coalesce(tx.cobrador, '')) = 'cliente'
    AND tx.cobrador_cliente_id = p.cliente_id
    AND upper(trim(tx.moneda)) = upper(trim(p.moneda_recibida))
),
tx_eg_mone AS (
  SELECT tx.id AS trans_id, i.orden_id
  FROM public.transacciones tx
  JOIN public.instrumentacion i ON i.id = tx.instrumentacion_id
  JOIN patron p ON p.id = i.orden_id
  WHERE lower(tx.tipo) = 'egreso'
    AND upper(trim(tx.moneda)) = upper(trim(p.moneda_entregada))
    AND lower(coalesce(tx.cobrador, '')) = 'cliente'
    AND (tx.cobrador_cliente_id = p.cliente_id OR (tx.cobrador_cliente_id IS NULL AND lower(coalesce(tx.pagador, '')) IN ('pandy', 'intermediario')))
    AND lower(coalesce(tx.pagador, '')) IN ('pandy', 'intermediario')
),
cc_neto AS (
  SELECT
    m.orden_id,
    sum(CASE WHEN upper(trim(m.moneda)) = 'USD' THEN m.monto::numeric ELSE 0 END) AS net_usd,
    sum(CASE WHEN upper(trim(m.moneda)) = 'ARS' THEN m.monto::numeric ELSE 0 END) AS net_ars,
    sum(CASE WHEN upper(trim(m.moneda)) = 'EUR' THEN m.monto::numeric ELSE 0 END) AS net_eur
  FROM public.movimientos_cuenta_corriente m
  JOIN patron p ON p.id = m.orden_id AND m.cliente_id = p.cliente_id
  WHERE lower(coalesce(m.estado, '')) <> 'anulado'
    AND coalesce(m.es_movimiento_manual, false) = false
  GROUP BY m.orden_id
),
net_monr_tx AS (
  SELECT m.orden_id, sum(m.monto)::numeric AS neto
  FROM public.movimientos_cuenta_corriente m
  JOIN tx_ing_monr x ON x.trans_id = m.transaccion_id AND x.orden_id = m.orden_id
  WHERE m.cliente_id IN (SELECT cliente_id FROM patron p WHERE p.id = m.orden_id)
    AND lower(coalesce(m.estado, '')) <> 'anulado'
    AND coalesce(m.es_movimiento_manual, false) = false
  GROUP BY m.orden_id
),
net_mone_tx AS (
  SELECT m.orden_id, sum(m.monto)::numeric AS neto
  FROM public.movimientos_cuenta_corriente m
  JOIN tx_eg_mone x ON x.trans_id = m.transaccion_id AND x.orden_id = m.orden_id
  WHERE m.cliente_id IN (SELECT cliente_id FROM patron p WHERE p.id = m.orden_id)
    AND lower(coalesce(m.estado, '')) <> 'anulado'
    AND coalesce(m.es_movimiento_manual, false) = false
  GROUP BY m.orden_id
),
flags AS (
  SELECT
    p.*,
    coalesce(c.net_usd, 0) AS net_cc_cli_usd,
    coalesce(c.net_ars, 0) AS net_cc_cli_ars,
    coalesce(c.net_eur, 0) AS net_cc_cli_eur,
    coalesce(r.neto, 0) AS net_cc_cli_monR_ingreso_tx,
    coalesce(e.neto, 0) AS net_cc_cli_monE_egreso_tx,
    (abs(coalesce(c.net_usd, 0)) > 0.02 OR abs(coalesce(c.net_ars, 0)) > 0.02 OR abs(coalesce(c.net_eur, 0)) > 0.02) AS orden_aporta_saldo_cc,
    (abs(coalesce(e.neto, 0)) <= 0.02) AS monE_egreso_netea_cero_en_cc,
    (upper(trim(p.moneda_recibida)) = upper(trim(p.moneda_entregada)) AND p.monto_recibido > p.monto_entregado + 0.02) AS spread_misma_moneda,
    EXISTS (
      SELECT 1 FROM public.movimientos_cuenta_corriente m
      WHERE m.orden_id = p.id AND m.cliente_id = p.cliente_id AND lower(coalesce(m.estado, '')) <> 'anulado'
        AND coalesce(m.es_movimiento_manual, false) = false
        AND (
          m.concepto ILIKE '%cobertura Pandy%moneda recibida%'
          OR m.concepto ILIKE '%Préstamo al cliente%'
          OR m.concepto ILIKE '%prestamo_pandy_monr%'
        )
    ) AS cc_cliente_hay_prestamo_regla_b,
    EXISTS (
      SELECT 1 FROM public.movimientos_cuenta_corriente m
      WHERE m.orden_id = p.id AND m.cliente_id = p.cliente_id AND lower(coalesce(m.estado, '')) <> 'anulado'
        AND coalesce(m.es_movimiento_manual, false) = false
        AND m.concepto ILIKE '%Compensación parcial%'
    ) AS cc_cliente_hay_compensacion_parcial,
    EXISTS (
      SELECT 1 FROM public.transacciones tx
      JOIN public.instrumentacion i ON i.id = tx.instrumentacion_id
      WHERE i.orden_id = p.id
        AND tx.compensacion_cc_monto_aplicado IS NOT NULL
        AND abs(tx.compensacion_cc_monto_aplicado::numeric) >= 0.01
    ) AS trx_tiene_compensacion_cc,
    EXISTS (
      SELECT 1 FROM public.movimientos_cuenta_corriente m
      WHERE m.orden_id = p.id AND m.cliente_id = p.cliente_id AND lower(coalesce(m.estado, '')) <> 'anulado'
        AND coalesce(m.es_movimiento_manual, false) = false
        AND m.concepto ILIKE '%Pandy cumple pata en moneda recibida%'
        AND abs(abs(m.monto::numeric) - p.monto_recibido::numeric) > 0.05
        AND NOT (
          upper(trim(p.moneda_recibida)) = upper(trim(p.moneda_entregada))
          AND p.monto_recibido > p.monto_entregado + 0.02
          AND abs(abs(m.monto::numeric) - least(p.monto_recibido::numeric, p.monto_entregado::numeric)) <= 0.05
        )
    ) AS cc_pata_monr_no_es_mr_ni_min_mr_me,
    (SELECT count(*)::int FROM public.movimientos_cuenta_corriente m
     WHERE m.orden_id = p.id AND m.cliente_id = p.cliente_id AND lower(coalesce(m.estado, '')) <> 'anulado'
       AND coalesce(m.es_movimiento_manual, false) = false) AS n_mov_cc_cli_no_anul_no_manual
  FROM patron p
  LEFT JOIN cc_neto c ON c.orden_id = p.id
  LEFT JOIN net_monr_tx r ON r.orden_id = p.id
  LEFT JOIN net_mone_tx e ON e.orden_id = p.id
)
SELECT
  numero AS orden_numero,
  tipo_codigo,
  estado_orden,
  net_cc_cli_usd,
  net_cc_cli_ars,
  net_cc_cli_eur,
  orden_aporta_saldo_cc,
  net_cc_cli_monR_ingreso_tx,
  net_cc_cli_monE_egreso_tx,
  monE_egreso_netea_cero_en_cc,
  spread_misma_moneda,
  cc_cliente_hay_prestamo_regla_b,
  cc_cliente_hay_compensacion_parcial,
  trx_tiene_compensacion_cc,
  cc_pata_monr_no_es_mr_ni_min_mr_me,
  n_mov_cc_cli_no_anul_no_manual,
  (
    (
      orden_aporta_saldo_cc
      OR NOT monE_egreso_netea_cero_en_cc
      OR (spread_misma_moneda AND lower(estado_orden) <> 'anulada')
      OR cc_cliente_hay_prestamo_regla_b
      OR cc_cliente_hay_compensacion_parcial
      OR trx_tiene_compensacion_cc
      OR cc_pata_monr_no_es_mr_ni_min_mr_me
    )
    AND NOT (
      lower(estado_orden) = 'anulada'
      AND NOT orden_aporta_saldo_cc
      AND n_mov_cc_cli_no_anul_no_manual = 0
    )
  ) AS riesgo_cambio_resync
FROM flags
ORDER BY riesgo_cambio_resync DESC, numero NULLS LAST;
