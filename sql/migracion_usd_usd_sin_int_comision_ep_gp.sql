-- USD-USD sin intermediario, **E,P**: la comisión implícita (`mr − me`) figura en CC como línea **cerrada** **−318**
-- (regla `es_comision` con `estado_transaccion = ejecutada`, `contrapartida_ejecutada = false`, `signo = −1`).
-- El cobro en CC es **−me**; el compromiso de entrega pendiente queda en **+mr** solamente (sin fila −me duplicada en el egreso).
-- G/P Operativa: la comisión **sí** entra en bolsas CC cerradas cuando aplica el panel.
--
-- Idempotente. Para bases con la matriz antigua (comisión pendiente / −mr en cobro), usar además
-- `sql/migracion_reglas_usd_usd_ep_cobro_me_comision_cerrada.sql`.

INSERT INTO public.reglas_de_negocio (
  tipo_operacion_codigo, usa_intermediario, entidad_cc, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea,
  moneda, signo, monto_origen, incluir_en_detalle, concepto_leyenda
) VALUES
  ('USD-USD', false, 'cliente', 'cliente', 'pandy', 'ingreso', true, 'ejecutada', false, 0,
   'USD', -1, 'mr_menos_me', true, 'comision_acuerdo')
ON CONFLICT (
  tipo_operacion_codigo, usa_intermediario, entidad_cc, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea
) DO UPDATE SET
  moneda = EXCLUDED.moneda,
  signo = EXCLUDED.signo,
  monto_origen = EXCLUDED.monto_origen,
  incluir_en_detalle = EXCLUDED.incluir_en_detalle,
  concepto_leyenda = EXCLUDED.concepto_leyenda;
