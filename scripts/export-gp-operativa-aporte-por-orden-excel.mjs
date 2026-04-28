/**
 * Exporta a Excel el aporte por orden al total P&L (devengado).
 *
 * Genera 2 archivos:
 * - Detalle: una fila por movimiento/bolsa que afecta al total.
 * - Resumen: una fila por (orden, moneda) con desglose por bolsa.
 *
 * Requiere en `.env`:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Uso:
 *   node scripts/export-gp-operativa-aporte-por-orden-excel.mjs
 *   node scripts/export-gp-operativa-aporte-por-orden-excel.mjs --out-detalle=docs/GP_APORTE_ORDEN_DETALLE.xlsx --out-resumen=docs/GP_APORTE_ORDEN_RESUMEN.xlsx
 *   node scripts/export-gp-operativa-aporte-por-orden-excel.mjs --url=https://bxwxuzbahewvptarlnxm.supabase.co --key=SERVICE_ROLE_PROD
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ExcelJS from 'exceljs';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
dotenv.config({ path: path.join(ROOT, '.env') });

const BOLSAS = [
  'caja_ordenes',
  'cc_cliente',
  'cc_intermediario',
  'cc_resultado_economico_compensatorio',
  'comisiones_acuerdo_pandy',
  'comisiones_acuerdo_intermediario',
];

function parseArgs() {
  const argv = process.argv.slice(2);
  let outDetalle = path.join(ROOT, 'docs', 'GP_OPERATIVA_APORTE_ORDEN_DETALLE.xlsx');
  let outResumen = path.join(ROOT, 'docs', 'GP_OPERATIVA_APORTE_ORDEN_RESUMEN.xlsx');
  let url = '';
  let key = '';
  for (const a of argv) {
    if (a.startsWith('--out-detalle=')) outDetalle = path.resolve(a.slice('--out-detalle='.length));
    if (a.startsWith('--out-resumen=')) outResumen = path.resolve(a.slice('--out-resumen='.length));
    if (a.startsWith('--url=')) url = a.slice('--url='.length).trim();
    if (a.startsWith('--key=')) key = a.slice('--key='.length).trim();
  }
  return { outDetalle, outResumen, url, key };
}

function num(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function intOrNull(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

async function rpcDetalle(url, key, bolsa) {
  const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/gp_operativa_detalle`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ p_desde: null, p_hasta: null, p_bolsa: bolsa }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`RPC ${bolsa}: ${res.status} ${text.slice(0, 500)}`);
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`RPC ${bolsa}: respuesta no JSON`);
  }
  if (typeof data === 'string') data = JSON.parse(data);
  if (!Array.isArray(data)) throw new Error(`RPC ${bolsa}: se esperaba array, recibió ${typeof data}`);
  return data;
}

async function fetchOrdenesMeta(url, key, ordenes) {
  const out = new Map();
  if (!ordenes.length) return out;
  const base = `${url.replace(/\/$/, '')}/rest/v1/ordenes`;
  const chunkSize = 80;
  for (let i = 0; i < ordenes.length; i += chunkSize) {
    const chunk = ordenes.slice(i, i + chunkSize);
    const inVals = chunk.join(',');
    const q = new URL(base);
    q.searchParams.set(
      'select',
      'numero,tipo_operacion_id,intermediario_id,tipos_operacion(codigo,moneda_in,moneda_out,usa_intermediario)',
    );
    q.searchParams.set('numero', `in.(${inVals})`);
    q.searchParams.set('limit', String(chunk.length));
    const res = await fetch(q, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`ordenes meta: ${res.status} ${text.slice(0, 500)}`);
    const rows = JSON.parse(text);
    for (const r of rows) {
      const n = intOrNull(r.numero);
      if (n == null) continue;
      const t = r.tipos_operacion && typeof r.tipos_operacion === 'object' ? r.tipos_operacion : {};
      const usaInt = Boolean(t.usa_intermediario);
      out.set(n, {
        tipo_operacion_id: r.tipo_operacion_id || null,
        tipo_operacion_codigo: t.codigo || '',
        tipo_moneda_in: t.moneda_in || '',
        tipo_moneda_out: t.moneda_out || '',
        tipo_usa_intermediario: usaInt,
        tiene_intermediario: r.intermediario_id != null,
        tipo_operacion_orden: t.codigo
          ? `${t.codigo}${usaInt ? ' con intermediario' : ' sin intermediario'}`
          : '',
      });
    }
  }
  return out;
}

function toDetalleRows(flat, metaByOrden) {
  return flat.map((r) => {
    const meta = r.orden_numero != null ? metaByOrden.get(r.orden_numero) : null;
    return {
      bolsa: r.bolsa,
      registro_id: r.registro_id,
      fecha: r.fecha,
      orden_numero: r.orden_numero,
      transaccion_numero: r.transaccion_numero,
      moneda: r.moneda,
      monto: r.monto,
      concepto: r.concepto,
      entidad: r.entidad,
      cc_estado: r.cc_estado,
      modo_pago: r.modo_pago,
      tipo_operacion_id: meta ? meta.tipo_operacion_id : null,
      tipo_operacion_codigo: meta ? meta.tipo_operacion_codigo : '',
      tipo_operacion_orden: meta ? meta.tipo_operacion_orden : '',
      tipo_moneda_in: meta ? meta.tipo_moneda_in : '',
      tipo_moneda_out: meta ? meta.tipo_moneda_out : '',
      tipo_usa_intermediario: meta ? meta.tipo_usa_intermediario : false,
      tiene_intermediario: meta ? meta.tiene_intermediario : false,
    };
  });
}

function buildResumenRows(detalleRows) {
  const map = new Map();
  for (const r of detalleRows) {
    if (r.orden_numero == null) continue;
    const key = `${r.orden_numero}\t${r.moneda}`;
    if (!map.has(key)) {
      map.set(key, {
        orden_numero: r.orden_numero,
        moneda: r.moneda,
        aporte_total_6_bolsas: 0,
        caja_ordenes: 0,
        cc_cliente: 0,
        cc_intermediario: 0,
        cc_resultado: 0,
        comisiones_pandy: 0,
        comisiones_intermediario: 0,
        tipo_operacion_id: r.tipo_operacion_id,
        tipo_operacion_codigo: r.tipo_operacion_codigo,
        tipo_operacion_orden: r.tipo_operacion_orden,
        tipo_moneda_in: r.tipo_moneda_in,
        tipo_moneda_out: r.tipo_moneda_out,
        tipo_usa_intermediario: r.tipo_usa_intermediario,
        tiene_intermediario: r.tiene_intermediario,
      });
    }
    const row = map.get(key);
    const m = num(r.monto) || 0;
    row.aporte_total_6_bolsas += m;
    if (r.bolsa === 'caja_ordenes') row.caja_ordenes += m;
    if (r.bolsa === 'cc_cliente') row.cc_cliente += m;
    if (r.bolsa === 'cc_intermediario') row.cc_intermediario += m;
    if (r.bolsa === 'cc_resultado_economico_compensatorio') row.cc_resultado += m;
    if (r.bolsa === 'comisiones_acuerdo_pandy') row.comisiones_pandy += m;
    if (r.bolsa === 'comisiones_acuerdo_intermediario') row.comisiones_intermediario += m;
  }
  return Array.from(map.values()).sort((a, b) => {
    if (a.orden_numero !== b.orden_numero) return a.orden_numero - b.orden_numero;
    return String(a.moneda).localeCompare(String(b.moneda));
  });
}

async function writeDetalleXlsx(pathOut, rows, metaInfo) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Pandi export-gp-operativa-aporte-por-orden-excel.mjs';
  wb.created = new Date();

  const ws = wb.addWorksheet('Detalle', { views: [{ state: 'frozen', ySplit: 1 }] });
  const headers = [
    'bolsa',
    'registro_id',
    'fecha',
    'orden_numero',
    'transaccion_numero',
    'moneda',
    'monto',
    'concepto',
    'entidad',
    'cc_estado',
    'modo_pago',
    'tipo_operacion_id',
    'tipo_operacion_codigo',
    'tipo_operacion_orden',
    'tipo_moneda_in',
    'tipo_moneda_out',
    'tipo_usa_intermediario',
    'tiene_intermediario',
  ];
  ws.addRow(headers);
  ws.getRow(1).font = { bold: true };
  for (const r of rows) {
    ws.addRow([
      r.bolsa,
      r.registro_id,
      r.fecha,
      r.orden_numero,
      r.transaccion_numero,
      r.moneda,
      r.monto,
      r.concepto,
      r.entidad,
      r.cc_estado,
      r.modo_pago,
      r.tipo_operacion_id,
      r.tipo_operacion_codigo,
      r.tipo_operacion_orden,
      r.tipo_moneda_in,
      r.tipo_moneda_out,
      r.tipo_usa_intermediario,
      r.tiene_intermediario,
    ]);
  }
  for (let i = 2; i <= ws.rowCount; i++) {
    ws.getRow(i).getCell(7).numFmt = '#,##0.000000';
    ws.getRow(i).getCell(4).numFmt = '0';
    ws.getRow(i).getCell(5).numFmt = '0';
  }
  ws.columns = [
    { width: 34 }, { width: 44 }, { width: 12 }, { width: 12 }, { width: 14 }, { width: 8 }, { width: 18 },
    { width: 58 }, { width: 28 }, { width: 12 }, { width: 16 }, { width: 16 }, { width: 18 }, { width: 28 },
    { width: 12 }, { width: 12 }, { width: 14 }, { width: 14 },
  ];

  const wsMeta = wb.addWorksheet('Meta');
  wsMeta.addRow(['supabase_url', metaInfo.url]);
  wsMeta.addRow(['filas_detalle', rows.length]);
  wsMeta.addRow(['generado_utc', new Date().toISOString()]);
  wsMeta.addRow(['rpc', 'gp_operativa_detalle(p_desde:=null,p_hasta:=null,p_bolsa:=6 bolsas panel)']);
  wsMeta.columns = [{ width: 22 }, { width: 80 }];

  await fs.promises.mkdir(path.dirname(pathOut), { recursive: true });
  await wb.xlsx.writeFile(pathOut);
}

async function writeResumenXlsx(pathOut, rows, metaInfo) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Pandi export-gp-operativa-aporte-por-orden-excel.mjs';
  wb.created = new Date();

  const ws = wb.addWorksheet('Resumen', { views: [{ state: 'frozen', ySplit: 1 }] });
  const headers = [
    'orden_numero',
    'moneda',
    'aporte_total_6_bolsas',
    'caja_ordenes',
    'cc_cliente',
    'cc_intermediario',
    'cc_resultado',
    'comisiones_pandy',
    'comisiones_intermediario',
    'tipo_operacion_id',
    'tipo_operacion_codigo',
    'tipo_operacion_orden',
    'tipo_moneda_in',
    'tipo_moneda_out',
    'tipo_usa_intermediario',
    'tiene_intermediario',
  ];
  ws.addRow(headers);
  ws.getRow(1).font = { bold: true };
  for (const r of rows) {
    ws.addRow([
      r.orden_numero,
      r.moneda,
      r.aporte_total_6_bolsas,
      r.caja_ordenes,
      r.cc_cliente,
      r.cc_intermediario,
      r.cc_resultado,
      r.comisiones_pandy,
      r.comisiones_intermediario,
      r.tipo_operacion_id,
      r.tipo_operacion_codigo,
      r.tipo_operacion_orden,
      r.tipo_moneda_in,
      r.tipo_moneda_out,
      r.tipo_usa_intermediario,
      r.tiene_intermediario,
    ]);
  }
  const moneyCols = [3, 4, 5, 6, 7, 8, 9];
  for (let i = 2; i <= ws.rowCount; i++) {
    ws.getRow(i).getCell(1).numFmt = '0';
    for (const col of moneyCols) ws.getRow(i).getCell(col).numFmt = '#,##0.000000';
  }
  ws.columns = [
    { width: 12 }, { width: 8 }, { width: 20 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 14 },
    { width: 18 }, { width: 24 }, { width: 16 }, { width: 18 }, { width: 30 }, { width: 12 }, { width: 12 },
    { width: 14 }, { width: 14 },
  ];

  const wsMeta = wb.addWorksheet('Meta');
  wsMeta.addRow(['supabase_url', metaInfo.url]);
  wsMeta.addRow(['filas_resumen', rows.length]);
  wsMeta.addRow(['generado_utc', new Date().toISOString()]);
  wsMeta.columns = [{ width: 22 }, { width: 80 }];

  await fs.promises.mkdir(path.dirname(pathOut), { recursive: true });
  await wb.xlsx.writeFile(pathOut);
}

async function main() {
  const { outDetalle, outResumen, url: argUrl, key: argKey } = parseArgs();
  const url = (argUrl || process.env.SUPABASE_URL || '').trim();
  const key = (argKey || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) {
    throw new Error('Faltan URL y service role: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY o flags --url= --key=');
  }

  const flat = [];
  for (const b of BOLSAS) {
    const rows = await rpcDetalle(url, key, b);
    for (const e of rows) {
      flat.push({
        bolsa: b,
        registro_id: e.id != null ? String(e.id) : '',
        fecha: e.fecha != null ? String(e.fecha).slice(0, 10) : '',
        orden_numero: intOrNull(e.orden_numero),
        transaccion_numero: intOrNull(e.transaccion_numero),
        moneda: e.moneda != null ? String(e.moneda).toUpperCase() : '',
        monto: num(e.monto),
        concepto: e.concepto != null ? String(e.concepto) : '',
        entidad: e.entidad != null ? String(e.entidad) : '',
        cc_estado: e.cc_estado != null ? String(e.cc_estado) : '',
        modo_pago: e.modo_pago != null ? String(e.modo_pago) : '',
      });
    }
  }

  const ordenes = [...new Set(flat.map((r) => r.orden_numero).filter((x) => x != null))].sort((a, b) => a - b);
  const metaByOrden = await fetchOrdenesMeta(url, key, ordenes);
  const detalleRows = toDetalleRows(flat, metaByOrden).sort((a, b) => {
    if ((a.orden_numero || 0) !== (b.orden_numero || 0)) return (a.orden_numero || 0) - (b.orden_numero || 0);
    const cMon = String(a.moneda || '').localeCompare(String(b.moneda || ''));
    if (cMon !== 0) return cMon;
    const cBolsa = String(a.bolsa || '').localeCompare(String(b.bolsa || ''));
    if (cBolsa !== 0) return cBolsa;
    return String(b.fecha || '').localeCompare(String(a.fecha || ''));
  });
  const resumenRows = buildResumenRows(detalleRows);

  await writeDetalleXlsx(outDetalle, detalleRows, { url });
  await writeResumenXlsx(outResumen, resumenRows, { url });

  console.log(`Escrito detalle: ${outDetalle} (${detalleRows.length} filas)`);
  console.log(`Escrito resumen: ${outResumen} (${resumenRows.length} filas)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

