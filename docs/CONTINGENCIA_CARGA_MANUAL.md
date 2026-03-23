# Contingencia — carga manual de órdenes y transacciones (Pandy)

## Objetivo

Tener un **respaldo operativo** si el sistema no está disponible (Supabase, Vercel, red, etc.): el negocio sigue anotando acuerdos y transacciones en una planilla Excel con lenguaje simple, para **después** volcar en Pandy con revisión humana (y en el futuro, si se implementa, una opción de importación).

## Archivo Excel

| Archivo | Descripción |
|--------|----------------|
| `docs/CONTINGENCIA_ordenes_transacciones_Pandy.xlsx` | Planilla con instructivo, datos y hoja **Listas** para desplegables. |

## Regenerar la planilla

Desde la raíz del repo:

```bash
node scripts/crear-excel-contingencia-ordenes.js
```

Opcionalmente: `npm run contingencia:excel` (ver `package.json`).

**Tecnología:** el generador usa **ExcelJS** (`exceljs`) para escribir **validación de datos**: listas que referencian la hoja **Listas**, validación de enteros (ID, nº de pata), decimales (montos) y fechas. Abrí el archivo preferentemente en **Microsoft Excel** o **LibreOffice Calc** (el soporte de validación puede variar).

## Contenido de las hojas

1. **1_Lee_primero_instructivo** — Cómo completar todo; explica desplegables y orden de trabajo.
2. **2_Acuerdos_ordenes** — Una fila por acuerdo; **ID_temporal** enlaza con transacciones. Columnas con lista (estado, monedas, tipo de operación, Si/No intermediario) y validación numérica/fecha.
3. **3_Transacciones** — Una fila por pata; **ID_temporal_orden** = mismo número que el acuerdo. Listas para tipo, modo de pago, moneda, pagador, cobrador, estado, caja.
4. **4_Comisiones** — Opcional; **ID_temporal_orden**; moneda desde lista.
5. **Listas** — Valores permitidos por columna: **origen de los desplegables**. No borrar celdas de esas listas; se pueden agregar códigos de tipo con acuerdo del administrador (y actualizar el script si hace falta ampliar filas del rango).

Los **montos** en Excel son **números** (no texto con formato), para poder sumar y revisar.

## Responsabilidad (acuerdo a retomar con el titular)

> **La plantilla y el flujo los armamos juntos; la revisión del archivo y la decisión de cargar/importar en producción es responsabilidad del titular del negocio.**

## Paso 2 — importación (diseño a revisar)

No pegar el Excel directo en tablas de negocio: **primero a tablas de tránsito (staging)**, luego UI para el **rol que defina el dueño** (permiso `revisar_import_contingencia`): revisión y edición **registro a registro** y, si el titular asume el riesgo, opción de **impacto masivo** con confirmación.

Detalle, preguntas abiertas y script SQL base: **`docs/CONTINGENCIA_IMPORTACION_DISENO.md`** y **`sql/migracion_contingencia_import_staging.sql`**.

## Referencia técnica del modelo

- Órdenes: `sql/ordenes_insertar_con_proximo_numero.sql`, `sql/supabase_complejidad_ordenes.sql`, migraciones de estado (`sql/migracion_estado_orden.sql`, `sql/migracion_orden_anulada.sql`).
- Transacciones: `cobrador`, `pagador`, `tipo`, `modo_pago_id` (en planilla: códigos de modo de pago en texto; al importar se traducen a UUID), `estado` pendiente/ejecutada.
