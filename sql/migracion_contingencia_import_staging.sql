-- Pandi — Tablas de tránsito para importación desde Excel de contingencia (diseño acordado).
-- Ejecutar en Supabase SQL Editor cuando se vaya a implementar import + UI de revisión.
-- Documentación: docs/CONTINGENCIA_IMPORTACION_DISENO.md
--
-- No aplica aún ordenes/transacciones reales: solo staging hasta que el rol autorizado
-- confirme y un proceso (RPC o app) vuelque a tablas de negocio.

-- Permiso para menú / RLS (asignar el rol que defina el titular en app_role_permission)
INSERT INTO public.app_permission (permission, description) VALUES
  ('revisar_import_contingencia', 'Revisar, editar y aplicar importaciones desde planilla de contingencia (staging)')
ON CONFLICT (permission) DO NOTHING;

-- Lote de importación (un archivo o una carga)
CREATE TABLE IF NOT EXISTS public.contingencia_import_batch (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  usuario_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  archivo_nombre text,
  observaciones text,
  estado text NOT NULL DEFAULT 'en_revision'
    CHECK (estado IN ('en_revision', 'aplicado', 'cancelado'))
);

CREATE INDEX IF NOT EXISTS idx_contingencia_batch_usuario ON public.contingencia_import_batch (usuario_id);
CREATE INDEX IF NOT EXISTS idx_contingencia_batch_estado ON public.contingencia_import_batch (estado);

COMMENT ON TABLE public.contingencia_import_batch IS 'Lote de importación Excel contingencia; revisión y aplicación desde UI con permiso revisar_import_contingencia.';

-- Acuerdos (hoja 2 del Excel)
CREATE TABLE IF NOT EXISTS public.contingencia_import_acuerdo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.contingencia_import_batch(id) ON DELETE CASCADE,
  linea_excel integer,
  id_temporal integer NOT NULL,
  fecha_acuerdo date,
  nombre_cliente text,
  nombre_intermediario text,
  con_intermediario_si_no text,
  codigo_tipo_operacion text,
  moneda_recibida text,
  moneda_entregada text,
  monto_recibido numeric(18,4),
  monto_entregado numeric(18,4),
  cotizacion numeric(18,6),
  tasa_descuento_intermediario_pct numeric(18,4),
  estado_orden text,
  observaciones text,
  quien_completa text,
  estado_linea text NOT NULL DEFAULT 'pendiente'
    CHECK (estado_linea IN ('pendiente', 'aprobado', 'rechazado', 'aplicado', 'error')),
  mensaje_validacion text,
  orden_id uuid REFERENCES public.ordenes(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contingencia_acuerdo_batch ON public.contingencia_import_acuerdo (batch_id);
CREATE INDEX IF NOT EXISTS idx_contingencia_acuerdo_id_temp ON public.contingencia_import_acuerdo (batch_id, id_temporal);
CREATE INDEX IF NOT EXISTS idx_contingencia_acuerdo_estado ON public.contingencia_import_acuerdo (estado_linea);

COMMENT ON TABLE public.contingencia_import_acuerdo IS 'Staging de filas de acuerdo; mapeo a clientes/tipos reales en el paso de aplicación.';

-- Transacciones (hoja 3)
CREATE TABLE IF NOT EXISTS public.contingencia_import_transaccion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.contingencia_import_batch(id) ON DELETE CASCADE,
  linea_excel integer,
  id_temporal_orden integer NOT NULL,
  nro_pata integer,
  tipo_ingreso_egreso text,
  modo_pago text,
  moneda text,
  monto numeric(18,4),
  pagador text,
  cobrador text,
  estado_trx text,
  fecha_ejecucion date,
  tipo_cambio_opcional numeric(18,6),
  caja_tipo text,
  concepto text,
  estado_linea text NOT NULL DEFAULT 'pendiente'
    CHECK (estado_linea IN ('pendiente', 'aprobado', 'rechazado', 'aplicado', 'error')),
  mensaje_validacion text,
  transaccion_id uuid REFERENCES public.transacciones(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contingencia_trx_batch ON public.contingencia_import_transaccion (batch_id);
CREATE INDEX IF NOT EXISTS idx_contingencia_trx_id_temp ON public.contingencia_import_transaccion (batch_id, id_temporal_orden);
CREATE INDEX IF NOT EXISTS idx_contingencia_trx_estado ON public.contingencia_import_transaccion (estado_linea);

COMMENT ON TABLE public.contingencia_import_transaccion IS 'Staging de patas; modo_pago en texto se traduce a modos_pago.id al aplicar.';

-- Comisiones opcionales (hoja 4)
CREATE TABLE IF NOT EXISTS public.contingencia_import_comision (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.contingencia_import_batch(id) ON DELETE CASCADE,
  linea_excel integer,
  id_temporal_orden integer NOT NULL,
  moneda text,
  monto numeric(18,4),
  concepto text,
  estado_linea text NOT NULL DEFAULT 'pendiente'
    CHECK (estado_linea IN ('pendiente', 'aprobado', 'rechazado', 'aplicado', 'error')),
  mensaje_validacion text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contingencia_com_batch ON public.contingencia_import_comision (batch_id);

COMMENT ON TABLE public.contingencia_import_comision IS 'Staging de comisiones vinculadas por id_temporal_orden al acuerdo del mismo batch.';

-- RLS
ALTER TABLE public.contingencia_import_batch ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contingencia_import_acuerdo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contingencia_import_transaccion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contingencia_import_comision ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contingencia_batch_revisor_all" ON public.contingencia_import_batch;
CREATE POLICY "contingencia_batch_revisor_all"
  ON public.contingencia_import_batch FOR ALL TO authenticated
  USING (public.has_permission('revisar_import_contingencia'))
  WITH CHECK (public.has_permission('revisar_import_contingencia'));

DROP POLICY IF EXISTS "contingencia_acuerdo_revisor_all" ON public.contingencia_import_acuerdo;
CREATE POLICY "contingencia_acuerdo_revisor_all"
  ON public.contingencia_import_acuerdo FOR ALL TO authenticated
  USING (public.has_permission('revisar_import_contingencia'))
  WITH CHECK (public.has_permission('revisar_import_contingencia'));

DROP POLICY IF EXISTS "contingencia_trx_revisor_all" ON public.contingencia_import_transaccion;
CREATE POLICY "contingencia_trx_revisor_all"
  ON public.contingencia_import_transaccion FOR ALL TO authenticated
  USING (public.has_permission('revisar_import_contingencia'))
  WITH CHECK (public.has_permission('revisar_import_contingencia'));

DROP POLICY IF EXISTS "contingencia_com_revisor_all" ON public.contingencia_import_comision;
CREATE POLICY "contingencia_com_revisor_all"
  ON public.contingencia_import_comision FOR ALL TO authenticated
  USING (public.has_permission('revisar_import_contingencia'))
  WITH CHECK (public.has_permission('revisar_import_contingencia'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contingencia_import_batch TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contingencia_import_acuerdo TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contingencia_import_transaccion TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contingencia_import_comision TO authenticated;

-- Tras ejecutar: asignar revisar_import_contingencia al rol del dueño (ej. admin) en app_role_permission, desde la app Seguridad o:
-- INSERT INTO public.app_role_permission (role, permission) VALUES ('admin', 'revisar_import_contingencia')
--   ON CONFLICT (role, permission) DO NOTHING;
