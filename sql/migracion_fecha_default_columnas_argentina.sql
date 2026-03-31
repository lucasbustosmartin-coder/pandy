-- Alinear DEFAULT de columnas fecha (día contable) con Argentina en bases ya creadas.
-- 1) Ejecutar antes (o incluir): sql/helpers_fecha_argentina.sql si la función aún no existe.
-- 2) Este script solo ajusta DEFAULT; no modifica filas existentes.

ALTER TABLE public.ordenes
  ALTER COLUMN fecha SET DEFAULT public.fecha_hoy_argentina();

ALTER TABLE public.movimientos_caja
  ALTER COLUMN fecha SET DEFAULT public.fecha_hoy_argentina();

ALTER TABLE public.movimientos_cuenta_corriente
  ALTER COLUMN fecha SET DEFAULT public.fecha_hoy_argentina();

ALTER TABLE public.movimientos_cuenta_corriente_intermediario
  ALTER COLUMN fecha SET DEFAULT public.fecha_hoy_argentina();
