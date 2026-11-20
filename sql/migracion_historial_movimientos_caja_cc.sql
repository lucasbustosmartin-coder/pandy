-- Fase C1 — Historial inmutable de movimientos de caja y cuenta corriente (2026-11-20)
-- Contexto: docs/INCIDENTE_CAJA_ARS_SYNC_2026-11-19.md §5.C
--
-- Toda alta / cambio / baja (incluido DELETE físico) en:
--   movimientos_caja, movimientos_cuenta_corriente, movimientos_cuenta_corriente_intermediario
-- queda registrada por TRIGGER (no depende del front, no se puede saltear desde la app):
--   valores antes/después, usuario, hora, fecha contable afectada, impacto en saldo,
--   "afecta día cerrado" y origen (RPC / escritura directa de la app / SQL manual, pantalla de la app).
-- La tabla no admite UPDATE ni DELETE (trigger) y solo la leen usuarios con permiso ver_auditoria.
-- Además: auditoria_app pasa a inmutable e indexada.
-- Idempotente. Aplicar en Pandy-Dev, probar, luego Pandy.

BEGIN;
SET LOCAL lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1) Tabla
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.movimientos_historial (
  id                    bigserial PRIMARY KEY,
  ocurrido_en           timestamptz NOT NULL DEFAULT now(),
  libro                 text NOT NULL,              -- caja | cc_cliente | cc_intermediario
  operacion             text NOT NULL,              -- alta | cambio | baja_fisica
  movimiento_id         uuid,
  usuario_id            uuid,                       -- auth.uid() de quien hizo el pedido (NULL si SQL manual)
  rol_db                text,                       -- rol del pedido (claims.role) o session_user si es SQL manual
  origen                text,                       -- sync | escritura_app | sql_manual | <pandi.origen>
  origen_ruta           text,                       -- p.ej. POST /rpc/sync_cc_caja_orden, PATCH /movimientos_caja
  origen_pantalla       text,                       -- header x-pandi-pantalla (si el front lo envía)
  origen_detalle        text,                       -- proceso: pandi.origen_detalle o header x-pandi-proceso
  version_app           text,                       -- header x-pandi-version
  caja_tipo             text,
  moneda                text,
  entidad_id            uuid,                       -- cliente_id / intermediario_id
  orden_id              uuid,
  orden_numero          integer,
  transaccion_id        uuid,
  transaccion_numero    integer,
  es_manual             boolean,
  fecha_antes           date,
  fecha_despues         date,
  monto_antes           numeric,
  monto_despues         numeric,
  estado_antes          text,
  estado_despues        text,
  impacto_saldo         numeric NOT NULL DEFAULT 0, -- saldo vigente después − antes (anulado = 0)
  afecta_dia_cerrado    boolean NOT NULL DEFAULT false,
  campos_cambiados      text[],
  datos_antes           jsonb,
  datos_despues         jsonb
);

COMMENT ON TABLE public.movimientos_historial IS
  'Historial inmutable (trigger) de altas/cambios/bajas en caja y CC. Fase C1, incidente 19/11/2026.';

CREATE INDEX IF NOT EXISTS idx_mov_hist_ocurrido   ON public.movimientos_historial (ocurrido_en DESC);
CREATE INDEX IF NOT EXISTS idx_mov_hist_fecha      ON public.movimientos_historial (fecha_despues, fecha_antes);
CREATE INDEX IF NOT EXISTS idx_mov_hist_libro      ON public.movimientos_historial (libro, moneda, caja_tipo);
CREATE INDEX IF NOT EXISTS idx_mov_hist_orden      ON public.movimientos_historial (orden_numero);
CREATE INDEX IF NOT EXISTS idx_mov_hist_mov        ON public.movimientos_historial (movimiento_id);
CREATE INDEX IF NOT EXISTS idx_mov_hist_cerrado    ON public.movimientos_historial (ocurrido_en DESC) WHERE afecta_dia_cerrado;

ALTER TABLE public.movimientos_historial ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS movimientos_historial_select ON public.movimientos_historial;
CREATE POLICY movimientos_historial_select ON public.movimientos_historial
  FOR SELECT TO authenticated USING ((SELECT public.has_permission('ver_auditoria')));
REVOKE ALL ON public.movimientos_historial FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.movimientos_historial TO authenticated;
REVOKE ALL ON SEQUENCE public.movimientos_historial_id_seq FROM PUBLIC, anon, authenticated;

-- Inmutable
CREATE OR REPLACE FUNCTION public.historial_inmutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- Única excepción: FK ON DELETE SET NULL al borrar un usuario (solo cambia usuario_id a NULL).
  IF TG_OP = 'UPDATE' AND pg_trigger_depth() > 1 AND to_jsonb(NEW) ? 'usuario_id'
     AND (to_jsonb(NEW) ->> 'usuario_id') IS NULL
     AND (to_jsonb(NEW) - 'usuario_id') = (to_jsonb(OLD) - 'usuario_id') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'Registro de auditoría inmutable: no se permite TRUNCATE en %', TG_TABLE_NAME;
  END IF;
  RAISE EXCEPTION 'Registro de auditoría inmutable: no se permite % en %', TG_OP, TG_TABLE_NAME;
END;
$$;

DROP TRIGGER IF EXISTS trg_movimientos_historial_inmutable ON public.movimientos_historial;
CREATE TRIGGER trg_movimientos_historial_inmutable
  BEFORE UPDATE OR DELETE ON public.movimientos_historial
  FOR EACH ROW EXECUTE FUNCTION public.historial_inmutable();
DROP TRIGGER IF EXISTS trg_movimientos_historial_no_truncate ON public.movimientos_historial;
CREATE TRIGGER trg_movimientos_historial_no_truncate
  BEFORE TRUNCATE ON public.movimientos_historial
  FOR EACH STATEMENT EXECUTE FUNCTION public.historial_inmutable();
REVOKE TRUNCATE, UPDATE, DELETE ON public.movimientos_historial FROM service_role;

-- ---------------------------------------------------------------------------
-- 2) Función de trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_registrar_historial_movimiento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old jsonb := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END;
  v_new jsonb := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END;
  v_ref jsonb := COALESCE(v_new, v_old);
  v_libro text := CASE TG_TABLE_NAME
                    WHEN 'movimientos_caja' THEN 'caja'
                    WHEN 'movimientos_cuenta_corriente' THEN 'cc_cliente'
                    ELSE 'cc_intermediario' END;
  v_campos text[] := ARRAY[]::text[];
  v_k text;
  v_vig_antes numeric := 0;
  v_vig_despues numeric := 0;
  v_fecha_antes date;
  v_fecha_despues date;
  v_hoy date := public.fecha_hoy_argentina();
  v_headers json;
  v_claims text;
  v_origen text;
  v_ruta text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    FOREACH v_k IN ARRAY ARRAY['monto', 'fecha', 'estado', 'moneda', 'caja_tipo', 'cliente_id', 'intermediario_id',
                               'transaccion_id', 'orden_id', 'concepto', 'monto_usd', 'monto_ars', 'monto_eur',
                               'tipo_movimiento_id', 'sync_clave']
    LOOP
      IF (v_old -> v_k) IS DISTINCT FROM (v_new -> v_k) THEN
        v_campos := v_campos || v_k;
      END IF;
    END LOOP;
    IF cardinality(v_campos) = 0 THEN
      RETURN NULL;  -- solo cambió estado_fecha / usuario / metadatos: no es un cambio contable
    END IF;
  END IF;

  IF v_old IS NOT NULL AND lower(COALESCE(v_old ->> 'estado', '')) NOT IN ('anulado', 'anulada') THEN
    v_vig_antes := COALESCE((v_old ->> 'monto')::numeric, 0);
  END IF;
  IF v_new IS NOT NULL AND lower(COALESCE(v_new ->> 'estado', '')) NOT IN ('anulado', 'anulada') THEN
    v_vig_despues := COALESCE((v_new ->> 'monto')::numeric, 0);
  END IF;
  v_fecha_antes := NULLIF(v_old ->> 'fecha', '')::date;
  v_fecha_despues := NULLIF(v_new ->> 'fecha', '')::date;

  v_claims := NULLIF(current_setting('request.jwt.claims', true), '');
  IF v_claims IS NOT NULL THEN
    v_headers := NULLIF(current_setting('request.headers', true), '')::json;  -- PostgREST siempre envía JSON válido
  END IF;
  v_ruta := NULLIF(trim(COALESCE(current_setting('request.method', true), '') || ' ' ||
                        COALESCE(current_setting('request.path', true), '')), '');
  v_origen := COALESCE(
    NULLIF(current_setting('pandi.origen', true), ''),
    CASE
      WHEN v_claims IS NULL THEN 'sql_manual'
      WHEN v_ruta ILIKE '%/rpc/sync_cc_caja%' THEN 'sync'
      WHEN v_ruta ILIKE '%/rpc/%' THEN 'rpc'
      ELSE 'escritura_app'
    END
  );

  INSERT INTO public.movimientos_historial (
    libro, operacion, movimiento_id, usuario_id, rol_db, origen, origen_ruta, origen_pantalla, origen_detalle,
    version_app, caja_tipo, moneda, entidad_id, orden_id, orden_numero, transaccion_id, transaccion_numero,
    es_manual, fecha_antes, fecha_despues, monto_antes, monto_despues, estado_antes, estado_despues,
    impacto_saldo, afecta_dia_cerrado, campos_cambiados, datos_antes, datos_despues
  ) VALUES (
    v_libro,
    CASE TG_OP WHEN 'INSERT' THEN 'alta' WHEN 'UPDATE' THEN 'cambio' ELSE 'baja_fisica' END,
    NULLIF(v_ref ->> 'id', '')::uuid,
    auth.uid(),
    COALESCE(v_claims::json ->> 'role', session_user),
    v_origen,
    v_ruta,
    v_headers ->> 'x-pandi-pantalla',
    COALESCE(NULLIF(current_setting('pandi.origen_detalle', true), ''), v_headers ->> 'x-pandi-proceso'),
    v_headers ->> 'x-pandi-version',
    CASE WHEN v_libro = 'caja' THEN COALESCE(v_ref ->> 'caja_tipo', 'efectivo') END,
    v_ref ->> 'moneda',
    COALESCE(NULLIF(v_ref ->> 'cliente_id', ''), NULLIF(v_ref ->> 'intermediario_id', ''))::uuid,
    NULLIF(v_ref ->> 'orden_id', '')::uuid,
    COALESCE(NULLIF(v_ref ->> 'orden_numero', '')::integer,
             (SELECT o.numero FROM public.ordenes o WHERE o.id = NULLIF(v_ref ->> 'orden_id', '')::uuid)),
    NULLIF(v_ref ->> 'transaccion_id', '')::uuid,
    NULLIF(v_ref ->> 'transaccion_numero', '')::integer,
    CASE WHEN v_libro = 'caja' THEN (v_ref ->> 'tipo_movimiento_id') IS NOT NULL
         ELSE COALESCE((v_ref ->> 'es_movimiento_manual')::boolean, false) END,
    v_fecha_antes,
    v_fecha_despues,
    (v_old ->> 'monto')::numeric,
    (v_new ->> 'monto')::numeric,
    v_old ->> 'estado',
    v_new ->> 'estado',
    v_vig_despues - v_vig_antes,
    (
      LEAST(COALESCE(v_fecha_antes, v_fecha_despues), COALESCE(v_fecha_despues, v_fecha_antes)) < v_hoy
      AND (
        v_vig_despues - v_vig_antes <> 0
        OR v_fecha_antes IS DISTINCT FROM v_fecha_despues AND TG_OP = 'UPDATE'
        OR 'moneda' = ANY (v_campos) OR 'caja_tipo' = ANY (v_campos)
        OR (v_libro <> 'caja' AND 'estado' = ANY (v_campos))
        OR 'cliente_id' = ANY (v_campos) OR 'intermediario_id' = ANY (v_campos)
      )
    ),
    CASE WHEN TG_OP = 'UPDATE' THEN v_campos END,
    v_old,
    v_new
  );
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_registrar_historial_movimiento() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_historial_movimientos_caja ON public.movimientos_caja;
CREATE TRIGGER trg_historial_movimientos_caja
  AFTER INSERT OR UPDATE OR DELETE ON public.movimientos_caja
  FOR EACH ROW EXECUTE FUNCTION public.trg_registrar_historial_movimiento();

DROP TRIGGER IF EXISTS trg_historial_mov_cc ON public.movimientos_cuenta_corriente;
CREATE TRIGGER trg_historial_mov_cc
  AFTER INSERT OR UPDATE OR DELETE ON public.movimientos_cuenta_corriente
  FOR EACH ROW EXECUTE FUNCTION public.trg_registrar_historial_movimiento();

DROP TRIGGER IF EXISTS trg_historial_mov_cc_int ON public.movimientos_cuenta_corriente_intermediario;
CREATE TRIGGER trg_historial_mov_cc_int
  AFTER INSERT OR UPDATE OR DELETE ON public.movimientos_cuenta_corriente_intermediario
  FOR EACH ROW EXECUTE FUNCTION public.trg_registrar_historial_movimiento();

-- ---------------------------------------------------------------------------
-- 3) auditoria_app: inmutable + índices
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_auditoria_app_inmutable ON public.auditoria_app;
CREATE TRIGGER trg_auditoria_app_inmutable
  BEFORE UPDATE OR DELETE ON public.auditoria_app
  FOR EACH ROW EXECUTE FUNCTION public.historial_inmutable();
DROP TRIGGER IF EXISTS trg_auditoria_app_no_truncate ON public.auditoria_app;
CREATE TRIGGER trg_auditoria_app_no_truncate
  BEFORE TRUNCATE ON public.auditoria_app
  FOR EACH STATEMENT EXECUTE FUNCTION public.historial_inmutable();
REVOKE TRUNCATE, UPDATE, DELETE ON public.auditoria_app FROM service_role;
-- Nota: sql/limpiar_auditoria_cc_caja_sync_error_20261103.sql (DELETE puntual, ya ejecutado) ya no puede re-ejecutarse.

CREATE INDEX IF NOT EXISTS idx_auditoria_app_creado ON public.auditoria_app (creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_app_cat ON public.auditoria_app (categoria, accion, creado_en DESC);

COMMIT;

-- Verificación
-- SELECT tgname, tgrelid::regclass FROM pg_trigger WHERE tgname LIKE 'trg_historial%' OR tgname LIKE '%inmutable';
-- SELECT * FROM public.movimientos_historial ORDER BY id DESC LIMIT 20;
