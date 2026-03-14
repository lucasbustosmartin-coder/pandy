-- Borra solo los movimientos de cuenta corriente (cliente) de una orden
-- para que el sync de la app los regenere al abrir Órdenes / Cuenta corriente / Inicio.
-- Con el código corregido, la CC quedará en 0 (Cobro 50.000 + Pago 48.750, etc.).

-- Reemplazá el orden_id por el de tu orden si es otra.
DELETE FROM public.movimientos_cuenta_corriente
WHERE orden_id = '765f5534-aa1e-41db-9a0d-6ca7189e6f9f';

-- Luego: en la app, entrá a Órdenes o Cuenta corriente o Inicio para que
-- se ejecute el sync y se recreen los movimientos correctos.
