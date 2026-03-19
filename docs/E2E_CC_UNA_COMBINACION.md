# E2E CC: ejecutar una sola combinación

Para revisar en la app que las **reglas** y el **caso de prueba** cierran para una combinación concreta (Tx1,Tx2,Tx3,Tx4), podés ejecutar solo esa combinación con:

```bash
COMBINACION_ID="E,P,E,P" npx playwright test tests/e2e/cc-combinaciones.spec.js --headed
```

- Reemplazá **E,P,E,P** por la que quieras. Las 12 válidas son:
  - **P,P,P,P** | **P,P,P,E** | **P,E,P,P** | **P,E,P,E**
  - **E,P,P,P** | **E,P,P,E** | **E,P,E,P** | **E,P,E,E**
  - **E,E,P,P** | **E,E,P,E** | **E,E,E,P** | **E,E,E,E**

- **--headed** abre el navegador para que veas el flujo (login → anular órdenes del cliente fijo → crear orden → ir a esa combinación → Cuenta corriente y validar saldo/detalle).

Antes del test: ejecutar en Supabase (si no lo hiciste) el script de reglas y, si querés arranque limpio, el truncate:

1. `sql/cc_modelo_reglas_todas_combinaciones.sql` (todo el archivo)
2. `sql/truncar_ordenes_transacciones.sql`

Luego en la app podés revisar para esa combinación que el **saldo** y el **detalle** (cliente e intermediario) coincidan con lo que dice la tabla de reglas y `tests/e2e/cc-combinaciones-esperado.js`.
