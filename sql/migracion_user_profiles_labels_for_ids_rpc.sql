-- Etiquetas de usuario para listados (órdenes, CC, cajas) sin permiso assign_roles.
-- La SELECT directa a user_profiles solo devuelve la fila propia o todas si assign_roles;
-- esta función (SECURITY DEFINER) devuelve display_name/email para los UUID solicitados
-- y se usa desde el front en fetchMapaEtiquetaUsuarioPorIds.
-- Ejecutar en Supabase SQL Editor (prod y dev según corresponda).

CREATE OR REPLACE FUNCTION public.user_profiles_labels_for_ids(p_ids uuid[])
RETURNS TABLE (id uuid, display_name text, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.display_name, p.email
  FROM public.user_profiles p
  WHERE p.id = ANY (COALESCE(p_ids, ARRAY[]::uuid[]));
$$;

COMMENT ON FUNCTION public.user_profiles_labels_for_ids(uuid[]) IS
  'Devuelve id, display_name y email para armar etiquetas en listados; solo columnas no sensibles.';

REVOKE ALL ON FUNCTION public.user_profiles_labels_for_ids(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_profiles_labels_for_ids(uuid[]) TO authenticated;
