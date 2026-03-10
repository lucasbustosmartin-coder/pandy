-- Pandi – Complejidad Órdenes: tipos de operación, instrumentación, transacciones
-- Ejecutar DESPUÉS de supabase_tablas_negocio.sql (y migracion_estado_movimientos si aplica).
-- Orden: 1) tablas_negocio  2) migracion_estado_movimientos (si existe)  3) este archivo  4) seguridad  5) rls_negocio

-- ========== 1. Catálogo: Tipos de operación ==========
CREATE TABLE IF NOT EXISTS public.tipos_operacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  nombre text NOT NULL,
  activo boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

INSERT INTO public.tipos_operacion (codigo, nombre) VALUES
  ('USD-USD', 'USD - USD'),
  ('ARS-USD', 'ARS - USD'),
  ('USD-ARS', 'USD - ARS'),
  ('ARS-EUR', 'ARS - EUR'),
  ('ARS-ARS-CHEQUE', 'ARS - ARS (CHEQUE)')
ON CONFLICT (codigo) DO NOTHING;

COMMENT ON TABLE public.tipos_operacion IS 'Clasificación de la orden: USD-USD, ARS-USD, USD-ARS, ARS-EUR, ARS-ARS CHEQUE.';

-- ========== 2. Catálogo: Modos de pago ==========
CREATE TABLE IF NOT EXISTS public.modos_pago (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  nombre text NOT NULL,
  permite_ars boolean DEFAULT true,
  permite_usd boolean DEFAULT true,
  permite_eur boolean DEFAULT true,
  activo boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

INSERT INTO public.modos_pago (codigo, nombre, permite_ars, permite_usd, permite_eur) VALUES
  ('efectivo', 'Efectivo', true, true, true),
  ('transferencia', 'Transferencia Bancaria', true, true, true),
  ('cheque', 'Cheque', true, false, false)
ON CONFLICT (codigo) DO NOTHING;

COMMENT ON TABLE public.modos_pago IS 'Efectivo, Transferencia, Cheque (solo ARS).';

-- ========== 3. Intermediarios ==========
CREATE TABLE IF NOT EXISTS public.intermediarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  documento text,
  email text,
  telefono text,
  direccion text,
  activo boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_intermediarios_activo ON public.intermediarios (activo);
CREATE INDEX IF NOT EXISTS idx_intermediarios_nombre ON public.intermediarios (nombre);

COMMENT ON TABLE public.intermediarios IS 'Terceros con cuenta corriente propia (Pandy ↔ intermediario). Operación intermediada.';

-- ========== 4. Cambios en órdenes ==========
-- Nuevas columnas (nullable para no romper datos existentes)
ALTER TABLE public.ordenes
  ADD COLUMN IF NOT EXISTS tipo_operacion_id uuid REFERENCES public.tipos_operacion(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS operacion_directa boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS intermediario_id uuid REFERENCES public.intermediarios(id) ON DELETE SET NULL;

-- Migrar estado viejo → nuevo y ampliar CHECK (idempotente)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ordenes_estado_check') THEN
    ALTER TABLE public.ordenes DROP CONSTRAINT ordenes_estado_check;
  END IF;
  UPDATE public.ordenes SET estado = 'cerrada' WHERE estado = 'concertada';
  UPDATE public.ordenes SET estado = 'abierta' WHERE estado IN ('cotizacion', 'cerrada');
  ALTER TABLE public.ordenes ADD CONSTRAINT ordenes_estado_check
    CHECK (estado IN ('abierta', 'parcialmente_cerrada', 'cerrada'));
  ALTER TABLE public.ordenes ALTER COLUMN estado SET DEFAULT 'abierta';
EXCEPTION
  WHEN duplicate_object THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ordenes_estado_check') THEN
      ALTER TABLE public.ordenes ADD CONSTRAINT ordenes_estado_check
        CHECK (estado IN ('abierta', 'parcialmente_cerrada', 'cerrada'));
    END IF;
  WHEN OTHERS THEN RAISE;
END $$;

CREATE INDEX IF NOT EXISTS idx_ordenes_tipo_operacion ON public.ordenes (tipo_operacion_id);
CREATE INDEX IF NOT EXISTS idx_ordenes_intermediario ON public.ordenes (intermediario_id);

COMMENT ON COLUMN public.ordenes.estado IS 'abierta = ninguna trx ejecutada; parcialmente_cerrada = alguna ejecutada; cerrada = todas ejecutadas.';
COMMENT ON COLUMN public.ordenes.operacion_directa IS 'true = solo Pandy–cliente; false = operación intermediada.';
COMMENT ON COLUMN public.ordenes.intermediario_id IS 'Obligatorio si operacion_directa = false.';

-- ========== 5. Comisiones por orden ==========
CREATE TABLE IF NOT EXISTS public.comisiones_orden (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id uuid NOT NULL REFERENCES public.ordenes(id) ON DELETE CASCADE,
  moneda text NOT NULL CHECK (moneda IN ('USD', 'EUR', 'ARS')),
  monto numeric(18,4) NOT NULL,
  concepto text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comisiones_orden_orden ON public.comisiones_orden (orden_id);

COMMENT ON TABLE public.comisiones_orden IS 'Registro de comisiones por orden (ej. 300 USD en cierre USD-USD).';

-- ========== 6. Instrumentación (1 por orden) ==========
CREATE TABLE IF NOT EXISTS public.instrumentacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id uuid NOT NULL REFERENCES public.ordenes(id) ON DELETE CASCADE UNIQUE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_instrumentacion_orden ON public.instrumentacion (orden_id);

COMMENT ON TABLE public.instrumentacion IS 'Una por orden. Agrupa las N transacciones de la instrumentación.';

-- ========== 7. Transacciones (N por instrumentación) ==========
CREATE TABLE IF NOT EXISTS public.transacciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instrumentacion_id uuid NOT NULL REFERENCES public.instrumentacion(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('ingreso', 'egreso')),
  modo_pago_id uuid NOT NULL REFERENCES public.modos_pago(id) ON DELETE RESTRICT,
  moneda text NOT NULL CHECK (moneda IN ('USD', 'EUR', 'ARS')),
  monto numeric(18,4) NOT NULL,
  owner text NOT NULL CHECK (owner IN ('pandy', 'cliente', 'intermediario')),
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'ejecutada')),
  tipo_cambio numeric(18,6),
  concepto text,
  fecha_ejecucion date,
  usuario_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transacciones_instrumentacion ON public.transacciones (instrumentacion_id);
CREATE INDEX IF NOT EXISTS idx_transacciones_estado ON public.transacciones (estado);

COMMENT ON TABLE public.transacciones IS 'Cada una es un pago o cobro. Solo al pasar a ejecutada impacta caja y cuenta corriente.';
COMMENT ON COLUMN public.transacciones.owner IS 'pandy = caja Pandy; cliente = CC cliente; intermediario = CC intermediario.';
COMMENT ON COLUMN public.transacciones.tipo_cambio IS 'Obligatorio si moneda = ARS para conversión.';

-- ========== 8. Cajas por tipo (efectivo / banco / cheque) ==========
-- Agregar a movimientos_caja: caja_tipo y transaccion_id
ALTER TABLE public.movimientos_caja
  ADD COLUMN IF NOT EXISTS caja_tipo text DEFAULT 'efectivo' CHECK (caja_tipo IN ('efectivo', 'banco', 'cheque')),
  ADD COLUMN IF NOT EXISTS transaccion_id uuid REFERENCES public.transacciones(id) ON DELETE SET NULL;

-- Cheque solo ARS
ALTER TABLE public.movimientos_caja
  DROP CONSTRAINT IF EXISTS chk_mov_caja_cheque_ars;
ALTER TABLE public.movimientos_caja
  ADD CONSTRAINT chk_mov_caja_cheque_ars CHECK (
    (caja_tipo <> 'cheque') OR (caja_tipo = 'cheque' AND moneda = 'ARS')
  );

-- Origen: transaccion_id (nuevo flujo) O orden_id (legacy) O tipo_movimiento_id (manual)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_mov_caja_origen') THEN
    ALTER TABLE public.movimientos_caja DROP CONSTRAINT chk_mov_caja_origen;
  END IF;
  ALTER TABLE public.movimientos_caja ADD CONSTRAINT chk_mov_caja_origen CHECK (
    (transaccion_id IS NOT NULL AND orden_id IS NULL AND tipo_movimiento_id IS NULL) OR
    (orden_id IS NOT NULL AND tipo_movimiento_id IS NULL AND transaccion_id IS NULL) OR
    (orden_id IS NULL AND tipo_movimiento_id IS NOT NULL AND transaccion_id IS NULL)
  );
END $$;

CREATE INDEX IF NOT EXISTS idx_movimientos_caja_caja_tipo ON public.movimientos_caja (caja_tipo);
CREATE INDEX IF NOT EXISTS idx_movimientos_caja_transaccion ON public.movimientos_caja (transaccion_id);

-- ========== 9. Cuenta corriente intermediario ==========
CREATE TABLE IF NOT EXISTS public.movimientos_cuenta_corriente_intermediario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intermediario_id uuid NOT NULL REFERENCES public.intermediarios(id) ON DELETE CASCADE,
  moneda text NOT NULL CHECK (moneda IN ('USD', 'EUR', 'ARS')),
  monto numeric(18,4) NOT NULL,
  transaccion_id uuid REFERENCES public.transacciones(id) ON DELETE SET NULL,
  concepto text,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  usuario_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  estado text NOT NULL DEFAULT 'cerrado' CHECK (estado IN ('cerrado', 'anulado')),
  estado_fecha timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mov_cc_int_intermediario ON public.movimientos_cuenta_corriente_intermediario (intermediario_id);
CREATE INDEX IF NOT EXISTS idx_mov_cc_int_intermediario_moneda ON public.movimientos_cuenta_corriente_intermediario (intermediario_id, moneda);
CREATE INDEX IF NOT EXISTS idx_mov_cc_int_fecha ON public.movimientos_cuenta_corriente_intermediario (fecha);

COMMENT ON TABLE public.movimientos_cuenta_corriente_intermediario IS 'Saldo por intermediario y moneda. Convención: positivo = intermediario nos debe, negativo = nosotros le debemos.';

-- ========== 10. Vincular movimientos CC cliente a transacción (opcional, para nuevo flujo) ==========
ALTER TABLE public.movimientos_cuenta_corriente
  ADD COLUMN IF NOT EXISTS transaccion_id uuid REFERENCES public.transacciones(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_mov_cc_transaccion ON public.movimientos_cuenta_corriente (transaccion_id);
