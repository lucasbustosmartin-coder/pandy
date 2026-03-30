-- USD-USD con intermediario: comisión fija en USD parametrizable (intermediario + dos importes).
-- La app lee la clave `usd_usd_comision_fija_config` (JSON) desde Seguridad (solo Admin).
-- Si `intermediario_id` está vacío, se mantiene compatibilidad por nombre (palabra «nacho» en el nombre del intermediario).

INSERT INTO public.app_config (key, value)
VALUES (
  'usd_usd_comision_fija_config',
  '{"intermediario_id":"","opcion_a":50,"opcion_b":75}'
)
ON CONFLICT (key) DO NOTHING;
