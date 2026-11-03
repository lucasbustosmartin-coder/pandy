# Exclusión de sync CC/caja — órdenes 23, 28, 41, 42 y 106

**Fecha de la foto:** 2026-11-02 (consultas de solo lectura a **Pandy** producción y **Pandy-Dev**). Actualizado **2026-11-03:** se suman **28** y **42** a la exclusión.

**Memoria del despliegue v3.8.20 (causas, gemelos, qué se toca):** `docs/CC_DESPLIEGUE_V3_8_20_CAMBIOS_Y_CAUSAS.docx` (fuente `docs/CC_DESPLIEGUE_V3_8_20_CAMBIOS_Y_CAUSAS.md`).  
**Código:** `PANDI_CC_SYNC_EXCLUIR_NUMEROS_ORDEN` en `main.js` (`[23, 28, 41, 42, 106]`).  
**Al desplegar sí se sincronizan:** **576** (Dacharry/Rou) y **788** (Guido).  
**Excel de consulta (todas las órdenes con impacto):** `docs/CC_ORDENES_IMPACTO_CAMBIOS_SYNC.xlsx` (misma copia en `docs/CC_ORDENES_23_Y_41_IMPACTO.xlsx`). Regenerar con `node scripts/crear-excel-ordenes-23-41-impacto.js`.

**Foto gemelos CC vivos en prod (para conciliar con Saldos):** `docs/CC_DUPLICADOS_PROD_SALDO.xlsx` (`docs/CC_DUPLICADOS_PROD_SALDO.md`).

Estas órdenes **no** estaban en la lista MonR/MonE (`NUEVA_REGLA_CC_ROLLOUT_EXCLUIR_NUMEROS_ORDEN_SALDO_4_4`). Esa lista solo deja el motor viejo; **igual sincroniza**. Acá el sync **no escribe** CC ni caja.

## Censo prod vs Dev (2026-11-02)

Se comparó **toda** la base: saldos y cantidad de filas vivas de CC cliente, CC intermediario y caja **cerrada**, agregados por orden + moneda (+ tipo de caja).

**Solo diferían 7 órdenes:** 23, 28, 41, 42, 106, 576 y 788. No apareció ninguna otra.

## Por qué se congelan 23, 28, 41, 42 y 106

| Orden | Tipo | Cliente | Intermediario | Qué pasaría en **producción** si se sincronizara como en Dev |
|------:|------|---------|---------------|---------------------------------------------------------------|
| **23** | CHEQUE-ARS | Aced | Jesus | En Dev el motor insertó comisión intermediario **−1.168.564,14 ARS** (2 % de 58.428.207) y una caja banco **cerrada** por el mismo importe. En **prod no hay** esa fila de CC int ni caja de la orden. Un Refrescar en prod **movería caja ARS banco** y el saldo de Jesus. |
| **41** | USD-USD | Mateo | Rou | En prod hay **dos** movimientos de caja efectivo **cerrados** de **+15.300 USD** (trx 101). En Dev uno quedó **anulado**. Sincronizar en prod con capa 1 (un vivo) **anularía un gemelo** y bajaría caja USD efectivo de esta orden de 30.600 a 15.300. |
| **106** | CHEQUE-ARS | Crosti | Titanium | En Dev el motor dejó una comisión intermediario extra de **−0,81 ARS**. CC Crosti igual. **Sin** cambio de caja. Se congela para no mover el saldo de Titanium ni un centavo. |
| **28** | USD-USD | DOC | Rou | Gemelos vivos en CC prod (cliente e int). Caja de la orden **sin** gemelo. Congelada **2026-11-03** para no bajar CC Rou **19.770,65 → 9.885,325**. CC DOC seguiría **0**. |
| **42** | USD-USD | Pablo Franck | Rou | Gemelos vivos en CC prod. Caja **sin** gemelo. Congelada **2026-11-03** para no bajar CC Rou **8.756 → 4.378**. CC Pablo Franck seguiría **0**. |

Decisión: al pasar el front a producción, **no tocar** el libro actual de esas cinco órdenes.

## Otras órdenes que **sí** se van a ver afectadas (no están excluidas)

Inventario 2026-11-02. Detalle y saldos en el Excel. Solo quedan **576** y **788**.

| Orden | Tipo | Cliente | Intermediario | Por qué entra | Impacto si el sync corre en prod |
|------:|------|---------|---------------|---------------|----------------------------------|
| **576** | USD-USD | Dacharry | Rou | Gemelos vivos en CC prod (caso original). Caja **sin** gemelo. | CC Dacharry USD **−15.760 → −7.880**. CC Rou USD **15.920 → 7.960**. |
| **788** | USD-ARS | Guido | — | Auditoría Dev: anular Compromiso de Pago 1.000 USD. | CC Guido USD **−1.000 → 0**. Caja efectivo **no cambia** (−1.530.000 ARS y +1.000 USD). Tras el deploy, anular a mano el ajuste +1.000 de Guido (27/08). |

Gemelos de **caja** en producción: **solo la orden 41** (excluida). 576 y 788 cambian **cuenta corriente**, no el cajón.

Auditoría Dev (`auditoria_app`, categoría `cc_caja_sync`) agrupa por nro. de orden solo **23, 106 y 788**. Los gemelos **28, 41, 42 y 576** se anularon en Dev con `sql/limpieza_cc_anular_gemelos_vivos.sql` y **no** siempre dejaron fila de auditoría RPC.

## Qué hace el código

- Refrescar / login / Inicio / Cajas: esas órdenes **salen de la lista** a sincronizar.
- Guardar instrumentación u otro llamado a `sincronizarCcYCajaDesdeOrden`: **return** sin RPC.
- Última red: `enviarSyncCcCajaOrdenUna` / lote ignoran payload con `_ordenNumero` 23, 28, 41, 42 o 106.

Mientras la lista tenga 23, 28, 41, 42 y 106, **ni un Guardar** les cambia CC/caja. Si hace falta operarlas de nuevo, hay que **sacarlas de la constante** (paso abajo).

**Detección y ajuste de gemelos (post v3.8.20):** la RPC anula copias extra de la misma identidad (deja la más antigua). **Control de calidad** las lista (`cc_caja_gemelos_vivos`) y marca las congeladas como «no se toca». Un Refrescar **sí** corrige **576**. **No** corrige 23/28/41/42/106: el front no las envía. Los índices únicos siguen **sin** crearse en prod mientras esas congeladas tengan gemelos.

## Cómo volver a sincronizarlas (futuro)

1. En `main.js`, en `PANDI_CC_SYNC_EXCLUIR_NUMEROS_ORDEN`, quitar `23`, `28`, `41`, `42` y/o `106`.
2. Actualizar este doc y volver a generar el Excel.
3. Bitácora Log.
4. Desplegar. Refrescar en prod **sí** va a escribir. Antes: backup o foto de saldos (misma consulta que este Excel).
5. Revisar caja efectivo USD (orden 41), CC intermediario Jesus + caja banco ARS (orden 23), CC Titanium −0,81 ARS (orden 106), y CC Rou por 28/42.

No hace falta SQL para “activar” el sync: alcanza el front.

## Foto producción (2026-11-02) — lo que queda congelado

### Orden 23 — Aced / Jesus — CHEQUE-ARS — ejecutada (fecha orden 08/04/2026)

- Acuerdo: recibe 58.428.207 ARS, entrega 57.259.642,86 ARS. `comisiones_orden`: Pandy 1.168.564,14 ARS (**la fila de comisión existe**; no está volcada a CC int ni a caja en prod).
- **CC cliente Aced ARS (vivos): 0** (cobro + pago se anulan).
- **CC intermediario Jesus ARS (vivos): +58.428.207** (Pago Realizado trx 65). **Sin** línea de comisión −1,17 M.
- **Caja de la orden:** no hay movimiento **cerrado** en prod.

### Orden 41 — Mateo / Rou — USD-USD — ejecutada (fecha orden 10/04/2026)

- Acuerdo: 15.300 / 15.000 USD. Comisiones: intermediario 75 USD, Pandy 225 USD.
- **CC cliente Mateo USD (vivos): 0** (hay **filas duplicadas** cobro/pago/ajuste; la suma sigue 0).
- **CC intermediario Rou USD (vivos): −30.150** (duplicados: dos × −75 comisión y dos × −15.000 pago trx 102).
- **Caja efectivo USD cerrado de la orden: +30.600** (dos filas vivas de **+15.300**, trx 101, ids `05ca24dc-…` y `08e9877c-…`).

### Orden 106 — Crosti / Titanium — CHEQUE-ARS — ejecutada (fecha orden 27/04/2026)

- **CC cliente Crosti ARS (vivos): −80.771.369,19** (igual en Dev).
- **CC intermediario Titanium ARS (vivos): +161.542.740** (en Dev 161.542.739,19: **−0,81**).
- **Caja de la orden:** sin movimiento cerrado distinto de prod.

### Orden 28 — DOC / Rou — USD-USD (congelada 2026-11-03)

- Gemelos CC en prod (DOC netea 0; Rou USD **19.770,65** con duplicado). Caja de la orden **sin** gemelo.
- Si se sincronizara: CC Rou **→ 9.885,325**.

### Orden 42 — Pablo Franck / Rou — USD-USD (congelada 2026-11-03)

- Gemelos CC en prod (Pablo Franck netea 0; Rou USD **8.756** con duplicado). Caja de la orden **sin** gemelo.
- Si se sincronizara: CC Rou **→ 4.378**.

## Copy del modal «Nueva versión» (v3.8.20 y v3.8.21)

Texto desplegado (lavado, visible al recargar; **sin** auditoría):

1. Ajustes para mejorar el rendimiento.
2. Control de registros duplicados.
3. En cuenta corriente, el listado y el Excel muestran todos los movimientos, igual que el saldo.

(La exclusión 23/28/41/42/106 **no** se menciona en el modal: es interna.)
