-- CC manual: permitir DELETE con editar_movimiento_cc_manual (reemplazo de filas al corregir pagador/cobrador/monto/moneda/modalidad desde la app).
-- Sin esto, solo eliminar_movimiento_cc_manual podía borrar; la edición completa requiere borrar e insertar patas nuevas.
-- Ejecutar en Supabase SQL Editor después de migracion_cc_manual_editar_eliminar_auditoria.sql.

DROP POLICY IF EXISTS "mov_cc_delete_perm" ON public.movimientos_cuenta_corriente;
CREATE POLICY "mov_cc_delete_perm"
  ON public.movimientos_cuenta_corriente FOR DELETE TO authenticated
  USING (
    (
      (public.has_permission('editar_transacciones') OR public.has_permission('eliminar_transacciones'))
      AND COALESCE(es_movimiento_manual, false) = false
    )
    OR (
      public.has_permission('eliminar_movimiento_cc_manual')
      AND COALESCE(es_movimiento_manual, false) = true
    )
    OR (
      public.has_permission('editar_movimiento_cc_manual')
      AND COALESCE(es_movimiento_manual, false) = true
    )
  );

DROP POLICY IF EXISTS "mov_cc_int_delete_perm" ON public.movimientos_cuenta_corriente_intermediario;
CREATE POLICY "mov_cc_int_delete_perm"
  ON public.movimientos_cuenta_corriente_intermediario FOR DELETE TO authenticated
  USING (
    (
      (public.has_permission('editar_transacciones') OR public.has_permission('eliminar_transacciones'))
      AND COALESCE(es_movimiento_manual, false) = false
    )
    OR (
      public.has_permission('eliminar_movimiento_cc_manual')
      AND COALESCE(es_movimiento_manual, false) = true
    )
    OR (
      public.has_permission('editar_movimiento_cc_manual')
      AND COALESCE(es_movimiento_manual, false) = true
    )
  );
