# Corazón del sistema: Cuenta corriente y Caja

Este documento define los principios que **siempre** deben cumplirse. El sistema debe funcionar como un **reloj**: determinista, confiable, fuente de verdad.

---

## 1. Cuenta corriente = situación real

- La **cuenta corriente** siempre tiene que reflejar la **situación real** entre:
  - **Pandy y el cliente**
  - **Pandy y el intermediario**
- Lo que muestra la CC (resumen y detalle) debe coincidir con quién le debe a quién en la realidad: signos, pendientes, ejecutadas, comisiones implícitas, misma convención de colores (verde = nos deben, rojo = Pandy debe). Referencia de regla: `docs/REGLA_CC_SIMPLE_INFALIBLE.md`.

---

## 2. Caja = dinero real

- La **caja** refleja **dinero real**. Es lo que Pandy tiene en efectivo, banco, etc.
- Si al final del día Pandy va y cuenta los billetes (o concilia con el banco), **tiene que dar lo que el sistema dice**. Solo entran movimientos que representan entradas o salidas reales de dinero (transacciones ejecutadas, movimientos manuales). Referencia: `docs/CONVENCION_MOVIMIENTOS_CAJA.md` y lógica en `main.js` (sync, caja por transacción).

---

## 3. Reloj: determinismo y fuente de verdad

- CC y caja son el **corazón del sistema**. Deben ser:
  - **Deterministas:** misma entrada (órdenes + transacciones y estados) → mismo resultado.
  - **Derivadas de una sola fuente de verdad:** órdenes e instrumentación (transacciones); no depender de textos de concepto ni de lógica duplicada.
- Cualquier cambio que toque CC o caja debe respetar estos principios y no introducir excepciones ocultas.

---

## 4. CC cliente y CC intermediario van juntas

- **No se puede tocar la CC del cliente sin revisar si hay que tocar también la CC del intermediario, ni viceversa.**
- Al modificar:
  - Cálculo o escritura de movimientos de **cuenta corriente cliente** → revisar impacto en **cuenta corriente intermediario** (misma convención de signos, pendientes, resumen, colores).
  - Cálculo o escritura de movimientos de **cuenta corriente intermediario** → revisar impacto en **cuenta corriente cliente** y en la coherencia global (órdenes con intermediario: flujos cliente ↔ intermediario se reflejan en Pandy–Intermediario).
- Validar siempre **ambas** cuentas (cliente e intermediario) al cambiar reglas de movimientos, sync, resumen o detalle.

---

## Checklist rápido al tocar CC o caja

- [ ] ¿La CC sigue reflejando la situación real (Pandy–cliente / Pandy–intermediario)?
- [ ] ¿La caja sigue reflejando dinero real (conteo físico / banco debe cuadrar)?
- [ ] ¿Revisé tanto CC **cliente** como CC **intermediario** (y viceversa)?
- [ ] ¿La regla es determinista y está alineada con `REGLA_CC_SIMPLE_INFALIBLE.md` y con la convención de caja?
