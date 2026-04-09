-- Pandi: ARS-USD / USD-ARS + intermediario, patrón **cp_ic** (ingreso Cliente→Pandy + egreso Intermediario→Cliente).
-- E,E: el egreso ya tenía par ± en moneda entregada (USD o ARS); el ingreso solo tenía una línea −monto_transacción
-- en moneda recibida con contrapartida_ejecutada = true → la CC cliente quedaba con saldo fantasma (ej. −5M ARS
-- como si el cliente debiera tras haber pagado). Se agrega linea = 1, signo = +1, mismo monto_origen, espejo del
-- criterio del egreso.
--
-- Idempotente: INSERT … ON CONFLICT DO UPDATE. Ejecutar en Supabase SQL Editor (dev y prod). Luego resincronizar
-- órdenes afectadas desde la app o RPC de sync.
-- Canónico: sql/reglas_de_negocio_tabla.sql, sql/reglas_ars_usd_int_inversa_reglas_de_negocio.sql,
-- sql/reglas_usd_ars_int_inversa_reglas_de_negocio.sql, sql/insert_reglas_ars_usd_int_cp_ic_si_faltan.sql.

INSERT INTO public.reglas_de_negocio (
  tipo_operacion_codigo, usa_intermediario, entidad_cc,
  pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea,
  moneda, signo, monto_origen, incluir_en_detalle, concepto_leyenda
) VALUES
  ('ARS-USD', true, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'ejecutada', true, 1, 'ARS', 1, 'monto_transaccion', true, 'cobro_realizado'),
  ('USD-ARS', true, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'ejecutada', true, 1, 'USD', 1, 'monto_transaccion', true, 'cobro_realizado')
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
