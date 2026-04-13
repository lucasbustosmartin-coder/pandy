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
