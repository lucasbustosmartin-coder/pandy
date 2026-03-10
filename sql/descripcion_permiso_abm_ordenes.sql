-- Aclarar en la descripción qué incluye el permiso abm_ordenes (editar orden y cambio de estado de transacciones).
-- Ejecutar en Supabase SQL Editor cuando quieras.

UPDATE public.app_permission
SET description = 'ABM de órdenes: crear, editar orden, instrumentación y cambio de estado de transacciones (pendiente/ejecutada)'
WHERE permission = 'abm_ordenes';
