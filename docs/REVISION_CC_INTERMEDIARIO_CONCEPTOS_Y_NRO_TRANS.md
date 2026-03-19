# Revisión: CC intermediario – conceptos y nro de transacción

Revisión solicitada antes de ajustar: (1) conceptos con intermediario poco claros, (2) nro de transacción que no aparece (incluso en pago de comisiones que deriva de un pago).

---

## 1. Conceptos con intermediario – estado actual

En **sincronizarCcYCajaDesdeOrden** los movimientos de CC intermediario (`rowsCcInt`) usan estos textos:

| Concepto actual | Cuándo se usa | Observación |
|-----------------|---------------|-------------|
| **Pandy a Intermediario** | Egreso Pandy→Intermediario (ej. -50.000 cheque) | No sigue la convención "Pago Realizado - Orden x y Trans x". Sería más claro como "Pago Realizado - Orden x y Trans x" (Pandy pagó al intermediario). |
| **Comisión Intermediario** | Parte que se queda el intermediario (ej. +750) | No lleva Orden/Trans en el texto ni usa `conceptoCcLeyenda`. Podría ser "Comisión del acuerdo - Orden x y Trans x" (Trans = la del pago del que deriva). |
| **Deuda por [moneda] [monto] - nro orden x** | Cliente→Intermediario (deuda del intermediario con Pandy) | Es legacy (`conceptoCcMovimiento` + `conceptoConOrden`). Podría unificarse a "Compromiso de Pago" o "Pago Realizado" según estado. |
| **Cobro por [moneda] [monto] - nro orden x** | Intermediario→Cliente (cobro) | Idem legacy. Podría ser "Cobro Realizado - Orden x y Trans x". |
| **Intermediario debe a Pandy** | Fila +49.250 (intermediario nos debe) | No lleva Trans. Sería más claro con "Compromiso a Cobrar - Orden x y Trans x" o "Cobro Realizado - Orden x y Trans x" cuando está ejecutado. |
| **Pago Intermediario a Pandy** | Cuando el intermediario paga (-49.250) | Idem, sin Trans en el concepto. |

En **insertarMovimientosCcParaTransaccion** (insert directo, no sync) se usa:
- **Comisión del acuerdo** – sin "Orden x y Trans x"; sí tiene `transaccion_id` (la transacción que dispara el pago).

**Momento cero intermediario** (insertarMovimientosCcMomentoCeroIntermediario) ya usa `conceptoCcLeyenda('compromiso_pago', ...)` y `conceptoCcLeyenda('compromiso_cobrar', ...)`.

---

## 2. Nro de transacción que no aparece

- En la **vista Detalle** (y en el modal de detalle) la columna **Trans.** muestra `m.transaccion_numero`. Si el movimiento se guardó con `transaccion_numero` en null, se muestra "–".
- **Causa:** En el sync, en **todos** los `rowsCcInt.push(...)` se envía `transaccion_id` pero **no** se envía `transaccion_numero`. El objeto que se manda a la RPC (o al insert) no tiene `transaccion_numero`, por lo que en DB queda null.
- En los `rowsCcCliente.push` del mismo sync **sí** se pone `transaccion_numero: t.numero != null ? t.numero : null` cuando hay transacción.
- Para **Comisión del acuerdo** (y "Comisión Intermediario" en el sync): la comisión deriva de un pago (egreso Pandy→Intermediario). Tenemos `transaccion_id` de esa transacción pero no estamos guardando su `numero` en el movimiento. Si en el sync añadimos `transaccion_numero` del egreso correspondiente, en la UI aparecería "deriva de Trans X".

**Resumen:**  
Hay que agregar `transaccion_numero` en todos los objetos que se pushean a `rowsCcInt` (y donde corresponda a `rowsCcCliente`) cuando tengamos la transacción de referencia (`t.numero`, `egresoTr.numero`, etc.), para que la columna Trans. nunca quede en blanco cuando el movimiento esté vinculado a una transacción (incluido el pago de comisiones que deriva de un pago).

---

## 3. Próximos pasos sugeridos (sin implementar aún)

1. **Conceptos intermediario**  
   Unificar con la misma convención que cliente:
   - Usar `conceptoCcLeyenda('pago_realizado', orden.numero, t.numero)` para egreso Pandy→Int ("Pandy a Intermediario").
   - Usar `conceptoCcLeyenda('cobro_realizado', orden.numero, t.numero)` para ingreso Int→Pandy ("Pago Intermediario a Pandy") y para cobros Intermediario→Cliente.
   - Para comisión intermediario: algo como "Comisión del acuerdo - Orden x y Trans x" con la Trans del egreso Pandy→Int.
   - Para "Intermediario debe a Pandy" (compromiso): `conceptoCcLeyenda('compromiso_cobrar', orden.numero, t.numero)` o similar, según corresponda.

2. **transaccion_numero**  
   En cada `rowsCcInt.push` (y en los `rowsCcCliente.push` que aún no lo tengan) donde exista una transacción de referencia (`transaccionId`, `t`, `egresoTr`, etc.), agregar en el objeto:
   - `transaccion_numero: (t && t.numero != null) ? t.numero : (egresoTr && egresoTr.numero != null ? egresoTr.numero : null)` (o la variable que corresponda).
   En los inserts directos de "Comisión del acuerdo" (insertarMovimientosCcParaTransaccion y asegurarComisionIntermediario), incluir `transaccion_numero` obtenido de la transacción que dispara el pago.

Cuando quieras, se pueden aplicar estos cambios en el código siguiendo esta revisión.

---

## 4. Cambios aplicados (implementación)

Se unificaron conceptos y se agregó `transaccion_numero` en todos los flujos relevantes:

- **conceptoCcLeyenda:** se agregó el tipo `comision_acuerdo` → "Comisión del acuerdo - Orden x y Trans x".
- **sincronizarCcYCajaDesdeOrden (rowsCcInt):** todos los conceptos usan `conceptoCcLeyenda` (pago_realizado, cobro_realizado, compromiso_pago, compromiso_cobrar, comision_acuerdo) y cada push incluye `transaccion_numero` cuando hay transacción de referencia. Las comprobaciones `tienePandyAInt` / `tieneComisionIntRow` / `tienePagoIntPandy` se actualizaron a los nuevos textos.
- **rowsCcCliente:** "Pandy debe al cliente" → compromiso_pago con Orden y Trans; "Comisión Pandy" y ganancia → comision_acuerdo con Orden y Trans; se añadió `transaccion_numero` donde faltaba.
- **insertarMovimientosCcParaTransaccion:** todos los inserts de CC (cliente e intermediario) usan `conceptoCcLeyenda` y `transaccion_numero`; "Deuda del intermediario con Pandy" → compromiso_cobrar; "Comisión del acuerdo" → comision_acuerdo.
- **asegurarComisionIntermediario:** nuevo parámetro `ordenNumero`; concepto CC unificado a "Comisión del acuerdo - Orden x y Trans x" y `transaccion_numero` del pago de comisión.
- **Inserts directos** en cambiarEstadoTransaccion y flujo de guardar transacción: mismos conceptos unificados y `transaccion_numero`; llamadas a `asegurarComisionIntermediario` pasan `orden.numero`.
- **Reversa:** los filtros que borraban por "Deuda del intermediario" ahora buscan "Compromiso a Cobrar"; el que busca "debe" para actualizar estado pasa a "compromiso a cobrar".
- **Flujo ganancia Pandy (generarComisionPandy):** el movimiento CC "Comisión Pandy" se reemplazó por `conceptoCcLeyenda('comision_acuerdo', orden.numero, trNumero)` y se agregó `transaccion_numero`.
