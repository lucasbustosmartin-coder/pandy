/**
 * Planilla Excel de contingencia Pandy: órdenes + transacciones a mano.
 * Usa ExcelJS para validación de datos (listas, fechas, números) y referencias a la hoja Listas.
 *
 *   node scripts/crear-excel-contingencia-ordenes.js
 *   npm run contingencia:excel
 *
 * Salida: docs/CONTINGENCIA_ordenes_transacciones_Pandy.xlsx
 * Montos e importes como número (regla LyP Excel).
 */
const ExcelJS = require('exceljs');
const path = require('path');

const outPath = path.join(__dirname, '..', 'docs', 'CONTINGENCIA_ordenes_transacciones_Pandy.xlsx');

/** Primera fila de datos con validación; fila 1 = encabezados */
const ROW_FIRST = 2;
/** Cantidad de filas con validación (contingencia: muchas filas vacías listas para usar) */
const ROW_COUNT = 400;

const SHEET_LISTAS = 'Listas';

/** Construye referencia Excel a rango en hoja Listas */
function refLista(col, fromRow, toRow) {
  return `'${SHEET_LISTAS}'!$${col}$${fromRow}:$${col}$${toRow}`;
}

function styleHeaderRow(worksheet, colCount) {
  for (let c = 1; c <= colCount; c += 1) {
    const cell = worksheet.getRow(1).getCell(c);
    cell.font = { bold: true };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE8EDF3' },
    };
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FF94A3B8' } },
    };
  }
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];
}

function applyListColumn(worksheet, colLetter, formulaRange, options = {}) {
  const {
    allowBlank = true,
    promptTitle = 'Lista',
    prompt = 'Elegí un valor con la flecha del desplegable. No escribas a mano si podés elegir de la lista.',
  } = options;
  const dv = {
    type: 'list',
    allowBlank,
    formulae: [formulaRange],
    showInputMessage: true,
    promptTitle,
    prompt,
    showErrorMessage: true,
    errorStyle: 'error',
    errorTitle: 'Valor no permitido',
    error: 'Solo valores de la lista (hoja Listas). Si no ves la opción, consultá al responsable de Pandy.',
  };
  for (let r = ROW_FIRST; r < ROW_FIRST + ROW_COUNT; r += 1) {
    worksheet.getCell(`${colLetter}${r}`).dataValidation = { ...dv };
  }
}

function applyWholeColumn(worksheet, colLetter, min, max, promptTitle, prompt) {
  const dv = {
    type: 'whole',
    operator: 'between',
    allowBlank: true,
    formulae: [min, max],
    showInputMessage: true,
    promptTitle,
    prompt,
    showErrorMessage: true,
    errorStyle: 'error',
    errorTitle: 'Número inválido',
    error: `Tiene que ser un número entero entre ${min} y ${max}.`,
  };
  for (let r = ROW_FIRST; r < ROW_FIRST + ROW_COUNT; r += 1) {
    worksheet.getCell(`${colLetter}${r}`).dataValidation = { ...dv };
  }
}

function applyDecimalColumn(worksheet, colLetter, min, max, promptTitle, prompt) {
  const dv = {
    type: 'decimal',
    operator: 'between',
    allowBlank: true,
    formulae: [min, max],
    showInputMessage: true,
    promptTitle,
    prompt,
    showErrorMessage: true,
    errorStyle: 'error',
    errorTitle: 'Importe inválido',
    error: 'Usá solo números (sin $ ni texto).',
  };
  for (let r = ROW_FIRST; r < ROW_FIRST + ROW_COUNT; r += 1) {
    worksheet.getCell(`${colLetter}${r}`).dataValidation = { ...dv };
  }
}

function applyDateColumn(worksheet, colLetter) {
  const dv = {
    type: 'date',
    operator: 'between',
    allowBlank: true,
    formulae: [new Date(2020, 0, 1), new Date(2040, 11, 31)],
    showInputMessage: true,
    promptTitle: 'Fecha',
    prompt: 'Formato de fecha válido (día/mes/año). Dejá vacío si no aplica.',
    showErrorMessage: true,
    errorStyle: 'warning',
    errorTitle: 'Revisar fecha',
    error: 'La fecha debería estar entre 2020 y 2040.',
  };
  for (let r = ROW_FIRST; r < ROW_FIRST + ROW_COUNT; r += 1) {
    worksheet.getCell(`${colLetter}${r}`).dataValidation = { ...dv };
  }
}

const LISTAS_COLUMNAS = [
  { h: 'Estado_orden', v: ['pendiente_instrumentar', 'instrumentacion_parcial', 'instrumentacion_cerrada_ejecucion', 'orden_ejecutada', 'anulada'] },
  { h: 'Estado_trx', v: ['pendiente', 'ejecutada'] },
  { h: 'Tipo_ingreso_egreso', v: ['ingreso', 'egreso'] },
  { h: 'Modo_pago', v: ['efectivo', 'transferencia', 'cheque'] },
  { h: 'Persona_pagador_cobrador', v: ['cliente', 'pandy', 'intermediario'] },
  { h: 'Caja_tipo', v: ['efectivo', 'banco', 'cheque'] },
  { h: 'Moneda', v: ['USD', 'ARS', 'EUR'] },
  { h: 'Con_intermediario', v: ['Si', 'No'] },
  {
    h: 'Codigo_tipo_operacion',
    v: [
      'USD-USD',
      'ARS-USD',
      'USD-ARS',
      'ARS-ARS',
      'CHEQUE-ARS',
      'EUR-USD',
      'USD-EUR',
      'ARS-EUR',
      'EUR-ARS',
    ],
  },
];

/** Rangos fijos (deben coincidir con LISTAS_COLUMNAS: fila 1 títulos, datos desde fila 2) */
const R = {
    estadoOrden: refLista('A', 2, 6),
    estadoTrx: refLista('B', 2, 3),
    tipo: refLista('C', 2, 3),
    modoPago: refLista('D', 2, 4),
    persona: refLista('E', 2, 4),
    cajaTipo: refLista('F', 2, 4),
    moneda: refLista('G', 2, 4),
    siNo: refLista('H', 2, 3),
    codigoTipo: refLista('I', 2, 10),
};

function poblarHojaListas(listas) {
  LISTAS_COLUMNAS.forEach((col, idx) => {
    const c = idx + 1;
    listas.getCell(1, c).value = col.h;
    listas.getCell(1, c).font = { bold: true };
    col.v.forEach((val, i) => {
      listas.getCell(2 + i, c).value = val;
    });
  });
  listas.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFDCE8F0' },
  };
  listas.views = [{ state: 'frozen', ySplit: 1 }];
  for (let i = 0; i < LISTAS_COLUMNAS.length; i += 1) {
    listas.getColumn(i + 1).width = 26;
  }
  listas.getCell('A15').value =
    'No borres las celdas de valores de la tabla de arriba. Si falta un código de tipo en tu Pandy, agregalo en la columna correspondiente y avisá para actualizar el script (npm run contingencia:excel).';
  listas.getCell('A15').font = { italic: true, color: { argb: 'FF475569' } };
}

async function main() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Pandi / Pandy — contingencia';
  wb.created = new Date();

  // --- 1 Instructivo ---
  const instructivo = wb.addWorksheet('1_Lee_primero_instructivo', {
    properties: { tabColor: { argb: 'FF0D7D3D' } },
  });
  const texto = [
    ['INSTRUCTIVO — PLANILLA DE CONTINGENCIA PANDY'],
    [''],
    ['DESPLEGABLES Y MENOS ERRORES'],
    [''],
    ['En las hojas 2_Acuerdos_ordenes y 3_Transacciones, muchas columnas tienen una flechita: al hacer clic solo podés elegir valores válidos para Pandy.'],
    ['Los valores permitidos están también en la hoja «Listas» (por si necesitás leerlos o agregar un código de tipo con acuerdo del administrador).'],
    [''],
    ['1. ¿Para qué sirve?'],
    [''],
    ['Anotar operaciones cuando Pandy no está disponible. Después se vuelca al sistema con revisión humana.'],
    [''],
    ['2. Orden de trabajo'],
    [''],
    ['• Primero «2_Acuerdos_ordenes» (un acuerdo = una fila; número en ID_temporal).'],
    ['• Después «3_Transacciones» (cada pata = una fila; mismo ID_temporal_orden que el acuerdo).'],
    ['• Opcional: «4_Comisiones».'],
    [''],
    ['3. ID_temporal'],
    [''],
    ['Número entero que vos elegís por acuerdo (1, 2, 3…). En transacciones repetís ese número para enlazar.'],
    [''],
    ['4. Montos'],
    [''],
    ['Solo números. El Excel avisa si el importe no es numérico razonable.'],
    [''],
    ['5. Pagador y cobrador'],
    [''],
    ['Son listas: cliente, pandy, intermediario. En cada fila tienen que ser distintos (el Excel no lo controla: revisalo antes de guardar).'],
    [''],
    ['6. Después del incidente'],
    [''],
    ['No cargar en Pandy sin revisar comprobantes. Conservá copia de este archivo con fecha.'],
    [''],
    ['— Fin —'],
  ];
  texto.forEach((row, i) => {
    instructivo.getCell(i + 1, 1).value = row[0];
  });
  instructivo.getColumn(1).width = 98;

  // --- 2 Acuerdos ---
  const headersOrdenes = [
    'ID_temporal',
    'Fecha_acuerdo',
    'Nombre_cliente',
    'Nombre_intermediario',
    'Con_intermediario_Si_No',
    'Codigo_tipo_operacion',
    'Moneda_recibida',
    'Moneda_entregada',
    'Monto_recibido',
    'Monto_entregado',
    'Cotizacion',
    'Tasa_descuento_intermediario_pct_0_100',
    'Estado_orden',
    'Observaciones',
    'Quien_completa_iniciales',
  ];
  const wsOrd = wb.addWorksheet('2_Acuerdos_ordenes', {
    properties: { tabColor: { argb: 'FF2563EB' } },
  });
  wsOrd.addRow(headersOrdenes);
  styleHeaderRow(wsOrd, headersOrdenes.length);
  wsOrd.addRow([
    1,
    new Date(2025, 2, 18),
    'Ejemplo S.A.',
    '',
    'No',
    'USD-USD',
    'USD',
    'USD',
    10000,
    9700,
    null,
    null,
    'instrumentacion_cerrada_ejecucion',
    'Borrar esta fila de ejemplo al usar',
    '—',
  ]);
  const widthsOrd = [14, 14, 28, 22, 22, 22, 14, 14, 14, 14, 12, 28, 24, 40, 16];
  widthsOrd.forEach((w, i) => {
    wsOrd.getColumn(i + 1).width = w;
  });

  applyWholeColumn(wsOrd, 'A', 1, 999999, 'ID temporal', 'Número entero que une acuerdo y transacciones (ej. 1, 2, 3).');
  applyDateColumn(wsOrd, 'B');
  applyListColumn(wsOrd, 'E', R.siNo, {
    promptTitle: '¿Intermediario?',
    prompt: 'Si hay intermediario en el acuerdo: Si. Si no: No.',
  });
  applyListColumn(wsOrd, 'F', R.codigoTipo, { promptTitle: 'Tipo de operación' });
  applyListColumn(wsOrd, 'G', R.moneda, { promptTitle: 'Moneda recibida (acuerdo)' });
  applyListColumn(wsOrd, 'H', R.moneda, { promptTitle: 'Moneda entregada (acuerdo)' });
  applyDecimalColumn(wsOrd, 'I', 0, 1e15, 'Monto recibido', 'Número positivo (acuerdo).');
  applyDecimalColumn(wsOrd, 'J', 0, 1e15, 'Monto entregado', 'Número positivo (acuerdo).');
  applyDecimalColumn(wsOrd, 'K', 0, 1e15, 'Cotización', 'Solo si aplica (cruces de moneda). Si no, vacío.');
  applyDecimalColumn(wsOrd, 'L', 0, 100, 'Tasa descuento %', 'De 0 a 100 si aplica; si no, vacío.');
  applyListColumn(wsOrd, 'M', R.estadoOrden, { promptTitle: 'Estado de la orden' });

  // --- 3 Transacciones ---
  const headersTrx = [
    'ID_temporal_orden',
    'Nro_pata_1_2_3_4',
    'Tipo_ingreso_egreso',
    'Modo_pago',
    'Moneda',
    'Monto',
    'Pagador',
    'Cobrador',
    'Estado_trx',
    'Fecha_ejecucion',
    'Tipo_cambio_opcional',
    'Caja_tipo_efectivo_banco_cheque',
    'Concepto',
  ];
  const wsTrx = wb.addWorksheet('3_Transacciones', {
    properties: { tabColor: { argb: 'FF2563EB' } },
  });
  wsTrx.addRow(headersTrx);
  styleHeaderRow(wsTrx, headersTrx.length);
  wsTrx.addRow([
    1,
    1,
    'ingreso',
    'efectivo',
    'USD',
    10000,
    'cliente',
    'pandy',
    'ejecutada',
    new Date(2025, 2, 18),
    null,
    'efectivo',
    'Ejemplo — borrar fila',
  ]);
  wsTrx.addRow([
    1,
    2,
    'egreso',
    'efectivo',
    'USD',
    9700,
    'pandy',
    'cliente',
    'ejecutada',
    new Date(2025, 2, 18),
    null,
    'efectivo',
    'Ejemplo — borrar fila',
  ]);
  const widthsTrx = [18, 12, 18, 14, 10, 12, 14, 14, 14, 14, 16, 22, 36];
  widthsTrx.forEach((w, i) => {
    wsTrx.getColumn(i + 1).width = w;
  });

  applyWholeColumn(wsTrx, 'A', 1, 999999, 'ID temporal orden', 'Mismo número que el acuerdo en hoja 2.');
  applyWholeColumn(wsTrx, 'B', 1, 4, 'Número de pata', '1, 2, 3 o 4 según el orden de instrumentación.');
  applyListColumn(wsTrx, 'C', R.tipo, { promptTitle: 'Tipo' });
  applyListColumn(wsTrx, 'D', R.modoPago, { promptTitle: 'Modo de pago' });
  applyListColumn(wsTrx, 'E', R.moneda, { promptTitle: 'Moneda' });
  applyDecimalColumn(wsTrx, 'F', 0, 1e15, 'Monto', 'Importe de la transacción.');
  applyListColumn(wsTrx, 'G', R.persona, { promptTitle: 'Pagador' });
  applyListColumn(wsTrx, 'H', R.persona, { promptTitle: 'Cobrador (distinto del pagador)' });
  applyListColumn(wsTrx, 'I', R.estadoTrx, { promptTitle: 'Estado transacción' });
  applyDateColumn(wsTrx, 'J');
  applyDecimalColumn(wsTrx, 'K', 0, 1e15, 'Tipo de cambio', 'Opcional; si no aplica, vacío.');
  applyListColumn(wsTrx, 'L', R.cajaTipo, { promptTitle: 'Caja' });

  // --- 4 Comisiones ---
  const headersCom = ['ID_temporal_orden', 'Moneda', 'Monto', 'Concepto'];
  const wsCom = wb.addWorksheet('4_Comisiones', {
    properties: { tabColor: { argb: 'FF2563EB' } },
  });
  wsCom.addRow(headersCom);
  styleHeaderRow(wsCom, headersCom.length);
  wsCom.addRow([1, 'USD', 300, 'Ejemplo — borrar fila']);
  [18, 10, 14, 44].forEach((w, i) => {
    wsCom.getColumn(i + 1).width = w;
  });
  applyWholeColumn(wsCom, 'A', 1, 999999, 'ID temporal orden', 'Enlace al acuerdo.');
  applyListColumn(wsCom, 'B', R.moneda, { promptTitle: 'Moneda comisión' });
  applyDecimalColumn(wsCom, 'C', 0, 1e15, 'Monto', 'Importe de la comisión.');

  // --- Listas al final (pestañas en orden lógico para quien carga datos) ---
  const listas = wb.addWorksheet(SHEET_LISTAS, {
    properties: { tabColor: { argb: 'FF64748B' } },
  });
  poblarHojaListas(listas);

  await wb.xlsx.writeFile(outPath);
  console.log('Creado:', outPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
