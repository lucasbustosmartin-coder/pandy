# Crear proyecto Supabase – Pandi

## Pasos

### 1. Crear proyecto en Supabase

1. Entrá a [supabase.com](https://supabase.com) e iniciá sesión.
2. **New project**: elegí nombre (ej. "pandi"), contraseña de base de datos y región.
3. Esperá a que el proyecto esté listo.

### 2. Obtener URL y API Key

1. En el dashboard: **Project Settings** (ícono engranaje) → **API**.
2. Copiá:
   - **Project URL** (ej. `https://xxxxx.supabase.co`).
   - **anon public** (para el frontend).
   - **service_role** (secret). Usala solo en scripts o entorno local, nunca en el frontend ni en el repo.

### 3. Archivo `.env` en la raíz del proyecto

En la carpeta Pandi creá `.env` (podés partir de **`.env.example`**: `cp .env.example .env`) con:

```env
SUPABASE_URL=https://TU_PROYECTO.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=<TU_SERVICE_ROLE_KEY>
```

No subas este archivo a Git (está en `.gitignore`). Opcional **`.env.local`** para pisar claves solo en tu máquina (también ignorado).

### 4. Config para el frontend

- **Local:** con `.env` completo, ejecutá `npm run dev` — se genera **`config.js`** automáticamente antes de Vite (`node scripts/build-config.js`). Guía: **`docs/DESARROLLO_LOCAL.md`**.
- **Manual (legacy):** copiar `config.example.js` a `config.js` y pegar URL + anon.
- **Vercel:** `config.js` se genera en el build desde variables de entorno (ver `docs/GIT_Y_VERCEL.md`).

### 5. Scripts SQL

**Fechas de negocio (Argentina):** ejecutá primero `sql/helpers_fecha_argentina.sql` si armás la base a mano (antes de tablas con `DEFAULT` en `fecha`). En bases ya existentes, `sql/migracion_fecha_default_columnas_argentina.sql` alinea los DEFAULT de columnas `fecha`. Convención: `docs/FECHAS_ARGENTINA.md`.

**Paridad dev/prod:** el bootstrap generado (`npm run sql:bootstrap:dev`) debe dejar **22 tablas** en `public` alineadas a la app actual (incluye `app_config` y `orden_comisiones_generadas`). Si producción tiene más, revisá tablas legacy (`cc_modelo_reglas`) o auxiliares no incluidas en el bundle (p. ej. `contingencia_import_*`). Detalle: `docs/PANDY_DEV_SUPABASE.md`.

Los archivos en `sql/` se ejecutan en el **SQL Editor** de Supabase. **Órdenes — pata intermediario en efectivo o transferencia:** `sql/migracion_orden_intermediario_pago_transferencia.sql` (columna `intermediario_pago_transferencia` en `ordenes`) y reemplazar en la base la función `ordenes_insertar_con_proximo_numero` con el contenido actual de `sql/ordenes_insertar_con_proximo_numero.sql` (parámetros `p_intermediario_pago_transferencia`, `p_intermediario_transferencia_cobra_tasa`, `p_intermediario_transferencia_tasa`). **Tasa por transferencia al intermediario:** `sql/migracion_orden_intermediario_transferencia_tasa.sql` (`intermediario_transferencia_cobra_tasa` boolean, `intermediario_transferencia_tasa` numeric nullable como fracción 0–1, misma convención que `tasa_descuento_intermediario`). **CC intermediario en cruces con TC (ARS↔USD, EUR↔USD):** ejecutar `sql/migracion_reglas_comision_intermediario_cruces_tc.sql` (filas `es_comision` + `comision_intermediario`, incluye `estado_transaccion` pendiente y ejecutada). El front fusiona reglas al sincronizar si el código de catálogo no coincide con el canónico. Pares ARS↔EUR sin USD no están modelados en `patronTipoCambioOrden` del front hasta que se agregue ese cruce. Tras aplicar o actualizar la migración, **resincronizar CC/caja** de las órdenes afectadas. Bootstrap: `scripts/concat-bootstrap-dev-sql.js`.

**Panel G/P Operativa** (tarjeta en Inicio): `sql/migracion_gp_operativa_panel.sql` — columna `incluye_gp_operativo` en `tipos_movimiento_caja`, permiso `ver_inicio_gp_operativo`, función `gp_operativa_resumen` (JSON con `caja_manual`, `caja_ordenes`, `cc_cliente`, `cc_intermediario`). Re-ejecutar el script actualiza la función si ya estaba desplegada.

**Detalle G/P Operativa** (modal «movimientos que suman» por fila): `sql/migracion_gp_operativa_detalle.sql` — función `gp_operativa_detalle(p_desde, p_hasta, p_bolsa)` devuelve un arreglo JSON de movimientos con el **mismo criterio** que cada fila del resumen (`p_bolsa`: `caja_manual` | `caja_ordenes` | `cc_cliente` | `cc_intermediario`). Incluida en bootstrap dev tras `migracion_gp_operativa_panel.sql`.

**Reglas `cp_ic` (ingreso Cliente→Pandy + egreso Intermediario→Cliente), ambas ejecutadas:** si la CC del cliente no cierra en cero (ARS/USD o cruces EUR), ejecutar `sql/migracion_reglas_cp_ic_ee_neteo_cliente_cruzadas.sql` (idempotente). Luego **volver a sincronizar** la orden (guardar estado de transacción o Refrescar en CC según flujo).

**Patrón `ci_pc` con varias entregas en moneda entregada** (ej. efectivo Pandy→Cliente + transferencia Intermediario→Cliente en la misma orden): si la CC del cliente queda con un «pendiente de cobro» igual al total `monto_entregado` pese a tener todas las transacciones ejecutadas, ejecutar `sql/migracion_reglas_ci_pc_egreso_pandy_monto_transaccion.sql` (idempotente: pasa `monto_origen` de `me` a `monto_transaccion` en egresos Pandy→Cliente `compromiso_pago`). Si tras eso, con **todas** las transacciones ejecutadas (E,E), aún queda un **compromiso de pago positivo** suelto en la moneda entregada (p. ej. solo una línea +2M sin el − que la netea), ejecutar también `sql/migracion_reglas_ci_pc_egreso_pandy_ee_linea1_negativo.sql` (agrega **linea 1** `signo −1` con `contrapartida_ejecutada = true`, análogo a `cp_ic`). Luego **resincronizar** las órdenes afectadas. El bootstrap dev y `sql/reglas_de_negocio_tabla.sql` ya traen ambas correcciones.

**USD-USD + intermediario, `cp_ic`, ingreso pendiente y egreso Int→Cliente ejecutado (P,E):** si la CC del intermediario neteaba en cero o no mostraba deuda Pandy (me + comisión int.), ejecutar `sql/migracion_usd_usd_int_cp_ic_intermediario_pe_deuda.sql` (idempotente). Quien use el script único `sql/ejecutar_supabase_cc_int_cp_ic_comision_y_regenerar_eur.sql` desde cero ya recibe las filas al día.

**Cruces dos monedas + intermediario (`USD-ARS`, `ARS-USD`, y EUR+int espejados), `cp_ic`, P,E:** si en CC intermediario el egreso Int→Cliente ejecutado (contrapartida pendiente) aparecía como **par +/−** que neteaba en cero en lugar de **una sola línea −me** (alineado a USD-USD+int), ejecutar `sql/migracion_reglas_cp_ic_int_pe_intermediario_una_sola_linea_negativa.sql` (idempotente; afecta cualquier fila que cumpla el criterio, incl. EUR clonados). Alternativa: volver a correr `sql/ejecutar_supabase_cc_int_cp_ic_comision_y_regenerar_eur.sql` tras actualizar el repo. Luego **resincronizar** órdenes afectadas.

**USD-USD + intermediario, patrón `ci_pc` (Cliente→Intermediario + Pandy→Cliente):** si faltaba el cobro **mr** en CC intermediario o la **Comisión del acuerdo** (mr−me) en CC cliente con tasas %, ejecutar `sql/migracion_usd_usd_int_ci_pc_cc_intermediario_ingreso_y_comision.sql` (idempotente). También está en `sql/ejecutar_supabase_cc_int_cp_ic_comision_y_regenerar_eur.sql` (§2c). **Motor actual:** el egreso Pandy→Cliente **no** genera fila en CC intermediario (sigue en reglas para compatibilidad; `main.js` lo omite en `ci_pc`); el saldo Pandy–intermediario queda en **+mr** del ingreso C→I y la comisión int. Ver `docs/USD_USD_CON_INTERMEDIARIO.md`. Tras migrar, **Refrescar** CC o re-guardar estado de transacción en la orden.

**USD-USD sin intermediario, cobro ejecutado y entrega al cliente pendiente (E,P):** para que la comisión implícita (`mr − me`) aparezca como línea explícita en CC sin duplicar G/P Operativa (solo entran movimientos CC **cerrados**), ejecutar `sql/migracion_usd_usd_sin_int_comision_ep_gp.sql` (idempotente). El bootstrap `sql/reglas_de_negocio_tabla.sql` ya incluye la fila.

**USD–USD con intermediario, comisión fija en USD (dos importes + intermediario por ID):** la app lee `app_config.key = usd_usd_comision_fija_config` (JSON: `intermediario_id`, `opcion_a`, `opcion_b`). Ejecutar `sql/migracion_app_config_usd_usd_comision_fija_intermediario.sql` en Supabase si la clave no existe. Configuración en **Seguridad** (solo admin). Si `intermediario_id` está vacío, se mantiene compatibilidad por nombre con la palabra «nacho».

**Movimientos de caja (alta / edición / anulación por separado):** en bases que aún usan `abm_movimientos_caja`, ejecutar `sql/migracion_permisos_movimientos_caja_granular.sql` (reemplazo en catálogo, migración de roles y RLS). Bootstrap dev lo incluye en el concat. Hasta migrar, la app trata `abm_movimientos_caja` como equivalente a los tres permisos granulares **solo en la UI**; las políticas RLS nuevas usan `has_permission('alta_movimiento_caja')`, etc., por lo que si el botón aparece pero el INSERT falla, falta ejecutar esa migración en Supabase.

**Seguridad → permisos por rol** (toggles que insertan/borran en `app_role_permission`) requieren `sql/migracion_permisos_rol_editable.sql`; sin esas políticas RLS y `GRANT INSERT, DELETE`, los cambios no persisten aunque el interruptor en pantalla parezca cambiar. **Perfiles nuevos desde la UI** (insert/delete en `app_role`, distintos de admin/encargado/visor): `sql/migracion_app_role_gestion_assign_roles.sql` — actualiza `set_user_role` y RLS de `app_role`; en instalaciones nuevas queda reflejado en `sql/supabase_seguridad.sql`.

**Panel Inicio — tarjetas pendientes por separado:** `sql/migracion_permisos_inicio_tarjetas_pendientes_split.sql` define `ver_inicio_ordenes_pendientes` y `ver_inicio_transacciones_pendientes` y los asigna a cada rol que ya tenía `ver_inicio_pendientes`. Cuando definas tablas para la app, creá los DDL en `sql/` (ej. `supabase_*.sql`) y ejecutalos en ese orden. Menús **Tipos de operación** y **Reglas de negocio (CC)** requieren permisos `abm_tipos_operacion` y `abm_reglas_negocio` (incluidos en `migracion_permisos_ordenes_transacciones.sql` y `migracion_permiso_abm_reglas_negocio.sql`; parche suelto `migracion_permiso_abm_tipos_operacion.sql` si la base ya tenía permisos viejos). Bootstrap: `docs/PANDY_DEV_SUPABASE.md`. **Tipos de operación (export):** `docs/tipos_operacion_rows.csv`; regenerar SQL de carga con `npm run sql:seed:tipos-operacion` → `sql/seed_tipos_operacion_from_docs_csv.sql` (ver comentarios en ese archivo). **Reglas de negocio (export con id):** `docs/reglas_de_negocio_rows.csv` o `docs/reglas_de_negocio_rows (2).csv`; `npm run sql:seed:reglas-de-negocio` → `sql/seed_reglas_de_negocio_from_docs_csv.sql`; detalle y riesgos en `docs/reglas_de_negocio_rows_README.md`. Para **marca / nombre visible en pantalla** (white-label): `sql/migracion_app_empresa.sql` y `docs/APP_EMPRESA.md`. Para **movimientos de CC sin orden** (manual + permiso + pagador/cobrador + tipos caja fijos + `orden_id` nullable): `sql/migracion_cc_movimiento_manual.sql`, `sql/migracion_cc_manual_pagador_cobrador.sql`, `sql/migracion_tipos_caja_cc_manual.sql`, si aplica `sql/migracion_cc_movimientos_orden_id_nullable.sql`, **edición/anulación/auditoría/caja vinculada:** `sql/migracion_cc_manual_editar_eliminar_auditoria.sql`, y `docs/CC_MOVIMIENTO_MANUAL.md`. Para **anular orden** con impacto en CC/caja usando el permiso `anular_orden`: `sql/migracion_rls_anular_orden_cc_caja.sql` (después de permisos órdenes/transacciones y RLS CC manual). Para **instrumentación manual multicontraparte** (ARS-USD / USD-ARS sin intermediario): `sql/migracion_instrumentacion_multicontraparte.sql`, `sql/migracion_transaccion_chk_pagador_cobrador_multicontraparte.sql` (CHECK pagador/cobrador con dos clientes distintos) y `docs/INSTRUMENTACION_MANUAL_MULTICONTRAPARTE.md`. **Signo «Compromiso a Cobrar» (ingreso pendiente hacia Pandy/intermediario en CC cliente):** parche idempotente `sql/migracion_reglas_compromiso_cobrar_ingreso_pendiente_signo_positivo.sql` en bases que ya tenían `signo = -1`; el canónico del repo está actualizado en `sql/reglas_de_negocio_tabla.sql`.

### 6. Proyecto de desarrollo (Excel local)

Para no pegar keys a mano: guardá **`docs/Pandy_Dev_Supabase.xlsx`** (no se versiona; está en `.gitignore`) y ejecutá `npm run dev:supabase:volcar`. Detalle de columnas: **`docs/PANDY_DEV_SUPABASE.md`**.

---

**Resumen:** Crear proyecto → copiar URL y keys → `.env` y `config.js` → ejecutar scripts en `sql/` según la app.
