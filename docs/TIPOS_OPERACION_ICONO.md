# Icono de tipo de operación

## Base de datos

1. Ejecutar `sql/migracion_tipos_operacion_icono.sql` (columnas `icono_modo`, `icono_url_publica`).

## Storage (opcional, para subir imagen desde el ABM)

1. Ejecutar `sql/storage_bucket_tipo_operacion_iconos.sql` en el SQL Editor **o** crear en Dashboard un bucket **`tipo-operacion-iconos`**, marcado como **público**.
2. Sin bucket/policies, el modo **Personalizado (URL)** sigue funcionando pegando una URL `https://` válida (por ejemplo otra CDN).

## Modos en la app

| `icono_modo` | Comportamiento |
|---------------|----------------|
| `auto` | Igual que antes: según `codigo` (pares de moneda con →; si el código contiene `CHEQUE`, icono de cheques). |
| `cheque` | Siempre el icono de cheques del repo, aunque el código no diga CHEQUE. |
| `custom` | Una sola imagen desde `icono_url_publica` (solo URLs `https://`). |

El **tooltip** en listados sigue mostrando código y nombre del tipo.
