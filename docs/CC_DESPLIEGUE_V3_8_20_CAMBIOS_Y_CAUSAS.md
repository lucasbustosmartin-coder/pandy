# Despliegue v3.8.20 — cambios y causas

**Fecha:** 3 de noviembre de 2026  
**Versión:** v3.8.20  
**Commit:** `2b95faa` (mismo en producción y preview)  
**Sitios:** https://pandi.company (datos reales) y https://preview.pandi.company (misma app, base de desarrollo)

Este archivo explica **qué se cambió** en este despliegue y, sobre todo, **por qué**: de dónde salieron los movimientos duplicados, por qué no pasaron en todas las órdenes, y qué se decidió congelar o sí sincronizar.

Fuente regenerable: `docs/CC_DESPLIEGUE_V3_8_20_CAMBIOS_Y_CAUSAS.md`. Word: `docs/CC_DESPLIEGUE_V3_8_20_CAMBIOS_Y_CAUSAS.docx` (`node scripts/crear-docx-despliegue-cc-v3820.js`).

---

## 1. Qué ve el usuario al recargar

El cartel «Nueva versión» dice tres cosas (sin tecnicismos de servidor):

1. Ajustes para mejorar el rendimiento.
2. Control de registros duplicados.
3. En cuenta corriente, el listado y el Excel muestran todos los movimientos, igual que el saldo.

Después de recargar hay que pulsar **Refrescar** en Cuenta corriente. Ahí el sistema escribe **solo** las órdenes **576** (Dacharry / Rou) y **788** (Guido). El resto del libro de producción no se toca.

Pendiente operativo (no lo hace el deploy): cuando termine ese Refrescar, **anular a mano** el movimiento manual de Guido **+1.000 USD** del 27/08 («AJUSTE PORQUE NO SE NETEO CON LA ORDEN»). Si no, Guido queda +1.000 de más.

---

## 2. Pregunta central: ¿por qué se duplicaron algunos movimientos y no todas las órdenes?

### 2.1 Qué es un «gemelo»

Un gemelo es **dos filas vivas iguales**: misma orden, misma transacción, mismo importe, mismo concepto. No es un movimiento manual. Saldos las **suma las dos**. El Excel viejo de Movimientos **escondía una**.

En producción, el 3/11/2026, eso pasaba **solo** en:

| Orden | Cliente | Intermediario | Dónde hay gemelos | Efecto en el saldo |
|------:|---------|---------------|-------------------|--------------------|
| 28 | DOC | Rou | CC cliente y CC intermediario | DOC netea 0 (las copias se anulan entre sí). Rou **sí** suma de más (~9.885 USD extra). |
| 41 | Mateo | Rou | CC cliente, CC intermediario **y caja efectivo** | Mateo netea 0. Rou suma de más. Caja de la orden **+15.300 USD de más** (dos ingresos de 15.300). |
| 42 | Pablo Franck | Rou | CC cliente y CC intermediario | Pablo Franck netea 0. Rou **sí** suma de más (~4.378 USD extra). |
| 576 | Dacharry | Rou | CC cliente y CC intermediario | Dacharry deuda **el doble** (−15.760 en vez de −7.880). Rou **el doble** en esa orden. **Caja sin gemelo.** |

Nadie más en producción tenía gemelos vivos de CC. Caja gemela: **solo la orden 41**.

Guido **788** no es gemelo: es un compromiso de −1.000 USD que el motor ya no arma, compensado a mano con un +1.000.

### 2.2 Por qué el sistema pudo insertar dos veces

Hasta este despliegue, al sincronizar una orden el servidor hacía tres cosas:

1. Buscaba si ya existía **una** fila con la misma transacción, moneda, importe y texto de concepto (`LIMIT 1`).
2. Si la encontraba, la actualizaba. Si no, **insertaba otra**.
3. Después borraba las filas que **ya no coincidían** con lo que mandaba la app.

Tres agujeros, en cadena:

**No había candado.** Login, Inicio, Cajas y Refrescar podían sincronizar **la misma orden a la vez**. Las dos corridas preguntaban «¿existe la fila?», las dos veían que no, y las dos insertaban.

**No había traba de unicidad** en la base («un solo vivo por esa clave»). Postgres aceptaba las dos copias.

**El paso de borrar no limpia gemelos.** Si las dos copias son **idénticas** a lo que la app acaba de mandar, ninguna es «huérfana». El borrado las deja. A partir de ahí, **cada Refrescar conserva el duplicado**.

Por eso no es un error del tipo de operación (USD–USD) en sí: es un error de **cómo se grababa** el resultado del motor.

### 2.3 Por qué no se duplicó todo el padrón

Hace falta que, en algún momento, **esa orden** haya tenido dos escrituras que insertaron la misma línea, y que después el sync no las pudiera borrar porque seguían coincidiendo.

La mayoría de las órdenes se sincronizaron de a una (un Guardar, un Refrescar sin pestaña duplicada). Quedaron con una sola copia. El censo de **toda** la base (saldos y filas vivas de CC cliente, CC intermediario y caja cerrada, por orden y moneda) encontró diferencias prod vs el motor nuevo en **siete** órdenes, no en cientos: 23, 28, 41, 42, 106, 576 y 788.

Las fechas de alta de los gemelos lo confirman (UTC):

| Órdenes | Primera copia | Segunda copia | Lectura |
|---------|---------------|---------------|---------|
| 28, 41 y 42 juntas | 26/10/2026 19:19 | 29/10/2026 16:54 (la misma hora en las tres) | Un sync **global** (Refrescar / login) escribió la segunda tanda de golpe. |
| 576 | 27/07/2026 ~14:31 y ~14:36 | 31/10/2026 14:23 | Oleada propia, más vieja; no salió del mismo Refrescar de octubre que 28/41/42. |

Si el motor «duplicara siempre» al armar USD–USD con intermediario, **todas** las órdenes de ese tipo tendrían gemelos. No es el caso.

Rou aparece en 28, 41, 42 y 576 porque es el intermediario de esas operaciones, no porque el ABM de Rou genere copias.

### 2.4 Por qué en el cliente a veces el saldo «daba bien» y en Rou no

En DOC (28), Mateo (41) y Pablo Franck (42) cada gemelo viene en **pares que se anulan** (por ejemplo −9.935 y +9.935, dos veces). El **saldo del cliente sigue 0**. El problema se ve en **Rou**: las copias extra de cobro/pago/comisión **no se anulan** y el saldo intermedia **sube**.

Dacharry (576) es el caso donde el cliente **sí** queda con deuda duplicada: dos veces −7.880.

### 2.5 Caja: por qué solo la 41

La caja derivada usa otra clave (incluye tipo de caja e importe). El mismo mecanismo (dos INSERT + «huérfano idéntico que no se borra») puede copiar un ingreso. En producción eso quedó **solo** en la 41: dos filas vivas de **+15.300 USD efectivo** (trx 101). 28, 42 y 576 **no** tienen gemelo de caja.

Congelar la 41 evita que un Refrescar anule una de esas dos y **baje el cajón** de 30.600 a 15.300. El titular pidió no tocar esa caja.

---

## 3. Qué se cambió para que no vuelva a pasar (y por qué cada capa)

### 3.1 Capa 1 — ya no se borra; se anula

**Causa:** borrar y reinsertar pierde historia, no evita gemelos si dos syncs corren juntos, y un fallo a mitad de camino deja el libro a medias.

**Cambio:** la función `sync_cc_caja_orden` hace INSERT si es alta, UPDATE si es la misma línea, y marca **anulado** lo que ya no corresponde. **No DELETE.** Candado por orden (`pg_advisory_xact_lock`) para que dos Refrescar no inserten a la vez. El navegador **ya no** reconstruye la orden con borrar+insertar si el servidor falla.

**Por qué importa:** el cajón y la CC quedan como libro. Se puede ver qué se anuló. Un vivo por clave (cuando el índice único exista; ver 3.3).

### 3.2 Capa 2 — la identidad ya no usa el importe

**Causa:** la clave vieja incluía el **monto**. Si el motor recalculaba 1.000 → 1.050, el servidor **no reconocía** la fila y metía una nueva. La vieja a veces quedaba viva.

**Cambio:** columna `sync_clave` = familia de leyenda + signo (ejemplo: `compromiso_pago:neg`). El importe se **edita en la misma fila**.

### 3.3 Índices únicos: en Dev se bajaron; en prod **no** se crearon

**Causa:** el índice «un solo vivo» **no puede nacer** mientras 28, 41 y 42 tengan gemelos: Postgres rechazaría la creación.

**Decisión:** en producción se aplicó la función nueva y el relleno de `sync_clave`, **sin** esos índices. En desarrollo se bajaron para poder copiar la foto de prod (con gemelos). Cuando se limpien 28/41/42, ahí sí se pueden crear.

### 3.4 Rendimiento de Refrescar

**Causa:** Refrescar hacía **un viaje de red por cada orden** (minutos con el padrón actual).

**Cambio:**

- Cálculo en el navegador de a 8 órdenes.
- Lectura de instrumentación / transacciones en tandas de 150.
- Escritura de a 10 órdenes por viaje (`sync_cc_caja_ordenes`).
- Login / Inicio / Cajas siguen de a 4, una orden por llamada.

No cambia saldos: es el mismo motor, menos ida y vuelta.

### 3.5 Excel y listado = Saldos

**Causa:** Movimientos agrupaba por orden + transacción + monto + concepto (60 caracteres) y **tiraba la segunda copia**. Saldos y el ojito sumaban las dos. Rou en Excel ~30.300 vs Saldos ~33.048: faltaban los gemelos (neto +2.748).

**Cambio:** se listan todas las filas (solo se saca el mismo `id` dos veces). El Excel de la app tiene que dar la misma suma que Saldos, con o sin gemelos.

Foto de producción: `docs/CC_DUPLICADOS_PROD_SALDO.xlsx`.

---

## 4. Censo prod vs el motor nuevo: siete órdenes, no el universo

Se comparó **todo**: CC cliente, CC intermediario y caja cerrada. Solo diferían estas siete.

| Orden | ¿El deploy la escribe? | Por qué se decidió así |
|------:|------------------------|------------------------|
| 23 | No (congelada) | El motor nuevo pondría comisión intermediario **−1.168.564 ARS** y caja banco. En prod **no está**. Jesus y el cajón ARS se moverían. |
| 28 | No (congelada 3/11) | Gemelos CC. Si se sincronizara, Rou 19.770,65 → 9.885,325. Caja de la orden sin gemelo. El titular pidió no bajar a Rou por esta orden. |
| 41 | No (congelada) | Gemelos CC **y** el único gemelo de caja (+15.300×2). Sync bajaba efectivo USD 30.600 → 15.300. |
| 42 | No (congelada 3/11) | Gemelos CC. Rou 8.756 → 4.378. Mismo criterio que la 28. |
| 106 | No (congelada) | El motor deja **−0,81 ARS** extra en Titanium (redondeo). Crosti igual. Sin caja. |
| 576 | **Sí** | Gemelos CC Dacharry/Rou (el caso que se quería corregir). Caja de la orden sin gemelo. Dacharry −15.760 → −7.880. Rou en esa orden 15.920 → 7.960. |
| 788 | **Sí** | Compromiso −1.000 USD que el motor ya no emite. Caja **no cambia**. Después: anular el manual +1.000 de Guido. |

Detalle numérico: `docs/CC_ORDENES_IMPACTO_CAMBIOS_SYNC.xlsx`. Cómo está hecha la exclusión: `docs/CC_EXCLUSION_SYNC_ORDENES_23_Y_41.md`.

La lista MonR/MonE (órdenes que siguen el motor viejo de patas) **no** es esta lista. Aquella igual sincroniza. Esta **no escribe** CC ni caja.

---

## 5. Cada hallazgo que motivó un cambio

### 5.1 Orden 576 — Dacharry / Rou (sí se sincroniza)

**Qué se vio:** dos veces los mismos cobros/ajustes/comisión. Deuda Dacharry y haber Rou al doble. Caja bien.

**Causa:** gemelos (mecanismo §2), oleada 27/07 y 31/10.

**Cambio:** entra al sync. La copia de más se **anula** (no se borra).

**Impacto:** CC Dacharry USD −15.760 → −7.880. CC Rou en esa orden 15.920 → 7.960. Caja igual.

### 5.2 Órdenes 28 y 42 — Rou (congeladas)

**Qué se vio:** mismo patrón de gemelos que 576, pero en DOC y Pablo Franck el cliente netea 0; **Rou queda inflado**.

**Causa:** misma mecánica; segunda copia el **29/10 16:54** junto con la 41.

**Cambio:** se las sacó del sync el 3/11, a pedido, para no «arreglar» a Rou bajándole el saldo de estas dos. Solo se deja que el sync limpie **576**.

**Si un día se sacan de la lista:** Rou 28 → 9.885,325; Rou 42 → 4.378. Avisar antes: cambia el saldo que hoy se está operando.

### 5.3 Orden 41 — Mateo / Rou (congelada, caja)

**Qué se vio:** gemelos de CC **y** dos ingresos de caja +15.300 USD.

**Causa:** mismo sync doble; además la caja derivada se copió. En desarrollo, con índice único, una copia de caja ya estaba anulada: por eso Dev **no** era foto fiel de prod.

**Cambio:** exclusión. No se toca el cajón.

### 5.4 Orden 23 — Aced / Jesus (congelada)

**Qué se vio:** en desarrollo, al Refrescar, apareció comisión intermediario −1,17 M ARS y caja banco. En producción **no hay** esa fila. La comisión **sí existe** en `comisiones_orden`; nunca se volcó al libro.

**Causa:** el motor de hoy arma esa línea; el libro histórico de prod nunca la tuvo. No es un gemelo: es **una línea nueva**.

**Cambio:** exclusión. Un Refrescar en prod habría movido CC Jesus y caja ARS banco.

### 5.5 Orden 106 — Crosti / Titanium (congelada)

**Qué se vio:** CC Titanium en Dev 0,81 ARS por debajo de prod. Crosti igual. Sin caja.

**Causa:** centavos al armar la comisión. El titular pidió no mover Titanium ni un centavo.

### 5.6 Orden 788 — Guido (sí se sincroniza) y el manual +1.000

**Qué se vio:** CC Guido USD −1.000 de un «Compromiso de Pago» que el motor actual **no** vuelve a emitir. El 27/08 alguien cargó un **manual +1.000** para compensar. Caja de la orden (ARS y USD) ya daba bien.

**Causa:** no es gemelo. Es un compromiso **huérfano** respecto del motor de hoy, tapado con un ajuste a mano. Dacharry y Rou **no** tenían un manual que compensara sus gemelos.

**Cambio:** el sync **anula** el −1.000 derivado. El manual **no se toca** (los manuales nunca los pisa el sync). Por eso, **después** del Refrescar hay que anular el +1.000 a mano. Si se anula antes, Guido queda −1.000 hasta el Refrescar; si no se anula después, queda +1.000.

**El titular pidió no excluir la 788** y preferir anular el manual una vez implementado.

### 5.7 Excel de Rou 30.299 vs Saldos 33.048

**Qué se vio:** con filtro Total, todo el histórico, entidad Rou, `SUM` del Excel ~30.299,86 y Saldos 33.048.

**Causa:** el Excel **ocultaba** una de cada pareja de gemelos (28, 41, 42, 576). Neto escondido **+2.748,32**. La fórmula `=SUM(H5:H5000)` estaba bien; faltaban filas.

**Cambio:** listado y Excel muestran las dos copias, igual que el ojito de Saldos.

### 5.8 Primer Refrescar en Dev después de copiar prod — «desastre» de caja

**Qué se vio:** al vaciar Dev, copiar prod y Refrescar, se anularon **147** movimientos de caja. Efectivo USD pasó de +26.804 a −50.254. CC no se cayó igual.

**Causa:** las filas copiadas tenían `sync_clave` vacía. El UPDATE de caja **no grababa la clave** si el importe no cambiaba. El paso de huérfanos, al no reconocer la fila, las **anulaba**. El UPDATE de CC sí escribía la clave: por eso CC y caja se desfasaron.

**Cambio:** el UPDATE de caja **siempre** escribe `sync_clave`. Si hace falta anular y no hay id, hay un respaldo por monto+concepto. Se volvió a copiar prod → Dev. Quedó efectivo USD +26.804 otra vez.

Eso **no** corrió en producción. En este deploy la función ya lleva el arreglo.

### 5.9 Lecturas recortadas a 1.000 filas

**Causa:** PostgREST devolvía como máximo ~1.000 filas. Caja, órdenes y CC podían **pintar de menos** sin error.

**Cambio (sesión previa, publicado ahora):** las lecturas que arman saldos van paginadas (`pandiSupabaseFetchAll`). No es un cambio de motor; evita totales mudos.

### 5.10 Tope silencioso y gemelos de caja en limpiezas

**Causa:** un script de limpieza en Dev llegó a anular gemelos de caja (orden 41). Prod las dos vivas.

**Cambio:** las limpiezas nuevas **no** anulan caja. Prod: la 41 congelada.

---

## 6. Qué se hizo el día del deploy (3/11/2026)

1. Se volvió a **vaciar desarrollo** y se **copió producción** (tablas de negocio + usuarios). Conviene: Dev ya no tenía los gemelos de 28/42 y no servía para prever el Refrescar. Hubo un tropiezo menor al copiar acuses de «Nueva versión» (clave duplicada); se corrigió. El libro CC/caja/órdenes copió 1 a 1 (órdenes 1.139, CC cliente 5.070, etc.).
2. En **producción y desarrollo** se instaló la función nueva (anular, no borrar; `sync_clave`; lote de Refrescar). **Sin** índices únicos en prod.
3. Front v3.8.20: exclusión `[23, 28, 41, 42, 106]`; Excel = Saldos; Refrescar en lote.
4. Push a `main` (Vercel producción) y `preview-empleado` al mismo commit `2b95faa`.
5. Backups de Supabase: copia **diaria, 7 días**. No hay vuelta a un minuto exacto. Desarrollo quedó como foto viva de prod **antes** de que el usuario pulse Refrescar en pandi.company.

---

## 7. Qué hay que hacer ahora (operación)

1. Esperar el build de Vercel y recargar la app.
2. **Refrescar** en Cuenta corriente.
3. Controlar:
   - Dacharry USD ≈ **−7.880** (antes −15.760).
   - Rou: baja **solo** lo de la 576 (15.920 → 7.960 en esa orden). Siguen los extras de 28, 41 y 42 hasta que se decida.
   - Guido USD: el −1.000 derivado desaparece; el **+1.000 manual sigue** hasta el paso 4.
   - Caja efectivo USD **igual** (la 41 no se toca).
4. Anular el manual +1.000 de Guido (27/08).
5. No sacar 23, 28, 41, 42 ni 106 de la lista sin una foto nueva de saldos y acuerdo explícito (sobre todo caja 41 y Rou 28/42).

---

## 8. Qué no cambió

- Alta de órdenes, cambios de estado, edición de instrumentación: mismo motor de siempre; solo cambia **cómo se graba** el resultado (libro, no borrar).
- Movimientos **manuales**: el sync no los pisa.
- Caja **manual** (con tipo de movimiento): no entra en esta RPC.
- Las órdenes congeladas: ni Guardar ni Refrescar les escriben CC/caja mientras estén en la lista.
- No se anuló ni se borró nada en producción **hasta** que el usuario pulse Refrescar (576 y 788).

---

## 9. Archivos para profundizar

| Archivo | Para qué |
|---------|----------|
| `docs/CC_EXCLUSION_SYNC_ORDENES_23_Y_41.md` | Lista de congeladas y cómo volver a sincronizarlas |
| `docs/CC_ORDENES_IMPACTO_CAMBIOS_SYNC.xlsx` | Números prod vs «si sync» |
| `docs/CC_DUPLICADOS_PROD_SALDO.xlsx` | Cada gemelo vivo (ids y fechas de alta) |
| `docs/CORAZON_SISTEMA_CC_Y_CAJA.md` | Principios: CC = situación real; caja = billetes |
| `docs/FLUJOS_CC_REGLA.md` §7.2 | Libro INSERT / UPDATE / ANULAR |
| `docs/PLAN_MEJORA_PERFORMANCE_SYNC_CC.md` | Por qué Refrescar era lento y qué se hizo |
| `sql/rpc_sync_cc_caja_orden.sql` | Función por orden |
| `sql/rpc_sync_cc_caja_ordenes.sql` | Lote Refrescar |
| `sql/migracion_sync_cc_caja_clave_identidad.sql` | `sync_clave` (índices únicos: no en prod todavía) |

---

## 10. En una frase

El duplicado **no** es «USD–USD duplica siempre». Es: **dos syncs pudieron insertar la misma línea, y el grabado viejo no podía borrar una copia idéntica**. Por eso hay cuatro órdenes con gemelos y un millar sin ellos. Este despliegue graba como libro, reconoce la línea aunque cambie el importe, acelera Refrescar, muestra las dos copias en el Excel, limpia **576** y **788**, y deja quietas **23, 28, 41, 42 y 106** para no mover caja ni saldos que hoy se están usando.

## 7. Post-despliegue: gemelos se detectan y se ajustan

Tras el primer Refrescar en prod, **576 no se ajustó**: las dos copias coincidían con el payload, así que ninguna era «huérfana».

**Cambio (mismo día):** la RPC anula las copias extra (deja la más antigua). **Control de calidad** lista `cc_caja_gemelos_vivos`. Un Refrescar **sí** corrige 576. **23, 28, 41, 42 y 106 siguen intactas** (el front no las envía). Sin índices únicos en prod mientras esas congeladas tengan gemelos.
