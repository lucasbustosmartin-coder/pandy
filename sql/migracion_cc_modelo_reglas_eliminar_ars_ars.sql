-- Pandi – Eliminar reglas cc_modelo legacy con tipo_operacion_codigo = 'ARS-ARS'
-- El catálogo ya no usa ARS-ARS; cheque en pesos es CHEQUE-ARS y vive en reglas_de_negocio.
-- Ejecutar en Supabase SQL Editor cuando hayas migrado y no necesites fallback en cc_modelo.

DELETE FROM public.cc_modelo_reglas
WHERE tipo_operacion_codigo = 'ARS-ARS';
