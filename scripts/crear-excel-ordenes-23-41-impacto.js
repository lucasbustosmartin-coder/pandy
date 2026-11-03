/**
 * Excel de consulta: órdenes con impacto si el sync nuevo (capa 1/2) corre en producción.
 * Foto 2026-11-02: gemelos vivos en Pandy + auditoría cc_caja_sync en Pandy-Dev.
 * Importes como número.
 *
 * Uso: node scripts/crear-excel-ordenes-23-41-impacto.js
 * Salida: docs/CC_ORDENES_IMPACTO_CAMBIOS_SYNC.xlsx
 *         docs/CC_ORDENES_23_Y_41_IMPACTO.xlsx (misma copia; 23/41/106 son exclusión, no el universo)
 */
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const outFull = path.join(__dirname, '..', 'docs', 'CC_ORDENES_IMPACTO_CAMBIOS_SYNC.xlsx');
const outOld = path.join(__dirname, '..', 'docs', 'CC_ORDENES_23_Y_41_IMPACTO.xlsx');

function sheet(aoa, name, widths) {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  if (widths) ws['!cols'] = widths.map((wch) => ({ wch }));
  return { name, ws };
}

const leyenda = [
  ['Campo', 'Valor'],
  ['Foto', '2026-11-02 (censo completo saldos/filas vivas CC y caja prod vs Dev)'],
  ['Producción', 'Pandy bxwxuzbahewvptarlnxm — lo que ve el cliente hoy'],
  ['Dev', 'Pandy-Dev ozsofsmnuzliczfphqze — lo que haría el sync (gemelos ya anulados / motor capa 1)'],
  ['Censo', 'CC cliente 1380 claves, CC int 688, caja 148/149. Solo 7 órdenes diferían: 23, 28, 41, 42, 106, 576, 788. Ninguna otra.'],
  ['Exclusión (NO se tocan)', 'Órdenes nro. 23, 28, 41, 42 y 106 — PANDI_CC_SYNC_EXCLUIR_NUMEROS_ORDEN'],
  ['Sí se tocan al desplegar', '576 (gemelos CC Dacharry/Rou). 788 (compromiso Guido −1.000 USD).'],
  ['Gemelos caja en prod', 'Solo orden 41 (dos +15.300 USD efectivo). 28/42/576 no tienen gemelo de caja.'],
  ['Doc exclusión', 'docs/CC_EXCLUSION_SYNC_ORDENES_23_Y_41.md'],
  ['Cómo regenerar', 'node scripts/crear-excel-ordenes-23-41-impacto.js'],
];

const todas = [
  [
    'Orden',
    '¿Se toca en prod?',
    'Origen del hallazgo',
    'Tipo',
    'Cliente',
    'Intermediario',
    'CC cliente prod',
    'CC cliente si sync (Dev)',
    'CC intermediario prod',
    'CC intermediario si sync (Dev)',
    'Caja cerrada prod',
    'Caja si sync (Dev)',
    'Impacto para el cliente / consulta',
  ],
  [
    23,
    'NO (exclusión)',
    'Auditoría Dev alta/anular comisión; no estaba en lista MonR/MonE',
    'CHEQUE-ARS',
    'Aced',
    'Jesus',
    'ARS 0',
    'ARS 0',
    58428207,
    57259642.86,
    'sin caja cerrada',
    'banco ARS -1168564.14',
    'Si se sincronizara: comisión −1.168.564,14 ARS en CC Jesus y caja banco. Por eso queda fuera.',
  ],
  [
    28,
    'NO (exclusión 2026-11-03)',
    'Gemelos vivos prod (también limpieza Dev 576/28/41/42)',
    'USD-USD',
    'DOC',
    'Rou',
    0,
    0,
    19770.65,
    9885.325,
    'sin caja cerrada de la orden',
    'sin caja cerrada de la orden',
    'Congelada: no se anula el duplicado de Rou (19.770,65). CC DOC sigue 0. Caja de la orden sin gemelo.',
  ],
  [
    41,
    'NO (exclusión)',
    'Gemelos CC + el único gemelo de CAJA en prod (+15.300×2)',
    'USD-USD',
    'Mateo',
    'Rou',
    0,
    0,
    -30150,
    -15075,
    30600,
    15300,
    'Caja efectivo USD de la orden bajaría de 30.600 a 15.300. CC Rou se reduciría a la mitad. Congelada.',
  ],
  [
    42,
    'NO (exclusión 2026-11-03)',
    'Gemelos vivos prod (limpieza Dev 576/28/41/42)',
    'USD-USD',
    'Pablo Franck',
    'Rou',
    0,
    0,
    8756,
    4378,
    'sin caja cerrada de la orden',
    'sin caja cerrada de la orden',
    'Congelada: no se anula el duplicado de Rou (8.756). CC Pablo Franck sigue 0. Caja de la orden sin gemelo.',
  ],
  [
    106,
    'NO (exclusión)',
    'Auditoría Dev cc_caja_sync: comisión ±0,81 ARS Titanium; censo prod vs Dev',
    'CHEQUE-ARS',
    'Crosti',
    'Titanium',
    -80771369.19,
    -80771369.19,
    161542740,
    161542739.19,
    'sin caja cerrada de la orden',
    'sin caja cerrada de la orden',
    'Congelada: si se sincronizara, CC Titanium ARS −0,81. CC Crosti igual. Sin caja.',
  ],
  [
    576,
    'SÍ (gemelos CC)',
    'Gemelos vivos prod (caso Dacharry; limpieza Dev)',
    'USD-USD',
    'Dacharry',
    'Rou',
    -15760,
    -7880,
    15920,
    7960,
    'sin caja cerrada de la orden',
    'sin caja cerrada de la orden',
    'CC Dacharry USD deuda se reduce a la mitad (−15.760 → −7.880). CC Rou USD a la mitad. Caja de la orden sin gemelo.',
  ],
  [
    788,
    'SÍ (motor / auditoría Dev)',
    'Auditoría Dev: anular Compromiso de Pago 1.000 USD (Guido)',
    'USD-ARS',
    'Guido',
    '(sin intermediario)',
    'ARS 0 / USD -1000',
    'ARS 0 / USD 0',
    'sin CC int',
    'sin CC int',
    'efectivo ARS -1530000 y USD +1000',
    'igual (caja no cambia)',
    'CC Guido USD −1.000 pasa a 0 (se anula compromiso duplicado/huérfano). Caja efectivo no se mueve.',
  ],
];

const gemelos = [
  ['Libro', 'Orden', 'Cliente/Intermediario', 'Concepto (recorte)', 'Moneda', 'Monto de cada fila', 'Filas vivas prod', 'Suma hoy (prod)', 'Suma si queda 1 (Dev)'],
  ['CC cliente', 28, 'DOC', 'Cobro Realizado trx 75', 'USD', -9935, 2, -19870, -9935],
  ['CC cliente', 28, 'DOC', 'Ajuste trx 75', 'USD', 9935, 2, 19870, 9935],
  ['CC cliente', 28, 'DOC', 'Ajuste trx 76', 'USD', 9835.65, 2, 19671.3, 9835.65],
  ['CC cliente', 28, 'DOC', 'Pago Realizado trx 76', 'USD', -9835.65, 2, -19671.3, -9835.65],
  ['CC intermediario', 28, 'Rou', 'Cobro Realizado trx 75', 'USD', 9935, 2, 19870, 9935],
  ['CC intermediario', 28, 'Rou', 'Comisión del acuerdo trx 75', 'USD', -49.675, 2, -99.35, -49.675],
  ['CC cliente', 41, 'Mateo', 'varios pares cobro/pago/ajuste trx 101-102', 'USD', null, 2, 0, 0],
  ['CC intermediario', 41, 'Rou', 'Comisión trx 101', 'USD', -75, 2, -150, -75],
  ['CC intermediario', 41, 'Rou', 'Pago Realizado trx 102', 'USD', -15000, 2, -30000, -15000],
  ['Caja efectivo', 41, '', 'Ingreso trx 101', 'USD', 15300, 2, 30600, 15300],
  ['CC cliente', 42, 'Pablo Franck', 'pares cobro/pago/ajuste trx 105-106', 'USD', null, 2, 0, 0],
  ['CC intermediario', 42, 'Rou', 'Cobro Realizado trx 105', 'USD', 4400, 2, 8800, 4400],
  ['CC intermediario', 42, 'Rou', 'Comisión trx 105', 'USD', -22, 2, -44, -22],
  ['CC cliente', 576, 'Dacharry', 'Ajuste trx 1238', 'USD', 8000, 2, 16000, 8000],
  ['CC cliente', 576, 'Dacharry', 'Cobro trx 1239', 'USD', -7880, 2, -15760, -7880],
  ['CC cliente', 576, 'Dacharry', 'Cobro trx 1238 (pago a intermediario)', 'USD', -8000, 2, -16000, -8000],
  ['CC intermediario', 576, 'Rou', 'Comisión trx 1238', 'USD', -40, 2, -80, -40],
  ['CC intermediario', 576, 'Rou', 'Cobro Realizado trx 1238', 'USD', 8000, 2, 16000, 8000],
];

const auditoriaDev = [
  ['Orden', 'Cliente', 'Intermediario', 'Libros en auditoría', 'Anular', 'Alta', 'Editar', 'Qué se vio en Dev'],
  [23, 'Aced', 'Jesus', 'cc_intermediario + caja banco', 14, 14, 18, 'Comisión −1.168.564,14 ARS y caja banco (no existe en prod)'],
  [106, '', 'Titanium', 'cc_intermediario', 9, 9, 23, 'Comisión ±0,81 ARS'],
  [788, 'Guido', '', 'cc_cliente', 7, 7, 10, 'Anular Compromiso de Pago 1.000 USD'],
  [28, 'DOC', 'Rou', '(limpieza SQL gemelos, no siempre pasó por auditoría RPC)', null, null, null, 'Gemelos CC anulados en Dev por sql/limpieza_cc_anular_gemelos_vivos.sql'],
  [41, 'Mateo', 'Rou', 'idem limpieza SQL + gemelo caja', null, null, null, 'Gemelo caja +15.300 anulado en Dev; prod las dos vivas'],
  [42, 'Pablo Franck', 'Rou', 'limpieza SQL gemelos', null, null, null, 'Gemelos CC anulados en Dev'],
  [576, 'Dacharry', 'Rou', 'limpieza SQL gemelos', null, null, null, 'Gemelos CC anulados en Dev (caso original de duplicados)'],
];

const saldos = [
  ['Orden', 'Libro', 'Entidad', 'Moneda', 'Saldo prod (vivos/cerrado)', 'Saldo Dev (si sync)', 'Delta (Dev − prod)'],
  [23, 'CC cliente', 'Aced', 'ARS', 0, 0, 0],
  [23, 'CC intermediario', 'Jesus', 'ARS', 58428207, 57259642.86, -1168564.14],
  [23, 'Caja banco', '', 'ARS', null, -1168564.14, -1168564.14],
  [28, 'CC cliente', 'DOC', 'USD', 0, 0, 0],
  [28, 'CC intermediario', 'Rou', 'USD', 19770.65, 9885.325, -9885.325],
  [41, 'CC cliente', 'Mateo', 'USD', 0, 0, 0],
  [41, 'CC intermediario', 'Rou', 'USD', -30150, -15075, 15075],
  [41, 'Caja efectivo', '', 'USD', 30600, 15300, -15300],
  [42, 'CC cliente', 'Pablo Franck', 'USD', 0, 0, 0],
  [42, 'CC intermediario', 'Rou', 'USD', 8756, 4378, -4378],
  [106, 'CC cliente', 'Crosti', 'ARS', -80771369.19, -80771369.19, 0],
  [106, 'CC intermediario', 'Titanium', 'ARS', 161542740, 161542739.19, -0.81],
  [576, 'CC cliente', 'Dacharry', 'USD', -15760, -7880, 7880],
  [576, 'CC intermediario', 'Rou', 'USD', 15920, 7960, -7960],
  [788, 'CC cliente', 'Guido', 'USD', -1000, 0, 1000],
  [788, 'CC cliente', 'Guido', 'ARS', 0, 0, 0],
  [788, 'Caja efectivo', '', 'USD', 1000, 1000, 0],
  [788, 'Caja efectivo', '', 'ARS', -1530000, -1530000, 0],
];

const copyModal = [
  ['Uso', 'Texto'],
  ['Línea 1', 'Ajustes para mejorar el rendimiento.'],
  ['Línea 2', 'Control de registros duplicados.'],
  ['Línea 3', 'Cambios en la estructura de datos de auditoría.'],
  ['No incluir', 'Números de orden, Supabase, RPC, 23/28/41/42/106.'],
];

const censo = [
  ['Qué se comparó', 'Resultado'],
  ['Universo', 'Todas las órdenes con filas vivas en CC cliente, CC intermediario o caja cerrada (prod y Dev)'],
  ['Claves CC cliente', '1380 en prod y 1380 en Dev'],
  ['Claves CC intermediario', '688 y 688'],
  ['Claves caja cerrada', '148 prod / 149 Dev (la extra es orden 23 banco ARS)'],
  ['Órdenes con cualquier diferencia de saldo o de cantidad de filas', 'Solo 23, 28, 41, 42, 106, 576, 788'],
  ['Gemelos vivos prod CC cliente', '28, 41, 42, 576'],
  ['Gemelos vivos prod CC int', '28, 41, 42, 576'],
  ['Gemelos vivos prod caja', '41'],
  ['Gemelos vivos Dev', 'ninguno (ya limpios)'],
  ['Conclusión', 'No hay más órdenes afectadas que esas siete. Fuera del sync: 23, 28, 41, 42 y 106. Al desplegar solo se tocan 576 y 788.'],
];

const wb = XLSX.utils.book_new();
[
  sheet(leyenda, 'Leyenda', [28, 100]),
  sheet(censo, 'Censo prod vs Dev', [40, 90]),
  sheet(todas, 'Todas las órdenes impacto', [10, 22, 42, 14, 16, 16, 18, 22, 22, 26, 28, 24, 70]),
  sheet(gemelos, 'Gemelos vivos producción', [20, 10, 22, 48, 10, 18, 16, 18, 22]),
  sheet(saldos, 'Saldos prod vs Dev', [10, 20, 16, 10, 26, 24, 20]),
  sheet(auditoriaDev, 'Auditoría Dev', [10, 16, 16, 40, 10, 10, 10, 70]),
  sheet(copyModal, 'Copy modal próxima versión', [22, 80]),
].forEach((s) => XLSX.utils.book_append_sheet(wb, s.ws, s.name));

[outFull, outOld].forEach((p) => {
  XLSX.writeFile(wb, p);
  if (!fs.existsSync(p)) {
    console.error('No se escribió', p);
    process.exit(1);
  }
  console.log('Creado:', p);
});
