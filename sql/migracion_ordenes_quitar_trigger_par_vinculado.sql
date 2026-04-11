-- Revoca la restricción Fase 4 que impedía que en una misma orden coincidieran
-- ordenes.cliente_id y ordenes.intermediario_id con un par declarado en contraparte_vinculo.
-- El producto permite esa combinación cuando la misma persona actúa en ambos roles; la vista
-- unificada de Cuenta corriente (tipo Intermediario) sigue leyendo ambos libros sin duplicar filas en BD.
--
-- Ejecutar en Supabase SQL Editor en **producción** y **desarrollo** (bases que ya aplicaron
-- sql/migracion_ordenes_validar_no_par_vinculado_fase4.sql). Idempotente.
--
-- Front: validación eliminada en main.js (saveOrden, wizard, cola offline).

DROP TRIGGER IF EXISTS tr_ordenes_no_par_vinculado ON public.ordenes;

DROP FUNCTION IF EXISTS public.ordenes_rechazar_par_vinculado_cliente_intermediario();
