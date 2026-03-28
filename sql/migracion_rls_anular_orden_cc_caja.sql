-- RLS: permitir que quien tiene anular_orden pueda marcar como anulados movimientos CC (no manual) y caja por orden_id,
-- alineado al flujo de anulación de orden en la app. Ejecutar en Supabase SQL Editor después de
-- migracion_permisos_ordenes_transacciones.sql y migracion_cc_manual_editar_eliminar_auditoria.sql.

-- ========== movimientos_cuenta_corriente ==========
DROP POLICY IF EXISTS "mov_cc_update_perm" ON public.movimientos_cuenta_corriente;
CREATE POLICY "mov_cc_update_perm"
  ON public.movimientos_cuenta_corriente FOR UPDATE TO authenticated
  USING (
    (
      (public.has_permission('editar_transacciones') OR public.has_permission('anular_orden'))
      AND COALESCE(es_movimiento_manual, false) = false
    )
    OR (
      COALESCE(es_movimiento_manual, false) = true
      AND (
        public.has_permission('editar_movimiento_cc_manual')
        OR public.has_permission('eliminar_movimiento_cc_manual')
        OR public.has_permission('registrar_movimiento_cc_manual')
      )
    )
  )
  WITH CHECK (
    (
      (public.has_permission('editar_transacciones') OR public.has_permission('anular_orden'))
      AND COALESCE(es_movimiento_manual, false) = false
    )
    OR (
      COALESCE(es_movimiento_manual, false) = true
      AND (
        public.has_permission('editar_movimiento_cc_manual')
        OR public.has_permission('eliminar_movimiento_cc_manual')
        OR public.has_permission('registrar_movimiento_cc_manual')
      )
    )
  );

-- ========== movimientos_cuenta_corriente_intermediario ==========
DROP POLICY IF EXISTS "mov_cc_int_update_perm" ON public.movimientos_cuenta_corriente_intermediario;
CREATE POLICY "mov_cc_int_update_perm"
  ON public.movimientos_cuenta_corriente_intermediario FOR UPDATE TO authenticated
  USING (
    (
      (public.has_permission('editar_transacciones') OR public.has_permission('anular_orden'))
      AND COALESCE(es_movimiento_manual, false) = false
    )
    OR (
      COALESCE(es_movimiento_manual, false) = true
      AND (
        public.has_permission('editar_movimiento_cc_manual')
        OR public.has_permission('eliminar_movimiento_cc_manual')
        OR public.has_permission('registrar_movimiento_cc_manual')
      )
    )
  )
  WITH CHECK (
    (
      (public.has_permission('editar_transacciones') OR public.has_permission('anular_orden'))
      AND COALESCE(es_movimiento_manual, false) = false
    )
    OR (
      COALESCE(es_movimiento_manual, false) = true
      AND (
        public.has_permission('editar_movimiento_cc_manual')
        OR public.has_permission('eliminar_movimiento_cc_manual')
        OR public.has_permission('registrar_movimiento_cc_manual')
      )
    )
  );

-- ========== movimientos_caja (filas con orden_id vinculado a la orden que se anula) ==========
DROP POLICY IF EXISTS "movimientos_caja_update_abm" ON public.movimientos_caja;
CREATE POLICY "movimientos_caja_update_abm"
  ON public.movimientos_caja FOR UPDATE TO authenticated
  USING (
    public.has_permission('abm_movimientos_caja')
    OR (
      public.has_permission('anular_orden')
      AND orden_id IS NOT NULL
    )
    OR (
      (
        public.has_permission('editar_movimiento_cc_manual')
        OR public.has_permission('eliminar_movimiento_cc_manual')
      )
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
    public.has_permission('abm_movimientos_caja')
    OR (
      public.has_permission('anular_orden')
      AND orden_id IS NOT NULL
    )
    OR (
      (
        public.has_permission('editar_movimiento_cc_manual')
        OR public.has_permission('eliminar_movimiento_cc_manual')
      )
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
  );

COMMENT ON POLICY "mov_cc_update_perm" ON public.movimientos_cuenta_corriente IS 'UPDATE: transacciones o anular orden (no manual); o CC manual con permisos de manual.';
COMMENT ON POLICY "mov_cc_int_update_perm" ON public.movimientos_cuenta_corriente_intermediario IS 'UPDATE: transacciones o anular orden (no manual); o CC manual con permisos de manual.';
COMMENT ON POLICY "movimientos_caja_update_abm" ON public.movimientos_caja IS 'UPDATE: ABM caja, anular orden (fila con orden_id), o caja vinculada a CC manual.';
