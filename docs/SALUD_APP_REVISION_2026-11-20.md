# Revisión de salud de Pandi — 2026-11-20

Revisión multi-agente **solo lectura** sobre el repo (commit `0f84987`, v3.8.25). No se consultaron las bases Supabase: lo que depende de datos reales queda marcado como *a confirmar*.

## Qué es Pandi

Back-office de una **mesa de cambio y descuento de cheques** argentina (marca blanca; `app_empresa`). Registra acuerdos con clientes (USD / ARS / EUR / cheques ARS), opcionalmente vía **intermediario**, su **instrumentación** en transacciones (pagador → cobrador, una moneda, pendiente/ejecutada) y deriva de ahí la **cuenta corriente** (cliente e intermediario, por moneda) y la **caja** (efectivo / banco / cheque). Ganancia = spread del acuerdo + comisiones (Pandy / intermediario). Roles Admin / Encargado / Visor + perfiles a medida con permisos Ver/Operar por menú. PWA con modo offline.

**Flujo:** Nueva orden → instrumentación sugerida por patrón → sync escribe compromisos en CC → ejecución de transacciones (con split si es parcial) → `sync_cc_caja_orden` recalcula CC cliente + intermediario + caja según `reglas_de_negocio` → orden ejecutada → plazo de N días hábiles para editar/anular.

## Notas por capa

| Capa | Nota | Lo mejor | Lo peor |
|------|-----:|----------|---------|
| Negocio / docs | — | Principios claros (CORAZÓN) | Docs contradictorias y obsoletas |
| Frontend (`main.js`) | 5/10 | Reglas de UI y fechas cumplidas (0 `alert`, 0 `toISOString().slice`) | Monolito 39k líneas; escrituras contables desde el navegador, no atómicas |
| Núcleo CC / caja | 5/10 | RPC sin DELETE, lock por orden, `sync_clave` | Verdad contable calculada en el cliente; servidor confía en el payload |
| Supabase / seguridad | 6/10 | RLS en todas las tablas, SECURITY DEFINER con `search_path`, sin secretos versionados | Lectura abierta a cualquier autenticado + auto-registro; sin migraciones |
| UI / PWA | 7,5/10 | Responsive, sticky, ayudas y aviso de versión bien hechos | Colas offline no idempotentes; JS viejo puede seguir escribiendo |
| QA / DevOps | 6/10 | 70/70 unit tests OK, build OK, main = preview-empleado | Sin CI; limpieza E2E sin barrera contra prod; jspdf crítico |

## Hallazgos prioritarios

### P0 — Seguridad y pérdida de datos

1. **Lectura total para cualquiera que se registre** — **CONFIRMADO 2026-11-20 en Pandy y Pandy-Dev**: `disable_signup = false` (con confirmación de email), política `app_user_profile_insert_self_visor` activa y `SELECT … USING (true)` en `clientes`, `ordenes`, `transacciones`, `movimientos_cuenta_corriente`, `movimientos_caja`. Prod: 8 usuarios, todos con perfil, 1 visor. Además `site_url = http://localhost:3000` y `password_hibp_enabled = false` en ambos.
   - **Incidente:** el único visor era una cuenta desconocida auto-registrada el 27/09/2026 22:25 (AR), con un único login. Sin rastro en auditoría ni log de Auth; no se puede descartar que haya leído datos.
   - **Fase 0 aplicada 2026-11-20 (dev → prod):** registro deshabilitado (signup responde 422), cuenta baneada y sin perfil, `site_url` + `uri_allow_list` corregidos (los links de recuperación de contraseña caían en localhost). Ver `sql/seguridad_fase0_cierre_registro_2026-11-20.sql`.
   - **Fases 1–2 aplicadas en Pandy-Dev 2026-11-20 (pendiente prod + deploy):** RLS de lectura con `public.es_usuario_habilitado()` en las 20 tablas (`sql/seguridad_fase1_rls_usuario_habilitado_sin_visor.sql`; verificado: admin lee todo, usuario sin perfil 0 filas), rol visor y auto-asignación eliminados; front sin pantalla «Crear cuenta», usuario sin perfil no entra y Seguridad lo muestra como «Sin acceso». Alcance original: RLS de lectura condicionada a rol habilitado en las 20 tablas con `USING (true)`, quitar política `app_user_profile_insert_self_visor` y el rol visor, quitar pantalla "Crear cuenta" y adaptar `ensureProfile` / Seguridad. Altas nuevas: invitar desde Supabase (Auth → Invite user) y asignar rol en Seguridad. La UI ofrece registro (`main.js:3099`, `index.html:353`), la política `app_user_profile_insert_self_visor` permite auto-asignarse `visor` (`sql/supabase_seguridad.sql:302`) y las tablas de negocio tienen `SELECT … USING (true)` (`sql/supabase_rls_negocio.sql`, `sql/supabase_rls_complejidad.sql`). Si "Allow new users to sign up" está activo en prod, cualquiera con la URL ve toda la operación.
2. **RESUELTO 2026-11-20 —** función eliminada en prod (`sql/seguridad_drop_limpiar_base_e2e_prod.sql`); en dev exige `app_config.entorno = 'desarrollo'` y `scripts/limpiar-base-e2e.js` solo acepta el ref de Pandy-Dev. **Antes:** `limpiar_base_e2e()` hacía TRUNCATE de todo y probablemente existe en prod (hay un REVOKE sobre ella en un script para prod). `scripts/limpiar-base-e2e.js` no valida el ref del proyecto; un `.env.test` mal apuntado vacía producción.
3. **Refrescar con lectura parcial anula filas legítimas** (verificado): `pandiSupabaseFetchAll` devuelve datos parciales con error (`main.js:548`), el prefetch los acepta y no chequea el error de instrumentación (`main.js:17712-17725`), y pagina sin `.order`. La RPC anula como huérfanas las filas faltantes. No hay freno ante anulación masiva.

### P1 — Integridad contable

4. **Escritores directos fuera de la RPC**, con DELETE físico y sin lock: `guardarSoloMontoTransaccion` (`main.js:23104`), `guardarSoloModoPagoTransaccion` (`main.js:23361`), `cambiarEstadoTransaccion` (`main.js:34025`, `33926`), comisiones intermediario (`main.js:29882`). Mismo mecanismo que generó los gemelos.
5. **Cadenas de escritura no atómicas que ignoran `{error}`** (≈33 cadenas `.then`). Un corte a mitad deja CC/caja inconsistentes; el invariante de neteo fallido no frena (`main.js:30936`).
6. **Payload viejo pisa cambios nuevos**: el lock ordena pero no hay control de versión (`updated_at`) en `sync_cc_caja_orden`.
7. **Choque de identidad front vs servidor**: el front deduplica por monto+concepto, el servidor por familia+signo (`sync_clave`). Dos filas distintas para el front → UPDATE de una sobre otra en el servidor.
8. **Índices únicos anti-gemelos no creados en prod**; `sync_clave` admite NULL; gemelos de órdenes 28/41/42 abiertos (orden 41: caja +15.300 USD duplicada *a confirmar*).
9. **Colas offline (CC manual, caja) no idempotentes**: reenvío duplica si se corta entre insert y borrado local o con dos pestañas (`main.js:21204`, `21461`).
10. **"Después" en el aviso de nueva versión** deja operar con lógica de sync vieja (`main.js:284-302`).

### P2 — Deuda estructural

11. **Regla de ORO incumplida**: ~230 referencias a códigos de tipo en `main.js`, ~39 ramas dentro de `aplicarMotorCcDesdeReglasDeNegocio`.
12. **Sin migraciones versionadas** (243 scripts sueltos en `sql/`, políticas `*_abm` vs `*_perm` que pueden coexistir) → drift prod/dev.
13. **Sin CI ni hooks**: push a `main` = producción sin tests.
14. **Dependencias**: jspdf 2.5.2 (crítica), jspdf-autotable (alta), xlsx 0.18.5 (CVEs sin fix en npm; uso solo escritura).
15. **Tests unitarios prueban copias** de funciones de `main.js`, no el código real; sin tests de la RPC SQL ni de concurrencia.
16. **Funciones gigantes** (7 > 500 líneas) y ~20 funciones sin referencias (p. ej. `asegurarGananciaPandy`).

### P3 — Higiene y UX

17. Datos reales de prod versionados en git (`Base/cuenta_corriente_*.xlsx`, `docs/CC_DUPLICADOS_PROD_SALDO.xlsx`, `docs/GP_*_PROD.xlsx`, `docs/reglas_de_negocio_rows*`).
18. Basura: `main_text`, `main_js.pdf`, `test-prod.js` (consulta prod) versionados; backups `main.js.backup-*`, `.tmp_*`, `sql/_*` locales; `.vercelignore` no excluye `.env*` / `.tmp_*`.
19. `dist/` 7,6 MB por `copyDirSync` de `assets/` (incluye `Dolar.png` 4,7 MB sin uso e iconos `-dev`); el plugin ignora `--outDir`.
20. Accesibilidad: 2/28 modales con `role="dialog"`, sin foco gestionado; toasts de error efímeros; 4 wraps sin `overscroll-behavior-x: contain` (`style.css:2377`, `2600`, `3239`, `index.html:1240`).
21. Hora UTC visible en observación (`main.js:1804`).

## Documentación contradictoria

- Signos de CC distintos en `docs/REGLA_CC_SIMPLE_INFALIBLE.md` (l. 9 vs 30) y `docs/MODELO_ORDENES_INSTRUMENTACION.md`.
- "Solo ejecutadas generan movimientos" vs pendientes persistidos (`FLUJOS_CC_REGLA.md`).
- DELETE y repoblado en `REGLA_CC_SIMPLE_INFALIBLE.md` / `FLUJOS_CC_REGLA.md` vs libro sin DELETE en `CORAZON_SISTEMA_CC_Y_CAJA.md`.
- `reversar_max_veces` vigente en `CONFIGURACION_REGLAS.md`, obsoleta en `CONFIGURACION_REGLAS_NEGOCIO.md`.
- `cc_modelo_reglas` citada como vigente; estados viejos (cotización/concertada) en `MODELO_Y_DECISIONES.md` y `presentacion/PROPUESTA_COMERCIAL.md`.
- `CC_EXCLUSION_SYNC_ORDENES_23_Y_41.md` cubre en realidad 5 órdenes (23, 28, 41, 42, 106).

## Verificaciones pendientes contra las bases (solo SELECT, prod y dev)

Requieren MCP Supabase o SQL Editor. Además, en Dashboard → Auth: estado de "Allow new users to sign up" y "Leaked password protection".

```sql
-- Tablas y RLS
SELECT relname, relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r' ORDER BY 2,1;
-- Políticas efectivas (abm + perm coexistiendo, USING true)
SELECT tablename, policyname, cmd, roles, qual, with_check FROM pg_policies
WHERE schemaname IN ('public','storage') ORDER BY 1,3,2;
-- EXECUTE a anon/PUBLIC
SELECT routine_name, grantee FROM information_schema.routine_privileges
WHERE routine_schema='public' AND grantee IN ('anon','PUBLIC') ORDER BY 1;
-- ¿Existe limpiar_base_e2e? (en prod no debería)
SELECT proname FROM pg_proc WHERE proname='limpiar_base_e2e';
-- Índices anti-duplicado reales
SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public'
AND indexname IN ('uq_mov_cc_cli_vivo_clave','uq_mov_cc_int_vivo_clave','uq_mov_caja_derivado_vivo_clave');
-- sync_clave NULL en filas vivas derivadas
SELECT 'cc' t, count(*) FROM movimientos_cuenta_corriente
WHERE sync_clave IS NULL AND NOT COALESCE(es_movimiento_manual,false) AND lower(COALESCE(estado,'')) NOT IN ('anulado','anulada')
UNION ALL SELECT 'cc_int', count(*) FROM movimientos_cuenta_corriente_intermediario
WHERE sync_clave IS NULL AND NOT COALESCE(es_movimiento_manual,false) AND lower(COALESCE(estado,'')) NOT IN ('anulado','anulada');
-- Usuarios sin rol o visor (auto-registro)
SELECT u.email, u.created_at, a.role FROM auth.users u LEFT JOIN public.app_user_profile a ON a.user_id=u.id
WHERE a.role IS NULL OR a.role='visor' ORDER BY u.created_at DESC;
-- Huella para detectar drift (comparar resultado prod vs dev)
SELECT md5(string_agg(p.proname||pg_get_function_identity_arguments(p.oid)||md5(pg_get_functiondef(p.oid)),'|' ORDER BY 1))
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f';
SELECT md5(string_agg(tablename||policyname||cmd||COALESCE(qual,'')||COALESCE(with_check,''),'|' ORDER BY 1))
FROM pg_policies WHERE schemaname='public';
SELECT md5(string_agg(indexdef,'|' ORDER BY indexname)) FROM pg_indexes WHERE schemaname='public';
```

## Hoja de ruta sugerida

1. **Inmediato (P0):** confirmar/desactivar auto-registro en prod y endurecer RLS de lectura; barrera de ref en `limpiar-base-e2e.js` y eliminar la función en prod; abortar el sync de una orden ante cualquier error de lectura + `.order('id')` + freno de anulación masiva en la RPC.
2. **Corto plazo (P1):** canalizar todos los escritores CC/caja por la RPC; control optimista por `updated_at`; rechazar `sync_clave` repetida; índices únicos en prod tras limpiar gemelos; idempotencia offline (`client_op_id` UNIQUE); bloquear escrituras con versión vieja.
3. **Mediano plazo (P2):** CI (GitHub Actions: `node --check`, unit, build) + protección de `main`; migraciones con Supabase CLI y baseline desde prod; actualizar jspdf/xlsx; tests de la RPC contra dev; sacar ramas por tipo del motor hacia `reglas_de_negocio`; modularizar `main.js`.
4. **Continuo (P3):** higiene del repo y de `dist/`, accesibilidad de modales, unificar docs contradictorias.

## Herramientas creadas para Claude Code

- `CLAUDE.md` — reglas de Cursor migradas (protocolo, CC/caja, fechas, UI, cierre, despliegue).
- Skills (`.claude/skills/`): `pandi-desplegar`, `pandi-cierre-tarea`, `pandi-supabase`, `pandi-cc-caja`, `pandi-ui-responsive`.
- Subagentes (`.claude/agents/`): `pandi-cc-auditor`, `pandi-supabase-dba`, `pandi-ui-pwa-reviewer`, `pandi-qa-devops`, `pandi-analista-negocio`.
