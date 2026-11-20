-- Corrección incidente sync 19/11/2026 17:34–17:35 — órdenes 150 y 152 (SOLO Pandy prod)
-- Contexto: docs/INCIDENTE_CAJA_ARS_SYNC_2026-11-19.md
--
-- El sync anuló, sin reemplazo, 8 movimientos válidos de dos órdenes ejecutadas (30/04/2026):
--   Caja efectivo ARS (orden 152)                 : 1  (-2.770.000 ARS)
--   CC cliente (As Sports 152 / Martucci 150)     : 6
--   CC intermediario (Rou, orden 150)             : 1  (+34.990 USD)
-- Libro sin DELETE: NO se reabren los anulados; se insertan copias nuevas vivas ('cerrado'),
-- con la misma fecha contable, transacción, monto y sync_clave (el próximo sync las reconoce como propias).
-- Idempotente: solo inserta si no existe ya una fila viva con la misma (transaccion_id, moneda, sync_clave).
-- Antes de correr: chequeo de sesiones (sql/consulta_sesiones_activas_pre_despliegue.sql).

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TEMP TABLE _restaurar (tabla text, id uuid) ON COMMIT DROP;
INSERT INTO _restaurar VALUES
  ('movimientos_caja',                           '162dbac2-3efa-4ecc-ae6d-d6e751622988'),
  ('movimientos_cuenta_corriente',               '38974a84-dbb2-49f8-a35d-e72aaa8ab4e1'),
  ('movimientos_cuenta_corriente',               'fe5586d1-199d-4f37-876e-1de46085fde6'),
  ('movimientos_cuenta_corriente',               'fb6b0b33-72f0-4431-99b7-139e7a0f034c'),
  ('movimientos_cuenta_corriente',               'a150569e-2da2-4514-a7f2-95184bd32a0b'),
  ('movimientos_cuenta_corriente',               '316457e7-412d-478d-bb2e-53aff19c891b'),
  ('movimientos_cuenta_corriente',               '9ff9b274-409a-473d-896c-0ea152c0cfe4'),
  ('movimientos_cuenta_corriente_intermediario', '13786efa-6f62-4bbb-975c-1efa421939d7');

CREATE TEMP TABLE _nuevos (tabla text, id_original uuid, id_nuevo uuid) ON COMMIT DROP;

-- Caja
WITH ins AS (
  INSERT INTO public.movimientos_caja
  SELECT (jsonb_populate_record(NULL::public.movimientos_caja,
           to_jsonb(m) || jsonb_build_object('id', gen_random_uuid(), 'estado', 'cerrado',
                                             'estado_fecha', COALESCE((SELECT t.updated_at FROM public.transacciones t WHERE t.id = m.transaccion_id), (SELECT o.updated_at FROM public.ordenes o WHERE o.id = m.orden_id), now()),
                                             'created_at', now()))).*
    FROM public.movimientos_caja m
    JOIN _restaurar r ON r.tabla = 'movimientos_caja' AND r.id = m.id
   WHERE m.estado = 'anulado'
     AND NOT EXISTS (SELECT 1 FROM public.movimientos_caja v
                      WHERE v.transaccion_id IS NOT DISTINCT FROM m.transaccion_id AND v.orden_id IS NOT DISTINCT FROM m.orden_id
                        AND v.moneda = m.moneda AND v.caja_tipo IS NOT DISTINCT FROM m.caja_tipo
                        AND v.sync_clave IS NOT DISTINCT FROM m.sync_clave AND v.estado <> 'anulado')
  RETURNING id, transaccion_id, orden_id, moneda, sync_clave, monto
)
INSERT INTO _nuevos
SELECT 'movimientos_caja', o.id, ins.id FROM ins
  JOIN public.movimientos_caja o ON o.id IN (SELECT id FROM _restaurar WHERE tabla = 'movimientos_caja')
   AND o.transaccion_id IS NOT DISTINCT FROM ins.transaccion_id AND o.orden_id IS NOT DISTINCT FROM ins.orden_id
   AND o.moneda = ins.moneda AND o.sync_clave IS NOT DISTINCT FROM ins.sync_clave AND o.monto = ins.monto;

-- CC cliente
WITH ins AS (
  INSERT INTO public.movimientos_cuenta_corriente
  SELECT (jsonb_populate_record(NULL::public.movimientos_cuenta_corriente,
           to_jsonb(m) || jsonb_build_object('id', gen_random_uuid(), 'estado', 'cerrado',
                                             'estado_fecha', COALESCE((SELECT t.updated_at FROM public.transacciones t WHERE t.id = m.transaccion_id), (SELECT o.updated_at FROM public.ordenes o WHERE o.id = m.orden_id), now()),
                                             'created_at', now()))).*
    FROM public.movimientos_cuenta_corriente m
    JOIN _restaurar r ON r.tabla = 'movimientos_cuenta_corriente' AND r.id = m.id
   WHERE m.estado IN ('anulado', 'anulada')
     AND NOT EXISTS (SELECT 1 FROM public.movimientos_cuenta_corriente v
                      WHERE v.transaccion_id IS NOT DISTINCT FROM m.transaccion_id AND v.orden_id IS NOT DISTINCT FROM m.orden_id
                        AND v.cliente_id = m.cliente_id AND v.moneda = m.moneda
                        AND v.sync_clave IS NOT DISTINCT FROM m.sync_clave AND v.estado NOT IN ('anulado', 'anulada'))
  RETURNING id, transaccion_id, orden_id, cliente_id, moneda, sync_clave, monto
)
INSERT INTO _nuevos
SELECT 'movimientos_cuenta_corriente', o.id, ins.id FROM ins
  JOIN public.movimientos_cuenta_corriente o ON o.id IN (SELECT id FROM _restaurar WHERE tabla = 'movimientos_cuenta_corriente')
   AND o.transaccion_id IS NOT DISTINCT FROM ins.transaccion_id AND o.orden_id IS NOT DISTINCT FROM ins.orden_id
   AND o.cliente_id = ins.cliente_id AND o.moneda = ins.moneda
   AND o.sync_clave IS NOT DISTINCT FROM ins.sync_clave AND o.monto = ins.monto;

-- CC intermediario
WITH ins AS (
  INSERT INTO public.movimientos_cuenta_corriente_intermediario
  SELECT (jsonb_populate_record(NULL::public.movimientos_cuenta_corriente_intermediario,
           to_jsonb(m) || jsonb_build_object('id', gen_random_uuid(), 'estado', 'cerrado',
                                             'estado_fecha', COALESCE((SELECT t.updated_at FROM public.transacciones t WHERE t.id = m.transaccion_id), (SELECT o.updated_at FROM public.ordenes o WHERE o.id = m.orden_id), now()),
                                             'created_at', now()))).*
    FROM public.movimientos_cuenta_corriente_intermediario m
    JOIN _restaurar r ON r.tabla = 'movimientos_cuenta_corriente_intermediario' AND r.id = m.id
   WHERE m.estado IN ('anulado', 'anulada')
     AND NOT EXISTS (SELECT 1 FROM public.movimientos_cuenta_corriente_intermediario v
                      WHERE v.transaccion_id IS NOT DISTINCT FROM m.transaccion_id AND v.orden_id = m.orden_id
                        AND v.intermediario_id = m.intermediario_id AND v.moneda = m.moneda AND v.sync_clave IS NOT DISTINCT FROM m.sync_clave
                        AND v.estado NOT IN ('anulado', 'anulada'))
  RETURNING id, orden_id, moneda, sync_clave, monto
)
INSERT INTO _nuevos
SELECT 'movimientos_cuenta_corriente_intermediario', o.id, ins.id FROM ins
  JOIN public.movimientos_cuenta_corriente_intermediario o
    ON o.id IN (SELECT id FROM _restaurar WHERE tabla = 'movimientos_cuenta_corriente_intermediario')
   AND o.orden_id = ins.orden_id AND o.moneda = ins.moneda
   AND o.sync_clave IS NOT DISTINCT FROM ins.sync_clave AND o.monto = ins.monto;

-- Auditoría (una fila por movimiento restaurado)
INSERT INTO public.auditoria_app (usuario_id, categoria, accion, detalle, metadata)
SELECT '21c8c0f9-ec58-455c-840f-baba670124d9'::uuid,  -- titular (admin) que autorizó la corrección
       'correccion_incidente', 'restaurar_movimiento',
       'Corrección incidente sync 19/11/2026 17:34: se restauró movimiento anulado sin reemplazo (' || n.tabla || ') de orden ejecutada.',
       jsonb_build_object('incidente', 'sync_20261119_ordenes_150_152',
                          'tabla', n.tabla, 'id_original_anulado', n.id_original, 'id_nuevo', n.id_nuevo,
                          'doc', 'docs/INCIDENTE_CAJA_ARS_SYNC_2026-11-19.md')
  FROM _nuevos n;

-- Control: 8 la primera vez, 0 si ya se aplicó; cualquier otro número revierte todo.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM _nuevos;
  IF n NOT IN (0, 8) THEN
    RAISE EXCEPTION 'Corrección abortada: se mapearon % filas (esperado 8 o 0)', n;
  END IF;
  IF n = 8 AND (SELECT count(DISTINCT id_original) FROM _nuevos) <> 8 THEN
    RAISE EXCEPTION 'Corrección abortada: mapeo id_original→id_nuevo ambiguo';
  END IF;
  RAISE NOTICE 'Movimientos restaurados: %', n;
END $$;

SELECT tabla, count(*) restaurados FROM _nuevos GROUP BY 1 ORDER BY 1;

COMMIT;

-- Verificación posterior
-- Saldo inicial efectivo ARS al 20/11 → 6.858.170
-- SELECT sum(monto) FROM public.movimientos_caja WHERE moneda='ARS' AND caja_tipo='efectivo' AND estado<>'anulado' AND fecha < '2026-11-20';
-- Orden 152 y 150 con movimientos vivos:
-- SELECT o.numero, count(*) FROM public.movimientos_cuenta_corriente m JOIN public.ordenes o ON o.id=m.orden_id
--  WHERE o.numero IN (150,152) AND m.estado NOT IN ('anulado','anulada') GROUP BY 1;
