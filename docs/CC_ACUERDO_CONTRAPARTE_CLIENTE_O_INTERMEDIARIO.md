# Acuerdo de orden: Cliente vs Intermediario como contraparte (borrador para retomar)

**Estado:** requisito discutido con cliente; **sin implementación acordada**. Este archivo sirve para retomar el diseño buscando la **solución más robusta** posible: no romper flujos existentes, mantener **una sola fuente de verdad** en `reglas_de_negocio`, y que el modelo sea **eficiente** (sin duplicar lógica frágil en el front).

**Referencias:** `docs/CORAZON_SISTEMA_CC_Y_CAJA.md`, `docs/CC_MOVIMIENTO_MANUAL.md`, `docs/MIGRACION_UNA_TABLA_REGLAS_DE_NEGOCIO.md`, reglas de trabajo en `.cursor/rules/reglas-pandi.mdc` (motor genérico, CC cliente e intermediario van juntos).

---

## 1. Necesidad de negocio

En algunas operaciones la empresa **no acuerda con un cliente del ABM** sino **con un intermediario**, que en lenguaje comercial “actúa como el cliente” del acuerdo (quién paga qué moneda, contra quién cierra el saldo que mira la empresa).

En la UI se planteó: en el modal de orden, poder indicar **con quién acuerda la empresa** — p. ej. check o radio **Cliente** vs **Intermediario** (además de la instrumentación y, si aplica, **otro** intermediario en la cadena).

---

## 2. Ejemplo concreto acotado (caso simple)

| Aspecto | Definición |
|--------|------------|
| Hecho | La empresa **compra USD** a un **intermediario**. |
| Flujo | El intermediario **aporta USD**; la empresa **paga ARS**. |
| Tipo de operación | **USD-ARS**, **sin** segundo intermediario en la cadena. |
| Cambio respecto del modelo actual | La **cuenta corriente** que debe reflejar el acuerdo con la contraparte es **Empresa ↔ Intermediario** (libro de **CC intermediario** para esa ficha), no la CC **cliente** anclada a `cliente_id` como hoy en USD-ARS típico. |

**Intuición:** misma mecánica de negocio que USD-ARS “contra persona”, pero el **libro contable/UI** del acuerdo vive en la **CC del intermediario** como contraparte.

---

## 3. Principios de diseño (robustez y eficiencia)

1. **No romper lo existente**  
   Órdenes y tipos actuales (USD-ARS contra cliente, USD-ARS/USD-USD con intermediario en cadena, CHEQUE-ARS, etc.) deben seguir comportándose igual con **valores por defecto** alineados al modelo actual.

2. **Una fuente de verdad en reglas**  
   Comportamiento de movimientos CC (y coherencia con caja cuando aplique) debe seguir saliendo de **`reglas_de_negocio`** (y SQL asociado), no de ramas grandes en `main.js` por combinación ad-hoc.

3. **Explícito en datos**  
   La orden debe persistir **quién es la contraparte del acuerdo** (cliente vs intermediario) y los **IDs** sin ambigüedad — especialmente si el mismo intermediario puede aparecer en **más de un rol** (acuerdo vs operación en cadena).

4. **CC cliente e intermediario juntos**  
   Cualquier cambio que mueva movimientos entre libros o cambie entidad debe revisar **impacto en ambas CC** y en caja según `docs/CORAZON_SISTEMA_CC_Y_CAJA.md`.

5. **Alineación con CC manual**  
   El criterio “Empresa vs Cliente vs Intermediario” en **movimientos manuales** debería ser **compatible** con el criterio de “contraparte del acuerdo” en órdenes, para que operadores y reportes sean intuitivos.

6. **Eficiencia**  
   Evitar duplicar tipos de operación innecesariamente; valorar un **discriminador en orden** (flag / enum) + **filas de reglas** que orienten `entidad_cc` y pagador/cobrador, en lugar de copiar flujos enteros.

---

## 4. Preguntas abiertas (cerrar antes de implementar)

- **Esquema `ordenes`:** ¿campo `acuerdo_con` + `cliente_id` / `intermediario_id` opcionales, o convivencia con `intermediario_id` ya usado para “cadena”?  
- **Instrumentación:** ¿las transacciones siguen el mismo esquema de pagador/cobrador reemplazando semánticamente “cliente” por “intermediario” en el acuerdo, o hay patrón dedicado?  
- **`reglas_de_negocio`:** ¿nuevo conjunto de filas para `USD-ARS` con `contraparte_acuerdo = intermediario` (nombre a definir), o extensión de `usa_intermediario` / otro flag?  
- **Nullable `cliente_id`:** en la app actual **no** se permite guardar una orden sin cliente (validación en front, RPC `ordenes_insertar_con_proximo_numero` y cola al importar). Siguen existiendo filas históricas o borradores con `NULL` hasta limpieza/migración de datos si se desea `NOT NULL` en tabla.  
- **Migración:** órdenes históricas = siempre “acuerdo con cliente” por defecto.

---

## 5. Próximo paso sugerido al retomar

1. Fijar **matriz mínima de movimientos CC** esperados para el ejemplo USD-ARS (ambas patas ejecutadas), en **CC intermediario** (y confirmar CC cliente = vacía o no aplica).  
2. Traducir esa matriz a **filas de `reglas_de_negocio`** (borrador en SQL comentado o script de migración).  
3. Recién entonces **UI** (checks/radios) + cambios en sync/motor + E2E.

---

## 6. Historial de notas

- 2026-03-24: Documento creado a partir de conversación con cliente y ejemplo USD-ARS simple (compra USD a intermediario, empresa paga ARS, sin segundo intermediario).
