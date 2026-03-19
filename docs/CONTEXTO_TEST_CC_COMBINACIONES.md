# Contexto: test CC combinaciones y modal orden

**Para retomar después de un "re open" de Cursor:** este doc resume en qué quedamos con el test de 12 combinaciones y el modal que no cerraba.

## Problema
- Test `tests/e2e/cc-combinaciones.spec.js` se quedaba trabado en la pantalla de instrumentación (modal "Nueva orden" abierto, paso instrumentación con los 4 combos).
- Al hacer clic en "Listo" o "Cerrar" el modal no se cerraba; la vista de Órdenes cargaba atrás en gris y el modal perdía el foco.

## Cambios ya hechos en la app
1. **No llamar `loadOrdenes()` con el modal abierto**  
   - En `cambiarEstadoTransaccion` (al actualizar estado de una transacción desde el wizard): se quitó la llamada a `loadOrdenes()` cuando `ordenWizardInstrumentacionIdActual === instrumentacionId`.  
   - En `loadOrdenes()`: al inicio, si `#modal-orden-backdrop` tiene clase `activo`, la función hace `return Promise.resolve()` y no recarga la lista. Así nunca se muestra el loading de Órdenes atrás mientras el modal está abierto.

2. **Cierre inmediato del modal**  
   - En `closeModalOrden()` se llama a `doClose()` de inmediato; la sincronización de montos de la tabla de instrumentación se hace en segundo plano (sin bloquear).

3. **Clase en body y z-index**  
   - Con el modal de orden abierto se agrega `modal-orden-abierto` al `body` y `#app-content` tiene `pointer-events: none`; el backdrop del modal tiene `z-index: 1000`.

4. **Listeners de cierre**  
   - En `setupModalOrden()` están asignados los listeners de "Listo" y "Cerrar" del wizard, más delegación en `document` (click y mousedown) para los botones `#orden-btn-cerrar-wizard` y `#orden-btn-cancelar-wizard`.

## Test (estado actual)
- **Tipo de operación:** los tests eligen **`CHEQUE-ARS`** en el select de orden. En Supabase ejecutá **`sql/seed_tipo_operacion_cheque_ars.sql`** si ese código no está en `tipos_operacion`.
- **Referencia que sí avanza:** `tests/e2e/cc-combinaciones.spec.js` (test de las 12 combinaciones).
- **orden-cc** (test individual) está alineado con cc-combinaciones:
  - **Flujo:** un solo cambio de combo por apertura del modal → Listo y cerrar → reabrir para el siguiente; **no se va a CC entre medio** (igual que cc-combinaciones). Toda la validación de CC y caja se hace **después** del loop de 4 pasos.
  - **Cierre:** mismas dos líneas, sin X ni fallbacks:  
    `await page.locator('#orden-btn-cerrar-wizard').click();`  
    `await expect(page.locator('#modal-orden-backdrop.activo')).toBeHidden({ timeout: 20000 });`
  - **esperarActualizacionEstadoOrden:** timeout **90000 ms** (90 s) por cada paso a ejecutada; espera a que `#orden-inst-actualizando-msg` desaparezca.
  - **Timeout del test completo (`cc-combinaciones.spec.js`):** **15 min** (`test.setTimeout(900000)`) para las 12 combinaciones con sync repetido.

## RPC sync (si “Actualizando estado…” no termina o falla el sync)

Si en consola aparece **`sync_cc_caja_orden: cannot cast jsonb null to type integer`**, en Supabase hay que volver a ejecutar **`sql/rpc_sync_cc_caja_orden.sql`** (casts con `->>` para `transaccion_numero` / `orden_numero` en caja). Sin eso, filas de comisión con `transaccion_numero` null rompen la RPC y el mensaje de carga puede quedar colgado.

## Qué probar si sigue fallando
- Ejecutar el test con el navegador visible:  
  `npx playwright test tests/e2e/cc-combinaciones.spec.js --headed`
- Si el modal sigue sin cerrar al hacer clic en Listo, revisar en consola del navegador si hay errores de JS al hacer clic.
- Confirmar que con los cambios de la app (no cargar Órdenes atrás) el modal ya no pierde el foco al terminar de cargar la instrumentación.

## Cómo evitar tantos "re open" de Cursor
- Al empezar una sesión nueva, podés decir: "Leé docs/CONTEXTO_TEST_CC_COMBINACIONES.md y retomamos el tema del test cc-combinaciones."
- Así se recupera el contexto sin tener que reexplicar.
