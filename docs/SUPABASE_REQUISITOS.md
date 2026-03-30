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

En la carpeta Pandi creá `.env` con:

```env
SUPABASE_URL=https://TU_PROYECTO.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=<TU_SERVICE_ROLE_KEY>
```

No subas este archivo a Git (está en `.gitignore`).

### 4. Config para el frontend

Copiá `config.example.js` a `config.js` y pegá la **anon key** y la **URL** del proyecto. En Vercel, `config.js` se genera en el build desde variables de entorno (ver `docs/GIT_Y_VERCEL.md`).

### 5. Scripts SQL

**Paridad dev/prod:** el bootstrap generado (`npm run sql:bootstrap:dev`) debe dejar **22 tablas** en `public` alineadas a la app actual (incluye `app_config` y `orden_comisiones_generadas`). Si producción tiene más, revisá tablas legacy (`cc_modelo_reglas`) o auxiliares no incluidas en el bundle (p. ej. `contingencia_import_*`). Detalle: `docs/PANDY_DEV_SUPABASE.md`.

Los archivos en `sql/` se ejecutan en el **SQL Editor** de Supabase. **Panel G/P Operativa** (tarjeta en Inicio): `sql/migracion_gp_operativa_panel.sql` — columna `incluye_gp_operativo` en `tipos_movimiento_caja`, permiso `ver_inicio_gp_operativo`, función `gp_operativa_resumen` (JSON con `caja_manual`, `caja_ordenes`, `cc_cliente`, `cc_intermediario`). Re-ejecutar el script actualiza la función si ya estaba desplegada.

**Reglas `cp_ic` (ingreso Cliente→Pandy + egreso Intermediario→Cliente), ambas ejecutadas:** si la CC del cliente no cierra en cero (ARS/USD o cruces EUR), ejecutar `sql/migracion_reglas_cp_ic_ee_neteo_cliente_cruzadas.sql` (idempotente). Luego **volver a sincronizar** la orden (guardar estado de transacción o Refrescar en CC según flujo).

**USD-USD + intermediario, `cp_ic`, ingreso pendiente y egreso Int→Cliente ejecutado (P,E):** si la CC del intermediario neteaba en cero o no mostraba deuda Pandy (me + comisión int.), ejecutar `sql/migracion_usd_usd_int_cp_ic_intermediario_pe_deuda.sql` (idempotente). Quien use el script único `sql/ejecutar_supabase_cc_int_cp_ic_comision_y_regenerar_eur.sql` desde cero ya recibe las filas al día.

**USD-USD sin intermediario, cobro ejecutado y entrega al cliente pendiente (E,P):** para que la comisión implícita (`mr − me`) aparezca como línea explícita en CC sin duplicar G/P Operativa (solo entran movimientos CC **cerrados**), ejecutar `sql/migracion_usd_usd_sin_int_comision_ep_gp.sql` (idempotente). El bootstrap `sql/reglas_de_negocio_tabla.sql` ya incluye la fila.

**Seguridad → permisos por rol** (toggles que insertan/borran en `app_role_permission`) requieren `sql/migracion_permisos_rol_editable.sql`; sin esas políticas RLS y `GRANT INSERT, DELETE`, los cambios no persisten aunque el interruptor en pantalla parezca cambiar. Cuando definas tablas para la app, creá los DDL en `sql/` (ej. `supabase_*.sql`) y ejecutalos en ese orden. Menús **Tipos de operación** y **Reglas de negocio (CC)** requieren permisos `abm_tipos_operacion` y `abm_reglas_negocio` (incluidos en `migracion_permisos_ordenes_transacciones.sql` y `migracion_permiso_abm_reglas_negocio.sql`; parche suelto `migracion_permiso_abm_tipos_operacion.sql` si la base ya tenía permisos viejos). Bootstrap: `docs/PANDY_DEV_SUPABASE.md`. **Tipos de operación (export):** `docs/tipos_operacion_rows.csv`; regenerar SQL de carga con `npm run sql:seed:tipos-operacion` → `sql/seed_tipos_operacion_from_docs_csv.sql` (ver comentarios en ese archivo). **Reglas de negocio (export con id):** `docs/reglas_de_negocio_rows.csv` o `docs/reglas_de_negocio_rows (2).csv`; `npm run sql:seed:reglas-de-negocio` → `sql/seed_reglas_de_negocio_from_docs_csv.sql`; detalle y riesgos en `docs/reglas_de_negocio_rows_README.md`. Para **marca / nombre visible en pantalla** (white-label): `sql/migracion_app_empresa.sql` y `docs/APP_EMPRESA.md`. Para **movimientos de CC sin orden** (manual + permiso + pagador/cobrador + tipos caja fijos + `orden_id` nullable): `sql/migracion_cc_movimiento_manual.sql`, `sql/migracion_cc_manual_pagador_cobrador.sql`, `sql/migracion_tipos_caja_cc_manual.sql`, si aplica `sql/migracion_cc_movimientos_orden_id_nullable.sql`, **edición/anulación/auditoría/caja vinculada:** `sql/migracion_cc_manual_editar_eliminar_auditoria.sql`, y `docs/CC_MOVIMIENTO_MANUAL.md`. Para **anular orden** con impacto en CC/caja usando el permiso `anular_orden`: `sql/migracion_rls_anular_orden_cc_caja.sql` (después de permisos órdenes/transacciones y RLS CC manual). Para **instrumentación manual multicontraparte** (ARS-USD / USD-ARS sin intermediario): `sql/migracion_instrumentacion_multicontraparte.sql`, `sql/migracion_transaccion_chk_pagador_cobrador_multicontraparte.sql` (CHECK pagador/cobrador con dos clientes distintos) y `docs/INSTRUMENTACION_MANUAL_MULTICONTRAPARTE.md`. **Signo «Compromiso a Cobrar» (ingreso pendiente hacia Pandy/intermediario en CC cliente):** parche idempotente `sql/migracion_reglas_compromiso_cobrar_ingreso_pendiente_signo_positivo.sql` en bases que ya tenían `signo = -1`; el canónico del repo está actualizado en `sql/reglas_de_negocio_tabla.sql`.

### 6. Proyecto de desarrollo (Excel local)

Para no pegar keys a mano: guardá **`docs/Pandy_Dev_Supabase.xlsx`** (no se versiona; está en `.gitignore`) y ejecutá `npm run dev:supabase:volcar`. Detalle de columnas: **`docs/PANDY_DEV_SUPABASE.md`**.

---

**Resumen:** Crear proyecto → copiar URL y keys → `.env` y `config.js` → ejecutar scripts en `sql/` según la app.
