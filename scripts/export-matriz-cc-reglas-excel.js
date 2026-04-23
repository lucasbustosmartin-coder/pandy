/**
 * Exporta a Excel la matriz declarada en Supabase de movimientos CC (cliente / intermediario)
 * según `reglas_de_negocio` y `cc_modelo_reglas`, más catálogo `tipos_operacion`.
 *
 * Requiere en la raíz del repo un `.env` con:
 *   SUPABASE_URL=…
 *   SUPABASE_SERVICE_ROLE_KEY=…   (recomendado; con anon puede fallar por RLS)
 *
 * Uso:
 *   node scripts/export-matriz-cc-reglas-excel.js
 *   node scripts/export-matriz-cc-reglas-excel.js --out=/ruta/custom.xlsx
 *
 * Salida por defecto: docs/MATRIZ_CC_REGLAS_MOVIMIENTOS.xlsx
 * Ver: docs/MATRIZ_CC_REGLAS_EXCEL.md
 * Borrador (composición CC vs ciclo de estados, uso conjunto del Excel): docs/BORRADOR_CC_COMPOSICION_FIJA_ESTADO.md
 */
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');
const { buildMatrizCombinacionesActivas, matrizToAoa } = require('./matriz-cc-combinaciones-activas');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const ROOT = path.join(__dirname, '..');
const DEFAULT_OUT = path.join(ROOT, 'docs', 'MATRIZ_CC_REGLAS_MOVIMIENTOS.xlsx');

function parseArgs() {
  const argv = process.argv.slice(2);
  let out = DEFAULT_OUT;
  for (const a of argv) {
    if (a.startsWith('--out=')) out = path.resolve(a.slice('--out='.length));
  }
  return { out };
}

async function fetchAll(client, table, orderCol, { optional = false } = {}) {
  const pageSize = 1000;
  let from = 0;
  const all = [];
  for (;;) {
    const q = client.from(table).select('*').order(orderCol, { ascending: true }).range(from, from + pageSize - 1);
    const { data, error } = await q;
    if (error) {
      const msg = `${table}: ${error.message}`;
      if (optional && /does not exist|schema cache|not find/i.test(error.message)) {
        console.warn(`[advertencia] ${msg} — se exporta hoja vacía.`);
        return [];
      }
      throw new Error(msg);
    }
    if (!data || !data.length) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

function sheetFromObjects(rows) {
  if (!rows.length) return XLSX.utils.aoa_to_sheet([['(sin filas)']]);
  return XLSX.utils.json_to_sheet(rows);
}

function buildResumenPorTipo(reglas, ccModelo, tipos) {
  const byKey = new Map();
  const add = (tipo, usa, source) => {
    const k = `${String(tipo || '').toUpperCase()}|${usa ? 'int' : 'sin'}`;
    if (!byKey.has(k)) {
      byKey.set(k, {
        tipo_operacion_codigo: String(tipo || '').toUpperCase(),
        usa_intermediario: !!usa,
        filas_reglas_de_negocio: 0,
        filas_cc_modelo_reglas: 0,
      });
    }
    const o = byKey.get(k);
    if (source === 'r') o.filas_reglas_de_negocio += 1;
    else o.filas_cc_modelo_reglas += 1;
  };
  for (const r of reglas) add(r.tipo_operacion_codigo, r.usa_intermediario, 'r');
  for (const r of ccModelo) add(r.tipo_operacion_codigo, r.usa_intermediario, 'c');

  const tipoMeta = new Map();
  for (const t of tipos || []) {
    const c = (t.codigo || '').toString().trim().toUpperCase();
    if (c) tipoMeta.set(c, t);
  }

  const rows = Array.from(byKey.values()).sort((a, b) => {
    const ca = a.tipo_operacion_codigo;
    const cb = b.tipo_operacion_codigo;
    if (ca !== cb) return ca.localeCompare(cb);
    return Number(a.usa_intermediario) - Number(b.usa_intermediario);
  });

  return rows.map((o) => {
    const meta = tipoMeta.get(o.tipo_operacion_codigo);
    const motorNota =
      o.filas_reglas_de_negocio > 0
        ? 'En app: si hay filas para (tipo, usa_intermediario), el motor CC principal usa reglas_de_negocio (ver main.js cerca de sincronizarCc / aplicarMotorCcDesdeReglasDeNegocio).'
        : o.filas_cc_modelo_reglas > 0
          ? 'Sin filas en reglas_de_negocio para esta clave: puede aplicarse cc_modelo_reglas u otras ramas legacy en main.js — contrastar con código.'
          : 'Sin reglas en ninguna tabla para esta clave: revisar catálogo o migraciones.';
    return {
      ...o,
      moneda_in_catalogo: meta ? meta.moneda_in ?? '' : '',
      moneda_out_catalogo: meta ? meta.moneda_out ?? '' : '',
      usa_intermediario_catalogo: meta ? (meta.usa_intermediario == null ? '' : !!meta.usa_intermediario) : '',
      nota_motor_cc: motorNota,
    };
  });
}

function buildLeyendaIntro(fechaIso) {
  return [
    ['Matriz CC — reglas declaradas en base (export automático)'],
    ['Generado (UTC)', fechaIso],
    [],
    ['Qué contiene cada hoja'],
    [
      'Tipos_operacion',
      'Catálogo activo: código, moneda in/out, usa_intermediario (contexto; la clave del motor es tipo + usa_intermediario de cada fila de reglas).',
    ],
    [
      'Resumen_por_tipo',
      'Agrupa por (tipo_operacion_codigo, usa_intermediario): cuántas filas hay en reglas_de_negocio vs cc_modelo_reglas y nota sobre qué motor suele aplicar en la app.',
    ],
    [
      'Reglas_de_negocio',
      'Una fila = un movimiento CC potencial (entidad_cc cliente|intermediario) cuando una transacción coincide con pagador/cobrador/tipo/es_comision y estado+contrapartida. signo y moneda son numéricos/texto declarados; el monto en runtime es signo × base según monto_origen.',
    ],
    [
      'CC_modelo_reglas',
      'Matriz histórica / tipos que siguen en esta tabla: columnas separadas para efecto en CC cliente vs CC intermediario (signo, suma_saldo, incluir_en_mov, exposición moneda, referencia monto).',
    ],
    [
      'Movimientos_desde_reglas',
      'Vista derivada solo de reglas_de_negocio con columna legible para auditoría humana (no altera datos).',
    ],
    [
      'Matriz',
      'Tipos×P/E (E2E) + filas [main]… (ramas main.js). Mov_CC en líneas cortas con +/−. Origen: scripts/matriz-cc-combinaciones-activas.js. Columnas **Nivel certeza** y **Como verificar**: trazabilidad para impacto con cliente (no sustituyen revisión de código cuando el nivel es C).',
    ],
    [],
    ['Nivel certeza (columna en hoja Matriz)'],
    ['A', 'Alta: hay E2E o tests unitarios con asserts numéricos / invariantes alineados al caso; reproducir con el comando indicado.'],
    ['B', 'Media: verificación cruzando main.js + hoja Reglas_de_negocio (y/o SQL); puede no haber E2E dedicado por fila.'],
    ['C', 'Revisión de código / orden manual en entorno: sin automatismo listado para esa fila; la columna «Como verificar» indica anclas en main.js o BD.'],
    [],
    ['Borrador (repo)', 'Composición estable de CC vs estados del ciclo — evaluación con cliente usando este Excel: docs/BORRADOR_CC_COMPOSICION_FIJA_ESTADO.md'],
    [],
    ['Límites del Excel (importante)'],
    [
      'Reglas_de_negocio vs Matriz',
      'Las hojas **Reglas_de_negocio** / **Movimientos_desde_reglas** son volcado SQL; **no** listan MC manual, compensación, nueva regla MonR/MonE, etc. Eso queda resumido (con signo) en **Matriz** y en docs; el detalle ejecutable sigue en main.js.',
    ],
    ['Re-ejecutar', 'Tras migraciones SQL en Supabase, volver a correr este script contra el mismo proyecto para refrescar la matriz.'],
    [],
    ['monto_origen (reglas_de_negocio) — resumen'],
    ['mr', 'Monto recibido total del acuerdo (orden).'],
    ['me', 'Monto entregado total del acuerdo (orden).'],
    ['monto_transaccion', 'Monto de esta transacción.'],
    ['me_prorrateado', 'Prorrateo entrega desde trx y orden.'],
    ['mr_prorrateado', 'Prorrateo recibido desde trx y orden.'],
    ['mr_menos_me', 'Comisión implícita USD-USD (mr − me).'],
    ['monto_efectivo_intermediario', 'Monto efectivo intermediario (tasa descuento).'],
    ['comision_intermediario', 'Comisión intermediario explícita.'],
    [],
    ['concepto_leyenda — claves habituales'],
    ['cobro_realizado', 'Texto catálogo “Cobro realizado” (ingreso cobrado).'],
    ['pago_realizado', 'Pago / entrega hacia intermediario o similar.'],
    ['compromiso_pago', 'Compromiso de pago / entrega pendiente o ejecutada según estado.'],
    ['compromiso_cobrar', 'Compromiso a cobrar.'],
    ['comision_acuerdo', 'Comisión del acuerdo.'],
    ['contra_cobro_entrega_pendiente', 'Contra en misma trx para netear visualmente (ver reglas_de_negocio_tabla.sql).'],
  ];
}

function legibleRegla(r) {
  const ent = r.entidad_cc || '';
  const com = r.es_comision ? ' comisión' : '';
  return (
    `CC ${ent}: signo ${r.signo} × base «${r.monto_origen}» en moneda ${r.moneda}; ` +
    `${r.pagador}→${r.cobrador} ${r.tipo_transaccion}${com}; ` +
    `estado=${r.estado_transaccion} contrapartida_ejecutada=${r.contrapartida_ejecutada} línea=${r.linea}; ` +
    `incluir_detalle=${r.incluir_en_detalle}; leyenda=${r.concepto_leyenda}` +
    (r.condicion_estado_comision ? `; cond_comisión=${r.condicion_estado_comision}` : '')
  );
}

function movimientosDesdeReglas(reglas) {
  return reglas.map((r) => ({
    ...r,
    signo: r.signo != null ? Number(r.signo) : null,
    linea: r.linea != null ? Number(r.linea) : null,
    incluir_en_detalle: r.incluir_en_detalle === true || r.incluir_en_detalle === false ? r.incluir_en_detalle : r.incluir_en_detalle,
    texto_movimiento_cc: legibleRegla(r),
  }));
}

async function main() {
  const { out } = parseArgs();
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error(
      'Falta SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY (o anon) en .env. Ver docs/MATRIZ_CC_REGLAS_EXCEL.md'
    );
    process.exit(1);
  }

  const client = createClient(url, key);
  const [reglas, ccModelo, tipos] = await Promise.all([
    fetchAll(client, 'reglas_de_negocio', 'tipo_operacion_codigo'),
    fetchAll(client, 'cc_modelo_reglas', 'tipo_operacion_codigo', { optional: true }),
    fetchAll(client, 'tipos_operacion', 'codigo', { optional: true }),
  ]);

  const resumen = buildResumenPorTipo(reglas, ccModelo, tipos);
  const movReglas = movimientosDesdeReglas(reglas);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(buildLeyendaIntro(new Date().toISOString())), 'Leyenda');
  XLSX.utils.book_append_sheet(wb, sheetFromObjects(tipos), 'Tipos_operacion');
  XLSX.utils.book_append_sheet(wb, sheetFromObjects(resumen), 'Resumen_por_tipo');
  XLSX.utils.book_append_sheet(wb, sheetFromObjects(reglas), 'Reglas_de_negocio');
  XLSX.utils.book_append_sheet(wb, sheetFromObjects(ccModelo), 'CC_modelo_reglas');
  XLSX.utils.book_append_sheet(wb, sheetFromObjects(movReglas), 'Movimientos_desde_reglas');

  const matrizAoa = matrizToAoa(buildMatrizCombinacionesActivas());
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(matrizAoa), 'Matriz');

  const dir = path.dirname(out);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  XLSX.writeFile(wb, out);
  console.log(`Escrito: ${out}`);
  console.log(
    `Filas: tipos=${tipos.length} reglas_de_negocio=${reglas.length} cc_modelo_reglas=${ccModelo.length} matriz_combinaciones=${matrizAoa.length - 1}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
