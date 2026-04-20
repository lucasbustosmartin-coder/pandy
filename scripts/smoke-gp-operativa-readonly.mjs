#!/usr/bin/env node
/**
 * Smoke solo lectura: invoca `gp_operativa_resumen` y (opcional) `gp_operativa_detalle`
 * vía Supabase RPC. No ejecuta INSERT/UPDATE/DELETE ni `rpc_limpiar_base_e2e`.
 *
 * Uso típico: validar producción o staging con datos reales sin tocar filas.
 *
 * Variables dedicadas (no uses `.env.test` de E2E):
 *   SMOKE_GP_READONLY_CONFIRM=yes   — obligatorio; evita ejecución accidental
 *   SMOKE_GP_SUPABASE_URL           — URL del proyecto
 *   SMOKE_GP_SUPABASE_SERVICE_ROLE_KEY — service role del mismo proyecto que la URL
 *
 * Opcionales:
 *   SMOKE_GP_DESDE=YYYY-MM-DD      — default: hace ~400 días (UTC)
 *   SMOKE_GP_HASTA=YYYY-MM-DD      — default: hoy (UTC)
 *   SMOKE_GP_INCLUDE_DETALLE=1     — además llama `gp_operativa_detalle` bolsa `caja_manual` (suele ser acotada)
 *
 * Archivo opcional: `.env.smoke-prod-readonly` en la raíz (gitignored) con las variables.
 *
 * Salida: código 0 si las RPC responden sin error y el JSON de resumen tiene las siete claves esperadas.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(root, '.env.smoke-prod-readonly') });

const BOLSAS_RESUMEN = [
  'caja_manual',
  'caja_ordenes',
  'cc_cliente',
  'cc_intermediario',
  'cc_resultado_economico_compensatorio',
  'comisiones_acuerdo_pandy',
  'comisiones_acuerdo_intermediario',
];

function isoDateUtc(d) {
  return d.toISOString().slice(0, 10);
}

function defaultDesde() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 400);
  return isoDateUtc(d);
}

function defaultHasta() {
  return isoDateUtc(new Date());
}

function main() {
  if (String(process.env.SMOKE_GP_READONLY_CONFIRM || '').toLowerCase() !== 'yes') {
    console.error(
      'Smoke G/P omitido: definí SMOKE_GP_READONLY_CONFIRM=yes (y URL + service role en variables SMOKE_GP_*). ' +
        'Ver docs/TESTING_E2E_GUIA.md § Smoke G/P solo lectura.',
    );
    process.exit(1);
  }

  const url = String(process.env.SMOKE_GP_SUPABASE_URL || '').trim();
  const key = String(process.env.SMOKE_GP_SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) {
    console.error('Faltan SMOKE_GP_SUPABASE_URL o SMOKE_GP_SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }

  const pDesde = String(process.env.SMOKE_GP_DESDE || '').trim() || defaultDesde();
  const pHasta = String(process.env.SMOKE_GP_HASTA || '').trim() || defaultHasta();
  const includeDetalle = String(process.env.SMOKE_GP_INCLUDE_DETALLE || '').trim() === '1';

  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const run = async () => {
    console.log('Smoke G/P read-only: gp_operativa_resumen', { p_desde: pDesde, p_hasta: pHasta });
    const res = await client.rpc('gp_operativa_resumen', { p_desde: pDesde, p_hasta: pHasta });
    if (res.error) {
      console.error('RPC gp_operativa_resumen error:', res.error.message || res.error);
      process.exit(1);
    }
    const data = res.data;
    if (data == null || typeof data !== 'object') {
      console.error('Respuesta inválida (no es objeto JSON):', typeof data);
      process.exit(1);
    }
    for (const k of BOLSAS_RESUMEN) {
      if (!(k in data)) {
        console.error('Falta clave en JSON de resumen:', k);
        process.exit(1);
      }
      const v = data[k];
      if (v != null && typeof v !== 'object') {
        console.error('Valor de bolsa no es objeto:', k, typeof v);
        process.exit(1);
      }
    }
    console.log('OK: gp_operativa_resumen — seis bolsas presentes.');

    if (includeDetalle) {
      const bolsa = 'caja_manual';
      console.log('Smoke: gp_operativa_detalle', { bolsa, p_desde: pDesde, p_hasta: pHasta });
      const r2 = await client.rpc('gp_operativa_detalle', {
        p_desde: pDesde,
        p_hasta: pHasta,
        p_bolsa: bolsa,
      });
      if (r2.error) {
        console.error('RPC gp_operativa_detalle error:', r2.error.message || r2.error);
        process.exit(1);
      }
      if (!Array.isArray(r2.data)) {
        console.error('gp_operativa_detalle: se esperaba array JSON');
        process.exit(1);
      }
      console.log('OK: gp_operativa_detalle (', bolsa, ') —', r2.data.length, 'filas.');
    }

    console.log('Smoke G/P read-only finalizado sin errores.');
  };

  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

main();
