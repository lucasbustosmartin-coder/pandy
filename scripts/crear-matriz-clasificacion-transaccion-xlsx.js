/**
 * Genera docs/MATRIZ_CLASIFICACION_TRANSACCION.xlsx (mismo esquema que G/P: Leyenda + Matriz + hoja extra).
 * Precarga: solo CC_FLUJO_OPERATIVO_TRX = S por fila (resto N), alineado a main.js inferClasificacionTransaccionDesdePayload.
 *
 * Filas: combinaciones únicas (codigo, usa_intermediario) desde docs/tipos_operacion_rows.csv + filas de flujos de app.
 * Sobrescribe el .xlsx si existe.
 */
const fs = require('fs');
const XLSX = require('xlsx');
const path = require('path');

const outPath = path.join(__dirname, '..', 'docs', 'MATRIZ_CLASIFICACION_TRANSACCION.xlsx');
const csvPath = path.join(__dirname, '..', 'docs', 'tipos_operacion_rows.csv');

/** Mismo orden que sql/migracion_movimiento_clasificacion_fase0_ddl.sql */
const ENUM_TRANSACCION = [
  'LEGACY_SIN_CLASIFICAR',
  'CC_FLUJO_OPERATIVO_TRX',
  'CC_COMISION_ACUERDO',
  'CC_COMPENSACION',
  'CC_COMISION_SINTETICA_SIN_TRX',
  'REGULA_B_MONR_MONE_PRESTAMO',
  'CIERRE_ORDEN_MULTIMONEDA',
  'CC_RESULTADO_ECONOMICO_COMPENSATORIO',
  'CANCELACION_CONTRAPARTE',
  'SALDO_INICIAL_VOLCADO',
  'MANUAL_EXPLICITO',
  'CAJA_FLUJO_OPERATIVO',
  'CAJA_COMISION_ACUERDO',
  'EXCEPCION_NETEO_USD_USD_CON_INTERMEDIARIO',
];

const N = 'N';
const S = 'S';

function loadTiposOperacionUnicos() {
  const raw = fs.readFileSync(csvPath, 'utf8');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  const map = new Map();
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    if (parts.length < 8) continue;
    const codigo = (parts[1] || '').trim();
    const nombre = (parts[2] || '').trim();
    const usa = (parts[7] || '').trim();
    if (!codigo) continue;
    const key = `${codigo}|${usa}`;
    if (!map.has(key)) map.set(key, { codigo, nombre, usa_intermediario: usa });
  }
  return Array.from(map.values()).sort((a, b) => {
    const c = a.codigo.localeCompare(b.codigo);
    return c !== 0 ? c : String(a.usa_intermediario).localeCompare(String(b.usa_intermediario));
  });
}

function filaEnumSoloCcFlujo(notas) {
  const cells = ENUM_TRANSACCION.map((e) => (e === 'CC_FLUJO_OPERATIVO_TRX' ? S : N));
  return cells.concat([notas]);
}

const leyenda = [
  ['Leyenda — hoja Matriz: transacciones → columna clasificacion_transaccion en Postgres'],
  [],
  ['Qué es cada celda', 'Cada celda cruz una FILA (un contexto: tipo de operación o flujo de la app) con una COLUMNA (un valor posible del ENUM). Ahí va S o N.'],
  [],
  ['S', 'SÍ = “Para este contexto (esta fila), cuando se guarda la transacción, el valor que debe quedar guardado en transacciones.clasificacion_transaccion es exactamente el ENUM del encabezado de esta columna.” Es decir: esta columna es el valor elegido para esa fila.'],
  ['N', 'NO = “Para este contexto NO corresponde guardar la transacción con ese ENUM.” La celda solo indica que ese valor no aplica; no significa “error”, significa “no es este”.'],
  [],
  ['Regla al cerrar la matriz', 'En cada FILA debería haber exactamente UNA celda S entre todas las columnas ENUM (una sola clasificación por contexto). El resto de columnas ENUM en esa fila = N. Si un contexto necesita dos valores distintos según caso, duplicá la fila o aclarálo en Notas.'],
  [],
  ['Ejemplo', 'Si en la fila “USD-USD | usa_intermediario=true” solo ponés S bajo CC_FLUJO_OPERATIVO_TRX y N en todas las demás columnas ENUM, estás diciendo: “toda transacción de ese tipo debe persistirse con clasificacion_transaccion = CC_FLUJO_OPERATIVO_TRX”.'],
  [],
  ['Hoy el código (main.js)', 'ignora el tipo y pone siempre CC_FLUJO en todas las filas (precarga del Excel). Cuando cambies una fila, estás definiendo qué debería hacer el código después.'],
  ['Filas “Catálogo”', 'vienen de docs/tipos_operacion_rows.csv (codigo + usa_intermediario únicos).'],
  ['Filas “Flujo app”', 'lugares donde la app también setea clasificacion_transaccion al guardar.'],
];

const extraFlujos = [
  {
    contexto: 'Flujo app: modal guardar transacción',
    codigo: '* (cualquier tipo)',
    usa: '',
    nombre: 'Inferencia actual ignora tipo',
    notas: 'main.js ~3802: siempre CC_FLUJO_OPERATIVO_TRX hasta matriz fina.',
  },
  {
    contexto: 'Flujo app: compensatoria',
    codigo: '*',
    usa: '',
    nombre: 'Compensación CC',
    notas: 'asegurarClasificacionTransaccionEnPayload en payload compensatorio.',
  },
  {
    contexto: 'Flujo app: import desde cola',
    codigo: '*',
    usa: '',
    nombre: 'Cola import',
    notas: '',
  },
  {
    contexto: 'Flujo app: plantillas / autocompletar',
    codigo: '*',
    usa: '',
    nombre: 'Instrumentación',
    notas: '',
  },
  {
    contexto: 'Flujo app: splits (monto o estado)',
    codigo: '*',
    usa: '',
    nombre: 'Particiones transacción',
    notas: '',
  },
  {
    contexto: 'Flujo app: Ganancia Pandy',
    codigo: '*',
    usa: '',
    nombre: 'Transacción ganancia',
    notas: '',
  },
  {
    contexto: 'Flujo app: cambio estado / debeDividir',
    codigo: '*',
    usa: '',
    nombre: 'Splits bajo cambio estado',
    notas: '',
  },
];

const pendientes = [
  ['Notas — ítem 2 plan (matriz fina clasificacion_transaccion)'],
  [],
  ['Recordatorio S vs N (transacciones)', 'S en una columna ENUM = “guardar con ese valor”. N = “no guardar con ese valor”. Una S por fila = una sola clasificacion_transaccion por contexto.'],
  [],
  ['Si un contexto necesita varios ENUM según flags:', 'duplicá la fila en Matriz o detallá en Notas; el código luego puede ramificar por tipo + flags.'],
  ['Valores poco probables en transacciones (CAJA_*, MANUAL_EXPLICITO, etc.):', 'dejá N salvo que negocio defina persistirlos en transacciones.'],
  [],
  ['Regenerar este Excel:', 'npm run excel:matriz-clasificacion-trx (pisa el archivo).'],
];

function buildMatriz() {
  const header = [
    'contexto',
    'tipo_operacion_codigo',
    'usa_intermediario',
    'nombre_catalogo',
    ...ENUM_TRANSACCION,
    'notas_comportamiento_repo',
  ];
  const rows = [header];

  const tipos = loadTiposOperacionUnicos();
  for (const t of tipos) {
    rows.push(
      [
        'Catálogo tipos_operacion',
        t.codigo,
        t.usa_intermediario,
        t.nombre,
        ...filaEnumSoloCcFlujo('CSV docs/tipos_operacion_rows.csv; infer repo: solo CC_FLUJO.'),
      ],
    );
  }

  for (const ex of extraFlujos) {
    rows.push(
      [
        ex.contexto,
        ex.codigo,
        ex.usa,
        ex.nombre,
        ...filaEnumSoloCcFlujo(ex.notas),
      ],
    );
  }

  return rows;
}

const wb = XLSX.utils.book_new();

const wsLey = XLSX.utils.aoa_to_sheet(leyenda);
wsLey['!cols'] = [{ wch: 28 }, { wch: 110 }];
XLSX.utils.book_append_sheet(wb, wsLey, 'Leyenda');

const matriz = buildMatriz();
const wsMat = XLSX.utils.aoa_to_sheet(matriz);
const colW = [{ wch: 32 }, { wch: 22 }, { wch: 16 }, { wch: 28 }];
for (let i = 0; i < ENUM_TRANSACCION.length; i++) colW.push({ wch: 12 });
colW.push({ wch: 72 });
wsMat['!cols'] = colW;
XLSX.utils.book_append_sheet(wb, wsMat, 'Matriz');

const wsPen = XLSX.utils.aoa_to_sheet(pendientes);
wsPen['!cols'] = [{ wch: 55 }, { wch: 90 }];
XLSX.utils.book_append_sheet(wb, wsPen, 'Notas');

XLSX.writeFile(wb, outPath);
console.log('Creado:', outPath);
