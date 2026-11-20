-- Guarda anti-vaciado del sync CC/caja (incidente 19/11/2026 — docs/INCIDENTE_CAJA_ARS_SYNC_2026-11-19.md)
--
-- Problema: con lecturas incompletas en el navegador, el front mandó a sync_cc_caja_orden un payload vacío para
-- órdenes ejecutadas (150, 152) y la RPC anuló como "huérfanas" todas sus filas válidas de CC y caja.
-- Guarda (servidor, no depende del front), para una orden NO anulada:
--   G1 (BLOQUEA): tiene transacciones ejecutadas y el payload no trae ninguna fila de CC (cliente + intermediario)
--       → RAISE, no se escribe nada (caso exacto del incidente).
--   G2 (ALERTA, no bloquea): una transacción ejecutada tiene filas vivas de CC y el payload no trae ninguna para ella.
--   G3 (ALERTA, no bloquea): una transacción ejecutada en EFECTIVO tiene caja viva y el payload de caja no la trae.
--   G2/G3 quedan en observación (revisión DBA 2026-11-20: posibles falsos positivos futuros en CHEQUE-ARS Tx4,
--   ingreso tomado como comisión, legado «Ganancia del acuerdo»). Se registran en auditoria_app
--   (categoria cc_caja_sync, accion alerta_guarda) y RAISE WARNING. Pasar a bloqueo tras 1–2 semanas sin alertas falsas.
-- Medido en prod 2026-11-20: de 957 órdenes vivas con transacciones ejecutadas, solo la 152 (incidente) no tenía CC.
-- Casos legítimos que siguen pasando: cambio de modo de pago (la trx deja de ser efectivo antes del sync),
-- volver a pendiente / anular (la trx deja de estar ejecutada), cambio de leyenda (mismo trx con otra clave),
-- cheques Pandy→intermediario sin CC (no hay filas vivas que proteger).
-- Si la guarda corta, NO se escribe nada de esa orden (RAISE → rollback de la orden; en sync_cc_caja_ordenes
-- solo esa orden queda con error y el lote sigue).
-- Idempotente. Aplicar en Pandy-Dev y luego Pandy. El cuerpo completo de sync_cc_caja_orden vive en
-- sql/rpc_sync_cc_caja_orden.sql (incluye el PERFORM de esta guarda).

CREATE OR REPLACE FUNCTION public.sync_cc_caja_guarda_payload(
  p_orden_id uuid,
  p_rows_cc_cliente jsonb,
  p_rows_cc_int jsonb,
  p_rows_caja jsonb
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_estado text;
  v_numero int;
  v_trx record;
  v_trx_payload_cc uuid[];
  v_trx_payload_caja uuid[];
  v_n_cc int;
BEGIN
  SELECT o.estado, o.numero INTO v_estado, v_numero FROM public.ordenes o WHERE o.id = p_orden_id;
  IF v_estado IS NULL OR lower(v_estado) IN ('anulada', 'anulado') THEN
    RETURN;
  END IF;

  v_n_cc := COALESCE(jsonb_array_length(COALESCE(p_rows_cc_cliente, '[]'::jsonb)), 0)
          + COALESCE(jsonb_array_length(COALESCE(p_rows_cc_int, '[]'::jsonb)), 0);

  -- G1
  IF v_n_cc = 0 AND EXISTS (
    SELECT 1 FROM public.transacciones t
    JOIN public.instrumentacion i ON i.id = t.instrumentacion_id
    WHERE i.orden_id = p_orden_id AND lower(t.estado) = 'ejecutada'
  ) THEN
    RAISE EXCEPTION 'PANDI_SYNC_GUARDA: la orden % tiene transacciones ejecutadas y el cálculo llegó sin movimientos de cuenta corriente. No se modificó nada; reintentá (posible lectura incompleta).', v_numero
      USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT NULLIF(trim(e->>'transaccion_id'), '')::uuid), array[]::uuid[])
    INTO v_trx_payload_cc
    FROM (
      SELECT jsonb_array_elements(COALESCE(p_rows_cc_cliente, '[]'::jsonb)) e
      UNION ALL
      SELECT jsonb_array_elements(COALESCE(p_rows_cc_int, '[]'::jsonb))
    ) x
   WHERE NULLIF(trim(e->>'transaccion_id'), '') IS NOT NULL;

  SELECT COALESCE(array_agg(DISTINCT NULLIF(trim(e->>'transaccion_id'), '')::uuid), array[]::uuid[])
    INTO v_trx_payload_caja
    FROM jsonb_array_elements(COALESCE(p_rows_caja, '[]'::jsonb)) e
   WHERE NULLIF(trim(e->>'transaccion_id'), '') IS NOT NULL;

  -- G2
  FOR v_trx IN
    SELECT t.id, t.numero
      FROM public.transacciones t
      JOIN public.instrumentacion i ON i.id = t.instrumentacion_id
     WHERE i.orden_id = p_orden_id
       AND lower(t.estado) = 'ejecutada'
       AND NOT (t.id = ANY (v_trx_payload_cc))
       AND (
         EXISTS (SELECT 1 FROM public.movimientos_cuenta_corriente m
                  WHERE m.transaccion_id = t.id AND NOT COALESCE(m.es_movimiento_manual, false)
                    AND lower(COALESCE(m.estado, '')) NOT IN ('anulado', 'anulada'))
         OR EXISTS (SELECT 1 FROM public.movimientos_cuenta_corriente_intermediario m
                     WHERE m.transaccion_id = t.id AND NOT COALESCE(m.es_movimiento_manual, false)
                       AND lower(COALESCE(m.estado, '')) NOT IN ('anulado', 'anulada'))
       )
  LOOP
    RAISE WARNING 'PANDI_SYNC_GUARDA_ALERTA G2: trx % orden %', v_trx.numero, v_numero;
    PERFORM public.sync_cc_caja_registrar_auditoria(
      'alerta_guarda',
      'Alerta de control: la transacción ' || v_trx.numero || ' (ejecutada) de la orden ' || v_numero ||
        ' quedaría sin sus movimientos de cuenta corriente en esta sincronización. Revisar.',
      jsonb_build_object('guarda', 'G2', 'orden_id', p_orden_id, 'orden_numero', v_numero,
                         'transaccion_id', v_trx.id, 'transaccion_numero', v_trx.numero)
    );
  END LOOP;

  -- G3
  FOR v_trx IN
    SELECT t.id, t.numero
      FROM public.transacciones t
      JOIN public.instrumentacion i ON i.id = t.instrumentacion_id
      JOIN public.modos_pago mp ON mp.id = t.modo_pago_id
     WHERE i.orden_id = p_orden_id
       AND lower(t.estado) = 'ejecutada'
       AND lower(trim(mp.codigo)) = 'efectivo'
       AND NOT (t.id = ANY (v_trx_payload_caja))
       AND EXISTS (SELECT 1 FROM public.movimientos_caja c
                    WHERE c.transaccion_id = t.id AND c.tipo_movimiento_id IS NULL
                      AND lower(COALESCE(c.estado, '')) NOT IN ('anulado', 'anulada'))
  LOOP
    RAISE WARNING 'PANDI_SYNC_GUARDA_ALERTA G3: trx % orden %', v_trx.numero, v_numero;
    PERFORM public.sync_cc_caja_registrar_auditoria(
      'alerta_guarda',
      'Alerta de control: la transacción ' || v_trx.numero || ' (ejecutada) de la orden ' || v_numero ||
        ' quedaría sin sus movimientos de caja (efectivo) en esta sincronización. Revisar.',
      jsonb_build_object('guarda', 'G3', 'orden_id', p_orden_id, 'orden_numero', v_numero,
                         'transaccion_id', v_trx.id, 'transaccion_numero', v_trx.numero)
    );
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.sync_cc_caja_guarda_payload(uuid, jsonb, jsonb, jsonb) IS
  'Guarda anti-vaciado (incidente 19/11/2026): rechaza payloads que anularían CC/caja de transacciones ejecutadas de órdenes vivas. Llamada al inicio de sync_cc_caja_orden.';

REVOKE ALL ON FUNCTION public.sync_cc_caja_guarda_payload(uuid, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_cc_caja_guarda_payload(uuid, jsonb, jsonb, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.sync_cc_caja_guarda_payload(uuid, jsonb, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_cc_caja_guarda_payload(uuid, jsonb, jsonb, jsonb) TO service_role;

-- Índice para la consulta de G2 sobre CC intermediario por transacción.
CREATE INDEX IF NOT EXISTS idx_mov_cc_int_transaccion_id
  ON public.movimientos_cuenta_corriente_intermediario (transaccion_id);
