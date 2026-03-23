# Importación desde Excel de contingencia — diseño a revisar (Pandy)

Documento para **retomar cuando lo hayas definido con el titular del negocio**. No es implementación cerrada de UI; fija criterios y responsabilidades.

---

## Frase de responsabilidad (acuerdo operativo)

> **La plantilla y el flujo los armamos juntos; la revisión del archivo y la decisión de cargar/importar en producción es responsabilidad del titular del negocio.**

- Quien **ofrece** la solución (implementación técnica, plantilla, flujo): entrega herramientas y criterios.
- Quien **decide** en el negocio: revisa el Excel, valida coherencia con comprobantes y autoriza que los datos entren a Pandy (registro a registro o masivo).

---

## Dirección técnica acordada (resumen)

1. **Importar el Excel a tablas de tránsito (staging)** en Supabase — no escribir directo en `ordenes` / `transacciones` en el primer paso.
2. **UI** visible solo para el **rol que defina el dueño** (permiso dedicado), donde pueda:
   - **Revisar y editar** cada registro (acuerdos, transacciones, comisiones) antes de aplicar.
   - Opcionalmente, si el dueño **asume el riesgo**, un camino de **impacto masivo** (aplicar todo lo aprobado en un lote), con confirmación explícita en pantalla.
3. **Motor de aplicación** (futuro): desde staging validado → crear/actualizar `ordenes`, `instrumentacion`, `transacciones`, `comisiones_orden`, etc., resolviendo `cliente_id` / `intermediario_id` / `tipo_operacion_id` / `modo_pago_id` por nombre o código según reglas definidas.

Esto separa **“subir archivo”** de **“impactar negocio real”** y deja trazabilidad por lote (`batch`).

---

## Esquema de datos (preparación en repo)

Script base (ejecutar en Supabase cuando corresponda):

- `sql/migracion_contingencia_import_staging.sql`

Incluye:

- `contingencia_import_batch` — un envío / archivo / sesión de importación.
- `contingencia_import_acuerdo`, `contingencia_import_transaccion`, `contingencia_import_comision` — filas espejo de la planilla + `estado_linea` y campos para mensajes de validación y referencia al registro ya aplicado (si aplica).

Permiso sugerido: **`revisar_import_contingencia`** (asignar en `app_role_permission` al rol que el dueño elija; no se asume automáticamente a todos los admins en el script).

---

## Preguntas abiertas (para masticar con el dueño)

- ¿Solo el titular o también un “operador de confianza” con el mismo permiso?
- ¿Obligatorio paso “aprobación línea a línea” antes de habilitar masivo, o el masivo es siempre tras checklist en pantalla?
- ¿Se guarda copia del archivo `.xlsx` en Storage o basta con las filas en staging?
- ¿Qué pasa si `nombre_cliente` no matchea un cliente en Pandy: bloquear línea, permitir alta rápida, o solo error para corrección manual?

---

## Referencias

- Planilla y uso manual: `docs/CONTINGENCIA_CARGA_MANUAL.md`
- Generador Excel: `scripts/crear-excel-contingencia-ordenes.js`
- Corazón CC/caja al aplicar: `docs/CORAZON_SISTEMA_CC_Y_CAJA.md`
