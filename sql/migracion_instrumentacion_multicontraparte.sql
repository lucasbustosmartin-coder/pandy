-- Instrumentación manual multicontraparte (ARS-USD / USD-ARS sin intermediario).
-- Ejecutar en Supabase SQL Editor después de las migraciones base de transacciones/instrumentación.

ALTER TABLE public.instrumentacion
  ADD COLUMN IF NOT EXISTS multicontraparte_manual boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.instrumentacion.multicontraparte_manual IS 'Si true: CC/caja para esta orden no usa motor reglas_de_negocio; aplica regla extendida por transacción + cierre (N pagos, contrapartes Cliente/Intermediario explícitas). Solo ARS-USD/USD-ARS sin int.';

ALTER TABLE public.transacciones
  ADD COLUMN IF NOT EXISTS pagador_cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cobrador_cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pagador_intermediario_id uuid REFERENCES public.intermediarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cobrador_intermediario_id uuid REFERENCES public.intermediarios(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.transacciones.pagador_cliente_id IS 'Si pagador=cliente: cliente concreto (NULL = cliente del acuerdo de la orden).';
COMMENT ON COLUMN public.transacciones.cobrador_cliente_id IS 'Si cobrador=cliente: cliente concreto (NULL = cliente del acuerdo).';
COMMENT ON COLUMN public.transacciones.pagador_intermediario_id IS 'Si pagador=intermediario: intermediario concreto (NULL = intermediario de la orden si existe).';
COMMENT ON COLUMN public.transacciones.cobrador_intermediario_id IS 'Si cobrador=intermediario: intermediario concreto (NULL = intermediario de la orden).';
