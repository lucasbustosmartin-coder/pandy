# Supabase MCP en Cursor (token fuera de `mcp.json`)

La configuración global de Cursor vive en **`~/.cursor/mcp.json`**. Para **no guardar el Personal Access Token (PAT) de Supabase en ese JSON** (evita copiar/pegar el archivo, backups, capturas, etc.), se usa:

1. **`envmcp`** (`npx -y envmcp`): carga variables desde un archivo y ejecuta el comando del servidor MCP.
2. **`~/.cursor/supabase-mcp.env`**: archivo **local**, **no versionado**, con una sola variable obligatoria para el servidor stdio de Supabase:

```bash
SUPABASE_ACCESS_TOKEN=<TU_PERSONAL_ACCESS_TOKEN_SUPABASE>
```

3. **Permisos**: el archivo real debería ser legible solo por tu usuario, p. ej. `chmod 600 ~/.cursor/supabase-mcp.env`.

## Referencia de configuración

En `~/.cursor/mcp.json` el servidor `supabase` debe invocar algo equivalente a:

- `npx -y envmcp --env-file /Users/TU_USUARIO/.cursor/supabase-mcp.env npx -y @supabase/mcp-server-supabase@latest`

El paquete oficial del servidor lee el token con **`process.env.SUPABASE_ACCESS_TOKEN`** si no pasás `--access-token` en la línea de comandos (ver código fuente: `cliAccessToken ?? process.env.SUPABASE_ACCESS_TOKEN`).

## Plantilla

En **`~/.cursor/supabase-mcp.env.example`** hay una plantilla sin secretos. Copiala a **`supabase-mcp.env`** y completá el token.

## Rotación del token

Si el PAT pudo verse en un chat, log o captura: en **Supabase Dashboard → Account → Access Tokens** revocá el token antiguo, generá uno nuevo y actualizá solo **`~/.cursor/supabase-mcp.env`**. No hace falta tocar `mcp.json`.

## Alternativa oficial (HTTP + OAuth)

Supabase documenta también el servidor MCP por URL **`https://mcp.supabase.com/mcp`** con flujo de login en el cliente, sin PAT en archivo local. Si migrás a ese modo, seguí la guía en [Supabase MCP](https://supabase.com/docs/guides/getting-started/mcp).

## Uso en Cursor (agente)

Con el MCP enlazado, el agente debe seguir la regla **`.cursor/rules/supabase-mcp.mdc`** (siempre activa): usar el MCP de forma proactiva para SQL, advisors y proyectos **Pandy** / **Pandy-Dev**, y mantener `sql/` + `docs/` alineados tras cambios en la base.

### Dos proyectos (producción y desarrollo)

Mismo criterio para **ambos**: migraciones / `CREATE OR REPLACE` / RLS / parches idempotentes deben aplicarse a **Pandy (prod)** y **Pandy-Dev** salvo que el usuario diga explícitamente solo uno. Confirmar refs vigentes con **`list_projects`** (puede haber homónimos inactivos).

| Entorno | Nombre Supabase | `project_id` (ref) habitual |
|---------|-----------------|----------------------------|
| Producción | **Pandy** | `bxwxuzbahewvptarlnxm` |
| Desarrollo | **Pandy-Dev** | `ozsofsmnuzliczfphqze` |

Desarrollo en Vercel Preview usa la base **dev**; producción usa **prod** — ver `docs/GIT_Y_VERCEL.md`.

### Nombre del servidor en `call_mcp_tool` (importante)

La herramienta del host es **`call_mcp_tool`**. El argumento **`server`** debe coincidir con el **`serverIdentifier`** que Cursor genera para ese proceso MCP, no siempre con la clave del JSON.

- En configuraciones típicas con `~/.cursor/mcp.json` bajo la clave `"supabase"`, el identificador suele ser **`user-supabase`** (prefijo `user-` + nombre de la entrada).
- Si aparece *MCP server does not exist: supabase*, probá **`user-supabase`**.
- Referencia local al workspace: carpeta **`.cursor/projects/.../mcps/user-supabase/SERVER_METADATA.json`** (`serverIdentifier` / `serverName`).

Para DDL grande, el propio MCP recomienda **`apply_migration`** en lugar de `execute_sql` cuando aplique; revisar el descriptor en `mcps/user-supabase/tools/`.
