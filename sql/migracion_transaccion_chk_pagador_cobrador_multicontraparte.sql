-- Permite pagador = cobrador = 'cliente' (o ambos 'intermediario') cuando los UUID
-- explícitos difieren (instrumentación manual multicontraparte).
-- El check anterior (cobrador <> pagador) rechazaba cualquier fila con dos roles
-- "cliente" aunque fueran personas distintas (p. ej. acuerdo paga a otro cliente).
--
-- Ejecutar en Supabase SQL Editor después de:
--   sql/migracion_transaccion_cobrador_pagador.sql
--   sql/migracion_instrumentacion_multicontraparte.sql
--
-- Semántica: NULL en *_cliente_id / *_intermediario_id = “entidad por defecto del acuerdo”
-- en ese rol; IS DISTINCT FROM trata NULL = NULL como “misma entidad explícita” y
-- NULL vs uuid como distintos.

ALTER TABLE public.transacciones
  DROP CONSTRAINT IF EXISTS chk_transaccion_cobrador_pagador_distintos;

ALTER TABLE public.transacciones
  ADD CONSTRAINT chk_transaccion_cobrador_pagador_distintos CHECK (
    cobrador <> pagador
    OR (
      cobrador = 'cliente'
      AND pagador = 'cliente'
      AND pagador_cliente_id IS DISTINCT FROM cobrador_cliente_id
    )
    OR (
      cobrador = 'intermediario'
      AND pagador = 'intermediario'
      AND pagador_intermediario_id IS DISTINCT FROM cobrador_intermediario_id
    )
  );

COMMENT ON CONSTRAINT chk_transaccion_cobrador_pagador_distintos ON public.transacciones IS
  'Pagador y cobrador distintos por rol, o mismo rol cliente/intermediario solo si los UUID explícitos difieren (NULL = entidad por defecto del acuerdo en ese rol).';
