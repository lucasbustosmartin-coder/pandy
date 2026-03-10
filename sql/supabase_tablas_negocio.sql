-- Pandi – Tablas de negocio
-- Ejecutar en Supabase SQL Editor (proyecto Pandi) antes de supabase_seguridad.sql
-- Orden: 1) este archivo  2) supabase_seguridad.sql  3) supabase_rls_negocio.sql

-- ========== 1. Clientes ==========
CREATE TABLE IF NOT EXISTS public.clientes (
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

CREATE INDEX IF NOT EXISTS idx_clientes_activo ON public.clientes (activo);
CREATE INDEX IF NOT EXISTS idx_clientes_nombre ON public.clientes (nombre);

COMMENT ON TABLE public.clientes IS 'ABM de clientes. activo=false = baja lógica.';

-- ========== 2. Tipos de movimiento de caja (ABM para movimientos manuales) ==========
CREATE TABLE IF NOT EXISTS public.tipos_movimiento_caja (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  direccion text NOT NULL CHECK (direccion IN ('ingreso', 'egreso')),
  activo boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE (nombre, direccion)
);

INSERT INTO public.tipos_movimiento_caja (nombre, direccion) VALUES
  ('Ajuste ingreso', 'ingreso'),
  ('Ajuste egreso', 'egreso')
ON CONFLICT (nombre, direccion) DO NOTHING;

COMMENT ON TABLE public.tipos_movimiento_caja IS 'Tipos para movimientos de caja no asociados a órdenes (manuales).';

-- ========== 3. Órdenes de compra/venta de divisas ==========
CREATE TABLE IF NOT EXISTS public.ordenes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  estado text NOT NULL DEFAULT 'cotizacion' CHECK (estado IN ('cotizacion', 'cerrada', 'concertada')),
  moneda_recibida text NOT NULL CHECK (moneda_recibida IN ('USD', 'EUR', 'ARS')),
  moneda_entregada text NOT NULL CHECK (moneda_entregada IN ('USD', 'EUR', 'ARS')),
  monto_recibido numeric(18,4) NOT NULL,
  monto_entregado numeric(18,4) NOT NULL,
  cotizacion numeric(18,6),
  observaciones text,
  usuario_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ordenes_cliente ON public.ordenes (cliente_id);
CREATE INDEX IF NOT EXISTS idx_ordenes_fecha ON public.ordenes (fecha);
CREATE INDEX IF NOT EXISTS idx_ordenes_estado ON public.ordenes (estado);

COMMENT ON TABLE public.ordenes IS 'Cotización → cerrada → concertada. Solo en concertada se generan movimientos de caja y cuenta corriente.';

-- ========== 4. Movimientos de caja (USD, EUR, ARS) ==========
-- Origen: orden_id (operación) o tipo_movimiento_id (movimiento manual)
CREATE TABLE IF NOT EXISTS public.movimientos_caja (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moneda text NOT NULL CHECK (moneda IN ('USD', 'EUR', 'ARS')),
  monto numeric(18,4) NOT NULL,
  orden_id uuid REFERENCES public.ordenes(id) ON DELETE SET NULL,
  tipo_movimiento_id uuid REFERENCES public.tipos_movimiento_caja(id) ON DELETE SET NULL,
  concepto text,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  usuario_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  estado text NOT NULL DEFAULT 'cerrado' CHECK (estado IN ('cerrado', 'anulado')),
  estado_fecha timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  CONSTRAINT chk_mov_caja_origen CHECK (
    (orden_id IS NOT NULL AND tipo_movimiento_id IS NULL) OR
    (orden_id IS NULL AND tipo_movimiento_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_movimientos_caja_moneda ON public.movimientos_caja (moneda);
CREATE INDEX IF NOT EXISTS idx_movimientos_caja_fecha ON public.movimientos_caja (fecha);
CREATE INDEX IF NOT EXISTS idx_movimientos_caja_orden ON public.movimientos_caja (orden_id);

COMMENT ON TABLE public.movimientos_caja IS 'Saldo por moneda = SUM(monto). Positivo = ingreso a caja, negativo = egreso.';

-- ========== 5. Movimientos cuenta corriente (por cliente y por moneda) ==========
CREATE TABLE IF NOT EXISTS public.movimientos_cuenta_corriente (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  moneda text NOT NULL CHECK (moneda IN ('USD', 'EUR', 'ARS')),
  monto numeric(18,4) NOT NULL,
  orden_id uuid REFERENCES public.ordenes(id) ON DELETE SET NULL,
  concepto text,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  usuario_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  estado text NOT NULL DEFAULT 'cerrado' CHECK (estado IN ('cerrado', 'anulado')),
  estado_fecha timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mov_cc_cliente ON public.movimientos_cuenta_corriente (cliente_id);
CREATE INDEX IF NOT EXISTS idx_mov_cc_cliente_moneda ON public.movimientos_cuenta_corriente (cliente_id, moneda);
CREATE INDEX IF NOT EXISTS idx_mov_cc_fecha ON public.movimientos_cuenta_corriente (fecha);

COMMENT ON TABLE public.movimientos_cuenta_corriente IS 'Saldo por cliente y moneda = SUM(monto). Convención: positivo = cliente nos debe, negativo = nosotros le debemos.';
