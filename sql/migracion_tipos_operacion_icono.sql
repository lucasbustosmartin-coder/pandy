-- Icono de tipo de operación: modo y URL opcional (p. ej. imagen en Storage público).
-- Ejecutar en Supabase SQL Editor después de crear el bucket (ver sql/storage_bucket_tipo_operacion_iconos.sql).

ALTER TABLE public.tipos_operacion
  ADD COLUMN IF NOT EXISTS icono_modo text NOT NULL DEFAULT 'auto';

ALTER TABLE public.tipos_operacion
  ADD COLUMN IF NOT EXISTS icono_url_publica text;

ALTER TABLE public.tipos_operacion
  DROP CONSTRAINT IF EXISTS tipos_operacion_icono_modo_check;

ALTER TABLE public.tipos_operacion
  ADD CONSTRAINT tipos_operacion_icono_modo_check
  CHECK (icono_modo IN ('auto', 'cheque', 'custom'));

COMMENT ON COLUMN public.tipos_operacion.icono_modo IS 'auto: iconos según código (monedas o CHEQUE en código); cheque: siempre icono cheques; custom: usar icono_url_publica (https).';
COMMENT ON COLUMN public.tipos_operacion.icono_url_publica IS 'URL https pública de la imagen (recomendado: Supabase Storage bucket tipo-operacion-iconos).';

UPDATE public.tipos_operacion SET icono_modo = 'auto' WHERE icono_modo IS NULL;
