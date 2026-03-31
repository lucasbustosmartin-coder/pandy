# Fechas: convención Argentina

En este proyecto **todas las fechas de negocio (día contable)** y los **rangos de filtros** se interpretan en **calendario Argentina** (timezone **America/Argentina/Buenos_Aires**), **sin usar el calendario local del navegador** para decidir qué día es “hoy”, “ayer”, “mañana” o qué día corresponde a un `updated_at` en UTC.

## `main.js` — helpers (orden de uso)

| Símbolo | Uso |
|--------|-----|
| `ZONA_ARGENTINA` | Constante `'America/Argentina/Buenos_Aires'`. |
| `fechaYYYYMMDDEnZonaArgentina(instante)` | Día YYYY-MM-DD en Argentina para un `Date` o un ISO timestamptz (p. ej. derivar día contable desde `updated_at` sin usar el prefijo UTC del string). |
| `fechaHoyYYYYMMDDArgentina()` | Hoy calendario Argentina (defaults de órdenes, caja, CC, filtros “Hoy”, cola offline, etc.). |
| `fechaAddDaysYYYYMMDDArgentina(ymd, delta)` | Suma días en calendario anclando mediodía ART (`T15:00:00.000Z`) para no cruzar de día al sumar. |
| `ultimoDiaDelMesGregoriano(anio, mes1a12)` | Último día del mes (gregoriano puro, sin TZ del navegador); usado en rango **mes** de G/P Operativa. |
| `estadoFechaUtcAnclaDiaContableArgentina(ymd)` | ISO UTC que representa ese día contable en Argentina (misma ancla que `fechaAddDays…`); solo cuando no hay `updated_at` real. |

**No hacer:** obtener “hoy” con `new Date().getFullYear()/getMonth()/getDate()` (depende del navegador), ni el día de un timestamp con `isoString.slice(0, 10)` (es la fecha UTC, no la argentina).

**Timestamps completos** (`updated_at`, `created_at`, metadatos JSON): pueden seguir en ISO UTC (`toISOString()`); el criterio anterior aplica al **campo fecha** de negocio y a **filtros por YYYY-MM-DD**.

## SQL / Supabase

- **`public.fecha_hoy_argentina()`** (`sql/helpers_fecha_argentina.sql`): día contable en `America/Argentina/Buenos_Aires`. Reemplaza **`CURRENT_DATE`** en defaults y fallbacks (en Supabase `CURRENT_DATE` sigue la zona de la sesión, suele desalinear del negocio).
- **Migración en bases ya creadas:** `sql/migracion_fecha_default_columnas_argentina.sql` (después de crear la función si hace falta).
- **DDL nuevos:** `supabase_tablas_negocio.sql` y `supabase_complejidad_ordenes.sql` usan `DEFAULT public.fecha_hoy_argentina()` en columnas `fecha`.
- **RPC:** `transacciones_cambiar_estado` y `sync_cc_caja_orden` usan `public.fecha_hoy_argentina()` cuando no viene fecha explícita.
- **Scripts utilitarios:** `resincronizar_cc_desde_transacciones.sql`, `backfill_cc_transacciones_pendientes.sql` derivan día desde `created_at` con **`AT TIME ZONE 'America/Argentina/Buenos_Aires'`**, no UTC.
- Las columnas `date` guardan calendario; deben alinearse con lo que envía la app (`fechaHoyYYYYMMDDArgentina` en `main.js`). `gp_operativa_resumen` compara `date` inclusive tal cual.

## Otros

- **Bitácora:** `scripts/crear-bitacora-excel.js` usa `America/Argentina/Buenos_Aires` para `__HOY__` y `__AHORA__`.
