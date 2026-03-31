# Credenciales Supabase de desarrollo (Pandy-Dev)

## Archivo Excel

1. Guardá el libro como **`docs/Pandy_Dev_Supabase.xlsx`** (primera hoja).
2. **Fila 1:** encabezados. **Fila 2:** valores (una sola fila de datos).

Encabezados reconocidos (el script ignora mayúsculas y espacios extra):

| Columna (ejemplo) | Uso |
|-------------------|-----|
| Proyecto | Solo comentario en `.env` |
| Pass_DB | Contraseña de Postgres (opcional, va a `.env` como `SUPABASE_DB_PASSWORD`) |
| Project URL | URL del proyecto; si pegás solo el ref (`https://xxxxx` o `xxxxx`), se completa a `https://xxxxx.supabase.co` |
| Publishable key | Opcional; queda como comentario en `.env` (el front usa **anon public**) |
| anon public | Clave **anon** para el navegador |
| service_role | Clave **service_role** para scripts/tests (no exponer en el front) |

## Volcar a `.env` y `config.js`

Desde la raíz del repo:

```bash
node scripts/volcar-pandy-dev-supabase.js
```

Eso genera o sobrescribe:

- **`.env`** — `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, etc.
- **`config.js`** — `window.SUPABASE_URL` y `window.SUPABASE_ANON_KEY` para Vite en local.
- **`.env.test`** — actualiza o crea `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` al **mismo proyecto (Pandy-Dev)** para que Playwright y `limpiar_base_e2e` no queden apuntando a producción u otro ref. Conserva el resto de líneas (`TEST_USER_*`, etc.). Si no existe `.env.test`, parte de `.env.test.example`.

Ambos archivos están en **`.gitignore`**: no se suben a Git.

## Seguridad

- **`Pandy_Dev_Supabase.xlsx` está en `.gitignore`**: no lo commitees; contiene secretos.
- Si alguna vez se subió con credenciales, rotá las keys en Supabase y borrá el archivo del historial de Git.

## Un solo SQL de bootstrap (migraciones en orden)

Para no ejecutar docenas de pasos en el SQL Editor en un **proyecto nuevo** (o reprovisión), podés generar un único archivo concatenado:

```bash
npm run sql:bootstrap:dev
```

Eso escribe **`sql/_generado_bootstrap_pandy_dev.sql`** (no se versiona; está en `.gitignore`). Pegalo completo en el SQL Editor de Supabase y ejecutalo **una vez**.

**Qué incluye:** `helpers_fecha_argentina.sql` (función `fecha_hoy_argentina()` para defaults y RPCs en calendario Argentina), base `supabase_*`, permisos (incluye `ver_cajas_efectivo` / `ver_cajas_banco` / `ver_cajas_cheque` vía `migracion_ver_cajas_*.sql` y panel), estados, números de orden/transacción, `ordenes.tasa_descuento_intermediario` (CHEQUE/ARS-ARS), columnas de CC/caja alineadas a `sync_cc_caja_orden`, **CC manual** (tipos de caja fijos, columnas y permisos, pagador/cobrador, auditoría y RLS, políticas con `anular_orden`), tipos de operación (`moneda_in` / `moneda_out`, usa_intermediario, orden visual, icono), `reglas_de_negocio_tabla`, **`app_config`** (timeout de sesión en Seguridad; `sql/app_config_session_timeout.sql`), **`orden_comisiones_generadas`** + parche `migracion_orden_comisiones_movimiento_caja.sql` (ganancia Pandy / comisión intermediario; misma tabla que usa `main.js`), RPCs `transacciones_cambiar_estado` y `sync_cc_caja_orden`, `ordenes_insertar_con_proximo_numero`.

**Tablas en `public` tras el bootstrap (22):** `clientes`, `tipos_movimiento_caja`, `ordenes`, `movimientos_caja`, `movimientos_cuenta_corriente`, `user_profiles`, `app_role`, `app_permission`, `app_role_permission`, `app_user_profile`, `tipos_operacion`, `modos_pago`, `intermediarios`, `comisiones_orden`, `instrumentacion`, `transacciones`, `movimientos_cuenta_corriente_intermediario`, `app_empresa`, `app_config`, `auditoria_app`, `reglas_de_negocio`, `orden_comisiones_generadas`. Si en **producción** contás **más** filas en `information_schema.tables` para `public`, suele ser **`cc_modelo_reglas`** (legacy, el front ya no la usa) o tablas de **contingencia** (`contingencia_import_*` en `sql/migracion_contingencia_import_staging.sql`), que no forman parte del bootstrap dev.

Si ya tenías la base creada **antes** de que `migracion_permisos_ordenes_transacciones.sql` incluyera `abm_tipos_operacion`, ejecutá una vez **`sql/migracion_permiso_abm_tipos_operacion.sql`** para ver el menú **Tipos de operación** y poder editar el catálogo con RLS acorde.

**Qué no incluye (a mano):**

- `sql/supabase_admin_inicial.sql` — depende del email del usuario en Auth.
- `sql/migracion_tipos_operacion_unique_codigo_usa_intermediario.sql` — toca `cc_modelo_reglas` (legacy); en bases sin esa tabla falla.
- **Bucket de iconos** (`tipo-operacion-iconos`): ejecutá en el SQL Editor `sql/storage_bucket_tipo_operacion_iconos.sql` en el proyecto **dev** si querés subir iconos custom desde la app (misma política que producción). Si `tipos_operacion.icono_url_publica` o `app_empresa.logo_url` apuntan a la URL de **otro** proyecto Supabase o a un objeto que no existe en dev, el navegador no cargará la imagen: la app hace **fallback** (icono IN→OUT según código y favicon local para el logo de cabecera/modal), pero conviene dejar la URL vacía, usar `/assets/…` o resubir al bucket del proyecto dev.
- Otras migraciones puntuales de bases ya desplegadas — ver `docs/SUPABASE_REQUISITOS.md`.

El orden de los fragmentos lo mantiene **`scripts/concat-bootstrap-dev-sql.js`** (lista explícita); si agregás migraciones nuevas al bootstrap, editá ese script y volvé a generar.

**Catálogo de tipos de operación (export LyP):** en **`docs/tipos_operacion_rows.csv`** está el volcado de filas (id, código, monedas, `usa_intermediario`, `orden_visual`, etc.). Para generar SQL que borre y repueble `tipos_operacion` con esos datos: `npm run sql:seed:tipos-operacion` → **`sql/seed_tipos_operacion_from_docs_csv.sql`**. Ejecutalo en el SQL Editor **solo** en bases sin órdenes que referencien `tipo_operacion_id` (o tras limpiar). El bootstrap ya incluye **`migracion_tipos_operacion_unique_solo_uq.sql`** para permitir el mismo `codigo` con distinto `usa_intermediario`.

**Reglas de negocio (export con id):** guardá el CSV como **`docs/reglas_de_negocio_rows.csv`** o **`docs/reglas_de_negocio_rows (2).csv`**. `npm run sql:seed:reglas-de-negocio` genera **`sql/seed_reglas_de_negocio_from_docs_csv.sql`**: vacía `reglas_de_negocio`, alinea la `UNIQUE` con **`entidad_cc`** (evita error 23505 en bases con unicidad vieja) y reinserta desde el CSV. **Backup antes** en cualquier entorno con datos; la matriz canónica del repo sigue siendo **`sql/reglas_de_negocio_tabla.sql`**. Más detalle: **`docs/reglas_de_negocio_rows_README.md`**.

## Referencia general

Ver también `docs/SUPABASE_REQUISITOS.md` y tests E2E: `.env.test` / `docs/TESTING_E2E_GUIA.md`.
