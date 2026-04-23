/**
 * Matriz producto: combinaciones + ramas **main.js** (no solo `reglas_de_negocio`).
 * Mov_CC_* en líneas **cortas** con signo explícito (+/−) en la convención libro cliente / intermediario.
 *
 * Fuentes: tests/e2e/cc-tipos-activos-esperado.js, cc-intermediario-inversa-esperado.js,
 * cc-combinaciones-esperado.js, docs/CUENTA_CORRIENTE_Y_CAJA.md, docs/NUEVA_REGLA_CC_PATA_MONR_MONE.md,
 * y rutas en main.js (~9784 MC manual, ~12477 motor reglas, ~11456 compensación, ~24283 sync).
 *
 * Borrador producto (composición CC vs ciclo de estados, uso con Excel): docs/BORRADOR_CC_COMPOSICION_FIJA_ESTADO.md
 */

const E = 'Empresa';
const C = 'Cliente';
const I = 'Intermediario';

const MATRIZ_HEADERS = [
  'Tipo de Operacion',
  'Intermediario',
  'Combinacion',
  'MonR_Pagador',
  'MonR_Cobrador',
  'MonE_Pagador',
  'MonE_Cobrador',
  'Multicontraparte_Manual',
  'Multicontraparte_Automatica',
  'Edita Instruccion',
  'Mov_CC_Cliente',
  'Mov_CC_Intermediario',
  'Regla que aplicó',
  'Nivel certeza',
  'Como verificar',
];

const COMBOS_2TX = ['P,P', 'E,P', 'P,E', 'E,E'];

/** Scripts npm por tipo (E2E 02 — cruces sin int). */
const E2E_SCRIPT_CRUCE_SIN_INT = {
  'ARS-USD': 'test:e2e-cc-ars-usd-sin-int',
  'USD-ARS': 'test:e2e-cc-usd-ars-sin-int',
  'EUR-USD': 'test:e2e-cc-eur-usd-sin-int',
  'USD-EUR': 'test:e2e-cc-usd-eur-sin-int',
  'EUR-ARS': 'test:e2e-cc-eur-ars-sin-int',
  'ARS-EUR': 'test:e2e-cc-ars-eur-sin-int',
};

/** Scripts npm por tipo (E2E 03 — intermediario inversa ci_pc). */
const E2E_SCRIPT_INV = {
  'USD-ARS': 'test:e2e-cc-usd-ars-int-inversa',
  'ARS-USD': 'test:e2e-cc-ars-usd-int-inversa',
  'USD-EUR': 'test:e2e-cc-usd-eur-int-inversa',
  'EUR-USD': 'test:e2e-cc-eur-usd-int-inversa',
  'EUR-ARS': 'test:e2e-cc-eur-ars-int-inversa',
  'ARS-EUR': 'test:e2e-cc-ars-eur-int-inversa',
};

const L = (lines) => lines.join('\n');

/** ARS-USD sin int — alineado al ejemplo manual (signos por pata MonR/MonE). */
const CLI_ARS_USD_N = {
  'P,P': L(['MonR +', 'MonE −']),
  'E,P': L(['MonR +', 'MonR −', 'MonE −']),
  'P,E': L(['MonR +', 'MonE +', 'MonE −']),
  'E,E': L(['MonR +', 'MonR −', 'MonE +', 'MonE −']),
};

/** USD-ARS sin int — espejo lógico de patas (misma secuencia de signos que ARS-USD). */
const CLI_USD_ARS_N = { ...CLI_ARS_USD_N };

/** Cruces fiat distintos (EUR-*) mismos signos que el par ARS/USD análogo. */
const CLI_CRUCE_ISO_ARS_USD = { ...CLI_ARS_USD_N };
const CLI_CRUCE_ISO_USD_ARS = { ...CLI_USD_ARS_N };

/** USD-USD sin int (mr/me/comisión misma moneda). */
const CLI_USD_USD_N = {
  'P,P': L(['MonE −', 'MonR +', 'Comisión −']),
  'E,P': L(['MonE −', 'Comisión −', 'MonR +']),
  'P,E': L(['MonE −', 'MonE +', 'MonR +']),
  'E,E': L(['MonR −', 'Comisión +', 'MonE +']),
};

/** USD-USD + int cp_ic — cliente (misma plantilla Tx1/Tx2 que sin int) + intermediario. */
const CLI_USD_USD_Y = {
  'P,P': L(['MonE −', 'MonE +', 'Comisión −', 'MonR +']),
  'E,P': L(['MonE −', 'Comisión −', 'MonR +']),
  'P,E': L(['MonE −', 'MonE +', 'MonR +']),
  'E,E': L(['MonR −', 'Comisión +', 'MonE +']),
};
const INT_USD_USD_Y = {
  'P,P': L(['MonE −', 'MonE +', 'Comisión int −']),
  'E,P': L(['MonE +', 'MonE −', 'Comisión int −']),
  'P,E': L(['MonE −', 'Comisión int −']),
  'E,E': L(['MonE −', 'Comisión int −', 'Pago +']),
};

/** Inversa ci_pc: Tx1 C→I (MonR), Tx2 P→C (MonE). */
const CLI_INV_Y = {
  'P,P': L(['MonR +', 'MonE −']),
  'E,P': L(['MonR +', 'MonR −', 'MonE −']),
  'P,E': L(['MonR +', 'MonE +', 'MonE −']),
  'E,E': L(['MonR +', 'MonR −', 'MonE +', 'MonE −']),
};
const INT_INV_Y = {
  'P,P': L(['MonR +']),
  'E,P': L(['MonR +']),
  'P,E': L(['MonR +']),
  'E,E': L(['MonR +', 'MonR −']),
};

const CLI_CHEQUE = L(['Tx1–Tx4: cobro ±, pago ±, comisión ±', 'Resumen cliente ARS = 0']);
const INT_CHEQUE = L(['Tx3–Tx4: pago int ±, comisión int −', 'Resumen int ARS = 0']);

const COMBOS_CHEQUE = [
  'P,P,P,P',
  'P,P,P,E',
  'P,E,P,P',
  'P,E,P,E',
  'E,P,P,P',
  'E,P,P,E',
  'E,P,E,P',
  'E,P,E,E',
  'E,E,P,P',
  'E,E,P,E',
  'E,E,E,P',
  'E,E,E,E',
];

/** Ramas codificadas en main.js además de filas `reglas_de_negocio`. */
const RAMAS_MAIN_JS = [
  {
    tipo: '[main] MC manual — mapa (N patas, actores múltiples)',
    inter: 'según orden',
    combo: 'libre (totales §6 doc MC)',
    monRP: 'C|P|I vs C|C_N',
    monRC: 'por trx',
    monEP: 'idem',
    monEC: 'idem',
    mcMan: 'S',
    mcAuto: 'N',
    edita: 'S',
    movCli: L([
      'Una o más filas CC por trx según pag/cob + UUID (acuerdo o Cliente_N)',
      'Pendiente: Instrumentación pendiente / Entrega … pendiente (− en pag., + en cob. cliente según doc)',
      'Ejecutada: pares −/+ Cobro/Ajuste o Pago/Ajuste en libro acuerdo; terceros e Int en su libro',
      'Tras conciliación: motor soloComisiones (spread, CHEQUE, int.) sin duplicar patas MC',
    ]),
    movInt: L(['Si hay trx pag/cob intermediario: líneas en CC int. vía conciliación + Trx']),
    regla: 'aplicarCcMulticontraparteManualConciliacionCompleta (~9784); aplicarMotorCcDesdeReglasDeNegocio soloComisiones',
    nivel: 'C',
    verificar:
      'docs/INSTRUMENTACION_MANUAL_MULTICONTRAPARTE.md (§2 actores, §3 CC, §6 cierre MC, §8 implementación); main.js ~9784; validarInvarianteNeteoCcClienteAcuerdoCerrado',
  },
  {
    tipo: '[main] MC manual — monR (ingresos, múltiples contrapartes)',
    inter: 'según orden',
    combo: '—',
    monRP: 'C|P|I',
    monRC: 'C|C_N',
    monEP: '—',
    monEC: '—',
    mcMan: 'S',
    mcAuto: 'N',
    edita: 'S',
    movCli: L([
      'Cliente pagador (acuerdo o N) pendiente monR: −m «Instrumentación pendiente» en CC de ese cliente',
      'Acuerdo→Pandy ejecutado: par −m Cobro +m Ajuste libro (neteo pata) en CC acuerdo',
      'Acuerdo→tercero ejecutado: −m/+m acuerdo + +m al cobrador tercero',
      'Tercero→acuerdo monR: +m compromiso «Tercero cumple pata» / −m cobro en tercero',
      'Pandy→acuerdo monR pendiente: −m compromiso «Pandy cumple pata» + +m préstamo si cobrador_cliente_id=acuerdo',
    ]),
    movInt: L(['C→I ejecutado: par −/+ acuerdo + línea CC intermediario']),
    regla: 'aplicarCcMulticontraparteManualConciliacionCompleta; completarCcClientePrestamoReglaBPandyMonSiFalta',
    nivel: 'C',
    verificar: 'docs/INSTRUMENTACION_MANUAL_MULTICONTRAPARTE.md §3; main.js ~9784 + ~11943 préstamo',
  },
  {
    tipo: '[main] MC manual — monE (egresos, múltiples pagadores)',
    inter: 'según orden',
    combo: '—',
    monRP: '—',
    monRC: '—',
    monEP: 'P|I|C_N',
    monEC: 'C acuerdo',
    mcMan: 'S',
    mcAuto: 'N',
    edita: 'S',
    movCli: L([
      'Cobrador cliente pendiente monE: +m «Entrega … pendiente» en CC de ese cobrador',
      'Pagador cliente pendiente monE (C→Pandy…): −m «Instrumentación pendiente» en CC pagador',
      'Pandy o tercero→acuerdo ejecutado monE: −m Pago realizado +m Ajuste libro en CC acuerdo',
      'Intermediario→acuerdo ejecutado: mismo par en acuerdo + −m pago en CC intermediario',
      'USD-ARS/ARS-USD doble Pandy→C monR+monE ejecutado: monE puede ir solo −m «Pandy cumple pata monE» (sin +m ajuste)',
    ]),
    movInt: L(['Egreso con pagador intermediario: CC int. según aplicarCcMulticontraparteManualTrx']),
    regla: 'aplicarCcMulticontraparteManualConciliacionCompleta; aplicarCcMulticontraparteManualTrx',
    nivel: 'C',
    verificar: 'docs/INSTRUMENTACION_MANUAL_MULTICONTRAPARTE.md §3; main.js ~9784, ~10323',
  },
  {
    tipo: '[main] MC manual — trx Int↔C y C(tercero)↔C(acuerdo)',
    inter: 'Y típico',
    combo: '—',
    monRP: 'varía',
    monRC: 'varía',
    monEP: 'varía',
    monEC: 'varía',
    mcMan: 'S',
    mcAuto: 'N',
    edita: 'S',
    movCli: L([
      'Int→C pendiente: Pago −, Ajuste + (compromiso)',
      'Int→C ejecutada: Pago −, Ajuste +',
      'C tercero→C acuerdo monE ejecutado: −, +, cobro − en acuerdo (paridad con Pandy pagador)',
    ]),
    movInt: L(['Ingreso ejecutado acuerdo→Int: −/+ en acuerdo + línea en CC int.', 'Egreso Int→acuerdo: − en int. + par acuerdo']),
    regla: 'aplicarCcMulticontraparteManualTrx (~10323)',
    nivel: 'C',
    verificar: 'main.js → aplicarCcMulticontraparteManualTrx (~10323); orden MC con int. en dev',
  },
  {
    tipo: '[main] MC manual + motor soloComisiones (sin duplicar patas)',
    inter: 'según tipo',
    combo: '—',
    monRP: '—',
    monRC: '—',
    monEP: '—',
    monEC: '—',
    mcMan: 'S',
    mcAuto: 'N',
    edita: 'S',
    movCli: L([
      'Patas MonR/MonE salen solo de conciliación MC',
      'Motor añade comisiones / tasas / CHEQUE según reglas (es_comision, sintéticas)',
      'USD-USD+MC: no emitir mr−me cliente en soloComisiones (evita duplicar y romper invariante)',
    ]),
    movInt: L(['Comisión int. / líneas reglas entidad intermediario si aplica']),
    regla: 'aplicarMotorCcDesdeReglasDeNegocio(..., { soloComisiones: true }) tras MC',
    nivel: 'B',
    verificar: 'docs/INSTRUMENTACION_MANUAL_MULTICONTRAPARTE.md §8; main.js ~12477 + rama soloComisiones; buscar soloComisiones cerca de sincronizarCcYCajaDesdeOrden',
  },
  {
    tipo: '[main] MC automático en sync',
    inter: '—',
    combo: '—',
    monRP: '—',
    monRC: '—',
    monEP: '—',
    monEC: '—',
    mcMan: 'pasa a S',
    mcAuto: 'S',
    edita: 'Aj o desvío',
    movCli: L(['Luego mismo flujo que MC manual']),
    movInt: L(['idem']),
    regla: 'sincronizarCcYCajaDesdeOrden activarMcAutoSync (~24415); derivMcAutoUsdUsdIntCpIcAjManual',
    nivel: 'C',
    verificar: 'main.js → sincronizarCcYCajaDesdeOrden (~24283); activarMcAutoSync; derivMcAutoUsdUsdIntCpIcAjManual (~24558)',
  },
  {
    tipo: '[main] Motor reglas + comisiones',
    inter: '—',
    combo: '—',
    monRP: '—',
    monRC: '—',
    monEP: '—',
    monEC: '—',
    mcMan: 'N',
    mcAuto: 'N',
    edita: 'N',
    movCli: L(['Por fila reglas: signo × base (mr/me/tx/mr−me/…)', 'Ver hoja Reglas_de_negocio']),
    movInt: L(['Por fila entidad_cc intermediario']),
    regla: 'aplicarMotorCcDesdeReglasDeNegocio (~12477)',
    nivel: 'B',
    verificar: 'main.js → aplicarMotorCcDesdeReglasDeNegocio (~12477); npm run excel:matriz-cc-reglas → cruzar filas Reglas_de_negocio (tipo+usa_int+estado+contrapartida)',
  },
  {
    tipo: '[main] Solo comisiones (motor)',
    inter: '—',
    combo: '—',
    monRP: '—',
    monRC: '—',
    monEP: '—',
    monEC: '—',
    mcMan: 'N',
    mcAuto: 'N',
    edita: 'N',
    movCli: L(['± solo filas es_comision / sintéticas']),
    movInt: L(['± comisión int si aplica']),
    regla: 'aplicarMotorCcDesdeReglasDeNegocio soloComisiones',
    nivel: 'B',
    verificar: 'main.js → aplicarMotorCcDesdeReglasDeNegocio (soloComisiones); misma hoja Reglas_de_negocio',
  },
  {
    tipo: '[main] Nueva regla MonR/MonE',
    inter: 'rollout',
    combo: 'patrón amplio',
    monRP: C,
    monRC: E,
    monEP: 'E o I',
    monEC: C,
    mcMan: 'N',
    mcAuto: 'N',
    edita: 'N',
    movCli: L(['MonR + (leyenda §1.3.4)', 'MonE − / + (§1.2.1)']),
    movInt: L(['MonE −', 'Comisión − (§1.1.1)']),
    regla: 'nuevaReglaCcRolloutActivoParaOrden + utils/cc-patron-nueva-regla-monr-mone.mjs',
    nivel: 'A',
    verificar: 'npm run test:unit-cc-patron-nueva-regla; npm run test:unit-cc-invariante-nueva-regla; docs/NUEVA_REGLA_CC_PATA_MONR_MONE.md',
  },
  {
    tipo: '[main] Compensación CC (flip)',
    inter: '—',
    combo: 'trx con comp.',
    monRP: '—',
    monRC: '—',
    monEP: '—',
    monEC: '—',
    mcMan: 'N',
    mcAuto: 'N',
    edita: 'N',
    movCli: L(['Fila «Compensación parcial/total…» + o −', 'Monto = compensacion_cc_monto_aplicado']),
    movInt: L(['NO APLICA salvo caso int']),
    regla: 'inyectarFilasCompensacionCcClienteDesdeTransacciones (~11460)',
    nivel: 'A',
    verificar: 'npm run test:unit-cc-flip; main.js → inyectarFilasCompensacionCcClienteDesdeTransacciones (~11460)',
  },
  {
    tipo: '[main] Préstamo regla B (gemelo)',
    inter: 'Y',
    combo: 'USD-USD+int',
    monRP: C,
    monRC: E,
    monEP: E,
    monEC: C,
    mcMan: 'N',
    mcAuto: 'N',
    edita: 'N',
    movCli: L(['+MonR «Préstamo al cliente…» (solo caso USD-USD+int)']),
    movInt: L(['NO APLICA']),
    regla: 'completarCcClientePrestamoReglaBPandyMonSiFalta (~11943)',
    nivel: 'A',
    verificar: 'npm run test:unit-cc-invariante-nueva-regla; main.js → completarCcClientePrestamoReglaBPandyMonSiFalta (~11943)',
  },
  {
    tipo: '[main] Pata regla B monR (spread)',
    inter: '—',
    combo: '—',
    monRP: C,
    monRC: E,
    monEP: E,
    monEC: C,
    mcMan: 'N',
    mcAuto: 'N',
    edita: 'N',
    movCli: L(['− en monE con mr>me (mismo catálogo rec/ent)', 'sin préstamo gemelo en cruces']),
    movInt: L(['NO APLICA']),
    regla: 'montoPataRegulaBPandyMonRecibidaClienteCc',
    nivel: 'A',
    verificar: 'npm run test:unit-cc-invariante-nueva-regla; buscar montoPataRegulaBPandyMonRecibidaClienteCc en main.js',
  },
  {
    tipo: '[main] Comisión int. tasa transferencia',
    inter: 'Y',
    combo: 'wizard orden',
    monRP: '—',
    monRC: '—',
    monEP: '—',
    monEC: '—',
    mcMan: 'N',
    mcAuto: 'N',
    edita: 'N',
    movCli: L(['NO APLICA']),
    movInt: L(['Comisión int − (aunque no califique MonR/MonE)']),
    regla: 'intermediario_transferencia_cobra_tasa + motor comisiones',
    nivel: 'B',
    verificar: 'main.js → aplicarMotorCcDesdeReglasDeNegocio (campos orden intermediario_transferencia_*); hoja Reglas comisiones',
  },
  {
    tipo: '[main] Alinear par cliente/int cp_ic',
    inter: 'Y',
    combo: 'cruce TC + int',
    monRP: '—',
    monRC: '—',
    monEP: '—',
    monEC: '—',
    mcMan: 'N',
    mcAuto: 'N',
    edita: 'N',
    movCli: L(['± neteo compromiso / me en USD-ARS+int etc.']),
    movInt: L(['± análogo']),
    regla: 'todoParCliIntAlinearCc (comentario ~10840)',
    nivel: 'B',
    verificar: 'main.js → aplicarMotorCcDesdeReglasDeNegocio (todoParCliIntAlinearCc ~12640+); E2E 03 cruces + int',
  },
  {
    tipo: '[main] Dedupe / espejo CC',
    inter: '—',
    combo: '—',
    monRP: '—',
    monRC: '—',
    monEP: '—',
    monEC: '—',
    mcMan: 'N',
    mcAuto: 'N',
    edita: 'N',
    movCli: L(['Elimina duplicado ±me (plano/MC spread)']),
    movInt: L(['NO APLICA']),
    regla: 'filasCcClienteSinCompromisoPagoPlanoEspejoMismaTrx, compensación exenta…',
    nivel: 'A',
    verificar: 'npm run test:unit-cc-invariante-nueva-regla (dedupe); main.js → filasCcClienteSinCompromisoPagoPlanoEspejoMismaTrx (~11659)',
  },
  {
    tipo: '[main] Invariante neteo cerrado',
    inter: '—',
    combo: '—',
    monRP: '—',
    monRC: '—',
    monEP: '—',
    monEC: '—',
    mcMan: 'N',
    mcAuto: 'N',
    edita: 'N',
    movCli: L(['Bloquea persist si no cierra (error usuario)']),
    movInt: L(['idem']),
    regla: 'validarInvarianteNeteoCcClienteAcuerdoCerrado',
    nivel: 'A',
    verificar: 'npm run test:unit-cc-invariante-nueva-regla; main.js → validarInvarianteNeteoCcClienteAcuerdoCerrado (~12303)',
  },
  {
    tipo: '[main] Reglas auxiliares comisión int.',
    inter: 'Y',
    combo: 'cruce sin filas canon',
    monRP: '—',
    monRC: '—',
    monEP: '—',
    monEC: '—',
    mcMan: 'N',
    mcAuto: 'N',
    edita: 'N',
    movCli: L(['± filas desde concat ARS-USD+int aux']),
    movInt: L(['± idem']),
    regla: 'sincronizarCcYCajaDesdeOrden necesitaReglasAuxComInt (~24313)',
    nivel: 'B',
    verificar: 'main.js → sincronizarCcYCajaDesdeOrden (~24313) concat reglas aux; SQL reglas_de_negocio',
  },
  {
    tipo: '[main] Cancelación de deuda (legacy)',
    inter: '—',
    combo: 'sin reglas',
    monRP: '—',
    monRC: '—',
    monEP: '—',
    monEC: '—',
    mcMan: 'N',
    mcAuto: 'N',
    edita: 'N',
    movCli: L(['± «Cancelación de deuda» por trx']),
    movInt: L(['NO APLICA']),
    regla: 'Órdenes sin reglas_de_negocio: insert legacy (~5435, ~18032)',
    nivel: 'C',
    verificar: 'main.js buscar «Cancelación de deuda» (~18032); orden sin filas en reglas_de_negocio',
  },
  {
    tipo: '[main] Orden anulada',
    inter: '—',
    combo: '—',
    monRP: '—',
    monRC: '—',
    monEP: '—',
    monEC: '—',
    mcMan: 'N',
    mcAuto: 'N',
    edita: 'N',
    movCli: L(['Regenera movimientos en estado anulado']),
    movInt: L(['idem']),
    regla: 'sincronizarCcYCajaDesdeOrden ordenAnuladaSync',
    nivel: 'C',
    verificar: 'main.js → sincronizarCcYCajaDesdeOrden (rama orden anulada); probar orden anulada en dev',
  },
  {
    tipo: '[main] CC manual (usuario)',
    inter: '—',
    combo: '—',
    monRP: '—',
    monRC: '—',
    monEP: '—',
    monEC: '—',
    mcMan: 'N',
    mcAuto: 'N',
    edita: 'N',
    movCli: L(['± libre (no motor reglas)', 'es_movimiento_manual = true', 'no entra en neteo regla nueva']),
    movInt: L(['± idem si libro int']),
    regla: 'UI movimiento manual CC; motor ignora en detección MonR/MonE',
    nivel: 'C',
    verificar: 'BD movimientos_cuenta_corriente.es_movimiento_manual = true; docs/NUEVA_REGLA_CC_PATA_MONR_MONE.md §1.3.2',
  },
  {
    tipo: '[main] Omitir par I→C (regla B / nueva regla)',
    inter: 'Y',
    combo: '—',
    monRP: '—',
    monRC: '—',
    monEP: I,
    monEC: C,
    mcMan: 'N',
    mcAuto: 'N',
    edita: 'N',
    movCli: L(['No duplica Pago/Ajuste I→C si ya cubre regla B / rollout']),
    movInt: L(['NO APLICA']),
    regla: 'debeOmitirParCcEgresoIntermediarioClienteAcuerdoPorReglaBPendientePandyMonR (y variantes rollout)',
    nivel: 'A',
    verificar: 'npm run test:unit-cc-invariante-nueva-regla; main.js → debeOmitirParCcEgresoIntermediarioClienteAcuerdoPorReglaBPendientePandyMonR (~9716)',
  },
];

function buildMatrizCombinacionesActivas() {
  /** @type {Array<Record<string, string>>} */
  const out = [];

  function row(r) {
    out.push({
      'Tipo de Operacion': r.tipo,
      Intermediario: r.inter,
      Combinacion: r.combo,
      MonR_Pagador: r.monRP,
      MonR_Cobrador: r.monRC,
      MonE_Pagador: r.monEP,
      MonE_Cobrador: r.monEC,
      Multicontraparte_Manual: r.mcMan,
      Multicontraparte_Automatica: r.mcAuto,
      'Edita Instruccion': r.edita,
      Mov_CC_Cliente: r.movCli,
      Mov_CC_Intermediario: r.movInt,
      'Regla que aplicó': r.regla,
      'Nivel certeza': r.nivel != null && r.nivel !== '' ? r.nivel : 'B',
      'Como verificar': r.verificar ?? '',
    });
  }

  const predMc = 'N';
  const predAuto = 'N';
  const predEd = 'N';
  const reglaDb = 'reglas_de_negocio (Supabase) + aplicarMotorCcDesdeReglasDeNegocio';

  const crucesTipoCli = [
    ['ARS-USD', CLI_ARS_USD_N],
    ['USD-ARS', CLI_USD_ARS_N],
    ['EUR-USD', CLI_CRUCE_ISO_ARS_USD],
    ['USD-EUR', CLI_CRUCE_ISO_USD_ARS],
    ['EUR-ARS', CLI_CRUCE_ISO_USD_ARS],
    ['ARS-EUR', CLI_CRUCE_ISO_ARS_USD],
  ];
  for (const [tipo, cliMap] of crucesTipoCli) {
    const npmRun = E2E_SCRIPT_CRUCE_SIN_INT[tipo] || 'test:e2e-cc-tipos-2tx';
    for (const combo of COMBOS_2TX) {
      row({
        tipo,
        inter: 'N',
        combo,
        monRP: C,
        monRC: E,
        monEP: E,
        monEC: C,
        mcMan: predMc,
        mcAuto: predAuto,
        edita: predEd,
        movCli: cliMap[combo],
        movInt: 'NO APLICA',
        regla: reglaDb,
        nivel: 'A',
        verificar: `COMBINACION_ID="${combo}" npm run ${npmRun}; tests/e2e/cc-tipos-activos-esperado.js; hoja Reglas_de_negocio (${tipo}, usa_int=false); main.js aplicarMotorCcDesdeReglasDeNegocio (~12477)`,
      });
    }
  }

  for (const combo of COMBOS_2TX) {
    row({
      tipo: 'USD-USD',
      inter: 'N',
      combo,
      monRP: C,
      monRC: E,
      monEP: E,
      monEC: C,
      mcMan: predMc,
      mcAuto: predAuto,
      edita: predEd,
      movCli: CLI_USD_USD_N[combo],
      movInt: 'NO APLICA',
      regla: `${reglaDb}; mr−me`,
      nivel: 'A',
      verificar: `COMBINACION_ID="${combo}" npm run test:e2e-cc-usd-usd-sin-int; tests/e2e/cc-combinaciones-esperado.js; Reglas_de_negocio (USD-USD, sin int); main.js mr−me`,
    });
  }

  for (const combo of COMBOS_2TX) {
    row({
      tipo: 'USD-USD',
      inter: 'Y',
      combo,
      monRP: C,
      monRC: E,
      monEP: I,
      monEC: C,
      mcMan: predMc,
      mcAuto: 'S si Aj+cp_ic o desvío',
      edita: 'S si Aj',
      movCli: CLI_USD_USD_Y[combo],
      movInt: INT_USD_USD_Y[combo],
      regla: `${reglaDb}; cp_ic Tx2 I→C`,
      nivel: 'A',
      verificar: `COMBINACION_ID="${combo}" npm run test:e2e-cc-usd-usd-int-combos; tests/e2e/cc-combinaciones-esperado.js; Reglas_de_negocio (USD-USD, usa_int=true); main.js cp_ic / todoParCliIntAlinearCc`,
    });
  }

  const inversa = ['USD-ARS', 'ARS-USD', 'USD-EUR', 'EUR-USD', 'EUR-ARS', 'ARS-EUR'];
  for (const tipo of inversa) {
    const npmRun = E2E_SCRIPT_INV[tipo] || 'test:e2e-cc-02-03';
    for (const combo of COMBOS_2TX) {
      row({
        tipo,
        inter: 'Y',
        combo,
        monRP: C,
        monRC: I,
        monEP: E,
        monEC: C,
        mcMan: predMc,
        mcAuto: predAuto,
        edita: 'S si ci_pc',
        movCli: CLI_INV_Y[combo],
        movInt: INT_INV_Y[combo],
        regla: `${reglaDb}; ci_pc (E2E 03)`,
        nivel: 'A',
        verificar: `COMBINACION_ID="${combo}" npm run ${npmRun}; tests/e2e/cc-intermediario-inversa-esperado.js; Reglas_de_negocio (${tipo}, usa_int=true, ci_pc); main.js aplicarMotorCcDesdeReglasDeNegocio`,
      });
    }
  }

  for (const combo of COMBOS_CHEQUE) {
    row({
      tipo: 'CHEQUE-ARS',
      inter: 'Y',
      combo,
      monRP: C,
      monRC: E,
      monEP: E,
      monEC: C,
      mcMan: predMc,
      mcAuto: predAuto,
      edita: predEd,
      movCli: CLI_CHEQUE,
      movInt: INT_CHEQUE,
      regla: reglaDb,
      nivel: 'A',
      verificar: `COMBINACION_ID="${combo}" npm run test:e2e-cc-cheque-ars; tests/e2e/01-cc-combinaciones.spec.js; Reglas_de_negocio (CHEQUE-ARS); main.js motor CC`,
    });
  }

  for (const m of RAMAS_MAIN_JS) {
    row({
      tipo: m.tipo,
      inter: m.inter,
      combo: m.combo,
      monRP: m.monRP,
      monRC: m.monRC,
      monEP: m.monEP,
      monEC: m.monEC,
      mcMan: m.mcMan,
      mcAuto: m.mcAuto,
      edita: m.edita,
      movCli: m.movCli,
      movInt: m.movInt,
      regla: m.regla,
      nivel: m.nivel,
      verificar: m.verificar,
    });
  }

  return out;
}

function matrizToAoa(objs) {
  const aoa = [MATRIZ_HEADERS];
  for (const o of objs) {
    aoa.push(MATRIZ_HEADERS.map((h) => o[h] ?? ''));
  }
  return aoa;
}

module.exports = {
  MATRIZ_HEADERS,
  buildMatrizCombinacionesActivas,
  matrizToAoa,
};
