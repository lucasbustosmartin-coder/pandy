-- Paso 1: CC cliente vs intermediario en la misma tabla `reglas_de_negocio`.
-- Ejecutar en Supabase SQL Editor antes de insertar reglas USD-ARS con intermediario.
-- Idempotente: si la columna ya existe, los ALTER fallan silenciosamente en algunos entornos — revisar mensajes.

ALTER TABLE public.reglas_de_negocio
  ADD COLUMN IF NOT EXISTS entidad_cc text NOT NULL DEFAULT 'cliente'
    CHECK (entidad_cc IN ('cliente', 'intermediario'));

COMMENT ON COLUMN public.reglas_de_negocio.entidad_cc IS
  'Ledger al que aplica la fila: cliente o intermediario. Default cliente para filas históricas sin int.';

-- Reemplazar UNIQUE para incluir entidad_cc (misma clave lógica puede repetirse por ledger).
ALTER TABLE public.reglas_de_negocio DROP CONSTRAINT IF EXISTS reglas_de_negocio_uniq;

ALTER TABLE public.reglas_de_negocio
  ADD CONSTRAINT reglas_de_negocio_uniq UNIQUE (
    tipo_operacion_codigo,
    usa_intermediario,
    entidad_cc,
    pagador,
    cobrador,
    tipo_transaccion,
    es_comision,
    estado_transaccion,
    contrapartida_ejecutada,
    linea
  );
