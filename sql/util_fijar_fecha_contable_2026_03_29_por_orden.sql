-- Fijar fecha contable 2026-03-29 (mediodía hora Argentina en estado_fecha / updated_at)
-- para una orden por su número: transacciones ejecutadas, fecha de la orden, caja y CC (no manuales).
--
-- Uso: Supabase SQL Editor. Cambiá v_orden_numero si no es la orden 1.
-- Después podés abrir la orden en la app y dejar que el sync siga coherente (no hace falta re-guardar la trx solo por fecha).

BEGIN;

DO $$
DECLARE
  v_orden_numero int := 1;
  d date := DATE '2026-03-29';
  ts timestamptz := make_timestamptz(2026, 3, 29, 12, 0, 0, 'America/Argentina/Buenos_Aires');
  oid uuid;
BEGIN
  SELECT id INTO oid FROM public.ordenes WHERE numero = v_orden_numero LIMIT 1;
  IF oid IS NULL THEN
    RAISE EXCEPTION 'No existe orden con numero = %', v_orden_numero;
  END IF;

  UPDATE public.ordenes
  SET fecha = d, updated_at = ts
  WHERE id = oid;

  UPDATE public.transacciones t
  SET fecha_ejecucion = d, updated_at = ts
  FROM public.instrumentacion i
  WHERE i.orden_id = oid
    AND t.instrumentacion_id = i.id
    AND t.estado = 'ejecutada';

  UPDATE public.movimientos_caja m
  SET fecha = d, estado_fecha = ts
  WHERE m.orden_id = oid
    AND m.tipo_movimiento_id IS NULL
    AND m.estado = 'cerrado';

  UPDATE public.movimientos_cuenta_corriente m
  SET fecha = d, estado_fecha = ts
  WHERE m.orden_id = oid
    AND COALESCE(m.es_movimiento_manual, false) = false;

  UPDATE public.movimientos_cuenta_corriente_intermediario m
  SET fecha = d, estado_fecha = ts
  WHERE m.orden_id = oid
    AND COALESCE(m.es_movimiento_manual, false) = false;
END $$;

COMMIT;
