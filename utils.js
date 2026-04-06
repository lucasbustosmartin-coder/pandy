/**
 * Utilidades de formato para la app Pandi (números, importes, celdas).
 * Mismo criterio que Sistema-Contable: lógica de presentación en utils, no en main.
 */

/**
 * Formato de importe para mostrar: separador de miles punto (.), decimal coma (,), 2 decimales.
 * @param {number} num
 * @returns {string}
 */
export function formatImporteDisplay(num) {
  if (num == null || isNaN(num)) return '';
  const parts = Number(num).toFixed(2).split('.');
  const entera = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return parts[1] ? entera + ',' + parts[1] : entera;
}

/**
 * Número con coma decimal y miles con punto; usado en blur de inputs `soloComaDecimal` (tasas %, etc.).
 * Si `maxDecimales` > 2, recorta ceros finales tras la coma (p. ej. 1,2500 → 1,25).
 * @param {number} num
 * @param {number} [maxDecimales=2]
 * @returns {string}
 */
export function formatNumeroComaHastaDecimales(num, maxDecimales) {
  if (num == null || isNaN(num)) return '';
  const d = typeof maxDecimales === 'number' && maxDecimales >= 0 ? maxDecimales : 2;
  const n = Number(num);
  if (!isFinite(n)) return '';
  let s = n.toFixed(d);
  if (d > 2) s = s.replace(/\.?0+$/, '');
  if (s === '' || s === '-') s = '0';
  if (s === '-0') s = '0';
  const parts = s.split('.');
  const intRaw = parts[0];
  const decPart = parts.length > 1 && parts[1] !== undefined ? parts[1] : '';
  const entera = intRaw.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return decPart !== '' ? entera + ',' + decPart : entera;
}

/**
 * Porcentaje de tasa para inputs del wizard (hasta 4 decimales, coma decimal, miles con punto).
 * @param {number} num - Valor en % (ej. 1.5 para 1,5%).
 * @returns {string}
 */
export function formatTasaPorcentajeDisplay(num) {
  return formatNumeroComaHastaDecimales(num, 4);
}

/**
 * Para inputs de importe: vacío si no hay valor, "0" si es cero (no "0,00"), sino formatImporteDisplay.
 * @param {number|string} num
 * @returns {string}
 */
export function formatImporteParaInput(num) {
  if (num == null || num === '' || isNaN(Number(num))) return '';
  const n = Number(num);
  if (n === 0) return '0';
  return formatImporteDisplay(n);
}

/**
 * Formato de monto para mostrar en la UI (delega en formatImporteDisplay).
 * @param {number} n
 * @param {string} [moneda] - No usado en el formato actual; se mantiene por compatibilidad con llamadas existentes.
 * @returns {string}
 */
export function formatMonto(n, moneda) {
  if (n == null || isNaN(n)) return '–';
  return formatImporteDisplay(n);
}

/**
 * HTML para celda de moneda en tablas CC: span con clase valor-positivo o valor-negativo.
 * @param {number} val
 * @param {string} [moneda]
 * @returns {string}
 */
export function formatearCeldaMoneda(val, moneda) {
  if (val == null || Number(val) === 0) return '–';
  const n = Number(val);
  const cls = n >= 0 ? 'valor-positivo' : 'valor-negativo';
  const mon = moneda || 'USD';
  return `<span class="${cls}">${formatMonto(n >= 0 ? n : -n, mon)}</span>`;
}

/**
 * Igual que formatearCeldaMoneda pero incluye el signo (+ / −) en el número para que se entienda la conciliación (ej. −200.000 + 195.000 − 5.000).
 * @param {number} val
 * @param {string} [moneda]
 * @returns {string}
 */
export function formatearCeldaMonedaConSigno(val, moneda) {
  if (val == null || Number(val) === 0) return '–';
  const n = Number(val);
  const cls = n >= 0 ? 'valor-positivo' : 'valor-negativo';
  const mon = moneda || 'USD';
  const signo = n >= 0 ? '+' : '−';
  return `<span class="${cls}">${signo}${formatMonto(n >= 0 ? n : -n, mon)}</span>`;
}

/** Rutas de iconos de moneda (misma convención que Panel / Cajas). */
const TIPO_OP_MONEDA_ICON = {
  USD: '/assets/Icono_Dolar.avif',
  EUR: '/assets/Icono_Euro.avif',
  ARS: '/assets/Icono_ARS.webp',
};
const TIPO_OP_ICONO_CHEQUE = '/assets/Icono_Cheques.png';

function escapeHtmlTipoOp(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttrTipoOp(s) {
  return escapeHtmlTipoOp(s).replace(/'/g, '&#39;');
}

/**
 * Solo URLs https (evita javascript: y otros esquemas) para iconos personalizados.
 * @param {string} s
 * @returns {boolean}
 */
export function isHttpsUrlSegura(s) {
  try {
    const u = new URL(String(s || '').trim());
    return u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Icono pequeño de moneda (ABM tipos, celdas auxiliares).
 * @param {string} moneda
 * @param {number} [size]
 * @returns {string}
 */
export function htmlIconoMonedaTipoOp(moneda, size = 18) {
  const m = (moneda || '').toUpperCase();
  if (m === 'CHEQUE') {
    const w = Number(size) || 18;
    return `<img src="${TIPO_OP_ICONO_CHEQUE}" alt="" width="${w}" height="${w}" class="tipo-op-icono-cheque" role="presentation"/>`;
  }
  const src = TIPO_OP_MONEDA_ICON[m];
  if (!src) return escapeHtmlTipoOp(moneda || '');
  const w = Number(size) || 18;
  return `<img src="${src}" alt="" width="${w}" height="${w}" class="tipo-op-icono-moneda" role="presentation"/>`;
}

/** Un segmento de código tipo XXX-YYY (CHEQUE, USD, EUR, ARS) → HTML de icono. */
function htmlSegmentoTipoOpLeg(leg, size = 22) {
  const u = (leg || '').toUpperCase();
  if (u === 'CHEQUE') {
    const w = Number(size) || 22;
    return `<img src="${TIPO_OP_ICONO_CHEQUE}" alt="" width="${w}" height="${w}" class="tipo-op-icono-cheque" role="presentation"/>`;
  }
  if (TIPO_OP_MONEDA_ICON[u]) return htmlIconoMonedaTipoOp(u, size);
  return '';
}

/** Círculo con icono de intermediario (misma línea visual que iconos de moneda en tipo op). */
function htmlBadgeIntermediarioTipoOp() {
  const t = escapeAttrTipoOp('Con intermediario');
  return `<span class="tipo-op-icono-int" title="${t}" role="img" aria-label="Con intermediario"><svg class="tipo-op-icono-int-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></span>`;
}

function wrapTipoOperacionIconosHtml(innerHtml, titleBase, usaIntermediario, extraClass, metaCodigoNombre) {
  const usaInt = usaIntermediario === true;
  let titleFull = titleBase || '';
  if (usaInt) titleFull = titleFull ? `${titleFull} · Con intermediario` : 'Con intermediario';
  const title = escapeAttrTipoOp(titleFull);
  const classes = ['tipo-op-iconos', extraClass || '', usaInt ? 'tipo-op-iconos--con-intermediario' : ''].filter(Boolean).join(' ');
  const m = metaCodigoNombre || {};
  const codMeta = (m.codigo != null ? String(m.codigo) : '').trim();
  const nomMeta = (m.nombre != null ? String(m.nombre) : '').trim();
  const dataAttrs = ` data-pandi-tipo-codigo="${escapeAttrTipoOp(codMeta)}" data-pandi-tipo-nombre="${escapeAttrTipoOp(nomMeta)}" data-pandi-tipo-int="${usaInt ? '1' : '0'}"`;
  if (!usaInt) {
    return `<span class="${classes}" title="${title}"${dataAttrs}>${innerHtml}</span>`;
  }
  return `<span class="${classes}" title="${title}"${dataAttrs}><span class="tipo-op-iconos-cuerpo" aria-hidden="true">${innerHtml}</span>${htmlBadgeIntermediarioTipoOp()}</span>`;
}

/**
 * HTML para mostrar un tipo de operación por código: iconos IN→OUT o solo cheque si el código incluye CHEQUE (ej. ARS-ARS-CHEQUE).
 * @param {string} codigo - tipos_operacion.codigo
 * @param {string} [nombreExtra] - para title accesible (nombre legible)
 * @param {{ iconoModo?: string, iconoUrlPublica?: string, usaIntermediario?: boolean }} [opts] - icono_modo: auto | cheque | custom; custom requiere URL https válida; usaIntermediario agrega círculo con icono al lado del flujo
 * @returns {string}
 */
export function htmlTipoOperacionIconos(codigo, nombreExtra, opts) {
  opts = opts || {};
  const usaInt = opts.usaIntermediario === true;
  const modo = String(opts.iconoModo || 'auto').toLowerCase().trim();
  const urlCustom = String(opts.iconoUrlPublica || '').trim();
  const raw = (codigo || '').toString().trim();
  const c = raw.toUpperCase();
  const nombre = (nombreExtra || '').toString().trim();
  const titleText = raw && nombre ? `${raw} — ${nombre}` : (raw || nombre);

  const metaCn = { codigo: raw, nombre };

  if (modo === 'custom' && isHttpsUrlSegura(urlCustom)) {
    return wrapTipoOperacionIconosHtml(
      `<img src="${escapeAttrTipoOp(urlCustom)}" alt="" width="24" height="24" class="tipo-op-icono-custom" role="presentation" onerror="typeof window!=='undefined'&&window.pandiOnTipoOpCustomImgError&&window.pandiOnTipoOpCustomImgError(this)"/>`,
      titleText,
      usaInt,
      'tipo-op-iconos--custom',
      metaCn,
    );
  }
  if (modo === 'cheque') {
    return wrapTipoOperacionIconosHtml(
      `<img src="${TIPO_OP_ICONO_CHEQUE}" alt="" width="24" height="24" class="tipo-op-icono-cheque" role="presentation"/>`,
      titleText,
      usaInt,
      '',
      metaCn,
    );
  }

  if (!c || c === '–') {
    if (nombre) return wrapTipoOperacionIconosHtml(escapeHtmlTipoOp(nombre), nombre, usaInt, '', metaCn);
    return wrapTipoOperacionIconosHtml('–', '', false, '', metaCn);
  }

  const partes = c.split('-').filter(Boolean);
  const twoLegChequeArs = partes.length === 2 && (
    (partes[0] === 'CHEQUE' && partes[1] === 'ARS') ||
    (partes[0] === 'ARS' && partes[1] === 'CHEQUE')
  );
  if (twoLegChequeArs) {
    const ia = htmlSegmentoTipoOpLeg(partes[0], 22);
    const ib = htmlSegmentoTipoOpLeg(partes[1], 22);
    if (ia && ib) {
      return wrapTipoOperacionIconosHtml(
        `<span class="tipo-op-iconos-par" aria-hidden="true">${ia}<span class="tipo-op-iconos-sep">→</span>${ib}</span>`,
        titleText,
        usaInt,
        '',
        metaCn,
      );
    }
  }

  if (c.includes('CHEQUE')) {
    return wrapTipoOperacionIconosHtml(
      `<img src="${TIPO_OP_ICONO_CHEQUE}" alt="" width="24" height="24" class="tipo-op-icono-cheque" role="presentation"/>`,
      titleText,
      usaInt,
      '',
      metaCn,
    );
  }

  const parts = c.split('-');
  if (parts.length < 2) {
    return wrapTipoOperacionIconosHtml(escapeHtmlTipoOp(raw), titleText, usaInt, '', metaCn);
  }

  const a = parts[0];
  const b = parts[1];
  const ia = htmlSegmentoTipoOpLeg(a, 22);
  const ib = htmlSegmentoTipoOpLeg(b, 22);
  if (!ia || !ib) {
    return wrapTipoOperacionIconosHtml(escapeHtmlTipoOp(raw), titleText, usaInt, '', metaCn);
  }

  return wrapTipoOperacionIconosHtml(
    `<span class="tipo-op-iconos-par" aria-hidden="true">${ia}<span class="tipo-op-iconos-sep">→</span>${ib}</span>`,
    titleText,
    usaInt,
    '',
    metaCn,
  );
}
