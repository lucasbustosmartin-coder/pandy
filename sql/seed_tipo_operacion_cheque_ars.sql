-- Tipo CHEQUE-ARS: mismo flujo de negocio que ARS-ARS (cheque + intermediario).
-- Ejecutar en Supabase SQL Editor (una vez) antes de correr E2E que usan data-codigo="CHEQUE-ARS".
-- Si existen columnas moneda_in / moneda_out, se rellenan CHEQUE + ARS.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tipos_operacion' AND column_name = 'moneda_in'
  ) THEN
    ALTER TABLE public.tipos_operacion
      DROP CONSTRAINT IF EXISTS tipos_operacion_moneda_in_check;
    ALTER TABLE public.tipos_operacion
      ADD CONSTRAINT tipos_operacion_moneda_in_check
      CHECK (moneda_in IN ('USD', 'EUR', 'ARS', 'CHEQUE'));
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tipos_operacion' AND column_name = 'moneda_out'
  ) THEN
    ALTER TABLE public.tipos_operacion
      DROP CONSTRAINT IF EXISTS tipos_operacion_moneda_out_check;
    ALTER TABLE public.tipos_operacion
      ADD CONSTRAINT tipos_operacion_moneda_out_check
      CHECK (moneda_out IN ('USD', 'EUR', 'ARS', 'CHEQUE'));
  END IF;
END $$;

INSERT INTO public.tipos_operacion (codigo, nombre, activo, usa_intermediario)
VALUES ('CHEQUE-ARS', 'CHEQUE – ARS', true, true)
ON CONFLICT (codigo) DO UPDATE SET
  nombre = EXCLUDED.nombre,
  activo = EXCLUDED.activo,
  usa_intermediario = EXCLUDED.usa_intermediario;

UPDATE public.tipos_operacion
SET moneda_in = 'CHEQUE', moneda_out = 'ARS'
WHERE codigo = 'CHEQUE-ARS'
  AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tipos_operacion' AND column_name = 'moneda_in'
  );


-- Si aún existe el código legacy, dejarlo inactivo en dev para evitar confusión.
UPDATE public.tipos_operacion
SET activo = false
WHERE codigo = 'ARS-ARS-CHEQUE';
