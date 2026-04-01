-- Permisos granulares de movimientos_caja: alta, edición, anulación (reemplaza abm_movimientos_caja).
-- RLS: INSERT/UPDATE/DELETE acorde; UPDATE partido en editar (estado cerrado) vs anular (estado anulado).
--
-- Ejecutar en Supabase SQL Editor en proyectos que aún tengan abm_movimientos_caja.
-- El bootstrap dev concatena este archivo después de migracion_rls_anular_orden_cc_caja.sql.
--
-- Migración de datos: cada rol que tenía abm_movimientos_caja recibe los tres permisos nuevos;
-- luego se elimina abm_movimientos_caja de app_role_permission y app_permission.

-- ========== 1) Catálogo de permisos ==========
INSERT INTO public.app_permission (permission, description) VALUES
  ('alta_movimiento_caja', 'Alta de movimientos de caja (manuales sin orden; también cubre INSERT vía app si aplica).'),
  ('editar_movimiento_caja', 'Edición de movimientos de caja (concepto, fecha, montos; mantiene estado cerrado).'),
  ('anular_movimiento_caja', 'Anulación de movimientos de caja manuales solo caja (sin orden ni transacción).')
ON CONFLICT (permission) DO UPDATE SET description = EXCLUDED.description;

-- Quien tenía ABM caja pasa a tener los tres permisos
INSERT INTO public.app_role_permission (role, permission)
SELECT rp.role, x.p
FROM public.app_role_permission rp
CROSS JOIN (
  VALUES
    ('alta_movimiento_caja'),
    ('editar_movimiento_caja'),
    ('anular_movimiento_caja')
) AS x(p)
WHERE rp.permission = 'abm_movimientos_caja'
ON CONFLICT (role, permission) DO NOTHING;

DELETE FROM public.app_role_permission WHERE permission = 'abm_movimientos_caja';
DELETE FROM public.app_permission WHERE permission = 'abm_movimientos_caja';

-- ========== 2) RLS movimientos_caja ==========
DROP POLICY IF EXISTS "movimientos_caja_insert_abm" ON public.movimientos_caja;
DROP POLICY IF EXISTS "movimientos_caja_insert_perm" ON public.movimientos_caja;
CREATE POLICY "movimientos_caja_insert_perm"
  ON public.movimientos_caja FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission('alta_movimiento_caja')
    OR (
      (
        public.has_permission('editar_transacciones')
        OR public.has_permission('ingresar_transacciones')
        OR public.has_permission('eliminar_transacciones')
      )
      AND (orden_id IS NOT NULL OR transaccion_id IS NOT NULL)
    )
  );

DROP POLICY IF EXISTS "movimientos_caja_delete_abm" ON public.movimientos_caja;
DROP POLICY IF EXISTS "movimientos_caja_delete_perm" ON public.movimientos_caja;
CREATE POLICY "movimientos_caja_delete_perm"
  ON public.movimientos_caja FOR DELETE TO authenticated
  USING (
    public.has_permission('editar_movimiento_caja')
    OR (
      (
        public.has_permission('editar_transacciones')
        OR public.has_permission('ingresar_transacciones')
        OR public.has_permission('eliminar_transacciones')
      )
      AND (orden_id IS NOT NULL OR transaccion_id IS NOT NULL)
    )
  );

DROP POLICY IF EXISTS "movimientos_caja_update_abm" ON public.movimientos_caja;
DROP POLICY IF EXISTS "movimientos_caja_update_editar" ON public.movimientos_caja;
DROP POLICY IF EXISTS "movimientos_caja_update_anular" ON public.movimientos_caja;

CREATE POLICY "movimientos_caja_update_editar"
  ON public.movimientos_caja FOR UPDATE TO authenticated
  USING (
    public.has_permission('editar_movimiento_caja')
    OR (
      (
        public.has_permission('editar_transacciones')
        OR public.has_permission('ingresar_transacciones')
      )
      AND (orden_id IS NOT NULL OR transaccion_id IS NOT NULL)
    )
    OR (
      public.has_permission('editar_movimiento_cc_manual')
      AND (
        EXISTS (
          SELECT 1 FROM public.movimientos_cuenta_corriente m
          WHERE m.movimiento_caja_id = movimientos_caja.id
            AND COALESCE(m.es_movimiento_manual, false) = true
        )
        OR EXISTS (
          SELECT 1 FROM public.movimientos_cuenta_corriente_intermediario mi
          WHERE mi.movimiento_caja_id = movimientos_caja.id
            AND COALESCE(mi.es_movimiento_manual, false) = true
        )
      )
    )
  )
  WITH CHECK (
    COALESCE(estado, 'cerrado') = 'cerrado'
    AND (
      public.has_permission('editar_movimiento_caja')
      OR (
        (
          public.has_permission('editar_transacciones')
          OR public.has_permission('ingresar_transacciones')
        )
        AND (orden_id IS NOT NULL OR transaccion_id IS NOT NULL)
      )
      OR (
        public.has_permission('editar_movimiento_cc_manual')
        AND (
          EXISTS (
            SELECT 1 FROM public.movimientos_cuenta_corriente m
            WHERE m.movimiento_caja_id = movimientos_caja.id
              AND COALESCE(m.es_movimiento_manual, false) = true
          )
          OR EXISTS (
            SELECT 1 FROM public.movimientos_cuenta_corriente_intermediario mi
            WHERE mi.movimiento_caja_id = movimientos_caja.id
              AND COALESCE(mi.es_movimiento_manual, false) = true
          )
        )
      )
    )
  );

CREATE POLICY "movimientos_caja_update_anular"
  ON public.movimientos_caja FOR UPDATE TO authenticated
  USING (
    (
      public.has_permission('anular_movimiento_caja')
      AND tipo_movimiento_id IS NOT NULL
      AND orden_id IS NULL
      AND transaccion_id IS NULL
      AND COALESCE(estado, 'cerrado') = 'cerrado'
    )
    OR (
      public.has_permission('anular_orden')
      AND orden_id IS NOT NULL
    )
    OR (
      public.has_permission('eliminar_movimiento_cc_manual')
      AND (
        EXISTS (
          SELECT 1 FROM public.movimientos_cuenta_corriente m
          WHERE m.movimiento_caja_id = movimientos_caja.id
            AND COALESCE(m.es_movimiento_manual, false) = true
        )
        OR EXISTS (
          SELECT 1 FROM public.movimientos_cuenta_corriente_intermediario mi
          WHERE mi.movimiento_caja_id = movimientos_caja.id
            AND COALESCE(mi.es_movimiento_manual, false) = true
        )
      )
    )
  )
  WITH CHECK (estado = 'anulado');

COMMENT ON POLICY "movimientos_caja_insert_perm" ON public.movimientos_caja IS 'INSERT: alta manual o filas vinculadas a orden/transacción con permisos de instrumentación.';
COMMENT ON POLICY "movimientos_caja_delete_perm" ON public.movimientos_caja IS 'DELETE: edición caja o limpieza por orden/transacción con permisos de instrumentación.';
COMMENT ON POLICY "movimientos_caja_update_editar" ON public.movimientos_caja IS 'UPDATE manteniendo estado cerrado: edición caja, sync por transacción, o caja vinculada a CC manual (editar).';
COMMENT ON POLICY "movimientos_caja_update_anular" ON public.movimientos_caja IS 'UPDATE a anulado: solo caja manual, anular orden, o CC manual (eliminar).';
