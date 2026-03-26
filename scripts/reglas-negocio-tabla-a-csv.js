#!/usr/bin/env node
/**
 * Genera docs/reglas_de_negocio_rows (1).csv desde sql/reglas_de_negocio_tabla.sql
 * (mismas columnas lógicas que un export de tabla, sin id ni created_at).
 *
 * Uso: node scripts/reglas-negocio-tabla-a-csv.js
 *
 * Si exportás desde Supabase a CSV, guardalo como docs/reglas_de_negocio_rows (1).csv
 * para comparar con la matriz del repo; este script vuelve a alinear el archivo con el canónico.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const sqlPath = path.join(root, 'sql', 'reglas_de_negocio_tabla.sql');
const outPath = path.join(root, 'docs', 'reglas_de_negocio_rows (1).csv');

function csvCell(v) {
  if (v == null || v === '') return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function parseTupleLine(line) {
  const t = line.trim();
  if (!t.startsWith('(')) return null;
  // Quita coma final y comentarios
  let s = t.replace(/\s*--.*$/, '').trim();
  if (s.endsWith(',')) s = s.slice(0, -1);
  if (!s.endsWith(')')) return null;
  s = s.slice(1, -1);
  const parts = [];
  let i = 0;
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i])) i++;
    if (i >= s.length) break;
    if (s[i] === "'") {
      i++;
      let buf = '';
      while (i < s.length) {
        if (s[i] === "'" && s[i + 1] === "'") {
          buf += "'";
          i += 2;
          continue;
        }
        if (s[i] === "'") {
          i++;
          break;
        }
        buf += s[i];
        i++;
      }
      parts.push(buf);
      while (i < s.length && /[\s,]/.test(s[i])) i++;
      continue;
    }
    if (s.slice(i, i + 4) === 'true') {
      parts.push('true');
      i += 4;
      while (i < s.length && /[\s,]/.test(s[i])) i++;
      continue;
    }
    if (s.slice(i, i + 5) === 'false') {
      parts.push('false');
      i += 5;
      while (i < s.length && /[\s,]/.test(s[i])) i++;
      continue;
    }
    if (s.slice(i, i + 4).toUpperCase() === 'NULL') {
      parts.push('');
      i += 4;
      while (i < s.length && /[\s,]/.test(s[i])) i++;
      continue;
    }
    const numM = s.slice(i).match(/^-?\d+/);
    if (numM) {
      parts.push(numM[0]);
      i += numM[0].length;
      while (i < s.length && /[\s,]/.test(s[i])) i++;
      continue;
    }
    return null;
  }
  return parts;
}

const header = [
  'tipo_operacion_codigo',
  'usa_intermediario',
  'entidad_cc',
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
  'condicion_estado_comision',
];

const text = fs.readFileSync(sqlPath, 'utf8');
const lines = text.split('\n');
const rows = [];

for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('(')) continue;
  if (trimmed.startsWith('(tipo_operacion_codigo')) continue;
  const parts = parseTupleLine(line);
  if (!parts || parts.length < 15) continue;
  let cond = '';
  if (parts.length >= 16) cond = parts[15];
  rows.push([
    parts[0],
    parts[1],
    parts[2],
    parts[3],
    parts[4],
    parts[5],
    parts[6],
    parts[7],
    parts[8],
    parts[9],
    parts[10],
    parts[11],
    parts[12],
    parts[13],
    parts[14],
    cond,
  ]);
}

const csvLines = [header.map(csvCell).join(',')];
for (const r of rows) {
  csvLines.push(r.map(csvCell).join(','));
}

fs.writeFileSync(outPath, csvLines.join('\n') + '\n', 'utf8');
console.log('Escrito:', outPath, '(' + rows.length + ' filas)');
