# Revisión: reglas con intermediario (cruces USD/ARS/EUR) — par ± en CC y comisiones

**Alcance de esta revisión**

- Tipos con **`usa_intermediario = true`** que son **cruces de dos monedas** en `reglas_de_negocio`: **USD-ARS**, **ARS-USD** y los derivados **EUR-USD**, **USD-EUR**, **EUR-ARS**, **ARS-EUR** (cuando existan en base, vía `sql/migracion_reglas_eur_usd_desde_usd_ars_ars_usd_int.sql` y bloque +int de `sql/migracion_reglas_eur_cruces_desde_usd_ars_ars_usd_sin_int_y_eur_ars_int.sql`).
- **Excluidos** (por pedido explícito): **CHEQUE-ARS**, **USD-USD** con intermediario.

**Fuente canónica en repo:** `sql/reglas_de_negocio_tabla.sql` + `sql/reglas_usd_ars_int_inversa_reglas_de_negocio.sql` / `sql/reglas_ars_usd_int_inversa_reglas_de_negocio.sql`.

---

## 0. Definición de producto: autocompensación en CC (orden / transacciones)

**Lo que importa** es que el **dinero “real” del movimiento ejecutado** no quede **doble contado** en cuenta corriente: en la moneda que corresponda, la **suma de movimientos** de la orden refleja bien el acuerdo.

Eso puede cumplirse de **dos maneras equivalentes** desde el punto de vista contable:

1. **Misma transacción ejecutada:** dos líneas ± que se anulan en CC (ej. **USD-USD** `P,E`: en Tx2 **−9.700 / +9.700** USD; o **ARS-USD** `P,E` sin int: el **me** en USD se netea en el egreso ejecutado).
2. **Dos transacciones de la misma orden:** al cumplirse una pata, queda el **compromiso** en una trx (suele **pendiente**) y el **cierre** en otra trx (**ejecutada**) — como en la captura de referencia: **Trans 1** −10.000.000 ARS (compromiso) + **Trans 2** +10.000.000 ARS (pago ejecutado) → **neto ARS = 0** en la orden. Es **coherente y a menudo más fiel al flujo real** (primero el acuerdo, después la ejecución).

**P,P:** sin ejecución parcial que “active” el cierre del otro lado, **no hay** (o hay poco) movimiento en CC — también coherente.

**Revisión de premisa** (tipos cubiertos por E2E + reglas en repo): en todas las combinaciones esperadas, el **detalle/saldo** netea donde debe: ver tabla siguiente y `tests/e2e/cc-tipos-activos-esperado.js`, `tests/e2e/cc-intermediario-inversa-esperado.js`, `tests/e2e/cc-combinaciones-esperado.js` (CHEQUE).

| Tipo | Notas respecto de autocompensación |
|------|-----------------------------------|
| **USD-ARS / ARS-USD sin int** (4× P/E) | `P,E`: una moneda queda en **compromiso pendiente** (Tx1); la del **pago ejecutado** se **netea** (en Tx2 con dos líneas ARS en USD-ARS, o −me/+me USD en ARS-USD según esperado). |
| **USD-USD sin int y + int** (cliente) | `P,E`: **−me/+me** en la trx ejecutada netea el pago; queda el **mr** pendiente en Tx1. `E,E`: comisión **mr−me** + cierre. |
| **USD-ARS / ARS-USD + int inverso** (`ci_pc`) | `P,E`: neteo **me** entre **Tx1 y Tx2** (misma orden), como la captura en ARS o el espejo en USD. |
| **USD-ARS / ARS-USD + int** (`cp_ic`) | Egreso ejecutado con **par ±** en la moneda de entrega **en la misma trx** donde aplica. |
| **CHEQUE-ARS** (12 combinaciones) | Múltiples transacciones; saldos/detalle alineados a `reglas_de_negocio` + E2E `01`. |
| **Cruces EUR** | Misma **lógica** que USD-ARS / ARS-USD (scripts de derivación). |

---

## 1. Definición operativa técnica (motor / `reglas_de_negocio`)

- **Operaciones no comisión (`es_comision = false`):** donde el modelo evita **doble registro** del pago/cobro en CC, se usa **par ±** sobre el **mismo `monto_origen` efectivo** (p. ej. dos filas `monto_transaccion` en la misma moneda, signos −1 / +1), **o** un par **−mr/+mr** (o **−me/+me**) en **ingreso ejecutado** con contrapartida false (tres líneas: USD netea, ARS queda abierto), **o** el par **−me (pendiente) / +me (ejecutada)** en **transacciones distintas** dentro de la misma orden (flujo inverso `P,E`).
- **Comisión (`es_comision = true`):** suele ser **una sola fila** por clave, con `condicion_estado_comision` (`par_cliente`, `par_pandy_int`, etc.); **no** se exige par ± interno: el importe es el de la comisión, no el del acuerdo principal.

En **USD-ARS** y **ARS-USD** con intermediario, en el canónico del repo **no hay** filas `es_comision = true` en los bloques **inverso (ci_pc)** ni **cp_ic**; las comisiones explícitas están en **CHEQUE-ARS** y **USD-USD+int** (fuera de alcance).

---

## 2. USD-ARS + intermediario

### 2.1 Flujo inverso (Cliente→Intermediario + Pandy→Cliente) — `reglas_de_negocio_tabla.sql` L98–116

| Clave lógica | Par ± en misma transacción | Notas |
|--------------|----------------------------|--------|
| Ingreso C→Int **ejecutada**, contrapartida **false** | **Sí en USD:** líneas 0–1 −mr/+mr USD; **ARS:** una línea −me | Netea USD en esa trx; ARS queda −me. |
| Ingreso C→Int **ejecutada**, contrapartida **true** (E,E) | **Sí en USD:** −mr/+mr (líneas 1–2); **ARS:** −me (línea 0) | Coherente con cierre en dos monedas. |
| Ingreso C→Int **pendiente**, contrapartida **true** (P,E) | **No** en una sola fila “doble”: **−me ARS** y **−mr USD** (compromisos) | El cierre del pago en ARS lo hace el **egreso** siguiente. |
| Egreso Pandy→Cliente **ejecutada**, contrapartida **false** | **Una fila** `+me` ARS | El **par que anula −me** del ingreso pendiente es **entre transacciones** (Tx1 pendiente + Tx2 ejecutada), no dos filas en la misma transacción ejecutada. Saldo ARS neto 0 en P,E; USD queda −mr. Ver E2E `COMBINACIONES_USD_ARS_INT_INVERSA` **P,E**. |
| Egreso Pandy→Cliente **ejecutada**, contrapartida **true** | Una fila `+me` ARS | Cierra contra ingreso ya en rama true. |

**Conclusión:** En **P,E** del flujo **inverso**, la definición “se anulan en CC” se cumple como **−me (Tx1) + +me (Tx2)** en ARS, no como dos filas en Tx2 sola. Es **intencional** y alineado a `tests/e2e/cc-intermediario-inversa-esperado.js`.

### 2.2 Patrón **cp_ic** (Cliente→Pandy USD + Intermediario→Cliente ARS) — L128–142

| Clave lógica | Par ± |
|--------------|--------|
| Egreso Int→Cliente **ejecutada**, contrapartida **false** | **Sí:** dos filas ARS `monto_transaccion` −1 / +1 (líneas 0–1) |
| Egreso **ejecutada**, contrapartida **true** | Una fila ARS +1 (cierra con ingreso en rama true) |

Aquí el **pago ejecutado** en la moneda de entrega **sí** lleva el par ± **en la misma transacción**, igual que sin int / ARS-USD cp_ic.

---

## 3. ARS-USD + intermediario

Espejo estructural de USD-ARS (mr/me y monedas invertidas):

- **Ingreso ejecutada false:** par **−mr/+mr en ARS** (líneas 0–1), más **−me USD** (línea 2).
- **P,E egreso Pandy→Cliente ejecutada false:** **una** fila **+me USD**; el par con **−me** va contra el ingreso pendiente (Tx1), análogo a USD-ARS.
- **cp_ic:** egreso Int→Cliente **ejecutada false** con **dos USD** `monto_transaccion` −1 / +1.

---

## 4. Cruces EUR + intermediario

Las filas se generan por **SELECT** desde USD-ARS+int y ARS-USD+int sustituyendo moneda (ARS→EUR o USD→EUR según script). **No introducen** `es_comision` nuevos: la forma del par ± se **hereda** del origen. Tras cambios en USD-ARS/ARS-USD+int, volver a ejecutar las migraciones EUR correspondientes.

---

## 5. Resumen de cumplimiento

| Bloque | ¿Egreso ejecutado con par ± en la misma trx? | ¿Comisión en estas reglas? |
|--------|-----------------------------------------------|----------------------------|
| USD-ARS int **ci_pc** P,E egreso | No (par **entre** Tx1 y Tx2 en ARS) | No |
| USD-ARS int **cp_ic** egreso ej. false | Sí (ARS −/+ `monto_transaccion`) | No |
| ARS-USD int **ci_pc** P,E egreso | No (par entre Tx1 y Tx2 en USD) | No |
| ARS-USD int **cp_ic** egreso ej. false | Sí (USD −/+ `monto_transaccion`) | No |
| Ingresos **ejecutada false** (ambos tipos) | Sí en moneda **mr** (par −/+ mr) | No |

**No se detectaron** incoherencias de **signo** ni filas de comisión faltantes en USD-ARS/ARS-USD+int respecto del modelo actual (sin contar CHEQUE ni USD-USD+int).

Si en el futuro se unifica el criterio para que **P,E ci_pc** también use **dos líneas en la trx ejecutada** (como sin int), habría que **ajustar** las filas de **ingreso pendiente** (p. ej. dejar solo la pata USD/EUR del compromiso) y actualizar **E2E 03** y motor; no es solo un `INSERT` aislado.

---

## 6. Referencias

- `docs/CC_NETEO_USD_ARS_VS_ARS_USD.md`
- `docs/REGLAS_DE_NEGOCIO.md`
- `tests/e2e/cc-intermediario-inversa-esperado.js`
- `sql/migracion_reglas_eur_usd_desde_usd_ars_ars_usd_int.sql`
