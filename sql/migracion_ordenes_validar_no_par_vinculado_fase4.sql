-- Fase 4 (PLAN_INTERMEDIARIO_CLIENTE_CC_UNIFICADA): en una misma orden no puede coincidir
-- cliente_id e intermediario_id con una fila de contraparte_vinculo (misma persona en ambos roles).
-- Ejecutar en Supabase SQL Editor en bases ya desplegadas (idempotente).
-- Registro Pandi: aplicado en Supabase dev y prod (constancia en docs/SUPABASE_REQUISITOS.md y Bitácora Log).

CREATE OR REPLACE FUNCTION public.ordenes_rechazar_par_vinculado_cliente_intermediario()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.intermediario_id IS NOT NULL AND NEW.cliente_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.contraparte_vinculo v
      WHERE v.cliente_id = NEW.cliente_id
        AND v.intermediario_id = NEW.intermediario_id
    ) THEN
      RAISE EXCEPTION
        'En una misma orden no puede figurar a la vez como cliente e intermediario el mismo registro vinculado. Elegí otro cliente u otro intermediario, o ajustá el vínculo en Clientes / Intermediarios.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.ordenes_rechazar_par_vinculado_cliente_intermediario() IS
  'Trigger: bloquea orden si cliente_id e intermediario_id forman par en contraparte_vinculo (Fase 4).';

DROP TRIGGER IF EXISTS tr_ordenes_no_par_vinculado ON public.ordenes;
CREATE TRIGGER tr_ordenes_no_par_vinculado
  BEFORE INSERT OR UPDATE OF cliente_id, intermediario_id ON public.ordenes
  FOR EACH ROW
  EXECUTE FUNCTION public.ordenes_rechazar_par_vinculado_cliente_intermediario();
