-- Pandi: «Compromiso a Cobrar» en CC cliente para ingreso pendiente Cliente→Pandy (o C→Int. en 2 patas)
-- debe sumar en positivo (pendiente de cobro), alineado a USD-USD y a la convención de resumen CC.
-- Corrige signo -1 → +1 en filas existentes (misma clave lógica en USD-ARS / ARS-USD en reglas_de_negocio_tabla.sql;
-- en bases con cruces EUR en CSV/seed, aplica el mismo criterio sin listar códigos).

BEGIN;

UPDATE public.reglas_de_negocio
SET signo = 1
WHERE es_comision = false
  AND concepto_leyenda = 'compromiso_cobrar'
  AND tipo_transaccion = 'ingreso'
  AND estado_transaccion = 'pendiente'
  AND contrapartida_ejecutada = true
  AND entidad_cc = 'cliente'
  AND pagador = 'cliente'
  AND cobrador IN ('pandy', 'intermediario')
  AND signo = -1;

COMMIT;
