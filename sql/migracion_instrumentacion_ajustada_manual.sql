-- Flag por instrumentación: CC/caja sin motor completo `reglas_de_negocio` (como multicontraparte manual),
-- sin activar la derivación multicontraparte ni el flujo del checkbox que borra plantillas.
-- Ejecutar en Supabase SQL Editor después de `migracion_instrumentacion_multicontraparte.sql`.

ALTER TABLE public.instrumentacion
  ADD COLUMN IF NOT EXISTS instrumentacion_ajustada_manual boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.instrumentacion.instrumentacion_ajustada_manual IS 'Si true: el sync CC/caja no aplica el motor completo desde reglas_de_negocio (misma exclusión que multicontraparte manual respecto del recorrido por transacción); no sustituye multicontraparte_manual ni el borrado de plantilla al activar MC. Comisiones y CHEQUE+reglas siguen alineados vía ramas soloComisiones / fallback en la app.';
