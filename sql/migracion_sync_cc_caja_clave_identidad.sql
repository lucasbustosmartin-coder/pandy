-- Capa 2 (solo identidad): clave estable de sync, sin monto ni texto completo.
-- Familia de leyenda + signo (pos/neg/cero). Un cambio de importe actualiza la misma fila.
-- Función + columnas + backfill: Pandy y Pandy-Dev (2026-11-03).
-- ÍNDICES ÚNICOS: no crearlos en producción mientras existan gemelos vivos (órdenes 28, 41, 42).
-- En Dev se bajaron para poder copiar la foto de prod. Requiere capa 1 histórica; este script reemplaza esos únicos.

CREATE OR REPLACE FUNCTION public.sync_cc_caja_clave_identidad(
  p_concepto text,
  p_monto numeric,
  p_libro text DEFAULT 'cc'
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    (
      CASE
        WHEN lower(trim(COALESCE(p_libro, 'cc'))) = 'caja' THEN
          CASE
            WHEN lower(COALESCE(p_concepto, '')) LIKE 'ingreso de %' THEN 'ingreso'
            WHEN lower(COALESCE(p_concepto, '')) LIKE 'egreso de %' THEN 'egreso'
            WHEN lower(COALESCE(p_concepto, '')) LIKE 'comisi%n del acuerdo%' THEN 'comision_acuerdo'
            WHEN lower(COALESCE(p_concepto, '')) LIKE 'ganancia del acuerdo%' THEN 'ganancia_acuerdo'
            ELSE 'otros:' || left(lower(COALESCE(p_concepto, '')), 48)
          END
        ELSE
          CASE
            WHEN lower(COALESCE(p_concepto, '')) LIKE 'compromiso de pago%' THEN 'compromiso_pago'
            WHEN lower(COALESCE(p_concepto, '')) LIKE 'pago realizado%' THEN 'pago_realizado'
            WHEN lower(COALESCE(p_concepto, '')) LIKE 'cobro realizado%' THEN 'cobro_realizado'
            WHEN lower(COALESCE(p_concepto, '')) LIKE 'ajuste libro%' THEN 'ajuste_libro'
            WHEN lower(COALESCE(p_concepto, '')) LIKE 'compromiso a cobrar%' THEN 'compromiso_cobrar'
            WHEN lower(COALESCE(p_concepto, '')) LIKE 'comisi%n del acuerdo%' THEN 'comision_acuerdo'
            WHEN lower(COALESCE(p_concepto, '')) LIKE 'contra cobro%' THEN 'contra_cobro'
            WHEN lower(COALESCE(p_concepto, '')) LIKE 'pr%stamo al cliente%' THEN 'prestamo_pandy'
            WHEN lower(COALESCE(p_concepto, '')) LIKE 'compensaci%n%' THEN 'compensacion'
            ELSE 'otros:' || left(lower(COALESCE(p_concepto, '')), 48)
          END
      END
    )
    || ':' ||
    CASE
      WHEN p_monto IS NULL THEN 'cero'
      WHEN p_monto < 0 THEN 'neg'
      WHEN p_monto > 0 THEN 'pos'
      ELSE 'cero'
    END;
$$;

COMMENT ON FUNCTION public.sync_cc_caja_clave_identidad(text, numeric, text) IS
  'Capa 2: identidad de fila derivada (familia de leyenda + signo). El monto no forma parte de la clave.';

REVOKE ALL ON FUNCTION public.sync_cc_caja_clave_identidad(text, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_cc_caja_clave_identidad(text, numeric, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.sync_cc_caja_clave_identidad(text, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_cc_caja_clave_identidad(text, numeric, text) TO service_role;

ALTER TABLE public.movimientos_cuenta_corriente
  ADD COLUMN IF NOT EXISTS sync_clave text;
ALTER TABLE public.movimientos_cuenta_corriente_intermediario
  ADD COLUMN IF NOT EXISTS sync_clave text;
ALTER TABLE public.movimientos_caja
  ADD COLUMN IF NOT EXISTS sync_clave text;

UPDATE public.movimientos_cuenta_corriente
SET sync_clave = public.sync_cc_caja_clave_identidad(concepto, monto, 'cc')
WHERE COALESCE(es_movimiento_manual, false) = false
  AND (sync_clave IS NULL OR btrim(sync_clave) = '');

UPDATE public.movimientos_cuenta_corriente_intermediario
SET sync_clave = public.sync_cc_caja_clave_identidad(concepto, monto, 'cc')
WHERE COALESCE(es_movimiento_manual, false) = false
  AND (sync_clave IS NULL OR btrim(sync_clave) = '');

UPDATE public.movimientos_caja
SET sync_clave = public.sync_cc_caja_clave_identidad(concepto, monto, 'caja')
WHERE tipo_movimiento_id IS NULL
  AND (sync_clave IS NULL OR btrim(sync_clave) = '');

-- No ejecutar el bloque de índices únicos en producción mientras 28/41/42 tengan gemelos vivos.
DROP INDEX IF EXISTS public.uq_mov_cc_cli_vivo_clave;
DROP INDEX IF EXISTS public.uq_mov_cc_int_vivo_clave;
DROP INDEX IF EXISTS public.uq_mov_caja_derivado_vivo_clave;

CREATE UNIQUE INDEX uq_mov_cc_cli_vivo_clave
ON public.movimientos_cuenta_corriente (
  orden_id,
  cliente_id,
  COALESCE(transaccion_id, '00000000-0000-0000-0000-000000000000'::uuid),
  upper(trim(moneda)),
  sync_clave
)
WHERE COALESCE(es_movimiento_manual, false) = false
  AND COALESCE(lower(estado), '') NOT IN ('anulado', 'anulada');

CREATE UNIQUE INDEX uq_mov_cc_int_vivo_clave
ON public.movimientos_cuenta_corriente_intermediario (
  orden_id,
  intermediario_id,
  COALESCE(transaccion_id, '00000000-0000-0000-0000-000000000000'::uuid),
  upper(trim(moneda)),
  sync_clave
)
WHERE COALESCE(es_movimiento_manual, false) = false
  AND COALESCE(lower(estado), '') NOT IN ('anulado', 'anulada');

CREATE UNIQUE INDEX uq_mov_caja_derivado_vivo_clave
ON public.movimientos_caja (
  COALESCE(orden_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(transaccion_id, '00000000-0000-0000-0000-000000000000'::uuid),
  upper(trim(moneda)),
  COALESCE(caja_tipo, 'efectivo'),
  sync_clave
)
WHERE tipo_movimiento_id IS NULL
  AND COALESCE(lower(estado), '') NOT IN ('anulado', 'anulada');

COMMENT ON INDEX public.uq_mov_cc_cli_vivo_clave IS
  'Capa 2: un vivo CC cliente por orden + cliente + transacción + moneda + clave (sin monto).';
COMMENT ON INDEX public.uq_mov_cc_int_vivo_clave IS
  'Capa 2: un vivo CC intermediario por orden + intermediario + transacción + moneda + clave (sin monto).';
COMMENT ON INDEX public.uq_mov_caja_derivado_vivo_clave IS
  'Capa 2: un vivo de caja derivado por orden + transacción + moneda + tipo de caja + clave (sin monto).';
