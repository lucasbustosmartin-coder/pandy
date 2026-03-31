# Configuración de empresa / marca (white-label)

La app muestra un **nombre comercial** y **logo** configurables (login, cabecera, textos de ayuda y etiquetas de participante `pandy`). Los datos internos de negocio (`pagador` / `cobrador` = `'pandy'`) **no cambian**.

## Supabase

1. Ejecutar en el SQL Editor: `sql/migracion_app_empresa.sql`.
2. **RLS:** lectura `anon` + `authenticated`; **INSERT/UPDATE** solo rol `admin`.
3. **Permiso de menú:** `abm_configuracion_empresa` — asignado solo a **admin** en la migración. Otros roles pueden recibirlo desde Seguridad si se desea.

## Campos (`app_empresa`, fila `id = 1`)

| Columna         | Uso |
|----------------|-----|
| `nombre_legal` | Referencia legal (formulario Configuración). |
| `nombre_sistema` | Texto que reemplaza la marca visible “Pandy” / “Pandi” en la UI. |
| `logo_url`     | Vacío = favicon por defecto; o ruta relativa (`/assets/...`) o URL **https** segura (p. ej. pública de Supabase Storage). |

## Logo: subida (igual que Tipos de operación)

En la vista **Empresa / marca**, el botón **Subir imagen** usa el mismo bucket público **`tipo-operacion-iconos`** que el ABM de tipos de operación (script `sql/storage_bucket_tipo_operacion_iconos.sql`). Los archivos quedan bajo la carpeta lógica **`empresa-marca/`** en ese bucket.

### Qué archivo elegir para parecerse al logo actual

El logo por defecto de la app es **`/assets/favicon-192x192.png`**: imagen **cuadrada** (192×192 px), **PNG**, con el dibujo del panda; en cabecera y login se muestra dentro de un **círculo** con `object-fit: contain` (igual que el favicon).

En **Preview de Vercel** (`VERCEL_ENV=preview`) el build usa **`/assets/favicon-192x192-dev.png`**: mismo estilo con la **cara del panda en celeste**, para distinguir rápido de producción. En local podés forzar lo mismo con `PANDI_DEV_ICON=1` al correr `npm run build` (junto con `build-config.js`) o definiendo `window.PANDI_ICON_192_DEFAULT` en `config.js` (ver `config.example.js`).

Para un resultado similar al “hardcode” actual:

- **Formato:** **PNG** (también permitidos: JPEG, WebP, AVIF, GIF, SVG — mismos MIME que el bucket).
- **Proporción:** **cuadrada** (1:1), ideal **192×192** o al menos **128×128** px.
- **Fondo:** transparente o blanco, para que el círculo no recorte mal el dibujo.

## Vista en la app

Menú **Empresa / marca** (solo quien tenga el permiso). Tras guardar, la marca se aplica en toda la sesión sin recargar la página.
