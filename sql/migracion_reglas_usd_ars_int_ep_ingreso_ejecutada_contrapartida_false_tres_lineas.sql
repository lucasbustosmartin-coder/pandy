-- USD-ARS + intermediario (flujo inverso): E,P y estados donde Tx1 Cliente→Intermediario está **ejecutada**
-- y el egreso Pandy→Cliente **aún no** está ejecutado (`contrapartida_ejecutada = false`).
--
-- El motor `reglas_de_negocio` debe generar **tres** movimientos CC cliente en el detalle:
--   −mr USD, +mr USD (netean el compromiso en USD de esa pata) y −me ARS (posición abierta del acuerdo).
-- Antes solo había una fila ARS −me sin el par USD → E2E "detalle cliente cantidad" esperaba 3, recibía 1.
--
-- Ejecutar en Supabase después de `reglas_usd_ars_int_inversa_reglas_de_negocio.sql` (o idempotente: UPSERT).

INSERT INTO public.reglas_de_negocio (
  tipo_operacion_codigo, usa_intermediario, entidad_cc,
  pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea,
  moneda, signo, monto_origen, incluir_en_detalle, concepto_leyenda
) VALUES
  ('USD-ARS', true, 'cliente', 'cliente', 'intermediario', 'ingreso', false, 'ejecutada', false, 0, 'USD', -1, 'mr', true, 'cobro_realizado'),
  ('USD-ARS', true, 'cliente', 'cliente', 'intermediario', 'ingreso', false, 'ejecutada', false, 1, 'USD', 1, 'mr', true, 'cobro_realizado'),
  ('USD-ARS', true, 'cliente', 'cliente', 'intermediario', 'ingreso', false, 'ejecutada', false, 2, 'ARS', -1, 'me', true, 'cobro_realizado')
ON CONFLICT (
  tipo_operacion_codigo, usa_intermediario, entidad_cc,
  pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea
) DO UPDATE SET
  moneda = EXCLUDED.moneda,
  signo = EXCLUDED.signo,
  monto_origen = EXCLUDED.monto_origen,
  incluir_en_detalle = EXCLUDED.incluir_en_detalle,
  concepto_leyenda = EXCLUDED.concepto_leyenda;

-- La fila antigua (linea 0 solo ARS −me) se reemplaza por UPSERT en la misma clave (linea 0 → USD −mr).
