-- Reglas de negocio configurables por Admin (app_config).
-- reversar_max_veces: 0 = no permitir reversar ejecutada→pendiente; 1 = permitir una vez por transacción (recomendado).
-- Ver docs/CONFIGURACION_REGLAS_NEGOCIO.md.

INSERT INTO public.app_config (key, value) VALUES ('reversar_max_veces', '1')
ON CONFLICT (key) DO NOTHING;
