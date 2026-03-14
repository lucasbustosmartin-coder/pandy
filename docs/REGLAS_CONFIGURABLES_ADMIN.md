# Reglas de negocio y configuración por Admin

## Criterio de diseño (a tener en cuenta)

**Lo mejor es que las reglas estén bien apoyadas en tablas configurables desde un perfil Admin.**

En lugar de (o además de) hardcodear reglas en la app, conviene que:

- Las reglas de negocio (límites, mensajes, advertencias, qué se puede o no hacer) tengan **soporte en tablas** en la base de datos.
- Esas tablas sean **editables desde la UI** por un usuario con perfil **Admin** (o el rol que corresponda).
- Así se pueden ajustar textos, umbrales, “reversar una vez”, mensajes por tipo de operación, etc. **sin tocar código**.

Ejemplos de lo que podría ser configurable en el futuro:

- Mensajes de advertencia al reversar (por tipo de transacción, con monto y moneda).
- Límites (ej. “máximo una reversión por transacción”: sí/no o número).
- Reglas por tipo de operación o por participante (cliente / intermediario).

Este doc sirve como recordatorio para orientar evolución de la app hacia reglas configurables por Admin.
