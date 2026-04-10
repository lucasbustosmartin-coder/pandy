-- Run this to check what is going on with Order 13:
SELECT 
    id, numero, estado 
FROM ordenes 
WHERE numero = 13;

SELECT 
    m.id, m.concepto, m.estado, m.orden_id, m.es_movimiento_manual 
FROM movimientos_cuenta_corriente_intermediario m
JOIN ordenes o ON o.id = m.orden_id
WHERE o.numero = 13;
