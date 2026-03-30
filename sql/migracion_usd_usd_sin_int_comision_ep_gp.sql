-- USD-USD sin intermediario, **E,P** (ingreso Cliente→Pandy ejecutado, egreso Pandy→Cliente pendiente):
-- comisión implícita (mr − me) como línea explícita en CC cliente en estado **pendiente**.
-- El front, si esta fila existe en `reglas_de_negocio`, trata la 2.ª línea del egreso pendiente como **−mr** (no −me)
-- para que el saldo no quede en −(me − (mr−me)); ver `aplicarMotorCcDesdeReglasDeNegocio` en main.js.
-- G/P Operativa (`gp_operativa_resumen`) solo agrega movimientos CC con estado **cerrado** → esta línea no entra
-- hasta que el par cierre (sync regenera la fila es_comision como cerrada vía regla ejecutada+true).
--
-- Idempotente. Ejecutar en Supabase SQL Editor en bases ya desplegadas.

INSERT INTO public.reglas_de_negocio (
  tipo_operacion_codigo, usa_intermediario, entidad_cc, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea,
  moneda, signo, monto_origen, incluir_en_detalle, concepto_leyenda
) VALUES
  ('USD-USD', false, 'cliente', 'cliente', 'pandy', 'ingreso', true, 'pendiente', false, 0,
   'USD', 1, 'mr_menos_me', true, 'comision_acuerdo')
ON CONFLICT (
  tipo_operacion_codigo, usa_intermediario, entidad_cc, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea
) DO UPDATE SET
  moneda = EXCLUDED.moneda,
  signo = EXCLUDED.signo,
  monto_origen = EXCLUDED.monto_origen,
  incluir_en_detalle = EXCLUDED.incluir_en_detalle,
  concepto_leyenda = EXCLUDED.concepto_leyenda;
