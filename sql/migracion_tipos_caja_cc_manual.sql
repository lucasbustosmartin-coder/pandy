-- Tipos de movimiento de caja fijos para efectivo originado en CC manual (sin combo en el modal).
-- Ejecutar en Supabase SQL Editor. UNIQUE (nombre, direccion) en tipos_movimiento_caja.

INSERT INTO public.tipos_movimiento_caja (nombre, direccion, activo) VALUES
  ('Ingreso de Dinero (Mov Manual en CC)', 'ingreso', true),
  ('Egreso de Dinero (Mov Manual en CC)', 'egreso', true)
ON CONFLICT (nombre, direccion) DO UPDATE SET activo = true;
