UPDATE movimientos_cuenta_corriente
SET estado = 'anulado', estado_fecha = now()
WHERE orden_id IN (SELECT id FROM ordenes WHERE estado = 'anulada')
AND (estado IS NULL OR estado != 'anulado')
AND (es_movimiento_manual IS NULL OR es_movimiento_manual = false);

UPDATE movimientos_cuenta_corriente_intermediario
SET estado = 'anulado', estado_fecha = now()
WHERE orden_id IN (SELECT id FROM ordenes WHERE estado = 'anulada')
AND (estado IS NULL OR estado != 'anulado')
AND (es_movimiento_manual IS NULL OR es_movimiento_manual = false);

UPDATE movimientos_caja
SET estado = 'anulado', estado_fecha = now()
WHERE orden_id IN (SELECT id FROM ordenes WHERE estado = 'anulada')
AND (estado IS NULL OR estado != 'anulado');

UPDATE transacciones
SET estado = 'anulada', fecha_ejecucion = NULL, updated_at = now()
WHERE instrumentacion_id IN (
    SELECT i.id FROM instrumentacion i 
    JOIN ordenes o ON o.id = i.orden_id 
    WHERE o.estado = 'anulada'
)
AND estado != 'anulada';
