-- RLS: permitir DELETE en comisiones_orden y orden_comisiones_generadas a quien tiene anular_orden,
-- alineado a ejecutarAnulacionOrdenCompleta en main.js (anulación de orden borra comisiones persistidas).
-- Ejecutar en Supabase SQL Editor (prod y dev) después de supabase_rls_complejidad.sql / migracion_orden_comisiones_generadas_tabla.sql.

DROP POLICY IF EXISTS "comisiones_orden_delete" ON public.comisiones_orden;
CREATE POLICY "comisiones_orden_delete"
  ON public.comisiones_orden FOR DELETE TO authenticated
  USING (
    public.has_permission('abm_ordenes')
    OR public.has_permission('anular_orden')
  );

DROP POLICY IF EXISTS "orden_comisiones_generadas_delete" ON public.orden_comisiones_generadas;
CREATE POLICY "orden_comisiones_generadas_delete"
  ON public.orden_comisiones_generadas FOR DELETE TO authenticated
  USING (
    public.has_permission('abm_ordenes')
    OR public.has_permission('anular_orden')
  );

COMMENT ON POLICY "comisiones_orden_delete" ON public.comisiones_orden IS
  'DELETE: ABM órdenes o anular orden (flujo anulación elimina filas de la orden).';
COMMENT ON POLICY "orden_comisiones_generadas_delete" ON public.orden_comisiones_generadas IS
  'DELETE: ABM órdenes o anular orden (flujo anulación limpia marcas ganancia/comisión int.).';
