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

-- Políticas UPDATE en movimientos_caja (anular orden, CC manual, granulares): migracion_permisos_movimientos_caja_granular.sql

COMMENT ON POLICY "mov_cc_update_perm" ON public.movimientos_cuenta_corriente IS 'UPDATE: transacciones o anular orden (no manual); o CC manual con permisos de manual.';
COMMENT ON POLICY "mov_cc_int_update_perm" ON public.movimientos_cuenta_corriente_intermediario IS 'UPDATE: transacciones o anular orden (no manual); o CC manual con permisos de manual.';
