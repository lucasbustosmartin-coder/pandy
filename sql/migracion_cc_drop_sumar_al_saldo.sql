-- Quitar `sumar_al_saldo` de movimientos CC: el saldo es la suma simple por moneda
-- de todos los movimientos no anulados; no hace falta flag en fila.
-- Ejecutar en Supabase SQL Editor después de desplegar front que ya no envía la columna.

ALTER TABLE public.movimientos_cuenta_corriente
  DROP COLUMN IF EXISTS sumar_al_saldo;

ALTER TABLE public.movimientos_cuenta_corriente_intermediario
  DROP COLUMN IF EXISTS sumar_al_saldo;

-- Si la tabla de reglas tuvo la columna en algún entorno:
ALTER TABLE public.reglas_de_negocio
  DROP COLUMN IF EXISTS sumar_al_saldo;
