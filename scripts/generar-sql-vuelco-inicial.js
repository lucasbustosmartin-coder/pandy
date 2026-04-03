#!/usr/bin/env node
/**
 * Lee docs/Vuelco_Inicial.xlsx (Hoja1: A=Cliente, B=Saldo, C=Cliente/Intermediario)
 * y genera sql/vuelco_inicial_desde_excel_generado.sql
 *
 * Uso: node scripts/generar-sql-vuelco-inicial.js
 *
 * Opciones vía variables de entorno:
 *   VUELCO_MONEDA_SALDO=USD|ARS|EUR   (default USD)
 *   VUELCO_EXCEL=ruta/al/archivo.xlsx (default docs/Vuelco_Inicial.xlsx)
 *   VUELCO_USUARIO_EMAIL=correo       (default lucas.bustos.martin@gmail.com) → usuario_id vía auth.users
 *
 * Pagador / cobrador manual (alineado a CC manual Pandi):
 *   saldo < 0 → pagador = cliente/inter, cobrador = empresa (pandy), manual_tip = cobro_entidad_pandy
 *   saldo > 0 → pagador = empresa (pandy), cobrador = cliente/inter, manual_tip = pago_pandy_entidad
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const root = path.join(__dirname, '..');
const excelPath = process.env.VUELCO_EXCEL || path.join(root, 'docs', 'Vuelco_Inicial.xlsx');
const monedaSaldo = (process.env.VUELCO_MONEDA_SALDO || 'USD').toUpperCase();

function escSqlLit(s) {
  return String(s ?? '').replace(/'/g, "''").trim();
}

const usuarioEmailRaw = (process.env.VUELCO_USUARIO_EMAIL || 'lucas.bustos.martin@gmail.com').trim();
const usuarioEmailSql = escSqlLit(usuarioEmailRaw);

if (!['USD', 'ARS', 'EUR'].includes(monedaSaldo)) {
  console.error('VUELCO_MONEDA_SALDO debe ser USD, ARS o EUR');
  process.exit(1);
}

function round4(n) {
  return Math.round(Number(n) * 10000) / 10000;
}

const wb = XLSX.readFile(excelPath, { cellDates: true });
const sh = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sh, { header: 1, defval: '' });

const clientes = [];
const intermediarios = [];
for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  const nombre = escSqlLit(r[0]);
  if (!nombre) continue;
  const saldo = round4(r[1]);
  const tipo = String(r[2] || '').toLowerCase().trim();
  if (tipo.includes('intermediario')) intermediarios.push({ nombre, saldo });
  else clientes.push({ nombre, saldo });
}

const usuarioSubquery =
  `(SELECT id FROM auth.users WHERE lower(trim(email)) = lower(trim('${usuarioEmailSql}')) LIMIT 1)`;

const out = [];
out.push('-- =============================================================================');
out.push('-- Volcado inicial: catálogo cliente/intermediario + saldos CC desde Excel');
out.push('-- GENERADO por scripts/generar-sql-vuelco-inicial.js — no editar a mano; regenerar con:');
out.push('--   npm run sql:vuelco-inicial');
out.push('--   VUELCO_USUARIO_EMAIL=... VUELCO_MONEDA_SALDO=USD|ARS|EUR npm run sql:vuelco-inicial');
out.push(`-- Origen: ${path.relative(root, excelPath)}`);
out.push('-- Hoja: primera solapa; A=Cliente, B=Saldo, C=Cliente o Intermediario');
out.push('-- Convención producto: importes en USD (columna Saldo).');
out.push(`-- Moneda movimientos CC: ${monedaSaldo}`);
out.push(`-- usuario_id: auth.users ← ${usuarioEmailRaw}`);
out.push('-- Pagador/cobrador manual: saldo<0 → pagador entidad + cobrador empresa; saldo>0 → pagador empresa + cobrador entidad.');
out.push('-- =============================================================================');
out.push('-- PELIGRO: borra órdenes, transacciones, CC, caja y catálogos cliente/intermediario.');
out.push('-- Requiere public.fecha_hoy_argentina() y que el usuario exista en Auth.');
out.push('-- =============================================================================');
out.push('');
out.push('BEGIN;');
out.push('');
out.push('-- Borrado previo de saldos de un volcado Excel anterior (mismo texto de concepto).');
out.push('-- Útil si ajustás el script y no truncás CC; tras TRUNCATE completo no borra filas.');
out.push('DELETE FROM public.movimientos_cuenta_corriente');
out.push("  WHERE es_movimiento_manual IS TRUE AND concepto LIKE 'Saldo inicial (volcado Excel)%';");
out.push('DELETE FROM public.movimientos_cuenta_corriente_intermediario');
out.push("  WHERE es_movimiento_manual IS TRUE AND concepto LIKE 'Saldo inicial (volcado Excel)%';");
out.push('');
out.push('TRUNCATE TABLE public.movimientos_cuenta_corriente CASCADE;');
out.push('TRUNCATE TABLE public.movimientos_cuenta_corriente_intermediario CASCADE;');
out.push('TRUNCATE TABLE public.movimientos_caja CASCADE;');
out.push('');
out.push("DO $$ BEGIN");
out.push("  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'orden_comisiones_generadas') THEN");
out.push("    EXECUTE 'TRUNCATE TABLE public.orden_comisiones_generadas CASCADE';");
out.push('  END IF;');
out.push('END $$;');
out.push('');
out.push('TRUNCATE TABLE public.transacciones CASCADE;');
out.push('TRUNCATE TABLE public.comisiones_orden CASCADE;');
out.push('TRUNCATE TABLE public.instrumentacion CASCADE;');
out.push('TRUNCATE TABLE public.ordenes CASCADE;');
out.push('');
out.push('TRUNCATE TABLE public.clientes CASCADE;');
out.push('TRUNCATE TABLE public.intermediarios CASCADE;');
out.push('');
out.push('-- Secuencias de número interno (si existen)');
out.push("DO $$ BEGIN");
out.push("  IF EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'ordenes_numero_seq') THEN");
out.push("    PERFORM setval('public.ordenes_numero_seq', 1, false);");
out.push('  END IF;');
out.push("  IF EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'transacciones_numero_seq') THEN");
out.push("    PERFORM setval('public.transacciones_numero_seq', 1, false);");
out.push('  END IF;');
out.push('END $$;');
out.push('');
out.push('-- ---------- Clientes ----------');
for (const c of clientes) {
  out.push(`INSERT INTO public.clientes (nombre, activo) VALUES ('${c.nombre}', true);`);
}
out.push('');
out.push('-- ---------- Intermediarios ----------');
for (const c of intermediarios) {
  out.push(`INSERT INTO public.intermediarios (nombre, activo) VALUES ('${c.nombre}', true);`);
}
out.push('');

const montoUsd = (s) => (monedaSaldo === 'USD' ? s : 0);
const montoArs = (s) => (monedaSaldo === 'ARS' ? s : 0);
const montoEur = (s) => (monedaSaldo === 'EUR' ? s : 0);

out.push(`-- ---------- Movimientos CC (saldo <> 0, moneda ${monedaSaldo}) ----------`);
out.push('-- Monto = saldo Excel; manual_tip y roles según signo (ver cabecera del script).');
out.push('');

function insertMovCliente(c) {
  const s = c.saldo;
  const neg = s < 0;
  const tip = neg ? 'cobro_entidad_pandy' : 'pago_pandy_entidad';
  const pagRol = neg ? 'cliente' : 'pandy';
  const cobRol = neg ? 'pandy' : 'cliente';
  const pagCli = neg ? 'c.id' : 'NULL';
  const cobCli = neg ? 'NULL' : 'c.id';
  return (
    `INSERT INTO public.movimientos_cuenta_corriente (` +
      `cliente_id, moneda, monto, monto_usd, monto_ars, monto_eur, concepto, fecha, estado, estado_fecha, ` +
      `es_movimiento_manual, manual_tip_movimiento, ` +
      `manual_pagador_rol, manual_cobrador_rol, ` +
      `manual_pagador_cliente_id, manual_pagador_intermediario_id, ` +
      `manual_cobrador_cliente_id, manual_cobrador_intermediario_id, ` +
      `usuario_id, incluir_en_detalle, orden_id, transaccion_id` +
      `) SELECT ` +
      `c.id, '${monedaSaldo}', ${s}::numeric, ${montoUsd(s)}::numeric, ${montoArs(s)}::numeric, ${montoEur(s)}::numeric, ` +
      `'Saldo inicial (volcado Excel) — ${c.nombre}', public.fecha_hoy_argentina(), 'cerrado', now(), ` +
      `true, '${tip}', '${pagRol}', '${cobRol}', ${pagCli}, NULL, ${cobCli}, NULL, ` +
      `${usuarioSubquery}, true, NULL, NULL ` +
      `FROM public.clientes c WHERE c.nombre = '${c.nombre}' LIMIT 1;`
  );
}

function insertMovInt(c) {
  const s = c.saldo;
  const neg = s < 0;
  const tip = neg ? 'cobro_entidad_pandy' : 'pago_pandy_entidad';
  const pagRol = neg ? 'intermediario' : 'pandy';
  const cobRol = neg ? 'pandy' : 'intermediario';
  const pagInt = neg ? 'i.id' : 'NULL';
  const cobInt = neg ? 'NULL' : 'i.id';
  return (
    `INSERT INTO public.movimientos_cuenta_corriente_intermediario (` +
      `intermediario_id, moneda, monto, monto_usd, monto_ars, monto_eur, concepto, fecha, estado, estado_fecha, ` +
      `es_movimiento_manual, manual_tip_movimiento, ` +
      `manual_pagador_rol, manual_cobrador_rol, ` +
      `manual_pagador_cliente_id, manual_pagador_intermediario_id, ` +
      `manual_cobrador_cliente_id, manual_cobrador_intermediario_id, ` +
      `usuario_id, incluir_en_detalle, orden_id, transaccion_id` +
      `) SELECT ` +
      `i.id, '${monedaSaldo}', ${s}::numeric, ${montoUsd(s)}::numeric, ${montoArs(s)}::numeric, ${montoEur(s)}::numeric, ` +
      `'Saldo inicial (volcado Excel) — ${c.nombre}', public.fecha_hoy_argentina(), 'cerrado', now(), ` +
      `true, '${tip}', '${pagRol}', '${cobRol}', NULL, ${pagInt}, NULL, ${cobInt}, ` +
      `${usuarioSubquery}, true, NULL, NULL ` +
      `FROM public.intermediarios i WHERE i.nombre = '${c.nombre}' LIMIT 1;`
  );
}

for (const c of clientes) {
  if (Math.abs(c.saldo) < 1e-9) continue;
  out.push(insertMovCliente(c));
}

for (const c of intermediarios) {
  if (Math.abs(c.saldo) < 1e-9) continue;
  out.push(insertMovInt(c));
}

out.push('');
out.push('COMMIT;');
out.push('');

const dest = path.join(root, 'sql', 'vuelco_inicial_desde_excel_generado.sql');
fs.writeFileSync(dest, out.join('\n'), 'utf8');
console.log('Escrito:', dest);
console.log(`Usuario: ${usuarioEmailRaw}`);
console.log(`Clientes: ${clientes.length}, Intermediarios: ${intermediarios.length}, movimientos CC (saldo≠0): ${
  clientes.filter((x) => Math.abs(x.saldo) >= 1e-9).length +
  intermediarios.filter((x) => Math.abs(x.saldo) >= 1e-9).length
}`);
