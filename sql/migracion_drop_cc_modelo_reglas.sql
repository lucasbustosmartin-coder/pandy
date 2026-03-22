-- Pandi – Quitar tabla legacy `cc_modelo_reglas` (el front ya no la consulta; CC desde `reglas_de_negocio`).
--
-- PREVIO (obligatorio en producción):
-- 1) Verificar que todas las combinaciones (tipo_operacion_codigo, usa_intermediario) activas tengan filas en reglas_de_negocio.
-- 2) Backup / snapshot de la base.
-- 3) Opcional: SELECT COUNT(*) FROM cc_modelo_reglas;
--
-- Ejecutar en Supabase SQL Editor.

DROP POLICY IF EXISTS "cc_modelo_reglas_select_authenticated" ON public.cc_modelo_reglas;

DROP TABLE IF EXISTS public.cc_modelo_reglas;
