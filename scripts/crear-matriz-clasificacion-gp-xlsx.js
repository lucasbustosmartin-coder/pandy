/**
 * Genera docs/MATRIZ_CLASIFICACION_MOVIMIENTO_GP_BOLSAS.xlsx.
 * La hoja Matriz viene precargada con el comportamiento actual de
 * sql/migracion_gp_operativa_panel.sql + migracion_gp_operativa_detalle.sql (helpers
 * gp_movimiento_cc_cuenta_es_linea_comision_gp, gp_movimiento_caja_ordenes_es_comision_gp).
 *
 * Sobrescribe el .xlsx si ya existe — guardá copia antes de re-ejecutar si tenés correcciones locales.
 */
const XLSX = require('xlsx');
const path = require('path');

const outPath = path.join(__dirname, '..', 'docs', 'MATRIZ_CLASIFICACION_MOVIMIENTO_GP_BOLSAS.xlsx');

const leyenda = [
  ['Leyenda — hoja Matriz: clasificacion_movimiento (ENUM) → bolsas del resumen G/P'],
  [],
  ['Qué es cada celda', 'Cada celda cruza una FILA (un valor del ENUM de clasificación del movimiento) con una COLUMNA (una bolsa del JSON de gp_operativa_resumen: caja_manual, caja_ordenes, cc_cliente, cc_intermediario, comisiones_acuerdo_pandy, comisiones_acuerdo_intermediario, cc_resultado_economico_compensatorio). Ahí va S, N, E o C.'],
  [],
  ['S', 'SÍ = “Un movimiento con esta clasificación, cuando viene de la tabla que alimenta esa bolsa (caja vs CC cliente vs CC intermediario) y cumple fecha/estado, su MONTO ENTRA en el total que ves en esa bolsa del panel G/P.” No significa que toda fila entre en todas las bolsas con S: depende de si el movimiento es de caja o de CC (ver notas de fila).'],
  ['N', 'NO = “Esa bolsa no suma el monto de este movimiento por este criterio.” Suele ser porque la bolsa se alimenta de otra tabla (ej. cc_cliente no suma filas de caja) o el WHERE del SQL no incluye ese caso.'],
  ['E', 'EXCLUSIÓN explícita en el SQL = “Este movimiento NO entra en el agregado de FLUJO de esa bolsa” (ej. comisión del acuerdo sacada de cc_* y de caja_ordenes), y en cambio puede contar en las bolsas de comisiones si la fila entra al UNION de comisiones.'],
  ['C', 'CONDICIONAL = “Depende de otra cosa (hoy: sobre todo el texto del concepto en LEGACY junto con gp_concepto_es_*).” Mirá la columna Notas de esa fila.'],
  [],
  ['Importante', 'Una MISMA fila de la base no puede estar a la vez en “flujo” y en “comisión” para la misma bolsa CC: el SQL usa NOT helper vs AND helper (excluyente). S/E/N describen el criterio por tipo de clasificación, no “sumá dos veces”.'],
  [],
  ['Columnas de bolsa', 'mismos nombres que las siete claves JSON de gp_operativa_resumen (incluye cc_resultado_economico_compensatorio).'],
  ['Columna Origen_típico', 'CCc = tabla movimientos_cuenta_corriente | CCi = movimientos_cuenta_corriente_intermediario | Caja = movimientos_caja.'],
  [],
  ['Matriz precargada', 'comportamiento actual del SQL en repo. Corregí solo lo que quieras cambiar.'],
];

const N = 'N';
const S = 'S';
const E = 'E';
const C = 'C';

/** [enum, origen, cm, co, ccc, cci, cap, cai, cc_resultado_economico_compensatorio, notas] */
const matriz = [
  [
    'clasificacion_movimiento',
    'Origen_típico',
    'caja_manual',
    'caja_ordenes',
    'cc_cliente',
    'cc_intermediario',
    'comisiones_acuerdo_pandy',
    'comisiones_acuerdo_intermediario',
    'cc_resultado_economico_compensatorio',
    'Notas_comportamiento_actual_SQL',
  ],
  [
    'LEGACY_SIN_CLASIFICAR',
    'mezcla',
    S,
    C,
    C,
    C,
    C,
    C,
    N,
    'caja_manual: sin filtro por clasificación (solo orden_id IS NULL, cerrado, tipo incluye_gp_operativo). caja_ordenes/CC: si gp_concepto_es_* marca comisión caja/CC → efecto E en flujo y puede entrar al UNION de comisiones; si no, S en flujo y N en comisiones. comisiones_*: C = S solo si la fila CC es línea comisión que entra al UNION (huérfana / sin comisiones_orden del beneficiario). Bolsa resultado: N salvo que el backfill/app clasifique explícitamente como REC.',
  ],
  [
    'CC_FLUJO_OPERATIVO_TRX',
    'CCc/CCi/Caja',
    S,
    S,
    S,
    S,
    N,
    N,
    N,
    'No es línea comisión por ENUM. CC: estado pendiente|cerrado, no anulado, suma en cc_cliente o cc_inter según tabla. Caja: suma en manual u órdenes según orden_id; caja_ordenes excluye solo por helper comisión (texto/CAJA_COMISION).',
  ],
  [
    'CC_COMISION_ACUERDO',
    'CCc/CCi',
    N,
    N,
    E,
    E,
    S,
    S,
    N,
    'gp_movimiento_cc_cuenta_es_linea_comision_gp = true → excluida del SUM de cc_cliente/cc_intermediario; puede sumar en comisiones_acuerdo_* vía UNION si aplica huérfano/comisiones_orden. S en com_pandy solo para filas en movimientos_cuenta_corriente; S en com_int solo para filas en movimientos_cuenta_corriente_intermediario (una fila no llena ambas).',
  ],
  [
    'CC_COMPENSACION',
    'CCc/CCi',
    N,
    N,
    S,
    S,
    N,
    N,
    N,
    'No está en el OR de comisión del helper; cuenta como flujo CC igual que CC_FLUJO.',
  ],
  [
    'CC_COMISION_SINTETICA_SIN_TRX',
    'CCc/CCi',
    N,
    N,
    E,
    E,
    S,
    S,
    N,
    'Mismo tratamiento comisión CC que CC_COMISION_ACUERDO (helper incluye este ENUM).',
  ],
  [
    'REGULA_B_MONR_MONE_PRESTAMO',
    'CCc/CCi',
    N,
    N,
    S,
    S,
    N,
    N,
    N,
    'Flujo CC; no es comisión por helper.',
  ],
  [
    'CIERRE_ORDEN_MULTIMONEDA',
    'CCc/CCi',
    N,
    N,
    S,
    S,
    N,
    N,
    N,
    'Flujo CC.',
  ],
  [
    'CC_RESULTADO_ECONOMICO_COMPENSATORIO',
    'CCc/CCi',
    N,
    N,
    N,
    N,
    N,
    N,
    S,
    'Modelo B: excluidas de cc_cliente/cc_intermediario en gp_operativa_resumen; suman solo en cc_resultado_economico_compensatorio (cliente+intermediario). No está en el OR de comisión del helper.',
  ],
  [
    'CANCELACION_CONTRAPARTE',
    'CCc/CCi',
    N,
    N,
    S,
    S,
    N,
    N,
    N,
    'Flujo CC.',
  ],
  [
    'SALDO_INICIAL_VOLCADO',
    'CCc/CCi',
    N,
    N,
    S,
    S,
    N,
    N,
    N,
    'Flujo CC.',
  ],
  [
    'MANUAL_EXPLICITO',
    'CCc/CCi/Caja',
    S,
    S,
    S,
    S,
    N,
    N,
    N,
    'Caja: mismas reglas que otras clasificaciones (manual sin orden_id; órdenes con filtro comisión caja). CC: flujo salvo que otra lógica marque comisión por texto. Además caja manual exige tipo_movimiento_caja.incluye_gp_operativo.',
  ],
  [
    'CAJA_FLUJO_OPERATIVO',
    'Caja',
    S,
    S,
    N,
    N,
    N,
    N,
    N,
    'Caja flujo; helper comisión caja solo por texto o CAJA_COMISION_ACUERDO.',
  ],
  [
    'CAJA_COMISION_ACUERDO',
    'Caja(órdenes)',
    N,
    E,
    N,
    N,
    N,
    N,
    N,
    'gp_movimiento_caja_ordenes_es_comision_gp true → excluido del SUM de caja_ordenes. El UNION de comisiones en panel usa comisiones_orden + CC comisión, no filas de movimientos_caja; el monto puede figurar vía comisiones_orden/CC aparte.',
  ],
  [
    'EXCEPCION_NETEO_USD_USD_CON_INTERMEDIARIO',
    'CC/Caja',
    S,
    S,
    S,
    S,
    N,
    N,
    N,
    'Hoy no hay rama específica por este ENUM en gp_*: se comporta como flujo (no entra al OR de comisión del helper). Si la fila es solo CC, cajas N por origen; si es caja, CC N. Valores S indican “donde aplica una fila con este ENUM en esa tabla, cuenta como flujo”.',
  ],
];

const excepcion = [
  ['EXCEPCION_NETEO_USD_USD_CON_INTERMEDIARIO — comportamiento actual SQL'],
  [],
  ['Campo', 'Texto (repo abril 2026)'],
  [
    'Cuándo aplica (regla en palabras)',
    'No hay condición dedicada en gp_operativa_resumen / gp_operativa_detalle: el ENUM no altera filtros respecto de CC_FLUJO_OPERATIVO_TRX en CC ni respecto de caja flujo en movimientos_caja.',
  ],
  [
    'Qué tablas / movimientos la reciben',
    'Donde persista clasificacion_movimiento = EXCEPCION_NETEO_USD_USD_CON_INTERMEDIARIO (backfill/app futuro); hoy el agregado solo distingue comisión vs no comisión vía helpers citados en el script.',
  ],
  [
    'Totales vs detalle',
    'Misma lógica en detalle que en resumen (mismos helpers por bolsa).',
  ],
  [],
  ['Si el negocio requiere otra bolsa o exclusiones:', 'corregí la fila en Matriz y esta hoja; luego se traduce a SQL + tests.'],
];

const wb = XLSX.utils.book_new();

const wsLey = XLSX.utils.aoa_to_sheet(leyenda);
wsLey['!cols'] = [{ wch: 28 }, { wch: 110 }];
XLSX.utils.book_append_sheet(wb, wsLey, 'Leyenda');

const wsMat = XLSX.utils.aoa_to_sheet(matriz);
wsMat['!cols'] = [
  { wch: 40 },
  { wch: 22 },
  { wch: 14 },
  { wch: 14 },
  { wch: 14 },
  { wch: 18 },
  { wch: 26 },
  { wch: 32 },
  { wch: 36 },
  { wch: 92 },
];
XLSX.utils.book_append_sheet(wb, wsMat, 'Matriz');

const wsExc = XLSX.utils.aoa_to_sheet(excepcion);
wsExc['!cols'] = [{ wch: 55 }, { wch: 95 }];
XLSX.utils.book_append_sheet(wb, wsExc, 'EXCEPCION_NETEO');

XLSX.writeFile(wb, outPath);
console.log('Creado:', outPath);
