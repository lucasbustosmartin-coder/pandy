# E2E: cobertura por tipo de operación (activo)

En el catálogo, la clave operativa es **`(codigo, usa_intermediario)`**: el mismo `codigo` puede tener dos filas (con y sin intermediario). Los tests deben elegir siempre **`option[data-codigo="…"][data-usa-intermediario="true|false"]`** para no ambigüedad.

## Tipos activos de referencia (export típico)

Según un listado como el tuyo, con **`activo: true`** suelen quedar **7 filas** (incluye **USD-USD** con y sin intermediario):

| `codigo`     | `usa_intermediario` | Nombre UI (ejemplo)   |
|-------------|----------------------|------------------------|
| ARS-USD     | `false`              | ARS - USD              |
| CHEQUE-ARS  | `true`               | CHEQUE – ARS           |
| USD-USD     | `false`              | USD - USD              |
| USD-USD     | `true`               | USD - USD (Int)        |
| USD-ARS     | `false`              | USD - ARS              |
| ARS-USD     | `true`               | ARS - USD (Int)        |
| USD-ARS     | `true`               | USD - ARS (Int)        |

Los demás códigos (`ARS-EUR`, `EUR-USD`, etc.) si están **inactivos** no exigen test hasta que se activen.

## Un spec de “combinaciones / reglas” por fila activa (sin duplicar)

Cada fila activa tiene **exactamente un** lugar principal de cobertura exhaustiva (matriz P/E o flujo inverso):

| Clave (`codigo` + int) | Spec principal | Qué valida |
|------------------------|----------------|------------|
| CHEQUE-ARS + `true`    | `tests/e2e/01-cc-combinaciones.spec.js` (`npm run test:e2e-cc-cheque-ars`) | 12 combinaciones Tx1..Tx4, CC cliente + intermediario, caja; modelo en `docs/CHEQUE_ARS_INTERMEDIARIO.md` |
| ARS-USD + `false`      | `tests/e2e/02-cc-tipos-activos-combinaciones.spec.js` | 4× combinaciones Tx1/Tx2 con tipos 2 tx sin intermediario |
| USD-ARS + `false`      | mismo **02**   | mismo      |
| USD-USD + `false`      | mismo **02**   | mismo      |
| USD-USD + `true`       | mismo **02** (`TIPO_USA_INTERMEDIARIO=true` si filtrás solo ese bloque; en `npm run test:e2e-cc-tipos-2tx` corre junto al resto) | 4× combinaciones Tx1/Tx2; CC cliente + caja como sin int.; CC intermediario USD en **E,E** (comisión repartida); ver `docs/USD_USD_CON_INTERMEDIARIO.md` |
| USD-ARS + `true`       | `tests/e2e/03-cc-intermediario-inversa-combinaciones.spec.js` | Flujo inverso con intermediario, 4× P/E |
| ARS-USD + `true`       | mismo **03**   | mismo      |

No hay dos specs 01/02/03 que cubran la **misma** clave `(codigo, usa_intermediario)`.

## Comando: todo lo que hay que probar de tipos **activos**, **sin repetir**

Un solo script — **solo** los specs **01 + 02 + 03** (cada tipo activo entra una vez en esta matriz; no corre **91** ni **reversa**):

```bash
npm run test:e2e-cc-activos-completo
```

---

## Qué es el archivo **91** y la **reversa** (por si aparecen en otros comandos)

- **`91-orden-cc.spec.js`**: tests extra que vuelven a crear órdenes “paso a paso” y arman otro tipo de log. **Repiten** tipos que ya cubren 01/02/03 → no hace falta correrlo si tu objetivo es solo validar **todos los activos una vez**.
- **Reversa**: un caso dentro del **91** que ejecuta transacciones y las **deshace** (vuelven a pendiente) para ver que CC y caja se corrigen. Es **otro** flujo, no es la matriz de combinaciones de tipos activos.

Si corrés `npm run test:e2e` se ejecuta **toda** la carpeta, incluidos 90, 91 y reversa → **sí** hay repetición respecto a 01/02/03.

## Selectores en UI

- Sin intermediario: `[data-usa-intermediario="false"]`
- Con intermediario: `[data-usa-intermediario="true"]`

Tras agregar en Supabase una segunda fila con el mismo `codigo`, los tests que solo filtraban por `data-codigo` **deben** actualizarse (como en `91-orden-cc.spec.js` para ARS-USD y USD-USD).

## Al activar un tipo nuevo

1. Dar de alta el tipo en `tipos_operacion` (`activo: true`).
2. Reglas CC / RPC según `docs/CORAZON_SISTEMA_CC_Y_CAJA.md`.
3. Añadir **un** spec de combinaciones o extender **02**/**03** con la clave `(codigo, usa_intermediario)` explícita.
4. Actualizar esta tabla y `docs/TESTING_E2E_GUIA.md` si aplica.
