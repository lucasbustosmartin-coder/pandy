-- Tamaño de página para lecturas masivas desde el front (PostgREST: .range / .limit en listas largas).
-- Debe ser **menor o igual** al límite `max-rows` de PostgREST en tu instancia (ej. 5000).
-- La app usa este valor en `pandiSupabaseFetchAll` y en límites de catálogos (clientes/intermediarios en modales).
-- Ejecutar en Supabase SQL Editor si ya tenés `app_config` (p. ej. tras `app_config_session_timeout.sql`).

INSERT INTO public.app_config (key, value) VALUES ('supabase_select_page_size', '1000')
ON CONFLICT (key) DO NOTHING;
