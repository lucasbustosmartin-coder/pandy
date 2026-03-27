-- CC manual: metadatos Pagador / Cobrador (cliente, intermediario, empresa) para movimientos sin orden.
-- Ejecutar en Supabase SQL Editor después de migracion_cc_movimiento_manual.sql.

-- ========== movimientos_cuenta_corriente ==========
ALTER TABLE public.movimientos_cuenta_corriente
  ADD COLUMN IF NOT EXISTS manual_grupo_id uuid;

ALTER TABLE public.movimientos_cuenta_corriente
  ADD COLUMN IF NOT EXISTS manual_pagador_rol text;

ALTER TABLE public.movimientos_cuenta_corriente
  ADD COLUMN IF NOT EXISTS manual_cobrador_rol text;

ALTER TABLE public.movimientos_cuenta_corriente
  ADD COLUMN IF NOT EXISTS manual_pagador_cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL;

ALTER TABLE public.movimientos_cuenta_corriente
  ADD COLUMN IF NOT EXISTS manual_pagador_intermediario_id uuid REFERENCES public.intermediarios(id) ON DELETE SET NULL;

ALTER TABLE public.movimientos_cuenta_corriente
  ADD COLUMN IF NOT EXISTS manual_cobrador_cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL;

ALTER TABLE public.movimientos_cuenta_corriente
  ADD COLUMN IF NOT EXISTS manual_cobrador_intermediario_id uuid REFERENCES public.intermediarios(id) ON DELETE SET NULL;

ALTER TABLE public.movimientos_cuenta_corriente
  DROP CONSTRAINT IF EXISTS chk_mov_cc_manual_pag_cob_rol;

ALTER TABLE public.movimientos_cuenta_corriente
  ADD CONSTRAINT chk_mov_cc_manual_pag_cob_rol CHECK (
    (manual_pagador_rol IS NULL AND manual_cobrador_rol IS NULL)
    OR (
      manual_pagador_rol IS NOT NULL
      AND manual_cobrador_rol IS NOT NULL
      AND manual_pagador_rol IN ('cliente', 'intermediario', 'pandy')
      AND manual_cobrador_rol IN ('cliente', 'intermediario', 'pandy')
    )
  );

COMMENT ON COLUMN public.movimientos_cuenta_corriente.manual_grupo_id IS 'Mismo UUID en todas las patas de un mismo registro manual (ej. cliente A + cliente B).';
COMMENT ON COLUMN public.movimientos_cuenta_corriente.manual_pagador_rol IS 'Quién paga en el hecho económico: cliente | intermediario | pandy.';
COMMENT ON COLUMN public.movimientos_cuenta_corriente.manual_cobrador_rol IS 'Quién cobra en el hecho económico.';

-- ========== movimientos_cuenta_corriente_intermediario ==========
ALTER TABLE public.movimientos_cuenta_corriente_intermediario
  ADD COLUMN IF NOT EXISTS manual_grupo_id uuid;

ALTER TABLE public.movimientos_cuenta_corriente_intermediario
  ADD COLUMN IF NOT EXISTS manual_pagador_rol text;

ALTER TABLE public.movimientos_cuenta_corriente_intermediario
  ADD COLUMN IF NOT EXISTS manual_cobrador_rol text;

ALTER TABLE public.movimientos_cuenta_corriente_intermediario
  ADD COLUMN IF NOT EXISTS manual_pagador_cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL;

ALTER TABLE public.movimientos_cuenta_corriente_intermediario
  ADD COLUMN IF NOT EXISTS manual_pagador_intermediario_id uuid REFERENCES public.intermediarios(id) ON DELETE SET NULL;

ALTER TABLE public.movimientos_cuenta_corriente_intermediario
  ADD COLUMN IF NOT EXISTS manual_cobrador_cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL;

ALTER TABLE public.movimientos_cuenta_corriente_intermediario
  ADD COLUMN IF NOT EXISTS manual_cobrador_intermediario_id uuid REFERENCES public.intermediarios(id) ON DELETE SET NULL;

ALTER TABLE public.movimientos_cuenta_corriente_intermediario
  DROP CONSTRAINT IF EXISTS chk_mov_cc_int_manual_pag_cob_rol;

ALTER TABLE public.movimientos_cuenta_corriente_intermediario
  ADD CONSTRAINT chk_mov_cc_int_manual_pag_cob_rol CHECK (
    (manual_pagador_rol IS NULL AND manual_cobrador_rol IS NULL)
    OR (
      manual_pagador_rol IS NOT NULL
      AND manual_cobrador_rol IS NOT NULL
      AND manual_pagador_rol IN ('cliente', 'intermediario', 'pandy')
      AND manual_cobrador_rol IN ('cliente', 'intermediario', 'pandy')
    )
  );

COMMENT ON COLUMN public.movimientos_cuenta_corriente_intermediario.manual_grupo_id IS 'Igual que movimientos_cuenta_corriente.manual_grupo_id.';
COMMENT ON COLUMN public.movimientos_cuenta_corriente_intermediario.manual_pagador_rol IS 'Igual que movimientos_cuenta_corriente.manual_pagador_rol.';
COMMENT ON COLUMN public.movimientos_cuenta_corriente_intermediario.manual_cobrador_rol IS 'Igual que movimientos_cuenta_corriente.manual_cobrador_rol.';

CREATE INDEX IF NOT EXISTS idx_mov_cc_manual_grupo ON public.movimientos_cuenta_corriente (manual_grupo_id) WHERE manual_grupo_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mov_cc_int_manual_grupo ON public.movimientos_cuenta_corriente_intermediario (manual_grupo_id) WHERE manual_grupo_id IS NOT NULL;
