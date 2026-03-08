# Fechas: convención Argentina

En este proyecto **todas las fechas y horas se interpretan y muestran en Argentina** (timezone **America/Argentina/Buenos_Aires**).

- **App:** al derivar mes/año o formatear fechas, usar esta zona para evitar diferencias por la zona horaria del navegador.
- **Bitácora:** el script `scripts/crear-bitacora-excel.js` usa `America/Argentina/Buenos_Aires` para `__HOY__` y `__AHORA__`.
- **Scripts y reglas:** al registrar fechas (log, versiones), usar la fecha/hora en Argentina.

Constante de referencia: `ZONA_ARGENTINA = 'America/Argentina/Buenos_Aires'`.
