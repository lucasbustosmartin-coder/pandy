# SQL – Pandi

Scripts para Supabase. **Ejecutar en el SQL Editor en este orden:**

| Orden | Archivo | Contenido |
|-------|---------|-----------|
| 1 | `supabase_tablas_negocio.sql` | Tablas: clientes, tipos_movimiento_caja, ordenes, movimientos_caja, movimientos_cuenta_corriente |
| 2 | `supabase_seguridad.sql` | user_profiles, app_role, app_permission, app_user_profile, trigger, get_my_role(), has_permission(), set_user_role(), RLS en tablas de seguridad |
| 3 | `supabase_rls_negocio.sql` | RLS y GRANT en tablas de negocio (lectura autenticados, escritura por permiso abm_*) |

Antes de ejecutar: tener **Auth** habilitado en el proyecto Supabase (Email puede estar activado para registro/login).

Después de ejecutar los 3: el primer usuario que se registre no tendrá rol; un Admin debe asignarle rol desde la app (Seguridad) o insertar manualmente en `app_user_profile`. Para tener un Admin inicial podés hacer en SQL Editor (reemplazando `TU_USER_ID` por el uuid del usuario en auth.users):

```sql
INSERT INTO public.app_user_profile (user_id, role) VALUES ('TU_USER_ID', 'admin')
ON CONFLICT (user_id) DO UPDATE SET role = 'admin';
```
