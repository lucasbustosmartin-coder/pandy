/**
 * Genera docs/CC_MODELO_REGLAS_REVISION.xlsx con el contenido actual de cc_modelo_reglas
 * para revisar la tabla. Ejecutar: node scripts/crear-excel-reglas-cc.js
 */
const XLSX = require('xlsx');
const path = require('path');

const raw = `id,tipo_operacion_codigo,usa_intermediario,pagador,cobrador,tipo_transaccion,es_comision,estado_transaccion,contrapartida_ejecutada,cc_cliente_signo,cc_cliente_suma_saldo,incluir_en_mov_cc_cliente,cc_intermediario_signo,cc_intermediario_suma_saldo,incluir_en_mov_cc_intermediario,concepto_leyenda,usa_monto_efectivo,created_at,condicion_estado_comision
0a988cd1-10f1-4bd4-ac34-a449c462712b,ARS-USD,false,pandy,cliente,egreso,false,ejecutada,false,1,true,true,0,false,false,compromiso_pago,false,2026-03-17 15:52:42.615018+00,
0f49fe38-6f4e-4f46-952d-fff022261c50,ARS-ARS-CHEQUE,true,intermediario,pandy,ingreso,false,ejecutada,false,0,false,false,1,true,true,cobro_realizado,true,2026-03-17 15:16:33.061996+00,
0f530cad-0417-4d30-b546-8623011207b8,USD-ARS,false,cliente,pandy,ingreso,false,ejecutada,true,-1,true,false,0,false,false,cobro_realizado,false,2026-03-17 15:52:42.615018+00,
1470074c-687a-49bb-acfd-5ad9a5110861,ARS-ARS-CHEQUE,true,intermediario,pandy,ingreso,false,pendiente,false,0,false,false,1,true,true,,true,2026-03-17 15:16:33.061996+00,
1b2099da-351b-47b5-b4d2-ff6e57272621,USD-ARS,false,cliente,pandy,ingreso,false,pendiente,false,0,false,false,0,false,false,,false,2026-03-17 15:52:42.615018+00,
2469c742-df80-4228-a52e-9659ec011208,ARS-ARS,true,pandy,cliente,egreso,false,ejecutada,false,1,true,true,0,false,false,compromiso_pago,false,2026-03-17 15:16:33.061996+00,
25815a58-ed7a-4a63-ab98-9a47c3c51264,ARS-ARS-CHEQUE,true,cliente,pandy,ingreso,true,pendiente,true,1,false,true,0,false,false,,false,2026-03-17 15:16:33.061996+00,
28f5772c-ccc6-4fbf-9d65-91786d13d182,ARS-ARS-CHEQUE,true,pandy,intermediario,egreso,false,pendiente,true,0,false,false,-1,true,true,,false,2026-03-17 15:16:33.061996+00,
29056f8d-282c-4e01-942b-d02ecf328d9d,ARS-ARS,true,intermediario,pandy,ingreso,false,pendiente,true,0,false,false,1,true,true,,true,2026-03-17 15:16:33.061996+00,
2c8fcf33-a18a-41dc-8704-5ade5a4e948a,ARS-ARS,true,pandy,cliente,egreso,false,pendiente,true,1,false,false,0,false,false,,false,2026-03-17 15:16:33.061996+00,
2ce55965-dabe-4ce6-9d30-f3714615a905,ARS-ARS-CHEQUE,true,pandy,cliente,egreso,false,pendiente,true,1,false,false,0,false,false,,false,2026-03-17 15:16:33.061996+00,
2e660232-e87b-4537-96c1-3825e8059a66,ARS-ARS-CHEQUE,true,pandy,intermediario,egreso,true,pendiente,true,0,false,false,-1,false,false,,false,2026-03-17 15:16:33.061996+00,par_pandy_int
2f217d7d-302b-4898-b103-6c27bae40e75,ARS-ARS,true,cliente,pandy,ingreso,false,ejecutada,false,-1,true,true,0,false,false,cobro_realizado,false,2026-03-17 15:16:33.061996+00,
30db9551-b954-4798-81d1-785a35468d16,ARS-ARS-CHEQUE,true,pandy,intermediario,egreso,true,ejecutada,false,0,false,false,-1,false,false,comision_acuerdo,false,2026-03-17 15:16:33.061996+00,par_pandy_int
341eb238-5f54-4581-89c8-59889ecc67e2,USD-ARS,false,pandy,cliente,egreso,false,ejecutada,true,1,false,true,0,false,false,compromiso_pago,false,2026-03-17 15:52:42.615018+00,
379d6bc0-2fa5-45be-9536-9f99c068cfe9,ARS-ARS,true,cliente,pandy,ingreso,true,ejecutada,false,1,false,true,0,false,false,comision_acuerdo,false,2026-03-17 15:16:33.061996+00,
398e3a43-88ba-4baa-8b10-a142a138fe14,ARS-ARS,true,cliente,pandy,ingreso,true,ejecutada,true,1,false,true,0,false,false,comision_acuerdo,false,2026-03-17 15:16:33.061996+00,
49b29c4c-5bd6-4d8c-b96c-decfbcb425da,USD-ARS,false,pandy,cliente,egreso,false,ejecutada,false,1,true,true,0,false,false,compromiso_pago,false,2026-03-17 15:52:42.615018+00,
52d51e09-dc08-4ca9-9e75-a82608846e2b,ARS-ARS-CHEQUE,true,pandy,cliente,egreso,false,ejecutada,true,1,false,true,0,false,false,compromiso_pago,false,2026-03-17 15:16:33.061996+00,
536fb890-e6bf-4f1d-a01f-38e47d753bde,ARS-ARS-CHEQUE,true,pandy,intermediario,egreso,false,ejecutada,false,0,false,false,-1,true,true,pago_realizado,false,2026-03-17 15:16:33.061996+00,
541b0b39-c02b-48e2-9e35-fb6a3114571d,ARS-ARS-CHEQUE,true,pandy,intermediario,egreso,false,pendiente,false,0,false,false,-1,true,true,,false,2026-03-17 15:16:33.061996+00,
566f8eda-61fd-4904-9483-7afac7fc593a,ARS-ARS,true,cliente,pandy,ingreso,false,pendiente,true,-1,true,false,0,false,false,,false,2026-03-17 15:16:33.061996+00,
58a084c8-1763-47a6-a7fb-a21d8e4c69c9,ARS-ARS,true,cliente,pandy,ingreso,true,pendiente,true,1,false,true,0,false,false,,false,2026-03-17 15:16:33.061996+00,
5d99c0d4-b89e-434a-b87f-18965e6a63d2,ARS-ARS-CHEQUE,true,intermediario,pandy,ingreso,false,ejecutada,true,0,false,false,1,true,true,cobro_realizado,true,2026-03-17 15:16:33.061996+00,
5df305f9-3169-4011-b2e2-0338002ce64d,ARS-ARS-CHEQUE,true,pandy,intermediario,egreso,true,ejecutada,true,0,false,false,-1,false,false,comision_acuerdo,false,2026-03-17 15:16:33.061996+00,par_pandy_int
5e16129b-8143-4437-b2b4-a36897ed16a0,ARS-ARS,true,pandy,cliente,egreso,false,ejecutada,true,1,false,true,0,false,false,compromiso_pago,false,2026-03-17 15:16:33.061996+00,
62b7cb0b-cfd1-4b72-b180-e301332bdba3,ARS-ARS-CHEQUE,true,cliente,pandy,ingreso,true,ejecutada,true,1,false,true,0,false,false,comision_acuerdo,false,2026-03-17 15:16:33.061996+00,
648bf5ad-6b3c-48ce-a4f5-3c370702cbbe,ARS-USD,false,cliente,pandy,ingreso,false,ejecutada,true,-1,true,false,0,false,false,cobro_realizado,false,2026-03-17 15:52:42.615018+00,
66b26b1b-7b13-4a61-be30-0fd1c916dcc7,ARS-ARS,true,intermediario,pandy,ingreso,false,ejecutada,false,0,false,false,1,true,true,cobro_realizado,true,2026-03-17 15:16:33.061996+00,
6bc53feb-9c85-4560-abf2-45fcdcedc5c1,ARS-ARS,true,pandy,intermediario,egreso,false,ejecutada,false,0,false,false,-1,true,true,pago_realizado,false,2026-03-17 15:16:33.061996+00,
6f8a333f-c44e-4b39-aba2-fccc042341a8,USD-USD,false,pandy,cliente,egreso,false,pendiente,true,1,false,false,0,false,false,,false,2026-03-17 15:52:42.615018+00,
7942b62e-4b11-4756-a38c-13e1655883dd,ARS-ARS,true,cliente,pandy,ingreso,false,pendiente,false,0,false,false,0,false,false,,false,2026-03-17 15:16:33.061996+00,
79d75df5-8c62-49e2-9ae5-260a78c0574a,ARS-ARS-CHEQUE,true,cliente,pandy,ingreso,false,ejecutada,false,-1,true,true,0,false,false,cobro_realizado,false,2026-03-17 15:16:33.061996+00,
84fca8fc-7a1a-4184-b3a3-5f1b0b393e13,USD-USD,false,pandy,cliente,egreso,false,ejecutada,true,1,false,true,0,false,false,compromiso_pago,false,2026-03-17 15:52:42.615018+00,
850e2f76-bf6f-410c-970c-2c433d65265c,ARS-ARS,true,intermediario,pandy,ingreso,false,ejecutada,true,0,false,false,1,true,true,cobro_realizado,true,2026-03-17 15:16:33.061996+00,
8747bc20-c396-46b9-968b-5cf423db543d,ARS-ARS,true,cliente,pandy,ingreso,false,ejecutada,true,-1,true,false,0,false,false,cobro_realizado,false,2026-03-17 15:16:33.061996+00,
88bde559-82c0-475b-a1d1-f09f23300c8b,USD-USD,false,cliente,pandy,ingreso,false,pendiente,false,0,false,false,0,false,false,,false,2026-03-17 15:52:42.615018+00,
88e6d652-490f-4241-a308-003c7b01728f,USD-ARS,false,pandy,cliente,egreso,false,pendiente,false,0,false,false,0,false,false,,false,2026-03-17 15:52:42.615018+00,
8c90e27f-1d66-43b9-ad99-22b133a9ddd6,USD-USD,false,pandy,cliente,egreso,false,pendiente,false,0,false,false,0,false,false,,false,2026-03-17 15:52:42.615018+00,
8c9b8349-28cd-4e97-a109-feeff8d24362,ARS-ARS,true,pandy,intermediario,egreso,false,pendiente,true,0,false,false,-1,true,true,,false,2026-03-17 15:16:33.061996+00,
8cf6f21b-6d13-4ec4-9cbe-50dacc0e436f,USD-ARS,false,pandy,cliente,egreso,false,pendiente,true,1,false,false,0,false,false,,false,2026-03-17 15:52:42.615018+00,
8f01eedd-23d8-4c81-98c0-ab781abdc1cf,ARS-ARS-CHEQUE,true,cliente,pandy,ingreso,true,pendiente,false,1,false,true,0,false,false,,false,2026-03-17 15:16:33.061996+00,
9b34e8bd-6b91-4e72-b2db-51013cb274c9,ARS-USD,false,pandy,cliente,egreso,false,ejecutada,true,1,false,true,0,false,false,compromiso_pago,false,2026-03-17 15:52:42.615018+00,
9cc79f22-376a-429b-9def-609a34d7aa52,ARS-ARS-CHEQUE,true,pandy,cliente,egreso,false,ejecutada,false,1,true,true,0,false,false,compromiso_pago,false,2026-03-17 15:16:33.061996+00,
a071eadf-553d-41cd-95ec-c08634d7e3b6,ARS-ARS,true,pandy,intermediario,egreso,true,ejecutada,false,0,false,false,-1,false,false,comision_acuerdo,false,2026-03-17 15:16:33.061996+00,par_pandy_int
a0c61232-3c16-41ce-8a37-f2457d9034c5,ARS-USD,false,pandy,cliente,egreso,false,pendiente,false,0,false,false,0,false,false,,false,2026-03-17 15:52:42.615018+00,
a3985c62-e452-4018-b14d-4572739b574d,ARS-ARS,true,pandy,intermediario,egreso,false,pendiente,false,0,false,false,-1,true,true,,false,2026-03-17 15:16:33.061996+00,
a7a08b2f-c275-4097-9dab-dcc158393123,ARS-USD,false,cliente,pandy,ingreso,false,pendiente,false,0,false,false,0,false,false,,false,2026-03-17 15:52:42.615018+00,
a7b1cbb3-5f0c-48f4-94b7-6631351bbe3c,ARS-USD,false,cliente,pandy,ingreso,false,ejecutada,false,-1,true,true,0,false,false,cobro_realizado,false,2026-03-17 15:52:42.615018+00,
ac009385-65af-4fa3-9e83-3532dbcab5f2,USD-USD,false,cliente,pandy,ingreso,false,ejecutada,true,-1,true,false,0,false,false,cobro_realizado,false,2026-03-17 15:52:42.615018+00,
ae321d33-6689-4fea-b40b-aaca47e7feec,ARS-ARS-CHEQUE,true,cliente,pandy,ingreso,false,pendiente,true,-1,true,false,0,false,false,,false,2026-03-17 15:16:33.061996+00,
b2899ecf-4aa0-4f4b-8e28-244354cbc399,ARS-ARS-CHEQUE,true,cliente,pandy,ingreso,false,pendiente,false,0,false,false,0,false,false,,false,2026-03-17 15:16:33.061996+00,
b6c5ecfc-1eb5-4fae-9981-b5af660a2284,ARS-ARS-CHEQUE,true,pandy,cliente,egreso,false,pendiente,false,0,false,false,0,false,false,,false,2026-03-17 15:16:33.061996+00,
b7b6587e-8bc6-402d-bc1d-1c273f366c49,USD-ARS,false,cliente,pandy,ingreso,false,pendiente,true,-1,true,false,0,false,false,,false,2026-03-17 15:52:42.615018+00,
c30e783d-14e4-4029-bd42-97a969f14e4e,ARS-ARS,true,pandy,intermediario,egreso,true,pendiente,false,0,false,false,-1,false,false,,false,2026-03-17 15:16:33.061996+00,par_pandy_int
cb14d275-abb6-4c26-b833-c155995e2d1b,ARS-ARS-CHEQUE,true,pandy,intermediario,egreso,false,ejecutada,true,0,false,false,-1,true,true,pago_realizado,false,2026-03-17 15:16:33.061996+00,
cb8c7a7a-4a61-4b6e-8219-b0a585574faf,ARS-ARS,true,pandy,intermediario,egreso,false,ejecutada,true,0,false,false,-1,true,true,pago_realizado,false,2026-03-17 15:16:33.061996+00,
cc9f5508-11a9-45bf-bf6b-3886d8639b71,ARS-ARS,true,pandy,intermediario,egreso,true,pendiente,true,0,false,false,-1,false,false,,false,2026-03-17 15:16:33.061996+00,par_pandy_int
cda33820-c8fc-4ba7-9719-0d6daa730022,ARS-ARS,true,pandy,cliente,egreso,false,pendiente,false,0,false,false,0,false,false,,false,2026-03-17 15:16:33.061996+00,
d32276fc-24a2-4d42-9350-1c0abf7ecc58,USD-ARS,false,cliente,pandy,ingreso,false,ejecutada,false,-1,true,true,0,false,false,cobro_realizado,false,2026-03-17 15:52:42.615018+00,
d6557080-be82-4805-a1c1-9f4e667eebf8,ARS-ARS,true,pandy,intermediario,egreso,true,ejecutada,true,0,false,false,-1,false,false,comision_acuerdo,false,2026-03-17 15:16:33.061996+00,par_pandy_int
d769f19b-4d93-435b-aab9-83947e2c1e8b,ARS-ARS,true,cliente,pandy,ingreso,true,pendiente,false,1,false,true,0,false,false,,false,2026-03-17 15:16:33.061996+00,
d8a2e692-0e83-4c47-8ea8-30e08c34c417,ARS-ARS,true,intermediario,pandy,ingreso,false,pendiente,false,0,false,false,1,true,true,,true,2026-03-17 15:16:33.061996+00,
d995dbb6-0974-4056-9e4b-2d87195ea659,ARS-ARS-CHEQUE,true,intermediario,pandy,ingreso,false,pendiente,true,0,false,false,1,true,true,,true,2026-03-17 15:16:33.061996+00,
da9ad362-00f8-4ffc-8757-d86af7da7b47,USD-USD,false,cliente,pandy,ingreso,false,pendiente,true,-1,true,false,0,false,false,,false,2026-03-17 15:52:42.615018+00,
dbc057cd-20f7-4d8f-aff5-29f0141c48e8,USD-USD,false,pandy,cliente,egreso,false,ejecutada,false,1,true,true,0,false,false,compromiso_pago,false,2026-03-17 15:52:42.615018+00,
dbdd00b3-5ded-4251-828a-751f564b83ef,ARS-ARS-CHEQUE,true,cliente,pandy,ingreso,false,ejecutada,true,-1,true,false,0,false,false,cobro_realizado,false,2026-03-17 15:16:33.061996+00,
e24a9a85-e319-44f1-b1d6-3607b85e8d50,ARS-ARS-CHEQUE,true,cliente,pandy,ingreso,true,ejecutada,false,1,false,true,0,false,false,comision_acuerdo,false,2026-03-17 15:16:33.061996+00,
f4195d50-846b-4b09-b190-817a8ffecd3a,USD-USD,false,cliente,pandy,ingreso,false,ejecutada,false,-1,true,true,0,false,false,cobro_realizado,false,2026-03-17 15:52:42.615018+00,
f697d60d-5e2c-4d0d-aa36-4c09f5a95efb,ARS-ARS-CHEQUE,true,pandy,intermediario,egreso,true,pendiente,false,0,false,false,-1,false,false,,false,2026-03-17 15:16:33.061996+00,par_pandy_int
f8d008df-6683-4eb9-80e4-779759c205ef,ARS-USD,false,pandy,cliente,egreso,false,pendiente,true,1,false,false,0,false,false,,false,2026-03-17 15:52:42.615018+00,
fae1e1e3-634d-43fc-9ec0-639bf94bf5d1,ARS-USD,false,cliente,pandy,ingreso,false,pendiente,true,-1,true,false,0,false,false,,false,2026-03-17 15:52:42.615018+00,`;

const rows = raw.trim().split('\n').map((line) => {
  const out = [];
  let cell = '';
  for (let i = 0; i < line.length; i++) {
    if (line[i] === ',') {
      out.push(cell);
      cell = '';
    } else {
      cell += line[i];
    }
  }
  out.push(cell);
  return out;
});

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet(rows);
XLSX.utils.book_append_sheet(wb, ws, 'cc_modelo_reglas');

const outPath = path.join(__dirname, '..', 'docs', 'CC_MODELO_REGLAS_REVISION.xlsx');
XLSX.writeFile(wb, outPath);
console.log('Generado:', outPath);
