# Tipo de operación: moneda **Cheque** (CHEQUE–ARS)

## Objetivo

Poder definir operaciones con código legible (ej. `CHEQUE-ARS` o `ARS-CHEQUE`) usando **Moneda IN / OUT** con valor **Cheque** en el ABM de tipos, sin depender solo del código legacy `ARS-ARS`.

## Reglas

1. **Catálogo `tipos_operacion`**: `moneda_in` y `moneda_out` pueden ser `USD`, `EUR`, `ARS` o `CHEQUE`.
2. **Restricción**: si un lado es `CHEQUE`, el otro debe ser `ARS` (validado al guardar en el front).
3. **Tabla `ordenes`**: `moneda_recibida` y `moneda_entregada` siguen siendo solo **USD / EUR / ARS**. Donde el tipo lleva `CHEQUE`, la app guarda **ARS** (mismo criterio que antes para “cheque en pesos”).

## Comportamiento igual a ARS-ARS (cheque + intermediario)

Si el tipo es equivalente a cheque–ARS (`codigo === 'ARS-ARS'`, el código contiene `CHEQUE`, o el par de monedas del catálogo es CHEQUE+ARS), el front aplica el **mismo flujo** que el tipo legacy:

- Wizard: importe + tasa cliente, intermediario obligatorio, tasa intermediario.
- Auto instrumentación: 4 transacciones (cheque / efectivo cliente–Pandy e intermediario).
- Comisión en ARS, concepto de comisión alineado al flujo ARS-ARS.
- **Reglas CC**: **`reglas_de_negocio`** (`tipo_operacion_codigo = 'CHEQUE-ARS'`, `usa_intermediario = true`); motor en **`main.js`** vía `getReglasDeNegocio` + `aplicarMotorCcDesdeReglasDeNegocio`. Ver **`docs/CHEQUE_ARS_INTERMEDIARIO.md`**.

## Implementación (referencia)

- `main.js`: `monedaCatalogoParaOrden`, `esTipoOperacionChequeArs`, `esChequeArsDesdeSelectOption`, `tiposOperacionEfectivoParaOrden`, `esOrdenChequeArsDesdeOrden`.
- Selects del modal tipo: `index.html` (`tipo-operacion-moneda-in` / `out`).
- Mapas de tipos en listados de órdenes incluyen `moneda_in`, `moneda_out` para resolver cheque sin depender solo del código.

Los E2E **`01-cc-combinaciones.spec.js`** y **`91-orden-cc.spec.js`** usan **`data-codigo="CHEQUE-ARS"`**; ejecutá **`sql/seed_tipo_operacion_cheque_ars.sql`** en Supabase para que exista el tipo. Podés seguir usando **ARS-ARS** en manual u otros entornos; es equivalente en lógica de negocio.


## Migración recomendada en desarrollo

Para dejar **tabla de verdad** y catálogo en código canónico, ejecutar:

1. `sql/migracion_cc_modelo_reglas_canonico_cheque_ars.sql`
2. `sql/seed_tipo_operacion_cheque_ars.sql`

Con eso, `CHEQUE-ARS` queda como referencia principal y `ARS-ARS-CHEQUE` queda desactivado/retirado.
