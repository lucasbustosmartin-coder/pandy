# Revisión exhaustiva: `reglas_de_negocio` vs expectativa de simetría

Fecha de análisis: volcado en **`docs/reglas_de_negocio_rows.sql`** (126 filas).  
**Nota:** En esta carpeta **no** se encontró un segundo archivo SQL con `tipos_operacion`; para comparar catálogo vs reglas conviene exportar la tabla (ver **`docs/tipos_operacion_rows_README.md`**).

## 1. Conteos por `tipo_operacion_codigo` × `usa_intermediario`

| Código      | Sin intermediario (`false`) | Con intermediario (`true`) |
|------------|-------------------------------|----------------------------|
| ARS-USD    | 10                            | **20**                     |
| USD-ARS    | 9                             | **12**                     |
| USD-USD    | 9                             | 18                         |
| CHEQUE-ARS | —                             | 16                         |
| EUR-USD    | —                             | 20                         |
| USD-EUR    | —                             | 12                         |

### Por qué se siente “anti intuitivo”

- **ARS-USD + int (20)** vs **USD-ARS + int (12)** no son espejo en **cantidad de filas** en tu base.  
- En el repo canónico **`sql/reglas_de_negocio_tabla.sql`** ambos lados del par USD↔ARS **con intermediario** tienen **20 filas** cada uno.  
- Conclusión: en tu instancia **USD-ARS + int quedó incompleto** respecto del canónico (migraciones parciales, réplica manual antigua o limpieza selectiva), mientras **ARS-USD + int** sí refleja (o se acerca más a) la matriz grande.

## 2. Pares EUR (consecuencia directa del punto 1)

El script **`sql/migracion_reglas_eur_usd_desde_usd_ars_ars_usd_int.sql`** genera:

- **EUR-USD + int** desde **ARS-USD + int** (reemplazo ARS → EUR en columna `moneda`).
- **USD-EUR + int** desde **USD-ARS + int** (mismo reemplazo).

Si el origen es **asimétrico (20 vs 12)**, el resultado **forzosamente** es:

- **EUR-USD + int: 20**
- **USD-EUR + int: 12**

Eso **no es un bug del script**: reproduce la asimetría que ya tenías en USD↔ARS.

## 3. Calidad de datos: EUR con columna `moneda` incorrecta

En el snapshot, las filas **EUR-USD + int** muestran **muchas ocurrencias de `moneda = ARS`** y **no** reemplazo consistente por **EUR** en la pata que en el canónico era ARS.

- Para acuerdos **EUR↔USD**, el motor y la CC deben ver **EUR** y **USD** en esas filas, no ARS.
- Indica **réplica desde ARS-USD sin mapa de moneda** (o export previo a corregir).

**Acción:** ejecutar de nuevo `sql/migracion_reglas_eur_usd_desde_usd_ars_ars_usd_int.sql` **después** de alinear USD-ARS+int y ARS-USD+int con el canónico.

## 4. Orden recomendado en Supabase

1. **Igualar matrices USD↔ARS + int al canónico**  
   - Referencia: `sql/reglas_de_negocio_tabla.sql` (20 + 20 con `usa_intermediario = true`).  
   - Revisar migraciones puntuales en `sql/` (p. ej. inversas, ci_pc) si ya las usaste en el pasado.

2. **Regenerar EUR-USD / USD-EUR + int** con  
   `sql/migracion_reglas_eur_usd_desde_usd_ars_ars_usd_int.sql`.

3. **Volver a exportar** `docs/reglas_de_negocio_rows.sql` si lo usás como evidencia documental.

4. **Exportar** `tipos_operacion` al archivo indicado en `docs/tipos_operacion_rows_README.md` para futuras revisiones cruzadas.

## 5. Relación con documentación existente

- **`docs/REGLAS_CRUCE_INVERSO_CONSISTENCIA.md`** — mismo diagnóstico, foco EUR y réplicas.  
- **`docs/CC_NETEO_USD_ARS_VS_ARS_USD.md`** — por qué el **negocio** del inverso no es idéntico fila a fila, pero la **matriz de reglas** en repo está pensada para **misma cardinalidad** por tipo+int.

## 6. Resumen en una frase

La diferencia de cantidad de reglas entre **ARS-USD+int** y **USD-ARS+int** en tu dump es **principalmente un desvío respecto del canónico del repo (12 vs 20)**; al replicar a EUR se **propaga** (20 vs 12) y además pueden quedar **monedas ARS** bajo códigos EUR si no se aplica la migración SQL de reemplazo.
