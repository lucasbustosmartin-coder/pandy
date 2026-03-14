-- Eliminar movimientos de cuenta corriente con concepto "Conversión de moneda" o "Conversión por tipo de cambio".
-- Con la nueva lógica de CC (momento cero + Cancelación de deuda) esos conceptos ya no se usan.
-- Ejecutar en Supabase SQL Editor si tenés datos legacy que quieras limpiar.

DELETE FROM public.movimientos_cuenta_corriente
WHERE concepto IN ('Conversión de moneda', 'Conversión por tipo de cambio');

DELETE FROM public.movimientos_cuenta_corriente_intermediario
WHERE concepto IN ('Conversión de moneda', 'Conversión por tipo de cambio');
