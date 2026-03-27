-- Movimientos de cuenta corriente manuales (sin orden): metadatos para listados y permiso dedicado.
-- Ejecutar en Supabase SQL Editor después de las migraciones de CC existentes.

-- ========== 1) Columnas en movimientos CC cliente e intermediario ==========
ALTER TABLE public.movimientos_cuenta_corriente
  ADD COLUMN IF NOT EXISTS es_movimiento_manual boolean NOT NULL DEFAULT false;

ALTER TABLE public.movimientos_cuenta_corriente
  ADD COLUMN IF NOT EXISTS manual_tip_movimiento text;

ALTER TABLE public.movimientos_cuenta_corriente_intermediario
  ADD COLUMN IF NOT EXISTS es_movimiento_manual boolean NOT NULL DEFAULT false;

ALTER TABLE public.movimientos_cuenta_corriente_intermediario
  ADD COLUMN IF NOT EXISTS manual_tip_movimiento text;

ALTER TABLE public.movimientos_cuenta_corriente
  DROP CONSTRAINT IF EXISTS chk_mov_cc_manual_tip;

ALTER TABLE public.movimientos_cuenta_corriente
  ADD CONSTRAINT chk_mov_cc_manual_tip CHECK (
    manual_tip_movimiento IS NULL OR manual_tip_movimiento IN ('cobro_entidad_pandy', 'pago_pandy_entidad')
  );

ALTER TABLE public.movimientos_cuenta_corriente_intermediario
  DROP CONSTRAINT IF EXISTS chk_mov_cc_int_manual_tip;

ALTER TABLE public.movimientos_cuenta_corriente_intermediario
  ADD CONSTRAINT chk_mov_cc_int_manual_tip CHECK (
    manual_tip_movimiento IS NULL OR manual_tip_movimiento IN ('cobro_entidad_pandy', 'pago_pandy_entidad')
  );

COMMENT ON COLUMN public.movimientos_cuenta_corriente.es_movimiento_manual IS 'true si el movimiento se cargó desde la vista CC sin orden (ajuste manual).';
COMMENT ON COLUMN public.movimientos_cuenta_corriente.manual_tip_movimiento IS 'cobro_entidad_pandy = la entidad entregó dinero a Pandy; pago_pandy_entidad = Pandy entregó dinero a la entidad.';

COMMENT ON COLUMN public.movimientos_cuenta_corriente_intermediario.es_movimiento_manual IS 'Igual que movimientos_cuenta_corriente.es_movimiento_manual.';
COMMENT ON COLUMN public.movimientos_cuenta_corriente_intermediario.manual_tip_movimiento IS 'Igual que movimientos_cuenta_corriente.manual_tip_movimiento.';

-- ========== 2) Permiso y asignación a roles ==========
INSERT INTO public.app_permission (permission, description) VALUES
  ('registrar_movimiento_cc_manual', 'Registrar movimientos de cuenta corriente manuales (sin orden); opcionalmente impactar caja con tipo de movimiento')
ON CONFLICT (permission) DO NOTHING;

INSERT INTO public.app_role_permission (role, permission) VALUES
  ('admin', 'registrar_movimiento_cc_manual'),
  ('encargado', 'registrar_movimiento_cc_manual')
ON CONFLICT (role, permission) DO NOTHING;

-- ========== 3) RLS: insert CC manual con permiso nuevo o editar_transacciones ==========
DROP POLICY IF EXISTS "mov_cc_insert_perm" ON public.movimientos_cuenta_corriente;
CREATE POLICY "mov_cc_insert_perm"
  ON public.movimientos_cuenta_corriente FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission('editar_transacciones')
    OR public.has_permission('registrar_movimiento_cc_manual')
  );

DROP POLICY IF EXISTS "mov_cc_int_insert_perm" ON public.movimientos_cuenta_corriente_intermediario;
CREATE POLICY "mov_cc_int_insert_perm"
  ON public.movimientos_cuenta_corriente_intermediario FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission('editar_transacciones')
    OR public.has_permission('registrar_movimiento_cc_manual')
  );

-- ========== 4) orden_id / transaccion_id NULL para movimientos sin orden ==========
ALTER TABLE public.movimientos_cuenta_corriente
  ALTER COLUMN orden_id DROP NOT NULL;

ALTER TABLE public.movimientos_cuenta_corriente
  ALTER COLUMN transaccion_id DROP NOT NULL;

ALTER TABLE public.movimientos_cuenta_corriente_intermediario
  ALTER COLUMN orden_id DROP NOT NULL;

ALTER TABLE public.movimientos_cuenta_corriente_intermediario
  ALTER COLUMN transaccion_id DROP NOT NULL;
