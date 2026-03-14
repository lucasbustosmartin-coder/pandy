-- Reglas de negocio configurables: reversión de transacciones.
-- reversar_max_veces: 0 = no permitir reversar; 1 = permitir solo una vez por transacción (comportamiento actual).
-- La tabla app_config debe existir (app_config_session_timeout.sql).
INSERT INTO public.app_config (key, value) VALUES ('reversar_max_veces', '1')
ON CONFLICT (key) DO NOTHING;
