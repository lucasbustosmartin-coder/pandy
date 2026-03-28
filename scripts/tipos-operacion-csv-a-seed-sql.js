#!/usr/bin/env node
/**
 * Lee docs/tipos_operacion_rows.csv y escribe sql/seed_tipos_operacion_from_docs_csv.sql
 * para repoblar tipos_operacion con los mismos id que el export (útil en dev).
 *
 * El SQL generado incluye al inicio la unicidad (codigo, usa_intermediario) para que
 * funcione aunque la base todavía tenga tipos_operacion_codigo_key (solo codigo).
 *
 * Uso (desde la raíz): node scripts/tipos-operacion-csv-a-seed-sql.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CSV = path.join(ROOT, 'docs', 'tipos_operacion_rows.csv');
const OUT = path.join(ROOT, 'sql', 'seed_tipos_operacion_from_docs_csv.sql');

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (c === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

function sqlStr(s) {
  if (s == null || s === '') return 'NULL';
  return "'" + String(s).replace(/'/g, "''") + "'";
}

function sqlBool(b) {
  return String(b).toLowerCase() === 'true' ? 'true' : 'false';
}

function main() {
  if (!fs.existsSync(CSV)) {
    console.error('No existe:', CSV);
    process.exit(1);
  }
  const text = fs.readFileSync(CSV, 'utf8');
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  const header = lines.shift();
  if (!header || !header.includes('codigo')) {
    console.error('CSV sin encabezado esperado');
    process.exit(1);
  }

  const values = [];
  for (const line of lines) {
    const cols = parseCsvLine(line);
    if (cols.length < 11) {
      console.error('Fila con columnas insuficientes:', line);
      process.exit(1);
    }
    const [
      id,
      codigo,
      nombre,
      activo,
      created_at,
      moneda_in,
      moneda_out,
      usa_intermediario,
      icono_modo,
      icono_url_publica,
      orden_visual,
    ] = cols;
    const url = icono_url_publica && icono_url_publica.trim() !== '' ? icono_url_publica.trim() : null;
    values.push(
      `  (${sqlStr(id)}::uuid, ${sqlStr(codigo)}, ${sqlStr(nombre)}, ${sqlBool(activo)}, ${sqlStr(created_at)}::timestamptz, ${sqlStr(moneda_in)}, ${sqlStr(moneda_out)}, ${sqlBool(usa_intermediario)}, ${sqlStr(icono_modo || 'auto')}, ${url == null ? 'NULL' : sqlStr(url)}, ${Number(orden_visual)})`
    );
  }

  const preamble = `-- ---------- 1) Misma semántica que migracion_tipos_operacion_unique_solo_uq.sql ----------
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
`;

  const body = `-- =============================================================================
-- Tipos de operación: carga desde export CSV del repo
-- Fuente: docs/tipos_operacion_rows.csv
-- Regenerar: node scripts/tipos-operacion-csv-a-seed-sql.js
--
-- Incluye ajuste de unicidad (codigo + usa_intermediario) antes del DELETE/INSERT.
-- Solo en bases sin órdenes que referencien tipo_operacion_id (o tras limpiar esas FK).
-- =============================================================================

BEGIN;

${preamble}

DELETE FROM public.tipos_operacion;

INSERT INTO public.tipos_operacion (
  id, codigo, nombre, activo, created_at,
  moneda_in, moneda_out, usa_intermediario,
  icono_modo, icono_url_publica, orden_visual
) VALUES
${values.join(',\n')};

COMMIT;
`;

  fs.writeFileSync(OUT, body, 'utf8');
  console.log('Escrito:', path.relative(ROOT, OUT), `(${values.length} filas)`);
}

main();
