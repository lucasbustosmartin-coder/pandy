# Seguridad Checklist: GitHub + Vercel + Supabase

Checklist operativo para mantener separado **desarrollo** y **producción** sin exponer secretos.

## 1) Principio base

- `SUPABASE_SERVICE_ROLE_KEY` es **secreta**: nunca en frontend, nunca en repo.
- Frontend solo usa `SUPABASE_URL` + `SUPABASE_ANON_KEY`.
- Cada ambiente (dev/prod) debe tener su propio proyecto Supabase y sus propias variables.

## 2) GitHub (repositorio)

- [ ] `.env`, `.env.local`, **`.env.production`** (y otras salidas de `vercel env pull`), `.env.test` y `config.js` están ignorados en `.gitignore`.
- [ ] No hay scripts de prueba con credenciales en el repo (`scratch*.js`, `get_t.js`, etc.): usarlos solo local y listados en `.gitignore`.
- [ ] No hay claves reales en commits/historial.
- [ ] En docs y ejemplos se usan placeholders (`<TU_SERVICE_ROLE_KEY>`, `eyJ...` recortado).
- [ ] Pull requests revisan que no se agreguen secretos por error.

Comando útil (local) para búsqueda rápida de posibles secretos:

```bash
git ls-files -z | xargs -0 grep -nI -E "SUPABASE_SERVICE_ROLE_KEY|service_role|sk_live|AIza|BEGIN (RSA|OPENSSH|PRIVATE) KEY" || true
```

## 3) Vercel (frontend)

- [ ] Proyecto de frontend **sin** variable `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] Variables de entorno separadas por ambiente:
  - Preview/Development -> proyecto Supabase DEV
  - Production -> proyecto Supabase PROD
- [ ] `SUPABASE_URL` y `SUPABASE_ANON_KEY` existen y apuntan al ambiente correcto.
- [ ] Redeploy luego de cambios de variables.

Chequeo en navegador (producción):

```js
typeof window.SUPABASE_SERVICE_ROLE_KEY // esperado: "undefined"
typeof window.SUPABASE_ANON_KEY         // esperado: "string"
```

## 4) Supabase (proyectos y claves)

- [ ] Existe proyecto DEV y proyecto PROD.
- [ ] Claves del proyecto PROD no se usan en local salvo necesidad puntual.
- [ ] Rotación de claves si hubo sospecha de exposición.
- [ ] RLS habilitado en tablas sensibles.
- [ ] RPC/funciones críticas revisadas para no depender de datos inseguros del cliente.

## 5) Flujo recomendado de ambientes

1. Desarrollar y probar en Supabase DEV.
2. Ejecutar migraciones SQL en DEV y validar.
3. Promover cambios a PROD con migraciones controladas.
4. Verificar app PROD (Vercel) con variables de PROD.
5. Registrar cambios en bitácora.

## 6) Auditoría mínima mensual

- [ ] Revisar variables en Vercel (todos los ambientes).
- [ ] Revisar miembros y roles en Supabase y GitHub.
- [ ] Ejecutar búsqueda de secretos en repo.
- [ ] Revisar accesos de servicio y tokens antiguos.

## 7) Señales de alerta

- Aparece `service_role` en frontend, logs cliente o bundle.
- Se usó una key de PROD en entorno DEV por comodidad.
- Se compartió `.env` por chat/email.
- Se hizo commit de credenciales "temporales".

Si pasa algo de esto: **rotar claves**, limpiar exposición y documentar incidente.

