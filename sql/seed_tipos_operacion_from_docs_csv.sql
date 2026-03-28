-- =============================================================================
-- Tipos de operación: carga desde export CSV del repo
-- Fuente: docs/tipos_operacion_rows.csv
-- Regenerar: node scripts/tipos-operacion-csv-a-seed-sql.js
--
-- Incluye ajuste de unicidad (codigo + usa_intermediario) antes del DELETE/INSERT.
-- Solo en bases sin órdenes que referencien tipo_operacion_id (o tras limpiar esas FK).
-- =============================================================================

BEGIN;

-- ---------- 1) Misma semántica que migracion_tipos_operacion_unique_solo_uq.sql ----------
-- Sin esto, Postgres mantiene UNIQUE solo sobre codigo y el INSERT falla (23505) al repetir codigo.
ALTER TABLE public.tipos_operacion
  ADD COLUMN IF NOT EXISTS usa_intermediario boolean DEFAULT false;

UPDATE public.tipos_operacion
SET usa_intermediario = COALESCE(usa_intermediario, false);

ALTER TABLE public.tipos_operacion
  ALTER COLUMN usa_intermediario SET DEFAULT false,
  ALTER COLUMN usa_intermediario SET NOT NULL;

ALTER TABLE public.tipos_operacion DROP CONSTRAINT IF EXISTS tipos_operacion_codigo_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tipos_operacion_codigo_usa_intermediario
  ON public.tipos_operacion (codigo, usa_intermediario);

COMMENT ON TABLE public.tipos_operacion IS 'Catálogo de tipos. codigo puede repetirse si usa_intermediario difiere (ej. USD-ARS directo vs intermediado).';


DELETE FROM public.tipos_operacion;

INSERT INTO public.tipos_operacion (
  id, codigo, nombre, activo, created_at,
  moneda_in, moneda_out, usa_intermediario,
  icono_modo, icono_url_publica, orden_visual
) VALUES
  ('0070f180-69cb-4324-af79-7c33c16df457'::uuid, 'ARS-USD', 'ARS - USD', true, '2026-03-09 18:33:55+00'::timestamptz, 'ARS', 'USD', false, 'auto', NULL, 20),
  ('0b5ab536-e18d-46e4-a7e1-385844cbec4c'::uuid, 'EUR-ARS', 'EUR - ARS', true, '2026-03-22 15:09:54.710287+00'::timestamptz, 'EUR', 'ARS', true, 'auto', NULL, 110),
  ('101da3ca-6eb1-4d57-a065-210dd9bc8278'::uuid, 'CHEQUE-ARS', 'CHEQUE – ARS', true, '2026-03-19 12:28:36.672779+00'::timestamptz, 'CHEQUE', 'ARS', true, 'auto', NULL, 10),
  ('559c3028-7f90-4ca5-968d-9cfc914ca961'::uuid, 'ARS-EUR', 'ARS - EUR', true, '2026-03-12 20:46:57.083016+00'::timestamptz, 'ARS', 'EUR', false, 'auto', NULL, 80),
  ('593668d7-3818-4711-9d24-52cc0860518d'::uuid, 'USD-USD', 'USD - USD', true, '2026-03-09 01:54:49.943985+00'::timestamptz, 'USD', 'USD', false, 'auto', NULL, 40),
  ('5f5baa3a-5984-4b83-8aa4-e23266520bdd'::uuid, 'USD-EUR', 'USD - EUR', true, '2026-03-22 15:03:40.429623+00'::timestamptz, 'USD', 'EUR', false, 'auto', NULL, 130),
  ('78d80d42-554f-4647-89f5-5862feeab2d3'::uuid, 'USD-ARS', 'USD - ARS', true, '2026-03-09 12:07:55.895581+00'::timestamptz, 'USD', 'ARS', false, 'auto', NULL, 30),
  ('78f2393e-4e25-4a77-b93a-8a62a9158123'::uuid, 'EUR-USD', 'EUR - USD', true, '2026-03-12 20:48:53.121661+00'::timestamptz, 'EUR', 'USD', true, 'auto', NULL, 140),
  ('8092fab5-56f9-4512-9e78-516ce346f4e8'::uuid, 'EUR-ARS', 'EUR - ARS', true, '2026-03-12 20:47:50.90019+00'::timestamptz, 'EUR', 'ARS', false, 'auto', NULL, 90),
  ('8dfcf674-cb5e-4a42-bb54-cc09c884c67e'::uuid, 'USD-EUR', 'USD - EUR', true, '2026-03-12 20:48:29.324912+00'::timestamptz, 'USD', 'EUR', true, 'auto', NULL, 150),
  ('9abca35a-f3c3-40c9-8148-b77858d6cfd3'::uuid, 'ARS-USD', 'ARS - USD', true, '2026-03-20 14:45:18.966859+00'::timestamptz, 'ARS', 'USD', true, 'auto', NULL, 50),
  ('ad1902c9-09b1-4d32-b10b-1d145fa47ae0'::uuid, 'USD-USD', 'USD - USD', true, '2026-03-21 16:35:58.101093+00'::timestamptz, 'USD', 'USD', true, 'auto', NULL, 70),
  ('b29b350b-308b-40f8-9794-d43a75d5a0dc'::uuid, 'ARS-EUR', 'ARS - EUR', true, '2026-03-22 15:07:55.824758+00'::timestamptz, 'ARS', 'EUR', true, 'auto', NULL, 100),
  ('d88f8c38-3495-4b22-a32a-76066825a31e'::uuid, 'EUR-USD', 'EUR - USD', true, '2026-03-22 15:01:56.5927+00'::timestamptz, 'EUR', 'USD', false, 'auto', NULL, 120),
  ('f4126c88-cc8c-4ae2-97ed-464d1f71174f'::uuid, 'USD-ARS', 'USD - ARS', true, '2026-03-20 12:27:20.368836+00'::timestamptz, 'USD', 'ARS', true, 'auto', NULL, 60);

COMMIT;
