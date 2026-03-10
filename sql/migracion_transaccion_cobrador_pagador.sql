-- Cada transacción tiene cobrador y pagador para conciliar bien las cuentas corrientes.
-- Ejecutar después de supabase_complejidad_ordenes.sql.

-- Agregar columnas cobrador y pagador
ALTER TABLE public.transacciones
  ADD COLUMN IF NOT EXISTS cobrador text CHECK (cobrador IN ('pandy', 'cliente', 'intermediario')),
  ADD COLUMN IF NOT EXISTS pagador text CHECK (pagador IN ('pandy', 'cliente', 'intermediario'));

-- Rellenar desde owner. Si owner=pandy, cobrador y pagador quedarían iguales; usamos 'cliente' como otro extremo.
UPDATE public.transacciones
  SET cobrador = CASE
        WHEN tipo = 'ingreso' AND owner = 'pandy' THEN 'pandy'
        WHEN tipo = 'ingreso' THEN owner
        WHEN tipo = 'egreso' AND owner = 'pandy' THEN 'cliente'
        ELSE 'pandy'
      END,
      pagador  = CASE
        WHEN tipo = 'egreso' AND owner = 'pandy' THEN 'pandy'
        WHEN tipo = 'egreso' THEN owner
        WHEN tipo = 'ingreso' AND owner = 'pandy' THEN 'cliente'
        ELSE 'pandy'
      END
  WHERE cobrador IS NULL OR pagador IS NULL;

-- Corregir filas donde cobrador = pagador (p. ej. owner=pandy con la lógica anterior)
UPDATE public.transacciones
  SET cobrador = CASE WHEN tipo = 'ingreso' THEN cobrador ELSE 'cliente' END,
      pagador  = CASE WHEN tipo = 'egreso' THEN pagador ELSE 'cliente' END
  WHERE cobrador = pagador;

-- Obligatorios y constraint: cobrador <> pagador
ALTER TABLE public.transacciones ALTER COLUMN cobrador SET NOT NULL;
ALTER TABLE public.transacciones ALTER COLUMN cobrador SET DEFAULT 'pandy';
ALTER TABLE public.transacciones ALTER COLUMN pagador SET NOT NULL;
ALTER TABLE public.transacciones ALTER COLUMN pagador SET DEFAULT 'pandy';

ALTER TABLE public.transacciones DROP CONSTRAINT IF EXISTS chk_transaccion_cobrador_pagador_distintos;
ALTER TABLE public.transacciones ADD CONSTRAINT chk_transaccion_cobrador_pagador_distintos CHECK (cobrador <> pagador);

COMMENT ON COLUMN public.transacciones.cobrador IS 'Quién recibe el dinero en esta transacción.';
COMMENT ON COLUMN public.transacciones.pagador IS 'Quién paga en esta transacción. Con cobrador permite conciliar CC cliente e intermediario.';
