-- Pandi: intermediarios con nombre duplicado (normalizado trim+lower) y conteo de referencias.
-- Uso: SQL Editor Supabase (prod o dev). Solo lectura / diagnóstico.
-- Referencias: órdenes, transacciones (pagador/cobrador intermediario), vínculo cliente↔intermediario,
-- CC intermediario (libro), CC cliente manual (pagador/cobrador intermediario en otra entidad),
-- comisiones de orden con beneficiario intermediario.

WITH i AS (
  SELECT id, nombre, trim(lower(nombre)) AS nkey, activo, created_at
  FROM public.intermediarios
),
dup_keys AS (
  SELECT nkey
  FROM i
  GROUP BY nkey
  HAVING count(*) > 1
),
refs AS (
  SELECT intm.id AS intermediario_id,
    (SELECT count(*)::int FROM public.ordenes o WHERE o.intermediario_id = intm.id) AS n_ordenes,
    (SELECT count(*)::int FROM public.transacciones t
     WHERE t.pagador_intermediario_id = intm.id OR t.cobrador_intermediario_id = intm.id) AS n_trx,
    (SELECT count(*)::int FROM public.contraparte_vinculo v WHERE v.intermediario_id = intm.id) AS n_vinculo,
    (SELECT count(*)::int FROM public.movimientos_cuenta_corriente_intermediario m WHERE m.intermediario_id = intm.id) AS n_cc_int,
    (SELECT count(*)::int FROM public.movimientos_cuenta_corriente m2
     WHERE m2.manual_pagador_intermediario_id = intm.id OR m2.manual_cobrador_intermediario_id = intm.id) AS n_cc_manual_roles,
    (SELECT count(*)::int FROM public.comisiones_orden co WHERE co.intermediario_id = intm.id) AS n_comisiones_orden
  FROM public.intermediarios intm
)
SELECT i.nkey,
  i.id,
  i.nombre,
  i.activo,
  i.created_at,
  r.n_ordenes,
  r.n_trx,
  r.n_vinculo,
  r.n_cc_int,
  r.n_cc_manual_roles,
  r.n_comisiones_orden,
  (r.n_ordenes + r.n_trx + r.n_vinculo + r.n_cc_int + r.n_cc_manual_roles + r.n_comisiones_orden) AS refs_total,
  ((r.n_ordenes + r.n_trx + r.n_vinculo + r.n_cc_int + r.n_cc_manual_roles + r.n_comisiones_orden) = 0) AS candidato_eliminar_fk
FROM i
JOIN dup_keys dk ON dk.nkey = i.nkey
JOIN refs r ON r.intermediario_id = i.id
ORDER BY i.nkey, i.created_at;
