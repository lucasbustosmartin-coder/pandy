-- Pandi: tabla puente 1:1 intermediario ↔ cliente (Fase 1 — misma persona; CC unificada en vistas futuras).
-- Idempotente: ejecutar en Supabase SQL Editor (prod/dev) en bases ya desplegadas.
-- Canónico en supabase_complejidad_ordenes.sql + supabase_rls_complejidad.sql para bootstrap nuevo.

CREATE TABLE IF NOT EXISTS public.contraparte_vinculo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intermediario_id uuid NOT NULL REFERENCES public.intermediarios(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

DO $$
BEGIN
  ALTER TABLE public.contraparte_vinculo
    ADD CONSTRAINT contraparte_vinculo_intermediario_id_key UNIQUE (intermediario_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.contraparte_vinculo
    ADD CONSTRAINT contraparte_vinculo_cliente_id_key UNIQUE (cliente_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_contraparte_vinculo_cliente ON public.contraparte_vinculo (cliente_id);
CREATE INDEX IF NOT EXISTS idx_contraparte_vinculo_intermediario ON public.contraparte_vinculo (intermediario_id);

COMMENT ON TABLE public.contraparte_vinculo IS 'Puente 1:1 opcional: el mismo sujeto económico figura como intermediario en algunas órdenes y como cliente en otras. Los movimientos CC siguen en movimientos_cuenta_corriente / movimientos_cuenta_corriente_intermediario; la app podrá consolidar lectura usando esta tabla. Un intermediario y un cliente solo pueden participar en un vínculo cada uno.';

ALTER TABLE public.contraparte_vinculo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contraparte_vinculo_select" ON public.contraparte_vinculo;
CREATE POLICY "contraparte_vinculo_select" ON public.contraparte_vinculo FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "contraparte_vinculo_insert" ON public.contraparte_vinculo;
CREATE POLICY "contraparte_vinculo_insert" ON public.contraparte_vinculo FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('abm_intermediarios') OR public.has_permission('abm_clientes'));

DROP POLICY IF EXISTS "contraparte_vinculo_update" ON public.contraparte_vinculo;
CREATE POLICY "contraparte_vinculo_update" ON public.contraparte_vinculo FOR UPDATE TO authenticated
  USING (public.has_permission('abm_intermediarios') OR public.has_permission('abm_clientes'))
  WITH CHECK (public.has_permission('abm_intermediarios') OR public.has_permission('abm_clientes'));

DROP POLICY IF EXISTS "contraparte_vinculo_delete" ON public.contraparte_vinculo;
CREATE POLICY "contraparte_vinculo_delete" ON public.contraparte_vinculo FOR DELETE TO authenticated
  USING (public.has_permission('abm_intermediarios') OR public.has_permission('abm_clientes'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contraparte_vinculo TO authenticated;
