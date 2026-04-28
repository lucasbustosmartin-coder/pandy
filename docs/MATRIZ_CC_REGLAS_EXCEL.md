# Matriz Excel — CC según `reglas_de_negocio` y `cc_modelo_reglas`

Sirve para **auditar en frío** qué combinaciones (tipo de operación, con/sin intermediario, pagador/cobrador, ingreso/egreso, comisión, estado de transacción, contrapartida ejecutada, línea) declaran movimientos en **cuenta corriente del cliente** y/o **del intermediario**, según lo que está cargado en **Supabase**. Complementa la narrativa de `docs/CC_MODELO_MATRIZ_COMPLETA.md` y `docs/CC_MODELO_TABLA_REGLAS.md` con un **volcado tabular** desde la base real (prod o dev).

En **Pandy producción** la tabla `cc_modelo_reglas` puede **no existir** (migración a una sola fuente: `docs/MIGRACION_UNA_TABLA_REGLAS_DE_NEGOCIO.md` / `sql/migracion_drop_cc_modelo_reglas.sql`). En ese caso el Excel trae la hoja **CC_modelo_reglas** vacía y la matriz operativa está **solo** en **Reglas_de_negocio** — es lo esperado.

### Borrador vinculado: composición CC estable vs estados del ciclo

Para evaluar con el cliente el objetivo de que la **composición** de movimientos en cuenta corriente sea **coherente en todo el ciclo** (equivalente al cierre, persistiendo pendiente/ejecutado como en la nueva regla MonR/MonE), usar el borrador **`docs/BORRADOR_CC_COMPOSICION_FIJA_ESTADO.md`**: indica **qué hojas del mismo Excel** cruzar (**Matriz**, **Reglas_de_negocio**, **Resumen_por_tipo**) y un checklist de fases. El archivo **`docs/MATRIZ_CC_REGLAS_MOVIMIENTOS.xlsx`** es el artefacto común.

## Registro breve (auditoría)

- **2026-04-28:** Regenerado con `npm run excel:matriz-cc-reglas` antes de ventana de deploy; artefacto `docs/MATRIZ_CC_REGLAS_MOVIMIENTOS.xlsx`. **Deploy producción:** conviene push a `main` **≥ 20:00 ART** (ver `docs/GIT_Y_VERCEL.md` § **4a**).
- **2026-04:** Tras cambios en motor CC / G&P / E2E, regenerar este Excel con el mismo proyecto Supabase que use la app (`npm run excel:matriz-cc-reglas`). La hoja **Matriz** también refleja `scripts/matriz-cc-combinaciones-activas.js` (ramas `[main] …`); si solo tocó G/P SQL (`gp_operativa_*`), la matriz CC puede no variar pero conviene **volver a exportar** para fecha de archivo y coherencia con `reglas_de_negocio` vigentes.

## Generar el Excel

1. En la raíz del repo, `.env` con al menos:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` (recomendado; con solo `anon` puede fallar por RLS según políticas del proyecto)

2. Ejecutar:

```bash
npm run excel:matriz-cc-reglas
```

Por defecto escribe **`docs/MATRIZ_CC_REGLAS_MOVIMIENTOS.xlsx`**. Otra ruta:

```bash
node scripts/export-matriz-cc-reglas-excel.js --out=/ruta/MATRIZ_CC.xlsx
```

3. Tras migraciones SQL en Supabase, **cambios en `reglas_de_negocio`**, o cambios en el **motor / sync CC** en `main.js` (incluye `matriz-cc-combinaciones-activas.js` para la hoja **Matriz**), **volver a correr** el comando sobre el mismo proyecto para refrescar la matriz. Obligatorio en flujo de agente: reglas **reglas-pandi** (Matriz Excel CC) y **documentacion-siempre-actualizada**.

## Contenido del archivo

| Hoja | Contenido |
|------|-----------|
| **Leyenda** | Qué es cada hoja, límites (qué **no** está en tablas), glosario de `monto_origen` y `concepto_leyenda`. |
| **Tipos_operacion** | Catálogo (`codigo`, monedas, `usa_intermediario`, etc.) tal cual en BD. |
| **Resumen_por_tipo** | Por cada par `(tipo_operacion_codigo, usa_intermediario)`: conteo de filas en `reglas_de_negocio` vs `cc_modelo_reglas` y nota sobre qué motor suele usar la app. |
| **Reglas_de_negocio** | Matriz completa exportada; **una fila = una receta de movimiento CC** (`entidad_cc` = cliente o intermediario). |
| **CC_modelo_reglas** | Matriz paralela con columnas separadas cliente / intermediario (signo, suma saldo, incluir en mov, exposición moneda, referencia monto). |
| **Movimientos_desde_reglas** | Igual que reglas con columna **`texto_movimiento_cc`** legible para revisión humana. |
| **Matriz** | **68** filas por tipo×combinación (E2E 01/02/03) + **21** filas **`[main] …`** con ramas solo en **main.js** (multicontraparte manual desglosada en **cinco** filas-arquetipo + auto-sync, compensación, nueva regla MonR/MonE, préstamo regla B, CC manual usuario, dedupe, invariante, legacy, etc.). Movimientos CC en **líneas cortas** con signo **+ / −**. Código: `scripts/matriz-cc-combinaciones-activas.js`. Detalle MC: `docs/INSTRUMENTACION_MANUAL_MULTICONTRAPARTE.md`. |

### Certeza y cómo verificar (hoja **Matriz**)

Las columnas **Nivel certeza** y **Como verificar** resumen qué tan fuerte es la evidencia automática para cada fila al evaluar impacto con el cliente:

- **A**: E2E o tests unitarios con asserts / invariantes alineados al caso; la columna **Como verificar** incluye comandos `npm run …` (con `COMBINACION_ID` cuando aplica) y referencias a archivos de expectativa en `tests/e2e/`.
- **B**: evidencia cruzando **main.js** y la hoja **Reglas_de_negocio** del mismo Excel (o SQL); puede no existir un E2E por fila.
- **C**: principalmente revisión de código o prueba manual en entorno; la matriz no reemplaza leer las ramas indicadas.

El detalle del significado A/B/C también está en la hoja **Leyenda** del `.xlsx`.

Los **signos** numéricos (`-1`, `1`) y **`linea`** quedan como **números** en Excel para poder filtrar y pivotear (criterio LyP de importes numéricos donde aplica).

## Qué **no** cubre del todo (importante)

- Las hojas **Reglas_de_negocio** / **Movimientos_desde_reglas** son solo lo declarado en SQL.
- La hoja **Matriz** resume ramas **`[main] …`** (MC, compensación, nueva regla, etc.) con texto **corto** y signos **+ / −**; **no** reemplaza leer `main.js` ni cubre cada bifurcación interna (p. ej. cada subcaso de `aplicarCcMulticontraparteManualConciliacionCompleta`).
- Sigue haciendo falta tests (`npm run test:unit-cc-invariante-nueva-regla`, E2E CC) y `docs/CUENTA_CORRIENTE_Y_CAJA.md` / `docs/NUEVA_REGLA_CC_PATA_MONR_MONE.md` para validar regresiones.

## Motor en runtime (recordatorio)

Si existen filas en **`reglas_de_negocio`** para `(tipo_operacion_codigo, usa_intermediario)`, el flujo principal de sync CC suele basarse en **esa tabla** (una fila → un movimiento potencial). **`cc_modelo_reglas`** sigue siendo fuente de verdad declarada para tipos/variantes que aún la usan o para comparar con el modelo documentado; la hoja **Resumen_por_tipo** ayuda a ver si una clave quedó solo en una de las dos.
