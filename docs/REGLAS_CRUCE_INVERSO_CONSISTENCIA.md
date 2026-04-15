# Cruce de monedas inverso: misma cantidad de filas y monedas correctas

## Qué pasó con EUR-USD / USD-EUR (+ intermediario)

En el snapshot `docs/reglas_de_negocio_rows.sql` (export real de la base):

| Tipo        | `usa_intermediario` | Filas (dump reciente) | Monedas en columna `moneda` |
|------------|---------------------|------------------------|-----------------------------|
| **USD-EUR** | true                | **12** | Suele incluir **ARS** si se replicó desde USD-ARS sin mapa → incorrecto para EUR |
| **EUR-USD** | true                | **20** | Suele incluir **ARS** si se replicó desde ARS-USD sin mapa → incorrecto para EUR |

La **replicación mecánica** en la app copia todas las filas de un código a otro **sin**:

1. Renombrar la columna **`moneda`**: si el origen era USD-ARS / ARS-USD, donde aparece **ARS** debe pasar a **EUR** para tipos EUR-USD / USD-EUR.
2. Garantizar que **ambos** sentidos del par usen la **misma plantilla de filas**.

En tu base, además:

- **USD-ARS + int** tiene **12** filas en el dump.
- **ARS-USD + int** tiene **20** filas.

Eso ya es **asimétrico** entre el par USD↔ARS: en el script canónico `sql/reglas_de_negocio_tabla.sql`, **cada uno** de USD-ARS+int y ARS-USD+int tiene **20** filas (bloque intermediario + bloque pandy/cierre). Si en producción USD-ARS+int quedó en 12, conviene **re-alinear** USD-ARS+int con la tabla SQL antes de confiar en réplicas.

### Conclusión

- **No es consistente** que EUR-USD tenga 20 y USD-EUR 12 **si** la intención es un par espejo completo: indica que un tipo se replicó desde **ARS-USD** (20) y el otro desde **USD-ARS** (12 en tu dump).
- Las filas con **moneda ARS** bajo códigos EUR son **error de datos** para esos tipos (el motor y la CC esperan **EUR** y **USD** según el acuerdo).

## Asimetría ARS-USD + int vs USD-ARS + int (sin hablar aún de EUR)

En muchas bases “crecidas” a mano, **ARS-USD+int** acumula más filas que **USD-ARS+int** porque:

- Se fueron agregando variantes (pendiente/ejecutada, ci_pc, líneas por pata) primero en un sentido del cruce.
- El canónico del repo **`sql/reglas_de_negocio_tabla.sql`** define **20 filas** para **cada uno** con `usa_intermediario = true`. Si en tu base ves **20 vs 12**, lo intuitivo (“mismo par, misma cantidad de reglas”) **sí** corresponde al diseño del repo: hay que **completar USD-ARS+int** hasta alinearlo al canónico, no asumir que 12 está “bien” solo porque cierra un flujo puntual.

Índice de revisión con tabla de conteos: **`docs/REVISION_EXHAUSTIVA_REGLAS_Y_TIPOS_OPERACION.md`**.

## Qué hacer en base

1. **Antes de EUR:** igualar **USD-ARS + int** y **ARS-USD + int** al canónico (**20 + 20** en `reglas_de_negocio_tabla.sql` + migraciones que apliquen a tu esquema).
2. **Opción recomendada para EUR (+ intermediario):** ejecutar `sql/migracion_reglas_eur_usd_desde_usd_ars_ars_usd_int.sql` (después de revisar el comentario del script). Eso **borra** reglas EUR-USD/USD-EUR+int y las **vuelve a generar** desde las filas actuales de **USD-ARS+int** y **ARS-USD+int**, mapeando `moneda` **ARS → EUR**. Así **EUR-USD** y **USD-EUR** quedan con el **mismo** reparto 20/20 que el par ARS origen.
3. **Sin intermediario (un solo SQL, 12×6):** ejecutar **`sql/migracion_reglas_todos_cruces_dos_monedas_sin_int_canonico.sql`**: borra y recarga **USD-ARS, ARS-USD, EUR-USD, USD-EUR, EUR-ARS, ARS-EUR** con `usa_intermediario = false` (**12 filas** cada tipo, incluye P,P con `contrapartida_ejecutada = false`; EUR siempre derivado de USD-ARS/ARS-USD). **No toca USD-USD ni reglas con intermediario.**
4. **Sin int parcial o +int EUR-ARS/ARS-EUR:** **`sql/migracion_reglas_eur_cruces_desde_usd_ars_ars_usd_sin_int_y_eur_ars_int.sql`** (bloques A/B/C según necesidad). **No toca USD-USD.**

## Referencia de conteos en `reglas_de_negocio_tabla.sql` (canónico)

- **USD-ARS** / **ARS-USD** + `usa_intermediario = false`: **12** filas cada uno (cruces dos monedas; script unificado: `sql/migracion_reglas_todos_cruces_dos_monedas_sin_int_canonico.sql`).
- **USD-ARS** + `usa_intermediario = true`: **20** filas.
- **ARS-USD** + `usa_intermediario = true`: **20** filas.

Un par nuevo **USD / EUR** debería mantener la **misma** relación: dos matrices del **mismo tamaño**, con **EUR** donde el canónico usa **ARS**.

## Réplica en la app

Hasta que la app replique con **mapa de monedas** (ARS→EUR, etc.) y opción “espejo del inverso”, después de **Replicar matriz** hay que **revisar monedas** y, si hace falta, **borrar** las filas EUR y aplicar la migración SQL anterior.
