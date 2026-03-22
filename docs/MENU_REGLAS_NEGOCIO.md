# Menú crítico: Reglas de negocio (CC)

Vista en la app para administrar la tabla **`reglas_de_negocio`**, que define cómo el motor genera movimientos de cuenta corriente (y coherencia con caja) por tipo de operación.

## Permisos y seguridad

- **Permiso de vista y ABM:** `abm_reglas_negocio`.
- Por defecto está asignado solo al rol **`admin`** (`sql/migracion_permiso_abm_reglas_negocio.sql`). Otros roles pueden recibirlo desde **Seguridad** si hace falta delegar.
- **RLS en Supabase:** `SELECT` sigue las políticas existentes para usuarios autenticados; **INSERT / UPDATE / DELETE** solo si `has_permission('abm_reglas_negocio')`.

Tras ejecutar la migración, los usuarios deben **volver a iniciar sesión** (o refrescar permisos) para ver el ítem de menú.

## Qué hace la pantalla

1. **Listado** con filtros por código de tipo de operación y por uso de intermediario. En la tabla, columnas **CC**, **Monto origen** y **Cond. com.** tienen ícono de ayuda (mismo patrón que Cuenta corriente: clic → modal de ayuda).
2. **Nueva fila / Editar:** modal con todos los campos alineados al esquema. En **edición**, el código de tipo y el flag **usa intermediario** quedan bloqueados (evita duplicar la clave lógica; para otro tipo usá **Nueva** o **Replicar**).
3. **Validaciones en cliente:** `monto_origen` permitido, moneda (USD/ARS/EUR), signo ±1, enums de pagador/cobrador/estado, coherencia básica comisión / `condicion_estado_comision`, y cruce opcional con el catálogo **`tipos_operacion`** (advertencias si no hay tipo o si la moneda no coincide con IN/OUT).
4. **Duplicados:** no permite guardar si ya existe otra fila con la misma clave única (tipo + intermediario + entidad CC + pagador/cobrador + tipo trx + comisión + estado + contrapartida + línea).
5. **Replicar matriz:** copia **todas** las filas de un par origen `(código, usa_intermediario)` a un **código destino** y flag intermediario destino. **No corre** si el destino ya tiene al menos una fila (hay que borrar o editar a mano antes). Si no existe el tipo en catálogo, pide confirmación explícita antes de insertar.

## Flujo recomendado para un tipo nuevo (ej. EUR-USD)

1. En **Tipos de operación**, dar de alta el código (ej. `EUR-USD`) con **moneda IN/OUT** correctas y, si aplica, **usa intermediario**.
2. En **Reglas de negocio**, usar **Replicar** desde un tipo similar (ej. `USD-EUR` o `ARS-USD`) hacia `EUR-USD`, o crear filas a mano.
3. Revisar **moneda**, **signos** y **concepto_leyenda** en las filas copiadas (la réplica es mecánica).

## Referencias

- Corazón del sistema: `docs/CORAZON_SISTEMA_CC_Y_CAJA.md`
- Tabla y convenciones: `docs/REGLAS_DE_NEGOCIO.md`, `sql/reglas_de_negocio_tabla.sql`
