# Propuesta comercial – Sistema de gestión financiera y operativa

**Documento para armar la presentación en PowerPoint / Google Slides.**  
Cada bloque siguiente es una diapositiva o sección. Copiar y pegar en las slides; la tabla del presupuesto se puede insertar como tabla en PPT.

---

## Slide 1 – Portada

**Título:** Propuesta de desarrollo  
**Subtítulo:** Sistema de gestión de órdenes, cajas y cuenta corriente  
**Pie:** [Tu nombre o estudio] · [Fecha] · Confidencial

---

## Slide 2 – El desafío

**Título:** Un solo lugar para operar con claridad

- Operaciones en múltiples monedas (USD, EUR, ARS) y con intermediarios.
- Necesidad de trazar cada orden desde la cotización hasta el cobro/pago.
- Cajas (efectivo y banco) y cuenta corriente con clientes e intermediarios.
- Equipos con distintos niveles de acceso (admin, encargado, visor).

**Mensaje:** Centralizar la operación, con seguridad y sin perder el control.

---

## Slide 3 – La solución

**Título:** Una aplicación web a medida

- **Panel de Control** con saldos por caja (efectivo/banco), variaciones y pendientes.
- **Órdenes** con estados claros (cotización → cerrada → concertada → ejecutada) e instrumentación de transacciones.
- **Cajas** con movimientos manuales y automáticos por orden; tipos de movimiento configurables.
- **Cuenta corriente** con clientes e intermediarios; conciliación y comisiones.
- **Seguridad** por roles y permisos granulares (vistas y acciones).
- **Responsive** para usar en escritorio y móvil.

**Mensaje:** Todo en un solo sistema, accesible desde el navegador, con roles y permisos definidos.

---

## Slide 4 – Beneficios

**Título:** Qué gana tu operación

| Beneficio | Impacto |
|-----------|--------|
| Trazabilidad | Cada orden y transacción queda registrada y vinculada a caja y cuenta corriente. |
| Control por roles | Admin, encargado y visor ven solo lo que necesitan; permisos por vista y por acción. |
| Menos errores | Concertación única, validaciones y mensajería clara (sin ventanas del navegador). |
| Múltiples monedas | USD, EUR, ARS en cajas y cuenta corriente; tipos de operación configurables. |
| Uso en celular | Interfaz adaptable para consultas y tareas básicas en movimiento. |

---

## Slide 5 – Alcance funcional (resumen)

**Título:** Alcance del desarrollo

1. **Setup y arquitectura** – Repo, Supabase, Vercel, configuración y despliegue.
2. **Autenticación y seguridad** – Login, roles (Admin, Encargado, Visor), permisos y RLS.
3. **UI base** – Sidebar, vistas, navegación, login y registro.
4. **Clientes** – Alta, edición y listado con permisos.
5. **Cajas** – Saldos por moneda, movimientos manuales y por orden, tipos de movimiento, Efectivo/Banco.
6. **Órdenes** – Alta, edición, estados, concertación, monedas e instrumentación.
7. **Transacciones** – Ingreso/egreso, intermediarios, comisiones, tipos de operación.
8. **Cuenta corriente** – Cliente e intermediario, conciliación y movimientos.
9. **Panel de Control** – Saldos, variaciones, pendientes y accesos rápidos (parametrizable por rol).
10. **Permisos granulares** – Control por vistas y por acciones (órdenes, transacciones, etc.).
11. **Experiencia de usuario** – Toasts, confirmaciones en modal, validaciones.
12. **Responsive** – Adaptación móvil, touch y buenas prácticas.
13. **Documentación y despliegue** – Bitácora, documentación interna y despliegue continuo.

---

## Slide 6 – Presupuesto

**Título:** Inversión – Desarrollo por funcionalidad

**Tarifa de referencia:** USD 38/h (desarrollador freelance, Argentina).

| Funcionalidad | Horas hombre | Importe (USD) |
|---------------|--------------|---------------|
| Setup y arquitectura (repo, Supabase, Vercel, config) | 12 | 456 |
| Autenticación y seguridad (Auth, roles, permisos, RLS) | 24 | 912 |
| UI base y navegación (sidebar, vistas, login, responsive) | 20 | 760 |
| ABM Clientes (listado, alta, edición, permisos) | 8 | 304 |
| Módulo Cajas (saldos, movimientos, tipos, Efectivo/Banco) | 24 | 912 |
| Módulo Órdenes (CRUD, estados, concertación, monedas) | 32 | 1 216 |
| Instrumentación y transacciones (intermediarios, comisiones) | 28 | 1 064 |
| Cuenta corriente (cliente e intermediario, conciliación) | 24 | 912 |
| Panel de Control (saldos, pendientes, accesos, parametrizable) | 16 | 608 |
| Permisos granulares y control de vistas por rol | 12 | 456 |
| Experiencia de usuario (toast, confirm, validaciones) | 8 | 304 |
| Responsive y adaptación móvil (touch, safe area) | 12 | 456 |
| Documentación, bitácora y despliegue continuo | 12 | 456 |
| **TOTAL** | **232** | **8 816** |

*Importes en dólares estadounidenses. Forma de pago y cronograma a definir según acuerdo.*

---

## Slide 7 – Próximos pasos

**Título:** Cómo seguimos

1. **Reunión de alcance** – Validar funcionalidades y prioridades.
2. **Acuerdo comercial** – Forma de pago (por hitos o mensual), plazos y aceptación del presupuesto.
3. **Kick-off** – Setup del repo, Supabase y primer despliegue.
4. **Desarrollo por módulos** – Entregas parciales y pruebas según lo acordado.
5. **Puesta en producción** – Dominio, variables de entorno y capacitación básica.

**Cierre:** Gracias por considerar esta propuesta. Quedamos a disposición para ajustar alcance o plazos según tu necesidad.

---

## Notas para el presentador

- Enfatizar que el presupuesto es **por funcionalidad**: si se recorta alcance, se reducen horas e importe.
- La tarifa (USD 38/h) es de referencia para Argentina; puede ajustarse por moneda o por proyecto.
- El archivo **presupuesto.csv** en esta carpeta permite importar la tabla a Excel o PowerPoint para mantener una sola fuente de verdad.
