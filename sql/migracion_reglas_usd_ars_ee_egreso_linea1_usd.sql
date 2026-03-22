-- USD-ARS sin int, E,E: segunda línea del egreso ejecutado (contrapartida true) en USD.
-- Completa el par ARS+USD en Tx2 para que con Tx1 ingreso (ARS+USD) haya 4 movimientos que netean a cero.
-- Ver docs/MODELO_CC_USD_ARS_TEORICO.md. Si ya aplicás `sql/reglas_de_negocio_tabla.sql` completo, no hace falta este script.

INSERT INTO public.reglas_de_negocio (
  tipo_operacion_codigo, usa_intermediario, entidad_cc, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea,
  moneda, signo, monto_origen, incluir_en_detalle, concepto_leyenda
) VALUES
  ('USD-ARS', false, 'cliente', 'pandy', 'cliente', 'egreso', false, 'ejecutada', true, 1, 'USD', 1, 'mr_prorrateado', true, 'compromiso_pago')
ON CONFLICT (
  tipo_operacion_codigo, usa_intermediario, entidad_cc, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea
) DO UPDATE SET
  moneda = EXCLUDED.moneda,
  signo = EXCLUDED.signo,
  monto_origen = EXCLUDED.monto_origen,
  incluir_en_detalle = EXCLUDED.incluir_en_detalle,
  concepto_leyenda = EXCLUDED.concepto_leyenda;
