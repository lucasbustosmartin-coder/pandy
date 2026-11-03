/**
 * Foto de gemelos CC vivos en producción (misma clave que el Excel viejo ocultaba).
 * Importes como número.
 *
 * Uso: node scripts/crear-excel-duplicados-cc-prod.js
 * Salida: docs/CC_DUPLICADOS_PROD_SALDO.xlsx
 */
const XLSX = require('xlsx');
const path = require('path');

const out = path.join(__dirname, '..', 'docs', 'CC_DUPLICADOS_PROD_SALDO.xlsx');

function sheet(aoa, name, widths) {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  if (widths) ws['!cols'] = widths.map((wch) => ({ wch }));
  return { name, ws };
}

const leyenda = [
  ['Campo', 'Valor'],
  ['Foto', '2026-11-03 producción Pandy (bxwxuzbahewvptarlnxm)'],
  ['Qué es', 'Movimientos CC vivos (no anulados) que están duplicados: misma entidad, orden, transacción, monto y concepto.'],
  ['Para qué', 'Saldos ya sumaba las dos copias; el Excel de Movimientos mostraba una. Este archivo lista las dos para que la suma concilie con Saldos.'],
  ['Criterio de gemelo', 'No manual; misma orden + transacción + monto + primeros 60 caracteres del concepto (lo que el Excel viejo recortaba).'],
  ['Quién tiene gemelos', 'Rou (intermediario), Dacharry, DOC, Mateo, Pablo Franck. Nadie más en prod.'],
  ['Qué no entra', 'Anulados. Manuales. Caja. Orden 788 (Guido: no es gemelo, es un compromiso de más + ajuste manual).'],
  ['Tras implementar el sync', 'Solo 576 y 788 se sincronizan. 23, 28, 41, 42 y 106 quedan congeladas. En Rou/Dacharry el gemelo que sí se anula es el de la 576.'],
  ['App desde este cambio', 'Movimientos + Excel de la app listan las dos copias (como el ojito). SUM Excel = Saldos, con o sin gemelos.'],
  ['Cómo regenerar', 'node scripts/crear-excel-duplicados-cc-prod.js'],
];

const resumen = [
  [
    'Entidad',
    'Libro',
    'USD Saldos hoy (prod, todas las filas vivas)',
    'USD extra = 2ª copia de gemelos',
    'USD que daba el Excel viejo (ocultaba 1 copia)',
    '¿Excel viejo = Saldos?',
    'Órdenes con gemelo',
    'Tras sync solo 576 (28/41/42 excluidas): extra que quedaría',
  ],
  ['Rou', 'Intermediario + cliente (lo que ves en Saldos tipo Intermediario)', 55271.5147, 7148.325, 48123.1897, 'NO', '28, 41, 42, 576', -811.675],
  ['Rou', 'Solo libro intermediario', -464658.6953, 7148.325, -471807.0203, 'NO', '28, 41, 42, 576', -811.675],
  ['Rou', 'Solo libro cliente', 519930.21, 0, 519930.21, 'SÍ', '—', 0],
  ['Dacharry', 'Cliente', -7880, -7880, 0, 'NO', '576', 0],
  ['DOC', 'Cliente', 0, 0, 0, 'SÍ (las 2ª copias se anulan entre sí)', '28', 0],
  ['Mateo', 'Cliente', -23978, 0, -23978, 'SÍ (las 2ª copias se anulan entre sí)', '41', 0],
  ['Pablo Franck', 'Cliente', 0, 0, 0, 'SÍ (las 2ª copias se anulan entre sí)', '42', 0],
];

const grupos = [
  ['Entidad', 'Libro', 'Orden', 'Trans.', 'Moneda', 'Monto de cada copia', 'Copias vivas', 'Extra en Saldos (1 copia)', 'Concepto', '¿Se toca al sync?'],
  ['Rou', 'Intermediario', 28, 75, 'USD', 9935, 2, 9935, 'Cobro Realizado - Orden 28 y Trans 75', 'NO (exclusión)'],
  ['Rou', 'Intermediario', 28, null, 'USD', -49.675, 2, -49.675, 'Comisión del acuerdo - Orden 28 y Trans 75', 'NO (exclusión)'],
  ['Rou', 'Intermediario', 41, 102, 'USD', -15000, 2, -15000, 'Pago Realizado - Orden 41 y Trans 102', 'NO (exclusión)'],
  ['Rou', 'Intermediario', 41, null, 'USD', -75, 2, -75, 'Comisión del acuerdo - Orden 41 y Trans 101', 'NO (exclusión)'],
  ['Rou', 'Intermediario', 42, 105, 'USD', 4400, 2, 4400, 'Cobro Realizado - Orden 42 y Trans 105', 'NO (exclusión)'],
  ['Rou', 'Intermediario', 42, null, 'USD', -22, 2, -22, 'Comisión del acuerdo - Orden 42 y Trans 105', 'NO (exclusión)'],
  ['Rou', 'Intermediario', 576, 1238, 'USD', 8000, 2, 8000, 'Cobro Realizado - Orden 576 y Trans 1238', 'SÍ'],
  ['Rou', 'Intermediario', 576, null, 'USD', -40, 2, -40, 'Comisión del acuerdo - Orden 576 y Trans 1238', 'SÍ'],
  ['Dacharry', 'Cliente', 576, 1238, 'USD', -8000, 2, -8000, 'Cobro Realizado - Orden 576 y Trans 1238 (pago a intermediario)', 'SÍ'],
  ['Dacharry', 'Cliente', 576, 1239, 'USD', -7880, 2, -7880, 'Cobro Realizado - Orden 576 y Trans 1239', 'SÍ'],
  ['Dacharry', 'Cliente', 576, 1238, 'USD', 8000, 2, 8000, 'Ajuste libro acuerdo — Orden 576 · Trans 1238', 'SÍ'],
  ['DOC', 'Cliente', 28, 75, 'USD', -9935, 2, -9935, 'Cobro Realizado - Orden 28 y Trans 75 (pago a intermediario)', 'NO (exclusión)'],
  ['DOC', 'Cliente', 28, 76, 'USD', -9835.65, 2, -9835.65, 'Pago Realizado - Orden 28 y Trans 76', 'NO (exclusión)'],
  ['DOC', 'Cliente', 28, 76, 'USD', 9835.65, 2, 9835.65, 'Ajuste libro acuerdo — Orden 28 · Trans 76', 'NO (exclusión)'],
  ['DOC', 'Cliente', 28, 75, 'USD', 9935, 2, 9935, 'Ajuste libro acuerdo — Orden 28 · Trans 75', 'NO (exclusión)'],
  ['Mateo', 'Cliente', 41, 101, 'USD', -15300, 2, -15300, 'Cobro Realizado - Orden 41 y Trans 101', 'NO (exclusión)'],
  ['Mateo', 'Cliente', 41, 102, 'USD', -15000, 2, -15000, 'Pago Realizado - Orden 41 y Trans 102', 'NO (exclusión)'],
  ['Mateo', 'Cliente', 41, 102, 'USD', 15000, 2, 15000, 'Ajuste libro acuerdo — Orden 41 · Trans 102', 'NO (exclusión)'],
  ['Mateo', 'Cliente', 41, 101, 'USD', 15300, 2, 15300, 'Ajuste libro acuerdo — Orden 41 · Trans 101', 'NO (exclusión)'],
  ['Pablo Franck', 'Cliente', 42, 105, 'USD', -4400, 2, -4400, 'Cobro Realizado - Orden 42 y Trans 105 (pago a intermediario)', 'NO (exclusión)'],
  ['Pablo Franck', 'Cliente', 42, 106, 'USD', -4300, 2, -4300, 'Pago Realizado - Orden 42 y Trans 106', 'NO (exclusión)'],
  ['Pablo Franck', 'Cliente', 42, 106, 'USD', 4300, 2, 4300, 'Ajuste libro acuerdo — Orden 42 · Trans 106', 'NO (exclusión)'],
  ['Pablo Franck', 'Cliente', 42, 105, 'USD', 4400, 2, 4400, 'Ajuste libro acuerdo — Orden 42 · Trans 105', 'NO (exclusión)'],
];

const filas = [
  ['Entidad', 'Libro', 'Fecha', 'Orden', 'Trans.', 'Moneda', 'Monto', 'Estado', 'Concepto', 'id', 'Alta (UTC)'],
  ['Rou', 'Intermediario', '2026-04-09', 28, null, 'USD', -49.675, 'cerrado', 'Comisión del acuerdo - Orden 28 y Trans 75', '35d1f9f3-2d76-4630-98af-df0d1c3a2dc8', '2026-10-26 19:19:34'],
  ['Rou', 'Intermediario', '2026-04-09', 28, null, 'USD', -49.675, 'cerrado', 'Comisión del acuerdo - Orden 28 y Trans 75', '3ebb1c38-7490-432a-9f71-bd095cc5c0e2', '2026-10-29 16:54:07'],
  ['Rou', 'Intermediario', '2026-04-09', 28, 75, 'USD', 9935, 'cerrado', 'Cobro Realizado - Orden 28 y Trans 75', '9c5d4e13-a6bc-4583-bbad-92db0b742715', '2026-10-26 19:19:34'],
  ['Rou', 'Intermediario', '2026-04-09', 28, 75, 'USD', 9935, 'cerrado', 'Cobro Realizado - Orden 28 y Trans 75', '2ac80f70-b27f-4ffa-b843-864b416fd6e3', '2026-10-29 16:54:07'],
  ['Rou', 'Intermediario', '2026-04-13', 41, 102, 'USD', -15000, 'cerrado', 'Pago Realizado - Orden 41 y Trans 102', '81bef385-90e0-44e3-b04e-cf4a502b5ba9', '2026-10-26 19:19:34'],
  ['Rou', 'Intermediario', '2026-04-13', 41, 102, 'USD', -15000, 'cerrado', 'Pago Realizado - Orden 41 y Trans 102', 'ddd6773d-0bdd-408c-baa0-2f4afd4f9c45', '2026-10-29 16:54:07'],
  ['Rou', 'Intermediario', '2026-04-13', 41, null, 'USD', -75, 'cerrado', 'Comisión del acuerdo - Orden 41 y Trans 101', '6dd0a0a3-659b-40bd-ba38-3a5d01579849', '2026-10-26 19:19:34'],
  ['Rou', 'Intermediario', '2026-04-13', 41, null, 'USD', -75, 'cerrado', 'Comisión del acuerdo - Orden 41 y Trans 101', 'b283a044-e752-4ea1-962b-1913fec5e984', '2026-10-29 16:54:06'],
  ['Rou', 'Intermediario', '2026-04-13', 42, null, 'USD', -22, 'cerrado', 'Comisión del acuerdo - Orden 42 y Trans 105', 'c0878d48-58f8-4c1e-bba6-5c6aa9d01507', '2026-10-26 19:19:34'],
  ['Rou', 'Intermediario', '2026-04-13', 42, null, 'USD', -22, 'cerrado', 'Comisión del acuerdo - Orden 42 y Trans 105', '25933230-6504-4569-902d-19fd6b79f093', '2026-10-29 16:54:07'],
  ['Rou', 'Intermediario', '2026-04-13', 42, 105, 'USD', 4400, 'cerrado', 'Cobro Realizado - Orden 42 y Trans 105', '1459f1af-2736-4a72-ae86-c2ce611ccead', '2026-10-26 19:19:34'],
  ['Rou', 'Intermediario', '2026-04-13', 42, 105, 'USD', 4400, 'cerrado', 'Cobro Realizado - Orden 42 y Trans 105', '5def990c-8004-4702-a852-88000ed0e35e', '2026-10-29 16:54:07'],
  ['Rou', 'Intermediario', '2026-07-27', 576, null, 'USD', -40, 'cerrado', 'Comisión del acuerdo - Orden 576 y Trans 1238', '439782bb-02e7-4066-8463-8cb03383b0d3', '2026-07-27 14:36:08'],
  ['Rou', 'Intermediario', '2026-07-27', 576, null, 'USD', -40, 'cerrado', 'Comisión del acuerdo - Orden 576 y Trans 1238', '0543a437-2a47-4002-b98f-6b96ae0003c6', '2026-10-31 14:23:13'],
  ['Rou', 'Intermediario', '2026-07-27', 576, 1238, 'USD', 8000, 'cerrado', 'Cobro Realizado - Orden 576 y Trans 1238', 'e937545a-3e3c-49d5-87f2-36f6152ba9a2', '2026-07-27 14:31:27'],
  ['Rou', 'Intermediario', '2026-07-27', 576, 1238, 'USD', 8000, 'cerrado', 'Cobro Realizado - Orden 576 y Trans 1238', '76f62d9e-f77a-4052-bc30-d46bef3e71a8', '2026-10-31 14:23:13'],
  ['Dacharry', 'Cliente', '2026-07-27', 576, 1238, 'USD', -8000, 'cerrado', 'Cobro Realizado - Orden 576 y Trans 1238 (pago a intermediario)', 'f72bc9da-02e7-416f-a0f3-8e44b63d36fc', '2026-07-27 14:36:08'],
  ['Dacharry', 'Cliente', '2026-07-27', 576, 1238, 'USD', -8000, 'cerrado', 'Cobro Realizado - Orden 576 y Trans 1238 (pago a intermediario)', '92bd61d0-11fb-4cd7-9592-f0783ec8e9c9', '2026-10-31 14:23:14'],
  ['Dacharry', 'Cliente', '2026-07-27', 576, 1239, 'USD', -7880, 'cerrado', 'Cobro Realizado - Orden 576 y Trans 1239', '0dbe7fc4-27d3-4f97-a2b0-82ab5e50449e', '2026-07-27 14:31:27'],
  ['Dacharry', 'Cliente', '2026-07-27', 576, 1239, 'USD', -7880, 'cerrado', 'Cobro Realizado - Orden 576 y Trans 1239', '3bcb8805-ed4f-4079-a329-6b3cb556fd2f', '2026-10-31 14:23:13'],
  ['Dacharry', 'Cliente', '2026-07-27', 576, 1238, 'USD', 8000, 'cerrado', 'Ajuste libro acuerdo — Orden 576 · Trans 1238', 'c2e55626-6310-43e7-9331-d08e728b3d6b', '2026-07-27 14:36:08'],
  ['Dacharry', 'Cliente', '2026-07-27', 576, 1238, 'USD', 8000, 'cerrado', 'Ajuste libro acuerdo — Orden 576 · Trans 1238', '5be8f70a-e94b-4ffd-aad6-295d61bea629', '2026-10-31 14:23:13'],
  ['DOC', 'Cliente', '2026-04-09', 28, 75, 'USD', -9935, 'cerrado', 'Cobro Realizado - Orden 28 y Trans 75 (pago a intermediario)', 'e4d7472e-c23c-458e-8d63-3ad2cc741ff0', '2026-10-26 19:19:34'],
  ['DOC', 'Cliente', '2026-04-09', 28, 75, 'USD', -9935, 'cerrado', 'Cobro Realizado - Orden 28 y Trans 75 (pago a intermediario)', 'eae2caa7-a69c-4c59-ae42-891774005b79', '2026-10-29 16:54:07'],
  ['DOC', 'Cliente', '2026-04-09', 28, 76, 'USD', -9835.65, 'cerrado', 'Pago Realizado - Orden 28 y Trans 76', '5fbfba2d-db5f-49bb-a6fe-380d7007afbf', '2026-10-26 19:19:34'],
  ['DOC', 'Cliente', '2026-04-09', 28, 76, 'USD', -9835.65, 'cerrado', 'Pago Realizado - Orden 28 y Trans 76', 'fe0e5945-a21a-44c5-b2c5-613979cc228f', '2026-10-29 16:54:07'],
  ['DOC', 'Cliente', '2026-04-09', 28, 76, 'USD', 9835.65, 'cerrado', 'Ajuste libro acuerdo — Orden 28 · Trans 76', '6145ace1-6ed6-4ff1-889e-4ff825afbc10', '2026-10-26 19:19:34'],
  ['DOC', 'Cliente', '2026-04-09', 28, 76, 'USD', 9835.65, 'cerrado', 'Ajuste libro acuerdo — Orden 28 · Trans 76', '0b0094ea-de22-44a9-881d-5b8840763f8f', '2026-10-29 16:54:06'],
  ['DOC', 'Cliente', '2026-04-09', 28, 75, 'USD', 9935, 'cerrado', 'Ajuste libro acuerdo — Orden 28 · Trans 75', 'a38837a2-d49f-4860-afed-1655086e42bc', '2026-10-26 19:19:34'],
  ['DOC', 'Cliente', '2026-04-09', 28, 75, 'USD', 9935, 'cerrado', 'Ajuste libro acuerdo — Orden 28 · Trans 75', '13ed8b79-fd89-4179-b92a-860b3f89b3c5', '2026-10-29 16:54:06'],
  ['Mateo', 'Cliente', '2026-04-13', 41, 101, 'USD', -15300, 'cerrado', 'Cobro Realizado - Orden 41 y Trans 101', 'e433b5a7-4fdd-4b84-b2e3-4f51debf21f4', '2026-10-26 19:19:34'],
  ['Mateo', 'Cliente', '2026-04-13', 41, 101, 'USD', -15300, 'cerrado', 'Cobro Realizado - Orden 41 y Trans 101', '70c05fbf-4288-4783-959f-262e5b6ce5d3', '2026-10-29 16:54:06'],
  ['Mateo', 'Cliente', '2026-04-13', 41, 102, 'USD', -15000, 'cerrado', 'Pago Realizado - Orden 41 y Trans 102', '1470c14d-d3f1-492e-bb05-d23cbfd2a59b', '2026-10-26 19:19:34'],
  ['Mateo', 'Cliente', '2026-04-13', 41, 102, 'USD', -15000, 'cerrado', 'Pago Realizado - Orden 41 y Trans 102', '14aebe8a-94e4-42c0-8dc6-7c59fe13326e', '2026-10-29 16:54:06'],
  ['Mateo', 'Cliente', '2026-04-13', 41, 102, 'USD', 15000, 'cerrado', 'Ajuste libro acuerdo — Orden 41 · Trans 102', '200a1e25-3c35-4e2a-a461-f73edbc98ee1', '2026-10-26 19:19:34'],
  ['Mateo', 'Cliente', '2026-04-13', 41, 102, 'USD', 15000, 'cerrado', 'Ajuste libro acuerdo — Orden 41 · Trans 102', '5abc54ba-f4f9-4802-9703-03484ede6ca4', '2026-10-29 16:54:07'],
  ['Mateo', 'Cliente', '2026-04-13', 41, 101, 'USD', 15300, 'cerrado', 'Ajuste libro acuerdo — Orden 41 · Trans 101', '218c89f3-9044-4e61-9012-9100b4ccfcb5', '2026-10-26 19:19:34'],
  ['Mateo', 'Cliente', '2026-04-13', 41, 101, 'USD', 15300, 'cerrado', 'Ajuste libro acuerdo — Orden 41 · Trans 101', 'c1fdefbc-35a7-4d63-835f-651f03396dfc', '2026-10-29 16:54:06'],
  ['Pablo Franck', 'Cliente', '2026-04-13', 42, 105, 'USD', -4400, 'cerrado', 'Cobro Realizado - Orden 42 y Trans 105 (pago a intermediario)', '53138192-ba13-481b-8507-f1e355fd0a3b', '2026-10-26 19:19:34'],
  ['Pablo Franck', 'Cliente', '2026-04-13', 42, 105, 'USD', -4400, 'cerrado', 'Cobro Realizado - Orden 42 y Trans 105 (pago a intermediario)', '42e31bcb-cc02-47ef-a0bf-4658c3ce3cd9', '2026-10-29 16:54:07'],
  ['Pablo Franck', 'Cliente', '2026-04-13', 42, 106, 'USD', -4300, 'cerrado', 'Pago Realizado - Orden 42 y Trans 106', '92a6834f-fa69-41c9-85b0-f8a3da739911', '2026-10-26 19:19:34'],
  ['Pablo Franck', 'Cliente', '2026-04-13', 42, 106, 'USD', -4300, 'cerrado', 'Pago Realizado - Orden 42 y Trans 106', '084d0e84-8510-40f1-b69c-6f35e797be06', '2026-10-29 16:54:07'],
  ['Pablo Franck', 'Cliente', '2026-04-13', 42, 106, 'USD', 4300, 'cerrado', 'Ajuste libro acuerdo — Orden 42 · Trans 106', '2140c0db-5085-41b4-b696-4e034230cf40', '2026-10-26 19:19:34'],
  ['Pablo Franck', 'Cliente', '2026-04-13', 42, 106, 'USD', 4300, 'cerrado', 'Ajuste libro acuerdo — Orden 42 · Trans 106', '90fe74e1-e6c9-469a-89ab-d272d2bb4e74', '2026-10-29 16:54:07'],
  ['Pablo Franck', 'Cliente', '2026-04-13', 42, 105, 'USD', 4400, 'cerrado', 'Ajuste libro acuerdo — Orden 42 · Trans 105', '460dc1ec-d519-4bb9-be4f-0162e6b64c35', '2026-10-26 19:19:34'],
  ['Pablo Franck', 'Cliente', '2026-04-13', 42, 105, 'USD', 4400, 'cerrado', 'Ajuste libro acuerdo — Orden 42 · Trans 105', '700141e9-b564-4bf0-8268-e7a231200c69', '2026-10-29 16:54:07'],
];

const wb = XLSX.utils.book_new();
const partes = [
  sheet(leyenda, 'Leyenda', [28, 90]),
  sheet(resumen, 'Resumen_vs_Saldos', [18, 55, 22, 22, 22, 22, 22, 28]),
  sheet(grupos, 'Grupos', [16, 16, 10, 10, 10, 18, 12, 22, 70, 18]),
  sheet(filas, 'Filas_vivas', [16, 16, 12, 10, 10, 10, 12, 12, 70, 40, 20]),
];
partes.forEach((p) => XLSX.utils.book_append_sheet(wb, p.ws, p.name));
XLSX.writeFile(wb, out);
console.log('Escrito', out);
