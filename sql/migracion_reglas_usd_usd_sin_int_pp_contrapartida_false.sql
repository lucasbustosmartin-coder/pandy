-- USD-USD sin intermediario, patrón **P,P** (ambas transacciones pendientes):
-- `contrapartidaEjecutada()` es false porque ninguna pata está ejecutada.
-- Sin estas filas el motor no matchea (toast «transacciones sin regla_de_negocio»).
-- Paridad con USD-ARS sin int (`pendiente` + `contrapartida_ejecutada = false`) y USD-USD+int (filas 299–300 y 315–316 de reglas_de_negocio_tabla.sql).
-- Idempotente: ON CONFLICT DO UPDATE.
--
-- Auditoría «misma moneda de intercambio» / mismo hueco P,P:
-- - En catálogo vigente el único tipo **acuerdo en una sola moneda** (mr/me en CC en esa moneda) es **USD-USD**; no hay EUR-EUR ni ARS-ARS en `reglas_de_negocio_tabla.sql`.
-- - **Cruces dos monedas** sin int. (USD-ARS, ARS-USD, EUR-USD, USD-EUR, EUR-ARS, ARS-EUR) ya traen P,P false en el bootstrap (`reglas_de_negocio_tabla.sql` y `migracion_reglas_todos_cruces_dos_monedas_sin_int_canonico.sql`).
-- - **USD-USD + intermediario** ya tenía ingreso/egreso `pendiente`+`contrapartida_ejecutada = false` antes de este parche.
-- - **CHEQUE-ARS** es CHEQUE↔ARS (no «una sola moneda»); en tabla figuran `pendiente`+`false` para las patas cliente/inter donde aplica.

INSERT INTO public.reglas_de_negocio (
  tipo_operacion_codigo, usa_intermediario, entidad_cc, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea,
  moneda, signo, monto_origen, incluir_en_detalle, concepto_leyenda
) VALUES
  ('USD-USD', false, 'cliente', 'cliente', 'pandy', 'ingreso', false, 'pendiente', false, 0, 'USD', 1, 'monto_transaccion', true, 'compromiso_cobrar'),
  ('USD-USD', false, 'cliente', 'pandy', 'cliente', 'egreso', false, 'pendiente', false, 0, 'USD', 1, 'mr', true, 'compromiso_pago'),
  ('USD-USD', false, 'cliente', 'pandy', 'cliente', 'egreso', false, 'pendiente', false, 1, 'USD', -1, 'me', true, 'compromiso_pago')
ON CONFLICT (
  tipo_operacion_codigo, usa_intermediario, entidad_cc, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea
) DO UPDATE SET
  moneda = EXCLUDED.moneda,
  signo = EXCLUDED.signo,
  monto_origen = EXCLUDED.monto_origen,
  incluir_en_detalle = EXCLUDED.incluir_en_detalle,
  concepto_leyenda = EXCLUDED.concepto_leyenda;
