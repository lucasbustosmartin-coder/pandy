-- Declina la reactivación automática de multicontraparte_manual en sync cuando el operador desactiva Multi en la UI.
-- Ver sincronizarCcYCajaDesdeOrden (main.js).
-- Despliegue documentado: Pandy-Dev y producción (2026-04-17). Requisitos: docs/SUPABASE_REQUISITOS.md.

ALTER TABLE public.instrumentacion
  ADD COLUMN IF NOT EXISTS multicontraparte_sync_no_auto boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.instrumentacion.multicontraparte_sync_no_auto IS
  'Si true: el sync no pone multicontraparte_manual=true automáticamente (Aj o desvío pag/cob). Se activa al desmarcar Multi; se limpia al marcar Multi o al activar MC por sync.';
