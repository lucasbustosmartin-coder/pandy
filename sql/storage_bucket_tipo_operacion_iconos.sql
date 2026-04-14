-- Bucket público para iconos personalizados de tipos de operación.
-- Bucket público: las URLs `/storage/v1/object/public/...` sirven imágenes sin política SELECT en storage.objects.
-- No crear política SELECT ancha: el Security Advisor (lint 0025) advierte que permite listar todo el bucket; la app solo usa upload + getPublicUrl (sin list). Ver docs/SUPABASE_REQUISITOS.md §7.
-- 1) Ejecutar en Supabase SQL Editor (o crear el bucket desde Dashboard > Storage con nombre tipo-operacion-iconos, público).
-- 2) La app sube archivos con el cliente autenticado y guarda la URL pública en tipos_operacion.icono_url_publica.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'tipo-operacion-iconos',
  'tipo-operacion-iconos',
  true,
  1048576,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/gif', 'image/svg+xml']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Quitar políticas SELECT heredadas (listado anónimo o autenticado); no hacen falta para URLs públicas del bucket.
DROP POLICY IF EXISTS "tipo_op_iconos_select_public" ON storage.objects;
DROP POLICY IF EXISTS "tipo_op_iconos_select_authenticated" ON storage.objects;

-- Usuarios autenticados pueden subir (ajustá si querés restringir solo a roles con abm_tipos_operacion vía Edge/claim)
DROP POLICY IF EXISTS "tipo_op_iconos_insert_auth" ON storage.objects;
CREATE POLICY "tipo_op_iconos_insert_auth"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'tipo-operacion-iconos');

DROP POLICY IF EXISTS "tipo_op_iconos_update_auth" ON storage.objects;
CREATE POLICY "tipo_op_iconos_update_auth"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'tipo-operacion-iconos');

DROP POLICY IF EXISTS "tipo_op_iconos_delete_auth" ON storage.objects;
CREATE POLICY "tipo_op_iconos_delete_auth"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'tipo-operacion-iconos');
