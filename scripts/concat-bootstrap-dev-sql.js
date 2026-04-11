#!/usr/bin/env node
/**
 * Genera un único SQL para bootstrap de Pandy-Dev (proyecto vacío o reprovisión),
 * concatenando archivos de sql/ en orden fijo.
 *
 * Uso (desde la raíz del repo):
 *   node scripts/concat-bootstrap-dev-sql.js
 *
 * Salida: sql/_generado_bootstrap_pandy_dev.sql (gitignored).
 *
 * No incluye: supabase_admin_inicial.sql (email a mano).
 * No incluye: migracion_tipos_operacion_unique_codigo_usa_intermediario.sql (INSERT en cc_modelo_reglas; legacy). La unicidad (codigo, usa_intermediario) va con migracion_tipos_operacion_unique_solo_uq.sql.
 * A mano según entorno: bucket iconos (`sql/storage_bucket_tipo_operacion_iconos.sql`).
 * Legacy opcional: `cc_modelo_reglas` (no va en bootstrap; producción antigua puede tenerla y sumar 1 tabla en el conteo).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SQL_DIR = path.join(ROOT, 'sql');
const OUT_FILE = path.join(SQL_DIR, '_generado_bootstrap_pandy_dev.sql');

/** Orden explícito: dependencias primero. */
const BOOTSTRAP_FILES = [
  'helpers_fecha_argentina.sql',
  'supabase_tablas_negocio.sql',
  'supabase_seguridad.sql',
  'migracion_user_profiles_display_name.sql',
  'supabase_rls_negocio.sql',
  'supabase_complejidad_ordenes.sql',
  'supabase_seguridad_complejidad.sql',
  'supabase_rls_complejidad.sql',
  'migracion_contraparte_vinculo_intermediario_cliente.sql',
  'migracion_ordenes_validar_no_par_vinculado_fase4.sql',
  'migracion_ordenes_quitar_trigger_par_vinculado.sql',
  'migracion_transaccion_cobrador_pagador.sql',
  'migracion_instrumentacion_multicontraparte.sql',
  'migracion_transaccion_chk_pagador_cobrador_multicontraparte.sql',
  'migracion_app_empresa.sql',
  'app_config_session_timeout.sql',
  'migracion_app_config_usd_usd_comision_fija_intermediario.sql',
  'migracion_permisos_ordenes_transacciones.sql',
  'migracion_permisos_vistas.sql',
  'migracion_permisos_inicio_tarjetas_pendientes_split.sql',
  'migracion_ver_cajas_efectivo_banco.sql',
  'migracion_ver_cajas_cheque.sql',
  'migracion_panel_tarjetas_mismos_permisos_ver_cajas.sql',
  'migracion_permisos_rol_editable.sql',
  'migracion_app_role_gestion_assign_roles.sql',
  'migracion_estado_orden.sql',
  'migracion_orden_anulada.sql',
  'migracion_transacciones_estado_anulada.sql',
  'migracion_transacciones_numero.sql',
  'migracion_ordenes_numero.sql',
  'migracion_orden_tasa_descuento_intermediario.sql',
  'migracion_orden_intermediario_pago_transferencia.sql',
  'migracion_orden_intermediario_transferencia_tasa.sql',
  'migracion_ordenes_usd_usd_tasa_cliente_modo.sql',
  'migracion_cc_intermediario_orden_id.sql',
  'migracion_cc_movimientos_cliente_montos_y_estado_pendiente.sql',
  'migracion_cc_intermediario_estado_pendiente.sql',
  'migracion_cc_transaccion_numero_y_regla_simple.sql',
  'migracion_cc_sumar_saldo_incluir_detalle.sql',
  'migracion_cc_caja_orden_robusto.sql',
  'migracion_movimientos_caja_orden_transaccion_numero.sql',
  'migracion_orden_comisiones_generadas_tabla.sql',
  'migracion_orden_comisiones_movimiento_caja.sql',
  'migracion_tipos_caja_cc_manual.sql',
  'migracion_gp_operativa_panel.sql',
  'migracion_gp_operativa_detalle.sql',
  'migracion_cc_movimiento_manual.sql',
  'migracion_cc_manual_pagador_cobrador.sql',
  'migracion_cc_manual_editar_eliminar_auditoria.sql',
  'migracion_cc_manual_editar_delete_reemplazo.sql',
  'migracion_rls_anular_orden_cc_caja.sql',
  'migracion_permisos_movimientos_caja_granular.sql',
  'migracion_tipos_operacion_usa_intermediario.sql',
  'migracion_tipos_operacion_unique_solo_uq.sql',
  'migracion_tipos_operacion_moneda_in_out.sql',
  'migracion_tipos_operacion_orden_visual.sql',
  'migracion_tipos_operacion_icono.sql',
  'reglas_de_negocio_tabla.sql',
  'migracion_reglas_ci_pc_egreso_pandy_monto_transaccion.sql',
  'migracion_reglas_ci_pc_egreso_pandy_ee_linea1_negativo.sql',
  'migracion_reglas_comision_intermediario_cruces_tc.sql',
  'migracion_permiso_abm_reglas_negocio.sql',
  'migracion_transaccion_revertida_una_vez.sql',
  'rpc_transacciones_cambiar_estado.sql',
  'rpc_sync_cc_caja_orden.sql',
  'ordenes_insertar_con_proximo_numero.sql',
];

const header = `-- =============================================================================
-- Pandi – SQL generado: bootstrap dev (concatenación automática)
-- NO EDITAR A MANO: regenerar con  node scripts/concat-bootstrap-dev-sql.js
-- Generado: ${new Date().toISOString()}
--
-- Después: registrar usuario en Auth y ejecutar supabase_admin_inicial.sql (email real).
-- =============================================================================

`;

function main() {
  const chunks = [header];
  for (const name of BOOTSTRAP_FILES) {
    const fp = path.join(SQL_DIR, name);
    if (!fs.existsSync(fp)) {
      console.error(`Falta el archivo: ${fp}`);
      process.exit(1);
    }
    const body = fs.readFileSync(fp, 'utf8');
    chunks.push(
      `\n-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>\n-- Archivo: ${name}\n-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<\n\n`,
      body.trimEnd(),
      '\n'
    );
  }
  fs.writeFileSync(OUT_FILE, chunks.join(''), 'utf8');
  console.log(`Escrito: ${path.relative(ROOT, OUT_FILE)} (${BOOTSTRAP_FILES.length} archivos)`);
}

main();
