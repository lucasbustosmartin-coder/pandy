-- Plazo para editar o anular una orden ya ejecutada o un movimiento manual ya guardado.
-- Días hábiles lunes a viernes, calendario Argentina. Default 10.
-- Ejecutar en Supabase (Pandy y Pandy-Dev) junto con el front. Solo Admin cambia el valor (RLS app_config).

INSERT INTO public.app_config (key, value) VALUES ('dias_laborables_editar_anular', '10')
ON CONFLICT (key) DO NOTHING;
