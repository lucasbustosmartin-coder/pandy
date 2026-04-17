# Movimientos manuales de cuenta corriente (sin orden)

## Idea central

La **cuenta corriente en base** sigue siendo solo:

- **Cliente ↔ empresa** (`movimientos_cuenta_corriente`)
- **Intermediario ↔ empresa** (`movimientos_cuenta_corriente_intermediario`)

En el modal el usuario define el **hecho económico** con **Pagador** y **Cobrador**, pudiendo ser en cada rol:

- **Cliente** (combo)
- **Intermediario** (combo)
- **Empresa** (marca del sistema / `pandy` en datos)

### Dos terceros (sin empresa en el flujo directo)

Ejemplo: **Cliente A** paga y **Cliente B** cobra (compensación, saldos a favor, etc.). No existe una fila “A↔B” en la base: se generan **dos movimientos** con el mismo `manual_grupo_id`:

1. En la CC de **A**: registro coherente con “entrega hacia la empresa” (`cobro_entidad_pandy` en convención de signo).
2. En la CC de **B**: registro coherente con “recibe desde la empresa” (`pago_pandy_entidad`).

Así la empresa **toma posición** con quien pagó y **ajusta** con quien cobró, alineado a cómo Pandi usa saldos a favor/en contra para cerrar operaciones cruzadas.

Lo mismo aplica a combinaciones **cliente ↔ intermediario** (dos patas en las tablas que correspondan).

### Signo del importe en la fila de CC (por entidad)

En cada fila de `movimientos_cuenta_corriente` / `movimientos_cuenta_corriente_intermediario`:

1. **Terceros (cliente o intermediario cuyo nombre no coincide con la empresa):** quien **paga** el flujo (`manual_tip` = `cobro_entidad_pandy`) → monto **negativo**; quien **recibe** (`pago_pandy_entidad`) → monto **positivo**.
2. **Empresa en el libro:** si el **nombre** de esa entidad (cliente o intermediario) coincide, normalizado, con **nombre legal** o **nombre en sistema** configurados en **Empresa / marca** (`app_empresa`), se **invierte** el signo respecto del punto 1: **empresa recibe** → negativo; **empresa paga** → positivo. Así la óptica de CC se alinea con la de caja (ingreso en caja puede ser + aunque en la CC de la entidad “Madero” el saldo vaya en −).

La caja (efectivo) sigue la dirección física: egreso si paga la empresa, ingreso si cobra la empresa.

**Datos ya guardados** con la lógica anterior pueden tener signo distinto; corregirlos solo con criterio explícito (edición manual, SQL puntual o anular y volver a cargar).

### Listado «Movimientos» en CC

- Los manuales sin `orden_id`/`transaccion_id` se deduplican en pantalla por **id de fila**, no solo por monto/concepto, para que no desaparezcan patas distintas del mismo grupo.
- El rango **Desde/Hasta** y **Todo el historial** no se reinician en cada refresco de datos: solo en la **primera** carga de la sesión se fija el default «solo hoy».

## Caja

- Solo si en el movimiento participa **explícitamente la empresa** como pagador o cobrador **y** el **modo de pago** es **efectivo**.
- No hay combo de tipo: se usa siempre uno de estos registros en `tipos_movimiento_caja` (creados por script):
  - **Ingreso de Dinero (Mov Manual en CC)** (`direccion = ingreso`) si **cobra la empresa**.
  - **Egreso de Dinero (Mov Manual en CC)** (`direccion = egreso`) si **paga la empresa**.
- Script: `sql/migracion_tipos_caja_cc_manual.sql`. El movimiento en `movimientos_caja` lleva `caja_tipo = efectivo`.
- **Banco/transferencia** y **cheque** no generan movimiento en caja; el modo queda reflejado en el **concepto** (`[Banco]` / `[Cheque]`).
- En la vista **Cajas → Movimientos**, los movimientos de caja que son el par de un **CC manual con efectivo** no se pueden **editar ni anular** desde ahí (la app muestra «Solo desde CC»): hay que usar **Cuenta corriente → Movimientos → lápiz** (o anular el manual desde CC) para no desalinear CC y caja.
- Los movimientos de caja que vienen de una **orden** o **transacción** del acuerdo tampoco se **editan** desde Cajas (hint «Solo desde orden»): hay que gestionarlos desde la **orden** o desde **Cuenta corriente** vinculada a esa operación, para no desalinear caja con el acuerdo.

Requiere permiso **`alta_movimiento_caja`** cuando aplica caja (insert del movimiento en `movimientos_caja`). La edición de filas de caja vinculadas a CC manual sigue **`editar_movimiento_cc_manual`**; en RLS también entra **`editar_movimiento_caja`** para otros casos.

## Permisos CC

- `registrar_movimiento_cc_manual` o `editar_transacciones` para insertar en tablas CC.
- `editar_movimiento_cc_manual` — editar desde la solapa **Movimientos** el **movimiento completo** (pagador, cobrador, moneda, importe, modalidad de pago, fecha y concepto). Si hay grupo (`manual_grupo_id`), se reemplazan **todas** las patas. En Supabase hace falta además la política de **DELETE** para manuales con este permiso: `sql/migracion_cc_manual_editar_delete_reemplazo.sql` (incluida en el bootstrap dev concatenado).
- `eliminar_movimiento_cc_manual` — anular esas líneas (`estado = anulado`); si había movimiento de caja vinculado, también se anula en caja.
- `ver_auditoria` — ver filas en `auditoria_app` (consulta SQL o futura pantalla).

## Edición, anulación y caja

- En **Movimientos**, las filas **Manual** muestran acciones lápiz / papelera según permisos.
- **Editar (lápiz):** el modal equivale al de alta: mismos campos; al guardar se **borran** las líneas CC anteriores y se **insertan** las nuevas (misma semántica que un alta). La caja vinculada se **actualiza** si sigue habiendo efectivo con empresa; se **anula** si pasás a banco/cheque o sacás a la empresa del flujo (requiere `anular_movimiento_caja` cuando corresponda anular). Si creás caja nueva donde antes no había, hace falta `alta_movimiento_caja`.
- Si el registro **vinculó caja** (`movimiento_caja_id` en la línea CC, rellenado al guardar manual con efectivo tras `sql/migracion_cc_manual_editar_eliminar_auditoria.sql`), al **editar** o **anular** la app pide **confirmación** advirtiendo caja y **auditoría**.
- Cada edición/anulación registra un evento en **`auditoria_app`** (categoría `cc_manual`, acción `editar` / `anular`). En **anular**, el campo **`detalle`** es texto **legible** (moneda, importe, fecha, concepto, pagador/cobrador con nombres de cliente/intermediario, cantidad de líneas, caja vinculada); los UUID siguen en **metadata** (`filas`, `grupo_id`, `caja_id`) para referencia técnica. En **editar**, si hubo cambios de formulario respecto del contexto cargado, `metadata.cambios` lista `{ campo, anterior, nuevo }` (roles, ids, moneda, monto, modalidad, concepto, fecha, grupo); ver **`docs/AUDITORIA_APP_CAMBIOS.md`**.
- Los movimientos generados por **órdenes/transacciones** (`es_movimiento_manual = false`) siguen editándose solo con `editar_transacciones` (no con los permisos de manual).

## Base de datos

1. `sql/migracion_cc_movimiento_manual.sql` — `es_movimiento_manual`, `manual_tip_movimiento`, permiso, RLS, y **orden_id / transaccion_id NULL** (patas sin orden).
2. `sql/migracion_cc_manual_pagador_cobrador.sql` — `manual_grupo_id`, `manual_pagador_rol`, `manual_cobrador_rol`, FKs a cliente/intermediario por lado, CHECK de roles.
3. `sql/migracion_tipos_caja_cc_manual.sql` — tipos fijos ingreso/egreso para caja desde CC manual.
4. `sql/migracion_cc_manual_editar_eliminar_auditoria.sql` — `movimiento_caja_id` en CC cliente/intermediario, tabla `auditoria_app`, permisos y RLS (manual vs orden en UPDATE; caja actualizable si está vinculada a CC manual).
5. `sql/migracion_cc_manual_editar_delete_reemplazo.sql` — DELETE en CC manual también con `editar_movimiento_cc_manual` (reemplazo al editar pagador/cobrador/monto, etc.).

Si la base tenía `orden_id` NOT NULL en CC (error *«null value in column orden_id»* al guardar manual), ejecutá también **`sql/migracion_cc_movimientos_orden_id_nullable.sql`** (o volvé a correr el bloque §4 de `migracion_cc_movimiento_manual.sql`).

Ejecutar los scripts necesarios en Supabase SQL Editor.

## Listados y columnas Pagador / Cobrador

Si la fila tiene `manual_pagador_rol` y `manual_cobrador_rol`, el front arma los nombres desde esos campos y los combos de id. Las filas antiguas solo con `manual_tip_movimiento` siguen mostrándose con la lógica previa.

## Sincronización por orden

Los sync borran movimientos con `orden_id` de esa orden. Los manuales tienen `orden_id` null y **no** se eliminan al resync.
