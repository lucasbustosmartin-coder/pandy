-- Pandi: clientes con nombre duplicado (normalizado trim+lower) y conteo de referencias.
-- Uso: SQL Editor Supabase (prod o dev). Solo lectura / diagnóstico.
-- Referencias: órdenes, transacciones (pagador/cobrador), vínculo int↔cliente,
-- movimientos CC donde el cliente es titular del libro o figura en pagador/cobrador manual.

WITH c AS (
  SELECT id, nombre, trim(lower(nombre)) AS nkey, activo, created_at
  FROM public.clientes
),
dup_keys AS (
  SELECT nkey
  FROM c
  GROUP BY nkey
  HAVING count(*) > 1
),
refs AS (
  SELECT cl.id AS cliente_id,
    (SELECT count(*)::int FROM public.ordenes o WHERE o.cliente_id = cl.id) AS n_ordenes,
    (SELECT count(*)::int FROM public.transacciones t WHERE t.pagador_cliente_id = cl.id OR t.cobrador_cliente_id = cl.id) AS n_trx,
    (SELECT count(*)::int FROM public.contraparte_vinculo v WHERE v.cliente_id = cl.id) AS n_vinculo,
    (SELECT count(*)::int FROM public.movimientos_cuenta_corriente m
     WHERE m.cliente_id = cl.id OR m.manual_pagador_cliente_id = cl.id OR m.manual_cobrador_cliente_id = cl.id) AS n_cc_any
  FROM public.clientes cl
)
SELECT c.nkey,
  c.id,
  c.nombre,
  c.activo,
  c.created_at,
  r.n_ordenes,
  r.n_trx,
  r.n_vinculo,
  r.n_cc_any,
  (r.n_ordenes + r.n_trx + r.n_vinculo + r.n_cc_any) AS refs_total,
  ((r.n_ordenes + r.n_trx + r.n_vinculo + r.n_cc_any) = 0) AS candidato_eliminar_fk
FROM c
JOIN dup_keys dk ON dk.nkey = c.nkey
JOIN refs r ON r.cliente_id = c.id
ORDER BY c.nkey, c.created_at;
