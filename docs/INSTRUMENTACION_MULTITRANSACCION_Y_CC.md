# Instrumentación parcial y varias transacciones

## Objetivo

Un mismo acuerdo puede instrumentarse con **varias transacciones** (ej. 5.000 USD en efectivo + 5.000 USD en transferencia). Es válido si la suma no supera `monto_recibido` / `monto_entregado` en moneda del acuerdo (`validarTotalesVsAcuerdo` + `totalesInstrumentacion`).

## Modal “Nueva transacción”

Al abrir el modal sin registro, la app compara los totales ya cargados con el acuerdo:

- Si el lado **ingreso** (hacia “recibir”) ya está cubierto, el default pasa a **egreso** con **Pagador Pandy** y **Cobrador Cliente** (o Intermediario si no hay cliente).
- Si faltan ambos lados, se prioriza el que tenga **menor avance** respecto del acuerdo (ratio).
- El monto sugerido es el **restante** del lado correspondiente, no el total del acuerdo.

Función: `defaultsNuevaTransaccionSegunInstrumentacion` en `main.js`.

## Cuenta corriente y caja

- **Por transacción ejecutada**: `sincronizarCcYCajaDesdeOrden` recorre cada transacción con `estado === 'ejecutada'` y genera movimientos de caja (si participa Pandy) y, según motor/reglas o modelo legacy, filas de CC con `transaccion_id` de esa transacción.
- **Cierre en dos monedas** (orden sin motor `reglas_de_negocio` en ese tramo, sin exposición CC en tabla): los movimientos sintéticos “Cierre orden …” usaban solo el **primer** ingreso/egreso Cliente↔Pandy ejecutado. Con varias transacciones parciales eso subestimaba montos. Ahora se **suman todos** los ingresos Cliente→Pandy y todos los egresos Pandy→Cliente ejecutados; el `transaccion_id` de referencia en el concepto apunta al **último** egreso por número de transacción.

Si el tipo usa **solo** `reglas_de_negocio` / `cc_modelo`, el motor ya itera **transacción por transacción**; no aplica el bloque de cierre legacy anterior.

## Referencias

- `docs/CORAZON_SISTEMA_CC_Y_CAJA.md`
- `docs/REGLA_CC_SIMPLE_INFALIBLE.md`
- `totalesInstrumentacion`, `validarTotalesVsAcuerdo`, `sincronizarCcYCajaDesdeOrden` en `main.js`.
