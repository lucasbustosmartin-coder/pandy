-- Pandi – CC intermediario en patrón **cp_ic** (egreso Intermediario→Cliente)
-- y corrección signo comisión explícita intermediario (USD-USD+int).
--
-- Efecto: Pandy queda debiendo al intermediario el monto entregado al cliente (me en la transacción)
-- más la parte de comisiones_orden para el intermediario (signo negativo en CC int).
--
-- Ejecutar en Supabase SQL Editor en bases que ya tenían reglas previas.
-- Para un solo archivo que incluya también la regeneración EUR+int: ver
-- `sql/ejecutar_supabase_cc_int_cp_ic_comision_y_regenerar_eur.sql`.
--
-- **Tipos con EUR + intermediario:** en el repo, **USD-EUR** y **EUR-USD** (usa_intermediario=true)
-- se regeneran copiando **USD-ARS+int** y **ARS-USD+int** (`sql/migracion_reglas_eur_usd_desde_usd_ars_ars_usd_int.sql`).
-- **EUR-ARS** y **ARS-EUR** +int copian lo mismo en el bloque C de
-- `sql/migracion_reglas_eur_cruces_desde_usd_ars_ars_usd_sin_int_y_eur_ars_int.sql`.
-- Después de aplicar este script, si usás esos códigos en `tipos_operacion`, **volvé a ejecutar**
-- esos dos archivos (o al menos los bloques +int) para que las filas nuevas de USD-ARS/ARS-USD
-- queden espejadas en EUR (moneda ARS→EUR o USD→EUR según el script). No hace falta una tabla
-- exportada de producción si la fuente canónica en repo está al día.
--
-- No existe en catálogo **EUR-EUR** (misma moneda) en este repo; el análogo es **USD-USD**, cubierto arriba.

INSERT INTO public.reglas_de_negocio (
  tipo_operacion_codigo, usa_intermediario, entidad_cc, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea,
  moneda, signo, monto_origen, incluir_en_detalle, concepto_leyenda
) VALUES
  -- USD-USD+int y cruces USD-ARS / ARS-USD: P,E en CC intermediario = una sola línea −me (linea 0); ver migracion_reglas_cp_ic_int_pe_intermediario_una_sola_linea_negativa.sql
  ('USD-USD', true, 'intermediario', 'intermediario', 'cliente', 'egreso', false, 'ejecutada', false, 0, 'USD', -1, 'monto_transaccion', true, 'compromiso_pago'),
  ('USD-USD', true, 'intermediario', 'intermediario', 'cliente', 'egreso', false, 'ejecutada', true, 0, 'USD', -1, 'monto_transaccion', true, 'compromiso_pago'),
  ('USD-ARS', true, 'intermediario', 'intermediario', 'cliente', 'egreso', false, 'ejecutada', false, 0, 'ARS', -1, 'monto_transaccion', true, 'compromiso_pago'),
  ('USD-ARS', true, 'intermediario', 'intermediario', 'cliente', 'egreso', false, 'ejecutada', true, 0, 'ARS', -1, 'monto_transaccion', true, 'compromiso_pago'),
  ('ARS-USD', true, 'intermediario', 'intermediario', 'cliente', 'egreso', false, 'ejecutada', false, 0, 'USD', -1, 'monto_transaccion', true, 'compromiso_pago'),
  ('ARS-USD', true, 'intermediario', 'intermediario', 'cliente', 'egreso', false, 'ejecutada', true, 0, 'USD', -1, 'monto_transaccion', true, 'compromiso_pago')
ON CONFLICT (
  tipo_operacion_codigo, usa_intermediario, entidad_cc, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea
) DO UPDATE SET
  moneda = EXCLUDED.moneda,
  signo = EXCLUDED.signo,
  monto_origen = EXCLUDED.monto_origen,
  incluir_en_detalle = EXCLUDED.incluir_en_detalle,
  concepto_leyenda = EXCLUDED.concepto_leyenda;

UPDATE public.reglas_de_negocio
SET signo = -1
WHERE tipo_operacion_codigo = 'USD-USD'
  AND usa_intermediario = true
  AND entidad_cc = 'intermediario'
  AND es_comision = true
  AND LOWER(pagador) = 'pandy'
  AND LOWER(cobrador) = 'intermediario'
  AND LOWER(tipo_transaccion) = 'egreso'
  AND LOWER(monto_origen) = 'comision_intermediario';
