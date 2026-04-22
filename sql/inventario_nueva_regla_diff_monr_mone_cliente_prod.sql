-- Comparación **solo CC cliente** en prod: neto hoy enlazado a trx MonR / MonE del patrón amplio
-- vs escalares que la **nueva regla** fija para esa pata (sin simular la tercera línea ni CC intermediario).
--
-- Definiciones (alinear con docs/NUEVA_REGLA_CC_PATA_MONR_MONE.md):
-- * `net_monr_hoy` = suma monto CC cliente (no anulado, no manual) con transaccion_id en ingresos MonR del patrón.
-- * `monr_regla` = + suma(monto) de esas trx ingreso MonR (valor de la pata en la trx).
-- * `net_mone_hoy` = suma monto CC cliente enlazado a egresos MonE del patrón.
-- * `mone_regla_cli` = si alguna trx egreso MonE tiene **pagador = intermediario**, el neto esperado en CC cliente para líneas enlazadas a esa pata es **0** (par −/+ que netea); si no, **− suma(monto)** de egresos MonE (ancla deuda en monE cuando el pagador no es intermediario).
--
-- «Afecta MonR» si:
-- * **Cruce de divisas** (`moneda_recibida` ≠ `moneda_entregada`): **||net_monr_hoy| − monr_regla| > 0.02** (legacy puede invertir signo en CC vs trx; p. ej. orden 22 USD→ARS: −500 en CC vs +500 trx — misma magnitud, OK).
-- * **Misma moneda** en ambas patas (p. ej. USD-USD): **|net_monr_hoy − monr_regla| > 0.02** (la regla nueva exige el movimiento MonR en CC con signo **+**; −1450 vs +1450 en orden **68** cuenta como diff).
-- «Afecta MonE» si **|net_mone_hoy − mone_regla_cli| > 0.02**.
-- Patrón amplio = inventario_patron_cc_regla_b_candidatas (egreso MonE permite cobrador_cliente_id NULL con pagador pandy|int).
-- Órdenes con `ordenes.estado = 'anulada'` **no** entran al universo (no elegibles).
--
-- **Alineación detector (2026-04-22):** en `ins`, `eg_amp`, `tx_ing_monr` y `tx_eg_mone` solo entran transacciones con
-- `estado` **pendiente** o **ejecutada** (como `esPatronAmplioCcMonrMoneNuevaRegla` en `utils/cc-patron-nueva-regla-monr-mone.mjs`)
-- y se excluye `concepto` que contenga **«Ganancia del acuerdo»** (misma exclusión que el bucle JS).
-- Sigue sin replicar `pagCobEfectivosTransaccionSync` (pag/cob vacíos): el SQL usa columnas crudas como el inventario histórico §4.3.
--
-- Solo lectura. Ejecutar en SQL Editor (prod / dev).

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
  WHERE lower(trim(coalesce(tx.estado, ''))) IN ('pendiente', 'ejecutada')
    AND coalesce(tx.concepto, '') NOT ILIKE '%Ganancia del acuerdo%'
    AND lower(tx.tipo) = 'ingreso' AND lower(coalesce(tx.pagador, '')) = 'pandy' AND lower(coalesce(tx.cobrador, '')) = 'cliente'
    AND tx.cobrador_cliente_id = ob.cliente_id AND upper(trim(tx.moneda)) = upper(trim(ob.moneda_recibida))
),
eg_amp AS (
  SELECT DISTINCT i.orden_id FROM public.transacciones tx
  JOIN public.instrumentacion i ON i.id = tx.instrumentacion_id
  JOIN ord_base ob ON ob.id = i.orden_id
  WHERE lower(trim(coalesce(tx.estado, ''))) IN ('pendiente', 'ejecutada')
    AND coalesce(tx.concepto, '') NOT ILIKE '%Ganancia del acuerdo%'
    AND lower(tx.tipo) = 'egreso' AND upper(trim(tx.moneda)) = upper(trim(ob.moneda_entregada))
    AND lower(coalesce(tx.cobrador, '')) = 'cliente'
    AND (tx.cobrador_cliente_id = ob.cliente_id OR (tx.cobrador_cliente_id IS NULL AND lower(coalesce(tx.pagador, '')) IN ('pandy', 'intermediario')))
    AND lower(coalesce(tx.pagador, '')) IN ('pandy', 'intermediario')
),
patron AS (
  SELECT ob.* FROM ord_base ob
  WHERE EXISTS (SELECT 1 FROM ins WHERE ins.orden_id = ob.id)
    AND EXISTS (SELECT 1 FROM eg_amp WHERE eg_amp.orden_id = ob.id)
),
tx_ing_monr AS (
  SELECT tx.id AS trans_id, i.orden_id, tx.monto::numeric AS monto_trx
  FROM public.transacciones tx
  JOIN public.instrumentacion i ON i.id = tx.instrumentacion_id
  JOIN patron p ON p.id = i.orden_id
  WHERE lower(trim(coalesce(tx.estado, ''))) IN ('pendiente', 'ejecutada')
    AND coalesce(tx.concepto, '') NOT ILIKE '%Ganancia del acuerdo%'
    AND lower(tx.tipo) = 'ingreso'
    AND lower(coalesce(tx.pagador, '')) = 'pandy' AND lower(coalesce(tx.cobrador, '')) = 'cliente'
    AND tx.cobrador_cliente_id = p.cliente_id
    AND upper(trim(tx.moneda)) = upper(trim(p.moneda_recibida))
),
tx_eg_mone AS (
  SELECT tx.id AS trans_id, i.orden_id, tx.monto::numeric AS monto_trx,
         lower(coalesce(tx.pagador, '')) AS pagador_norm
  FROM public.transacciones tx
  JOIN public.instrumentacion i ON i.id = tx.instrumentacion_id
  JOIN patron p ON p.id = i.orden_id
  WHERE lower(trim(coalesce(tx.estado, ''))) IN ('pendiente', 'ejecutada')
    AND coalesce(tx.concepto, '') NOT ILIKE '%Ganancia del acuerdo%'
    AND lower(tx.tipo) = 'egreso'
    AND upper(trim(tx.moneda)) = upper(trim(p.moneda_entregada))
    AND lower(coalesce(tx.cobrador, '')) = 'cliente'
    AND (tx.cobrador_cliente_id = p.cliente_id OR (tx.cobrador_cliente_id IS NULL AND lower(coalesce(tx.pagador, '')) IN ('pandy', 'intermediario')))
    AND lower(coalesce(tx.pagador, '')) IN ('pandy', 'intermediario')
),
ref_monr AS (
  SELECT orden_id, sum(monto_trx)::numeric AS monr_regla
  FROM tx_ing_monr
  GROUP BY orden_id
),
ref_mone AS (
  SELECT orden_id, sum(monto_trx)::numeric AS suma_egreso_monto,
         bool_or(pagador_norm = 'intermediario') AS tiene_pagador_inter
  FROM tx_eg_mone
  GROUP BY orden_id
),
net_monr_hoy AS (
  SELECT m.orden_id, sum(m.monto)::numeric AS neto
  FROM public.movimientos_cuenta_corriente m
  JOIN tx_ing_monr x ON x.trans_id = m.transaccion_id AND x.orden_id = m.orden_id
  WHERE m.cliente_id IN (SELECT cliente_id FROM patron p WHERE p.id = m.orden_id)
    AND lower(coalesce(m.estado, '')) <> 'anulado'
    AND coalesce(m.es_movimiento_manual, false) = false
  GROUP BY m.orden_id
),
net_mone_hoy AS (
  SELECT m.orden_id, sum(m.monto)::numeric AS neto
  FROM public.movimientos_cuenta_corriente m
  JOIN tx_eg_mone x ON x.trans_id = m.transaccion_id AND x.orden_id = m.orden_id
  WHERE m.cliente_id IN (SELECT cliente_id FROM patron p WHERE p.id = m.orden_id)
    AND lower(coalesce(m.estado, '')) <> 'anulado'
    AND coalesce(m.es_movimiento_manual, false) = false
  GROUP BY m.orden_id
),
cmp AS (
  SELECT
    p.numero AS orden_numero,
    p.estado_orden,
    p.tipo_codigo,
    coalesce(nmr.neto, 0)::numeric AS net_monr_hoy,
    coalesce(rm.monr_regla, 0)::numeric AS monr_regla,
    (upper(trim(coalesce(p.moneda_recibida, ''))) = upper(trim(coalesce(p.moneda_entregada, '')))) AS monr_misma_divisa_rec_ent,
    (CASE WHEN upper(trim(coalesce(p.moneda_recibida, ''))) = upper(trim(coalesce(p.moneda_entregada, '')))
      THEN abs(coalesce(nmr.neto, 0) - coalesce(rm.monr_regla, 0))
      ELSE abs(abs(coalesce(nmr.neto, 0)) - coalesce(rm.monr_regla, 0)) END)::numeric AS delta_err_monr,
    (CASE WHEN upper(trim(coalesce(p.moneda_recibida, ''))) = upper(trim(coalesce(p.moneda_entregada, '')))
      THEN abs(coalesce(nmr.neto, 0) - coalesce(rm.monr_regla, 0)) > 0.02
      ELSE abs(abs(coalesce(nmr.neto, 0)) - coalesce(rm.monr_regla, 0)) > 0.02 END) AS afecta_monr,
    coalesce(nme.neto, 0)::numeric AS net_mone_hoy,
    (CASE WHEN coalesce(rme.tiene_pagador_inter, false) THEN 0::numeric ELSE (-coalesce(rme.suma_egreso_monto, 0))::numeric END) AS mone_regla_cli,
    (coalesce(nme.neto, 0) - (CASE WHEN coalesce(rme.tiene_pagador_inter, false) THEN 0::numeric ELSE (-coalesce(rme.suma_egreso_monto, 0))::numeric END))::numeric AS delta_mone,
    (abs(coalesce(nme.neto, 0) - (CASE WHEN coalesce(rme.tiene_pagador_inter, false) THEN 0::numeric ELSE (-coalesce(rme.suma_egreso_monto, 0))::numeric END)) > 0.02) AS afecta_mone,
    (
      (CASE WHEN upper(trim(coalesce(p.moneda_recibida, ''))) = upper(trim(coalesce(p.moneda_entregada, '')))
        THEN abs(coalesce(nmr.neto, 0) - coalesce(rm.monr_regla, 0)) > 0.02
        ELSE abs(abs(coalesce(nmr.neto, 0)) - coalesce(rm.monr_regla, 0)) > 0.02 END)
      OR abs(coalesce(nme.neto, 0) - (CASE WHEN coalesce(rme.tiene_pagador_inter, false) THEN 0::numeric ELSE (-coalesce(rme.suma_egreso_monto, 0))::numeric END)) > 0.02
    ) AS afecta_monr_o_mone
  FROM patron p
  LEFT JOIN ref_monr rm ON rm.orden_id = p.id
  LEFT JOIN ref_mone rme ON rme.orden_id = p.id
  LEFT JOIN net_monr_hoy nmr ON nmr.orden_id = p.id
  LEFT JOIN net_mone_hoy nme ON nme.orden_id = p.id
)
SELECT
  count(*)::int AS ordenes_patron,
  count(*) FILTER (WHERE afecta_monr)::int AS ordenes_afecta_monr,
  count(*) FILTER (WHERE afecta_mone)::int AS ordenes_afecta_mone,
  count(*) FILTER (WHERE afecta_monr_o_mone)::int AS ordenes_afecta_monr_o_mone,
  coalesce(array_agg(orden_numero ORDER BY orden_numero) FILTER (WHERE afecta_monr_o_mone), ARRAY[]::int[]) AS numeros_afectados
FROM cmp;

-- Detalle por orden (descomentar para listar):
-- SELECT * FROM cmp ORDER BY orden_numero;
