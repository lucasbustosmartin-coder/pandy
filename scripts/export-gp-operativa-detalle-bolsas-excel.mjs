// NO pegar en Supabase SQL Editor: es JavaScript/Node, no SQL (error 42601 cerca de "import").
// En la raíz del repo: npm run excel:gp-bolsas  (o: node scripts/export-gp-operativa-detalle-bolsas-excel.mjs)
// Para consulta solo-SQL en el editor, usar: sql/consulta_gp_operativa_detalle_flat_via_rpc.sql

/**
 * Exporta a Excel el detalle G/P Operativa por bolsa (toda la historia: p_desde / p_hasta null).
 * Llama al RPC `gp_operativa_detalle` por cada bolsa (misma lógica que el panel y que las consultas MCP).
 *
 * Requiere en `.env` (raíz del repo):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 * del proyecto a exportar (ej. Pandy prod: https://bxwxuzbahewvptarlnxm.supabase.co).
 *
 * Uso:
 *   node scripts/export-gp-operativa-detalle-bolsas-excel.mjs
 *   node scripts/export-gp-operativa-detalle-bolsas-excel.mjs --out=docs/MI_ARCHIVO.xlsx
 *   node scripts/export-gp-operativa-detalle-bolsas-excel.mjs --url=https://bxwxuzbahewvptarlnxm.supabase.co --key=SERVICE_ROLE_PROD
 *
 * Hojas: Detalle (filas), Totales_bolsa_moneda (sumas numéricas), Meta (URL y fecha).
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
  'caja_manual',
  'caja_ordenes',
  'cc_cliente',
  'cc_intermediario',
  'cc_resultado_economico_compensatorio',
  'comisiones_acuerdo_pandy',
  'comisiones_acuerdo_intermediario',
  'ganancia_devengada_orden',
];

function parseArgs() {
  const argv = process.argv.slice(2);
  let out = path.join(ROOT, 'docs', 'GP_OPERATIVA_DETALLE_BOLSAS_HISTORIA_COMPLETA.xlsx');
  let url = '';
  let key = '';
  for (const a of argv) {
    if (a.startsWith('--out=')) out = path.resolve(a.slice('--out='.length));
    if (a.startsWith('--url=')) url = a.slice('--url='.length).trim();
    if (a.startsWith('--key=')) key = a.slice('--key='.length).trim();
  }
  return { out, url, key };
}

function num(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function intOrNull(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  if (!/^-?\d+$/.test(s)) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function fuenteFromBolsa(bolsa, id, _concepto) {
  if (bolsa === 'caja_manual' || bolsa === 'caja_ordenes') return 'movimientos_caja';
  if (bolsa === 'cc_cliente') return 'movimientos_cuenta_corriente';
  if (bolsa === 'cc_intermediario') return 'movimientos_cuenta_corriente_intermediario';
  if (bolsa === 'cc_resultado_economico_compensatorio') return 'movimientos_cuenta_corriente / intermediario';
  if (bolsa === 'comisiones_acuerdo_pandy') {
    return id && String(id).startsWith('co-') ? 'comisiones_orden' : 'movimientos_cuenta_corriente';
  }
  if (bolsa === 'comisiones_acuerdo_intermediario') {
    return id && String(id).startsWith('co-') ? 'comisiones_orden' : 'movimientos_cuenta_corriente_intermediario';
  }
  if (bolsa === 'ganancia_devengada_orden') return 'comisiones_orden (neto pandy vs intermediario)';
  return '';
}

function montoEnTabla(bolsa, montoRpc) {
  const m = num(montoRpc);
  if (m == null) return null;
  if (bolsa === 'comisiones_acuerdo_intermediario') return Math.abs(m);
  return m;
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
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      throw new Error(`RPC ${bolsa}: string no parseable como JSON`);
    }
  }
  if (!Array.isArray(data)) throw new Error(`RPC ${bolsa}: se esperaba array, recibió ${typeof data}`);
  return data;
}

function flattenRpcRows(url, key) {
  return async (bolsa) => {
    const rows = await rpcDetalle(url, key, bolsa);
    return rows.map((e) => {
      const id = e.id != null ? String(e.id) : '';
      const mRpc = e.monto;
      const mCont = num(mRpc);
      const mTab = montoEnTabla(bolsa, mRpc);
      return {
        bolsa,
        fuente_tabla: fuenteFromBolsa(bolsa, id, e.concepto),
        registro_id: id,
        fecha: e.fecha != null ? String(e.fecha).slice(0, 10) : '',
        moneda: e.moneda != null ? String(e.moneda) : '',
        monto_contribuye_gp: mCont,
        monto_en_tabla: mTab,
        concepto: e.concepto != null ? String(e.concepto) : '',
        tipo_movimiento_caja: e.tipo_movimiento != null ? String(e.tipo_movimiento) : '',
        modo_pago: e.modo_pago != null ? String(e.modo_pago) : '',
        orden_numero: intOrNull(e.orden_numero),
        transaccion_numero: intOrNull(e.transaccion_numero),
        entidad_nombre: e.entidad != null ? String(e.entidad) : '',
        cc_estado_o_sim: e.cc_estado != null ? String(e.cc_estado) : '',
        es_movimiento_manual: Boolean(e.es_movimiento_manual),
      };
    });
  };
}

async function main() {
  const { out, url: urlArg, key: keyArg } = parseArgs();
  const url = (urlArg || process.env.SUPABASE_URL || '').trim();
  const key = (keyArg || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) {
    console.error(
      'Faltan URL y service role: en .env (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) o flags --url= y --key=',
    );
    process.exit(1);
  }

  console.log(
    `Export G/P bolsas → RPC contra: ${url.replace(/\/$/, '')} (debe ser el mismo proyecto que el SQL/MCP si querés el mismo número de filas).`,
  );

  const flat = [];
  const load = flattenRpcRows(url, key);
  for (const b of BOLSAS) {
    const part = await load(b);
    flat.push(...part);
  }

  flat.sort((a, b) => {
    const c1 = String(a.bolsa).localeCompare(String(b.bolsa));
    if (c1 !== 0) return c1;
    const c2 = String(a.moneda).localeCompare(String(b.moneda));
    if (c2 !== 0) return c2;
    const df = String(b.fecha).localeCompare(String(a.fecha));
    if (df !== 0) return df;
    return String(a.registro_id).localeCompare(String(b.registro_id));
  });

  const totalesMap = new Map();
  for (const r of flat) {
    const k = `${r.bolsa}\t${r.moneda}`;
    totalesMap.set(k, (totalesMap.get(k) || 0) + (num(r.monto_contribuye_gp) || 0));
  }
  const totalesRows = Array.from(totalesMap.entries()).map(([k, suma]) => {
    const [bolsa, moneda] = k.split('\t');
    return { bolsa, moneda, suma_monto_contribuye_gp: suma };
  });
  totalesRows.sort((a, b) => {
    const c1 = a.bolsa.localeCompare(b.bolsa);
    if (c1 !== 0) return c1;
    return a.moneda.localeCompare(b.moneda);
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Pandi export-gp-operativa-detalle-bolsas-excel.mjs';
  wb.created = new Date();

  const ws = wb.addWorksheet('Detalle', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  const headers = [
    'bolsa',
    'fuente_tabla',
    'registro_id',
    'fecha',
    'moneda',
    'monto_contribuye_gp',
    'monto_en_tabla',
    'concepto',
    'tipo_movimiento_caja',
    'modo_pago',
    'orden_numero',
    'transaccion_numero',
    'entidad_nombre',
    'cc_estado_o_sim',
    'es_movimiento_manual',
  ];
  ws.addRow(headers);
  ws.getRow(1).font = { bold: true };

  for (const r of flat) {
    ws.addRow([
      r.bolsa,
      r.fuente_tabla,
      r.registro_id,
      r.fecha,
      r.moneda,
      r.monto_contribuye_gp,
      r.monto_en_tabla,
      r.concepto,
      r.tipo_movimiento_caja,
      r.modo_pago,
      r.orden_numero,
      r.transaccion_numero,
      r.entidad_nombre,
      r.cc_estado_o_sim,
      r.es_movimiento_manual,
    ]);
  }

  const colMontoGp = 6;
  const colMontoTabla = 7;
  const colOrden = 11;
  const colTrx = 12;
  for (let i = 2; i <= ws.rowCount; i++) {
    const row = ws.getRow(i);
    row.getCell(colMontoGp).numFmt = '#,##0.00';
    row.getCell(colMontoTabla).numFmt = '#,##0.00';
    if (row.getCell(colOrden).value != null) row.getCell(colOrden).numFmt = '0';
    if (row.getCell(colTrx).value != null) row.getCell(colTrx).numFmt = '0';
  }

  ws.columns = [
    { width: 28 },
    { width: 38 },
    { width: 40 },
    { width: 12 },
    { width: 8 },
    { width: 18 },
    { width: 18 },
    { width: 55 },
    { width: 32 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 28 },
    { width: 14 },
    { width: 10 },
  ];

  const wsT = wb.addWorksheet('Totales_bolsa_moneda', { views: [{ state: 'frozen', ySplit: 1 }] });
  wsT.addRow(['bolsa', 'moneda', 'suma_monto_contribuye_gp']);
  wsT.getRow(1).font = { bold: true };
  for (const t of totalesRows) {
    wsT.addRow([t.bolsa, t.moneda, t.suma_monto_contribuye_gp]);
  }
  for (let i = 2; i <= wsT.rowCount; i++) {
    wsT.getRow(i).getCell(3).numFmt = '#,##0.00';
  }
  wsT.columns = [{ width: 32 }, { width: 10 }, { width: 22 }];

  const wsM = wb.addWorksheet('Meta');
  wsM.addRow(['supabase_url', url]);
  wsM.addRow(['filas_detalle', flat.length]);
  wsM.addRow(['generado_utc', new Date().toISOString()]);
  wsM.addRow(['rpc', 'gp_operativa_detalle(p_desde:=null,p_hasta:=null,p_bolsa:=cada bolsa)']);
  wsM.addRow([
    'nota',
    'El número de filas es el de ESTE proyecto solamente. Si en SQL Editor o MCP consultaste Pandy prod (bxwxuzbahewvptarlnxm) y acá el .env apunta a Pandy-Dev (ozsofsmnuzliczfphqze), vas a ver ~150 filas en dev vs ~580 en prod. Para prod: --url=https://bxwxuzbahewvptarlnxm.supabase.co --key=<service_role prod>. En Excel, la hoja Detalle: filas de datos = filas totales menos 1 (cabecera).',
  ]);
  wsM.columns = [{ width: 22 }, { width: 80 }];

  await fs.promises.mkdir(path.dirname(out), { recursive: true });
  await wb.xlsx.writeFile(out);
  console.log(`Escrito: ${out} (${flat.length} filas)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
