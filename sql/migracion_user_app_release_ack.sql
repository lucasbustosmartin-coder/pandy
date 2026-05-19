-- Pandi: registro por usuario de la última versión de release cuyas novedades vio (modal «Nueva versión»).
-- Idempotente: ejecutar en Pandy (prod) y Pandy-Dev.

CREATE TABLE IF NOT EXISTS public.user_app_release_ack (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  version_label text NOT NULL,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_app_release_ack_version_label_len CHECK (char_length(version_label) <= 32)
);

COMMENT ON TABLE public.user_app_release_ack IS
  'Última versionLabel (ej. v3.8.14) cuyas novedades el usuario confirmó en el modal de release.';
COMMENT ON COLUMN public.user_app_release_ack.version_label IS
  'Debe coincidir con PANDI_RELEASE_BLURB.versionLabel / pandi-release.json del despliegue.';

CREATE INDEX IF NOT EXISTS idx_user_app_release_ack_acknowledged_at
  ON public.user_app_release_ack (acknowledged_at DESC);

ALTER TABLE public.user_app_release_ack ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_app_release_ack_select_own ON public.user_app_release_ack;
CREATE POLICY user_app_release_ack_select_own
  ON public.user_app_release_ack
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_app_release_ack_insert_own ON public.user_app_release_ack;
CREATE POLICY user_app_release_ack_insert_own
  ON public.user_app_release_ack
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_app_release_ack_update_own ON public.user_app_release_ack;
CREATE POLICY user_app_release_ack_update_own
  ON public.user_app_release_ack
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.get_my_release_ack_version()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT version_label
  FROM public.user_app_release_ack
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_my_release_ack_version() IS
  'versionLabel que el usuario autenticado ya vio en el modal de novedades; null si nunca confirmó.';

CREATE OR REPLACE FUNCTION public.set_my_release_ack_version(p_version_label text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida';
  END IF;
  v := left(btrim(COALESCE(p_version_label, '')), 32);
  IF v = '' THEN
    RAISE EXCEPTION 'Versión no válida';
  END IF;
  INSERT INTO public.user_app_release_ack (user_id, version_label, acknowledged_at)
  VALUES (auth.uid(), v, now())
  ON CONFLICT (user_id) DO UPDATE
  SET version_label = EXCLUDED.version_label,
      acknowledged_at = EXCLUDED.acknowledged_at;
END;
$$;

COMMENT ON FUNCTION public.set_my_release_ack_version(text) IS
  'Marca que el usuario vio las novedades de la versión indicada (modal «Nueva versión»).';

REVOKE ALL ON FUNCTION public.get_my_release_ack_version() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_release_ack_version() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_release_ack_version() TO authenticated;

REVOKE ALL ON FUNCTION public.set_my_release_ack_version(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_my_release_ack_version(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_my_release_ack_version(text) TO authenticated;
