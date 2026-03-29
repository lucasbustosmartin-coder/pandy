# Corazón del sistema: Cuenta corriente y Caja

Este documento define los principios que **siempre** deben cumplirse. El sistema debe funcionar como un **reloj**: determinista, confiable, fuente de verdad.

---

## 1. Cuenta corriente = situación real

- La **cuenta corriente** siempre tiene que reflejar la **situación real** entre:
  - **Pandy y el cliente**
  - **Pandy y el intermediario**
- Lo que muestra la CC (resumen y detalle) debe coincidir con quién le debe a quién en la realidad: signos, pendientes, ejecutadas, comisiones implícitas, misma convención de colores (verde = nos deben, rojo = Pandy debe). Referencia de regla: `docs/REGLA_CC_SIMPLE_INFALIBLE.md`.
- **USD-ARS sin intermediario** (dos monedas, dos transacciones): modelo teórico de **dos movimientos CC por transacción** cuando ambas patas aplican; con todo ejecutado (**E,E**) **cuatro** movimientos que netean por moneda. Ver `docs/MODELO_CC_USD_ARS_TEORICO.md` y `docs/REGLAS_DE_NEGOCIO.md`.
- **Varias transacciones por el mismo acuerdo** (parciales, distintos modos de pago): válido si los totales cierran; CC/caja se derivan **por transacción ejecutada**; cierre legacy dos monedas suma todos los montos Cliente↔Pandy. Ver `docs/INSTRUMENTACION_MULTITRANSACCION_Y_CC.md`.
- **Futuro (sin implementar):** instrumentación **manual libre** ARS-USD / USD-ARS sin int. (N pagos, contrapartes Cliente N o Intermediario N, mismos signos CC acuerdo que hoy en parciales). Definiciones: `docs/INSTRUMENTACION_MANUAL_MULTICONTRAPARTE.md`.
- **Futuro (sin implementar):** acuerdo explícito **contra cliente o contra intermediario** (ej. USD-ARS comprando USD al intermediario; CC del acuerdo en libro intermediario). Diseño y preguntas abiertas: `docs/CC_ACUERDO_CONTRAPARTE_CLIENTE_O_INTERMEDIARIO.md`.

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
- **Fechas en movimientos derivados:** al sincronizar CC/caja desde la orden, la **fecha contable** y **`estado_fecha`** de cada fila generada deben alinearse al **hecho** (`fecha_ejecucion` / `updated_at` de la transacción, o transacción de referencia en líneas sintéticas), no al instante del resync. La RPC sigue pudiendo borrar e insertar por orden; la coherencia temporal del listado depende de esos campos. Ver `fechaYEstadoFechaMovimientoCcCajaDesdeTransaccion` en `main.js`.

---

## Regla de ORO (reglas vs. código en `main.js`)

- La **verdad de negocio** de la cuenta corriente (montos que impactan saldo, exposición, comisiones, contrapartida) vive en **`reglas_de_negocio`** (y migraciones en `sql/`); ver **`docs/REGLAS_DE_NEGOCIO.md`**. **CHEQUE-ARS con intermediario** también en esa tabla. La tabla legacy **`cc_modelo_reglas`** ya **no** la lee el front; puede eliminarse en DB (`sql/migracion_drop_cc_modelo_reglas.sql`). No duplicar reglas contables en el frontend.
- El código en `main.js` debe **interpretar `reglas_de_negocio` de forma genérica** (motor de lookup y aplicación de filas). Evitar excepciones por código de operación salvo infraestructura; si hace falta un comportamiento nuevo, **cambiar o ampliar la matriz en Supabase** (y documentar la semántica).
- Ver también la regla del proyecto **Regla de ORO** en `.cursor/rules/reglas-pandi.mdc`.
- **Multi‑pata / varias transacciones:** `docs/CC_FUENTE_DE_VERDAD_TABLA_Y_MULTI_PATA.md` — contexto histórico; nuevas extensiones van sobre **`reglas_de_negocio`** (`linea`, `monto_origen`, etc.).

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
