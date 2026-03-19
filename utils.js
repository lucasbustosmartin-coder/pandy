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

/**
 * HTML para mostrar un tipo de operación por código: iconos IN→OUT o solo cheque si el código incluye CHEQUE (ej. ARS-ARS-CHEQUE).
 * @param {string} codigo - tipos_operacion.codigo
 * @param {string} [nombreExtra] - para title accesible (nombre legible)
 * @param {{ iconoModo?: string, iconoUrlPublica?: string }} [opts] - icono_modo: auto | cheque | custom; custom requiere URL https válida
 * @returns {string}
 */
export function htmlTipoOperacionIconos(codigo, nombreExtra, opts) {
  opts = opts || {};
  const modo = String(opts.iconoModo || 'auto').toLowerCase().trim();
  const urlCustom = String(opts.iconoUrlPublica || '').trim();
  const raw = (codigo || '').toString().trim();
  const c = raw.toUpperCase();
  const nombre = (nombreExtra || '').toString().trim();
  const titleText = raw && nombre ? `${raw} — ${nombre}` : (raw || nombre);
  const title = escapeAttrTipoOp(titleText);

  if (modo === 'custom' && isHttpsUrlSegura(urlCustom)) {
    return `<span class="tipo-op-iconos tipo-op-iconos--custom" title="${title}"><img src="${escapeAttrTipoOp(urlCustom)}" alt="" width="24" height="24" class="tipo-op-icono-custom" role="presentation"/></span>`;
  }
  if (modo === 'cheque') {
    return `<span class="tipo-op-iconos" title="${title}"><img src="${TIPO_OP_ICONO_CHEQUE}" alt="" width="24" height="24" class="tipo-op-icono-cheque" role="presentation"/></span>`;
  }

  if (!c || c === '–') {
    if (nombre) return `<span class="tipo-op-iconos" title="${escapeAttrTipoOp(nombre)}">${escapeHtmlTipoOp(nombre)}</span>`;
    return '<span class="tipo-op-iconos">–</span>';
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
      return `<span class="tipo-op-iconos" title="${title}"><span class="tipo-op-iconos-par" aria-hidden="true">${ia}<span class="tipo-op-iconos-sep">→</span>${ib}</span></span>`;
    }
  }

  if (c.includes('CHEQUE')) {
    return `<span class="tipo-op-iconos" title="${title}"><img src="${TIPO_OP_ICONO_CHEQUE}" alt="" width="24" height="24" class="tipo-op-icono-cheque" role="presentation"/></span>`;
  }

  const parts = c.split('-');
  if (parts.length < 2) {
    return `<span class="tipo-op-iconos" title="${title}">${escapeHtmlTipoOp(raw)}</span>`;
  }

  const a = parts[0];
  const b = parts[1];
  const ia = htmlSegmentoTipoOpLeg(a, 22);
  const ib = htmlSegmentoTipoOpLeg(b, 22);
  if (!ia || !ib) {
    return `<span class="tipo-op-iconos" title="${title}">${escapeHtmlTipoOp(raw)}</span>`;
  }

  return `<span class="tipo-op-iconos" title="${title}"><span class="tipo-op-iconos-par" aria-hidden="true">${ia}<span class="tipo-op-iconos-sep">→</span>${ib}</span></span>`;
}
