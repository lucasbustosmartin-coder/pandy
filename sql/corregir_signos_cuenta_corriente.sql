-- Corregir signos de movimientos de cuenta corriente (convención anterior).
-- Ejecutar una sola vez si ya tenías movimientos con signos al revés.
-- Convención: positivo = cliente nos debe; negativo = nosotros le debemos.
-- Cliente paga → +monto; cliente cobra → -monto.

-- Movimientos por órdenes concertadas (si los hubo):
UPDATE public.movimientos_cuenta_corriente
SET monto = -monto
WHERE concepto = 'Orden concertada';

-- Movimientos por transacciones ejecutadas (si se guardaron con cobrador=cliente → + y pagador=cliente → -):
UPDATE public.movimientos_cuenta_corriente
SET monto = -monto
WHERE concepto = 'Transacción ejecutada';
