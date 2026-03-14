-- Pandi – Tipos de operación: columna usa_intermediario (Sí/No)
-- Si usa_intermediario = true, en el modal de orden se muestra el selector de intermediario.
-- Si = false, el intermediario no se muestra ni se menciona para ese tipo.
-- Ejecutar en Supabase SQL Editor.

ALTER TABLE public.tipos_operacion
  ADD COLUMN IF NOT EXISTS usa_intermediario boolean DEFAULT false;

COMMENT ON COLUMN public.tipos_operacion.usa_intermediario IS 'Si true, las órdenes de este tipo pueden llevar intermediario; si false, no se muestra ni se usa.';

-- Backfill: solo ARS-ARS (cheque) usa intermediario hoy
UPDATE public.tipos_operacion
SET usa_intermediario = true
WHERE codigo IN ('ARS-ARS-CHEQUE', 'ARS-ARS');
