#!/usr/bin/env node
/**
 * Lee un CSV export de public.reglas_de_negocio y escribe
 * sql/seed_reglas_de_negocio_from_docs_csv.sql
 *
 * Archivos (en orden): docs/reglas_de_negocio_rows.csv, docs/reglas_de_negocio_rows (2).csv
 *
 * El SQL hace DELETE completo y luego alinea UNIQUE (con entidad_cc) y CHECK monto_origen,
 * igual que en bases que aún tenían la unicidad vieja sin entidad_cc.
 *
 * Uso: node scripts/reglas-de-negocio-csv-a-seed-sql.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CANDIDATES = [
  path.join(ROOT, 'docs', 'reglas_de_negocio_rows.csv'),
  path.join(ROOT, 'docs', 'reglas_de_negocio_rows (2).csv'),
];
const OUT = path.join(ROOT, 'sql', 'seed_reglas_de_negocio_from_docs_csv.sql');

function resolveCsvPath() {
  for (const p of CANDIDATES) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

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

function sqlSmallint(n) {
  const x = parseInt(String(n).trim(), 10);
  if (Number.isNaN(x)) throw new Error('entero inválido: ' + n);
  return String(x);
}

const PREAMBLE = `
-- ---------- Tras vaciar: alinear UNIQUE (incluye entidad_cc) y CHECK monto_origen ----------
-- Evita 23505 cuando la base tenía unicidad sin entidad_cc o CHECK viejo.
ALTER TABLE public.reglas_de_negocio
  ADD COLUMN IF NOT EXISTS entidad_cc text NOT NULL DEFAULT 'cliente'
    CHECK (entidad_cc IN ('cliente', 'intermediario'));

COMMENT ON COLUMN public.reglas_de_negocio.entidad_cc IS
  'Ledger al que aplica la fila: cliente o intermediario.';

ALTER TABLE public.reglas_de_negocio ADD COLUMN IF NOT EXISTS condicion_estado_comision text;

COMMENT ON COLUMN public.reglas_de_negocio.condicion_estado_comision IS
  'Para es_comision=true: par_pandy_int | par_cliente | null (motor main.js).';

ALTER TABLE public.reglas_de_negocio DROP CONSTRAINT IF EXISTS reglas_de_negocio_uniq;

ALTER TABLE public.reglas_de_negocio
  ADD CONSTRAINT reglas_de_negocio_uniq UNIQUE (
    tipo_operacion_codigo,
    usa_intermediario,
    entidad_cc,
    pagador,
    cobrador,
    tipo_transaccion,
    es_comision,
    estado_transaccion,
    contrapartida_ejecutada,
    linea
  );

ALTER TABLE public.reglas_de_negocio DROP CONSTRAINT IF EXISTS reglas_de_negocio_monto_origen_check;
ALTER TABLE public.reglas_de_negocio
  ADD CONSTRAINT reglas_de_negocio_monto_origen_check CHECK (monto_origen IN (
    'mr', 'me', 'monto_transaccion',
    'me_prorrateado', 'mr_prorrateado',
    'mr_menos_me',
    'monto_efectivo_intermediario',
    'comision_intermediario'
  ));
`;

function main() {
  const csvPath = resolveCsvPath();
  if (!csvPath) {
    console.error('No se encontró CSV. Colocá uno de:');
    CANDIDATES.forEach((p) => console.error(' ', p));
    process.exit(1);
  }

  const text = fs.readFileSync(csvPath, 'utf8');
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  const headerCols = parseCsvLine(lines.shift());
  const idx = {};
  headerCols.forEach((h, i) => {
    idx[h.trim()] = i;
  });

  const need = [
    'id',
    'tipo_operacion_codigo',
    'usa_intermediario',
    'pagador',
    'cobrador',
    'tipo_transaccion',
    'es_comision',
    'estado_transaccion',
    'contrapartida_ejecutada',
    'linea',
    'moneda',
    'signo',
    'monto_origen',
    'incluir_en_detalle',
    'concepto_leyenda',
    'created_at',
    'entidad_cc',
    'condicion_estado_comision',
  ];
  for (const k of need) {
    if (idx[k] === undefined) {
      console.error('Falta columna en CSV:', k);
      process.exit(1);
    }
  }

  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const values = [];
  for (const line of lines) {
    const cols = parseCsvLine(line);
    const g = (k) => (cols[idx[k]] != null ? cols[idx[k]] : '').trim();
    if (!uuidRe.test(g('id'))) continue;
    const cond = g('condicion_estado_comision');
    values.push(
      `  (${sqlStr(g('id'))}::uuid, ${sqlStr(g('tipo_operacion_codigo'))}, ${sqlBool(g('usa_intermediario'))}, ${sqlStr(g('pagador'))}, ${sqlStr(g('cobrador'))}, ${sqlStr(g('tipo_transaccion'))}, ${sqlBool(g('es_comision'))}, ${sqlStr(g('estado_transaccion'))}, ${sqlBool(g('contrapartida_ejecutada'))}, ${sqlSmallint(g('linea'))}::smallint, ${sqlStr(g('moneda'))}, ${sqlSmallint(g('signo'))}::smallint, ${sqlStr(g('monto_origen'))}, ${sqlBool(g('incluir_en_detalle'))}, ${sqlStr(g('concepto_leyenda'))}, ${cond === '' ? 'NULL' : sqlStr(cond)}, ${sqlStr(g('entidad_cc'))}, ${sqlStr(g('created_at'))}::timestamptz)`
    );
  }

  const relCsv = path.relative(ROOT, csvPath);
  const body = `-- =============================================================================
-- reglas_de_negocio: carga desde CSV en docs/
-- Fuente leída: ${relCsv}
-- Regenerar: node scripts/reglas-de-negocio-csv-a-seed-sql.js
-- npm: npm run sql:seed:reglas-de-negocio
--
-- ADVERTENCIA: borra TODAS las filas de reglas_de_negocio y las repone desde el CSV.
-- Ejecutar en SQL Editor (suele ser rol con bypass RLS). Hacé backup antes.
-- =============================================================================

BEGIN;

DELETE FROM public.reglas_de_negocio;
${PREAMBLE}

INSERT INTO public.reglas_de_negocio (
  id, tipo_operacion_codigo, usa_intermediario, pagador, cobrador, tipo_transaccion, es_comision,
  estado_transaccion, contrapartida_ejecutada, linea, moneda, signo, monto_origen,
  incluir_en_detalle, concepto_leyenda, condicion_estado_comision, entidad_cc, created_at
) VALUES
${values.join(',\n')};

COMMIT;
`;

  fs.writeFileSync(OUT, body.trimStart(), 'utf8');
  console.log('CSV:', relCsv);
  console.log('Escrito:', path.relative(ROOT, OUT), `(${values.length} filas)`);
}

main();
