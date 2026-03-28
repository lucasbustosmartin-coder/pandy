-- CC manual: vínculo a caja, permisos editar/eliminar, auditoría, RLS.
-- Ejecutar en Supabase SQL Editor después de migracion_cc_movimiento_manual.sql y políticas CC vigentes.

-- ========== 1) Vínculo CC manual → movimiento de caja (efectivo) ==========
ALTER TABLE public.movimientos_cuenta_corriente
  ADD COLUMN IF NOT EXISTS movimiento_caja_id uuid REFERENCES public.movimientos_caja(id) ON DELETE SET NULL;

ALTER TABLE public.movimientos_cuenta_corriente_intermediario
  ADD COLUMN IF NOT EXISTS movimiento_caja_id uuid REFERENCES public.movimientos_caja(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_mov_cc_movimiento_caja_id ON public.movimientos_cuenta_corriente (movimiento_caja_id) WHERE movimiento_caja_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mov_cc_int_movimiento_caja_id ON public.movimientos_cuenta_corriente_intermediario (movimiento_caja_id) WHERE movimiento_caja_id IS NOT NULL;

COMMENT ON COLUMN public.movimientos_cuenta_corriente.movimiento_caja_id IS 'Si el manual registró efectivo en caja, id del movimiento_caja asociado (misma operación).';
COMMENT ON COLUMN public.movimientos_cuenta_corriente_intermediario.movimiento_caja_id IS 'Igual que movimientos_cuenta_corriente.movimiento_caja_id.';

-- ========== 2) Tabla auditoría (append-only desde la app) ==========
CREATE TABLE IF NOT EXISTS public.auditoria_app (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creado_en timestamptz NOT NULL DEFAULT now(),
  usuario_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  categoria text NOT NULL DEFAULT 'app',
  accion text NOT NULL,
  detalle text,
  metadata jsonb
);

COMMENT ON TABLE public.auditoria_app IS 'Registro de acciones sensibles (ej. edición/eliminación CC manual con impacto en caja).';

ALTER TABLE public.auditoria_app ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auditoria_app_insert_own" ON public.auditoria_app;
CREATE POLICY "auditoria_app_insert_own"
  ON public.auditoria_app FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND usuario_id = auth.uid());

DROP POLICY IF EXISTS "auditoria_app_select_ver" ON public.auditoria_app;
CREATE POLICY "auditoria_app_select_ver"
  ON public.auditoria_app FOR SELECT TO authenticated
  USING (public.has_permission('ver_auditoria'));

GRANT SELECT, INSERT ON public.auditoria_app TO authenticated;

-- ========== 3) Permisos y roles (admin + encargado) ==========
INSERT INTO public.app_permission (permission, description) VALUES
  ('editar_movimiento_cc_manual', 'Editar movimientos de cuenta corriente cargados como manual (sin orden); puede actualizar líneas vinculadas a caja según RLS.'),
  ('eliminar_movimiento_cc_manual', 'Anular movimientos de cuenta corriente manuales (sin orden); puede anular el movimiento de caja vinculado según RLS.'),
  ('ver_auditoria', 'Ver el registro de auditoría (tabla auditoria_app)')
ON CONFLICT (permission) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO public.app_role_permission (role, permission) VALUES
  ('admin', 'editar_movimiento_cc_manual'),
  ('admin', 'eliminar_movimiento_cc_manual'),
  ('admin', 'ver_auditoria'),
  ('encargado', 'editar_movimiento_cc_manual'),
  ('encargado', 'eliminar_movimiento_cc_manual'),
  ('encargado', 'ver_auditoria')
ON CONFLICT (role, permission) DO NOTHING;

-- ========== 4) RLS movimientos_cuenta_corriente: manual vs resto ==========
DROP POLICY IF EXISTS "mov_cc_update_abm" ON public.movimientos_cuenta_corriente;
DROP POLICY IF EXISTS "mov_cc_update_perm" ON public.movimientos_cuenta_corriente;
CREATE POLICY "mov_cc_update_perm"
  ON public.movimientos_cuenta_corriente FOR UPDATE TO authenticated
  USING (
    (
      public.has_permission('editar_transacciones')
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
      public.has_permission('editar_transacciones')
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

DROP POLICY IF EXISTS "mov_cc_delete_abm" ON public.movimientos_cuenta_corriente;
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
  );

-- ========== 5) RLS movimientos_cuenta_corriente_intermediario ==========
DROP POLICY IF EXISTS "mov_cc_int_update" ON public.movimientos_cuenta_corriente_intermediario;
DROP POLICY IF EXISTS "mov_cc_int_update_perm" ON public.movimientos_cuenta_corriente_intermediario;
CREATE POLICY "mov_cc_int_update_perm"
  ON public.movimientos_cuenta_corriente_intermediario FOR UPDATE TO authenticated
  USING (
    (
      public.has_permission('editar_transacciones')
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
      public.has_permission('editar_transacciones')
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

DROP POLICY IF EXISTS "mov_cc_int_delete" ON public.movimientos_cuenta_corriente_intermediario;
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
  );

-- ========== 6) Caja: quien edita/anula filas vinculadas a CC manual ==========
DROP POLICY IF EXISTS "movimientos_caja_update_abm" ON public.movimientos_caja;
CREATE POLICY "movimientos_caja_update_abm"
  ON public.movimientos_caja FOR UPDATE TO authenticated
  USING (
    public.has_permission('abm_movimientos_caja')
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
