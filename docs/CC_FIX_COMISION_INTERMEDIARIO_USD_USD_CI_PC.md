# Corrección: comisión intermediario USD-USD (y cruces TC) — `ci_pc` vs `cp_ic`

## Contexto

En **CC intermediario**, la fila sintética **«Comisión del acuerdo»** (sin `transaccion_id`, clasificación típica `CC_COMISION_SINTETICA_SIN_TRX`) para **USD-USD con intermediario** y el mismo bloque en **cruces con tipo de cambio** cuando aplica comisión intermediario, se armaba en `main.js` → `aplicarMotorCcDesdeReglasDeNegocio` con una lógica que **tomaba el valor absoluto** del monto y solo aplicaba signo **−** si calificaba **rollout** MonR/MonE o **tasa por transferencia** al intermediario. En la práctica, para el patrón **`ci_pc`** (ingreso **Cliente → Intermediario** en MonR, sin ingreso C→Pandy en el conjunto que usa `patronInstrumentacionIntDesdeTransacciones`), la **matriz** `reglas_de_negocio` ya trae **`signo = −1`**, pero el motor **persistía comisión en +**, desalineado al negocio y a CHEQUE-ARS (`signo * monto`).

Para **`cp_ic`** (ingreso **Cliente → Pandy** en MonR + egreso **Intermediario → Cliente**), la convención **histórica** del motor era **comisión en +** (magnitud positiva) salvo rollout/tasa; **no** es el mismo error de negocio que en `ci_pc`.

## Implementación (código)

**Archivo:** `main.js`, dentro de `aplicarMotorCcDesdeReglasDeNegocio`, bloque comisión intermediario desde `comisiones_orden` para `(esUsdUsd || crucesTcComisionInt) && intermediarioId && filasIntParaComision`.

- **`patronInstrumentacionIntDesdeTransacciones(transacciones) === 'ci_pc'`:**  
  `montoCcInt = Number(reglaComIntUsd.signo) * baseInt` (respeta reglas; típicamente **−**).

- **`cp_ic`** (u otro valor del patrón):  
  Se mantiene la lógica anterior: `magComInt = Math.abs(signo * baseInt)` y **−magComInt** solo si `nuevaReglaCcRolloutActivoParaOrden` o `ordenIntermediarioComisionTasaTransferenciaCcNegativaMotor`; si no, **+magComInt**.

Referencia de patrones: comentario en `patronInstrumentacionIntDesdeTransacciones` (~11333–11335 en `main.js`).

## Verificación en base (solo lectura)

### Producción (Pandy) — órdenes con comisión en + **y** patrón `ci_pc` (criterio SQL)

Ingreso en **MonR** con `pagador = cliente`, `cobrador = intermediario`, transacción no anulada; orden no anulada; movimiento CC int. comisión con `monto > 0`.

- **18 órdenes** afectadas por el bug de negocio (ejemplos de números): 4, 18, 19, 20, 28, 31, 38, 39, 42, 43, 49, 56, 59, 73, 85, 86, 88, 100.  
- **Suma** de esas comisiones mal en +: **~1 915,44 USD** (consulta MCP abril 2026).

Órdenes con **+** en comisión pero **`cp_ic`** (no deben tratarse como “signo mal” bajo el criterio C→I MonR): por ejemplo **8, 41, 58, 67, 68, 81** en prod (ingreso MonR C→Pandy o instrumentación distinta).

### Desarrollo (Pandy-Dev)

Mismo criterio SQL: **3 órdenes** con comisión en +, no anuladas, C→I MonR — **17, 18, 19** (~237,73 USD en total).

## Checklist antes / después de desplegar

1. **Backup** en producción de lo que acuerden operativamente (p. ej. snapshot o export de **saldos** y tablas **movimientos_cuenta_corriente** / **movimientos_cuenta_corriente_intermediario** relevantes, o política interna de backup).
2. **Desplegar** el front que incluye el `main.js` corregido (Vercel prod cuando corresponda).
3. **No** hace falta migración SQL nueva para este fix: el cambio es solo en el cliente que **rearma** el payload del sync (`sincronizarCcYCajaDesdeOrden` → RPC `sync_cc_caja_orden` o delete+insert fallback).
4. **Re-sincronizar** las órdenes afectadas: abrir cada orden y guardar / **Refrescar** en Cuenta corriente (sync global), según el procedimiento habitual, para que las filas de comisión se **regeneren** con el signo correcto en `ci_pc`.
5. **Revalidar** saldos CC intermediario y reportes (G/P, Saldos) en un subconjunto de órdenes `ci_pc` y `cp_ic` tras el sync.

## Tests locales

- Unitarios CC ya existentes: `npm run test:unit-cc-patron-nueva-regla`, `npm run test:unit-cc-invariante-nueva-regla`, `npm run test:unit-cc-flip`, `npm run test:unit-clasificacion` (o el bloque que ejecuten en CI).
- E2E opcional: `npm run test:e2e-cc-usd-usd-int` / combos con intermediario.

## Ajuste adicional (CC cliente `ci_pc`, ambas patas ejecutadas)

- En **`aplicarMotorCcDesdeReglasDeNegocio`**, el colapso del par cliente **«Compromiso de Pago»** (+**mr** / −**me**) hacia **una sola línea** con |monto transacción| debe aplicar también cuando el egreso **Pandy → Cliente** está en estado **ejecutada** (no solo **pendiente**). Si no, con **E,E** la matriz volvía a generar el par asimétrico, el invariante de neteo del acuerdo fallaba (residual ≈ **mr − me**) y el sync podía dejar filas **Pendiente** mezcladas con **Cerrado**.
- En **`saveTransaccion`** (`continuarFlujo`), los inserts legacy **Cobro realizado** / **Deuda por** en CC del cliente **no** deben ejecutarse cuando la transacción pertenece a una **instrumentación** (`instrumentacion_id`): la fuente de verdad es el sync de orden (`sincronizarCcYCajaDesdeOrden`), alineado a **`cambiarEstadoTransaccion`**.
- El colapso del par **+mr / −me** no debe depender **solo** de detectar `monto_origen` **mr** y **me** en la misma búsqueda de reglas: si el catálogo trae **≥2** filas cliente `compromiso_pago` y **no** es únicamente el par **±monto_transacción** (signos opuestos), se fuerza la inyección de **una** línea **+|monto transacción|** y se filtran todas las filas cliente `compromiso_pago` de ese egreso (evita −1960/+2000 en USD-USD **ci_pc** cuando la matriz varió entre estados).
- **`validarInvarianteNeteoCcClienteAcuerdoCerrado`:** con **USD-USD** misma moneda, intermediario y patrón **`ci_pc`**, si **todas** las transacciones de instrumentación están **ejecutadas** y **mr > me**, el invariante **no** bloquea el sync: el residual **−(mr − me)** en CC cliente corresponde al **spread/comisión explícita** del acuerdo (p. ej. −40 con 2000 vs 1960), no a instrumentación mal cargada.

## Documentos relacionados

- `docs/USD_USD_CON_INTERMEDIARIO.md` — patrones `ci_pc` / `cp_ic`.
- `docs/CUENTA_CORRIENTE_Y_CAJA.md` — sync y fuente de verdad.
- `docs/NUEVA_REGLA_CC_PATA_MONR_MONE.md` — rollout MonR/MonE (comisión **−** cuando aplica esa regla; convive con la bifurcación `ci_pc`/`cp_ic` fuera de rollout).
