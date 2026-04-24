/**
 * Informe PDF — cuenta corriente cliente (período, saldo inicial opcional, movimientos sin anulados).
 * Carga perezosa desde main.js para no inflar el bundle inicial.
 */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatMonto } from './utils.js';

/**
 * Helvetica embebida en jsPDF no mapea bien U+2212 (menos tipográfico) ni U+2013 (guión largo):
 * suelen verse como * o “comillas”. En este informe solo usamos ASCII en importes.
 */
const PDF_MENOS = '-';
const PDF_SIN_MONTO = '-';

/** Positivo = a favor de la empresa (cliente nos debe); negativo = nosotros debemos al cliente. */
function pdfCcRgbSaldoCliente(v) {
  const n = Number(v) || 0;
  if (Math.abs(n) < 1e-9) return [88, 88, 88];
  if (n > 0) return [4, 120, 87];
  return [210, 45, 45];
}

function pdfCcCeldaMontoMovimiento(valor, moneda) {
  const n = Number(valor) || 0;
  if (Math.abs(n) < 1e-9) {
    return { content: PDF_SIN_MONTO, styles: { halign: 'right', textColor: [115, 115, 115] } };
  }
  const signo = n >= 0 ? '+' : PDF_MENOS;
  const text = signo + formatMonto(n >= 0 ? n : -n, moneda);
  return { content: text, styles: { halign: 'right', textColor: pdfCcRgbSaldoCliente(n) } };
}

function pdfCcCeldaMontoSaldo(valor, moneda) {
  const n = Number(valor) || 0;
  const text = formatMonto(n, moneda);
  return { content: text, styles: { halign: 'right', textColor: pdfCcRgbSaldoCliente(n) } };
}

/** Leyenda bajo saldo final: positivo = debe el cliente; negativo = debemos nosotros. */
function pdfCcCeldaLeyendaDeudaSaldoFinal(valor) {
  const n = Number(valor) || 0;
  if (Math.abs(n) < 1e-9) {
    return { content: 'Saldo cero', styles: { halign: 'right', fontSize: 7.5, textColor: [95, 95, 95], fontStyle: 'italic' } };
  }
  if (n > 0) {
    return {
      content: 'Deuda del Cliente',
      styles: { halign: 'right', fontSize: 7.5, textColor: [200, 45, 45], fontStyle: 'normal' },
    };
  }
  return {
    content: 'Deuda de la Empresa',
    styles: { halign: 'right', fontSize: 7.5, textColor: [5, 120, 87], fontStyle: 'normal' },
  };
}

function pdfCcFormatoImagenDesdeDataUrl(dataUrl) {
  const s = String(dataUrl || '').toLowerCase();
  if (s.startsWith('data:image/png')) return 'PNG';
  if (s.startsWith('data:image/jpeg') || s.startsWith('data:image/jpg')) return 'JPEG';
  if (s.startsWith('data:image/webp')) return 'WEBP';
  return 'PNG';
}

function safeFileSlug(s) {
  const raw = String(s || 'cliente')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 48);
  return raw || 'cliente';
}

/**
 * @param {object} opts
 * @param {string} opts.marcaNombre
 * @param {string} opts.clienteNombre
 * @param {string} opts.desde YYYY-MM-DD
 * @param {string} opts.hasta YYYY-MM-DD
 * @param {boolean} opts.domarDesde
 * @param {string[]} opts.monedas Ej. ['USD','ARS','EUR']
 * @param {Record<string, number>} opts.saldoInicialPorMoneda
 * @param {Record<string, number>} opts.saldoFinalPorMoneda
 * @param {Array<{fecha: string, tipoOp: string, orden: string, trans: string, concepto: string, montosValor?: Record<string, number>}>} opts.filasMovimientos
 * @param {string} opts.emitidoTexto Leyenda pie (fecha/hora emisión)
 * @param {string} [opts.marcaLogoDataUrl] data URL imagen marca (p. ej. favicon PNG)
 */
export function generarYCcInformePdfDescargar(opts) {
  const {
    marcaNombre,
    clienteNombre,
    desde,
    hasta,
    domarDesde,
    monedas,
    saldoInicialPorMoneda,
    saldoFinalPorMoneda,
    filasMovimientos,
    emitidoTexto,
    marcaLogoDataUrl,
  } = opts;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  const tableW = pageW - margin * 2;
  let y = margin;

  if (marcaLogoDataUrl && String(marcaLogoDataUrl).length > 40) {
    const fmt = pdfCcFormatoImagenDesdeDataUrl(marcaLogoDataUrl);
    const iw = 14;
    const ih = 14;
    try {
      doc.addImage(marcaLogoDataUrl, fmt, (pageW - iw) / 2, y, iw, ih);
      y += ih + 4;
    } catch (e) {
      console.warn('PDF CC cliente: no se pudo embeber el logo', e);
    }
  }

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Cuenta corriente — Cliente', margin, y);
  y += 8;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`${String(marcaNombre || 'Pandi').trim()} · Informe de movimientos (sin anulados)`, margin, y);
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.text(`Cliente: ${String(clienteNombre || '–').trim()}`, margin, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.text(`Período: ${desde} al ${hasta}`, margin, y);
  y += 4;
  doc.setFontSize(8.5);
  doc.setTextColor(80, 80, 80);
  doc.text(
    domarDesde
      ? 'Saldo inicial: suma de movimientos no anulados con fecha anterior al «Desde».'
      : 'Saldo inicial: cero (solo se consideran movimientos del período).',
    margin,
    y,
    { maxWidth: pageW - margin * 2 },
  );
  doc.setTextColor(0, 0, 0);
  y += 8;

  const nMon = Math.max(monedas.length, 1);
  const wFecha = 18;
  const wTipo = 20;
  const wOrd = 12;
  const wTrans = 12;
  const leftSum = wFecha + wTipo + wOrd + wTrans;
  let wMonMov = Math.max(36, (tableW - leftSum - 26) / nMon);
  let wConceptoMov = tableW - leftSum - nMon * wMonMov;
  if (wConceptoMov < 24) {
    wMonMov = Math.max(28, (tableW - leftSum - 24) / nMon);
    wConceptoMov = tableW - leftSum - nMon * wMonMov;
  }
  wConceptoMov = Math.round(wConceptoMov * 100) / 100;
  wMonMov = Math.round(wMonMov * 100) / 100;
  const wMonSaldo = wMonMov;
  const wConceptoSaldo = Math.round((tableW - nMon * wMonSaldo) * 100) / 100;

  const headSaldo = [['Concepto', ...monedas.map((m) => m)]];
  const saldoIniRow = [
    'Saldo inicial al inicio del período',
    ...monedas.map((mon) => pdfCcCeldaMontoSaldo(saldoInicialPorMoneda[mon], mon)),
  ];
  autoTable(doc, {
    startY: y,
    head: headSaldo,
    body: [saldoIniRow],
    theme: 'grid',
    tableWidth: tableW,
    styles: { fontSize: 9, cellPadding: { top: 2, right: 1.5, bottom: 2, left: 1.5 }, valign: 'middle' },
    headStyles: { fillColor: [45, 85, 120], textColor: 255 },
    columnStyles: {
      0: { cellWidth: wConceptoSaldo, halign: 'left' },
      ...Object.fromEntries(
        monedas.map((_, i) => [
          1 + i,
          {
            cellWidth: wMonSaldo,
            halign: 'right',
            overflow: 'linebreak',
            cellPadding: { top: 2, right: 0.9, bottom: 2, left: 0.9 },
          },
        ]),
      ),
    },
    didParseCell: (data) => {
      if (data.section === 'head' && data.column.index >= 1) data.cell.styles.halign = 'right';
    },
    margin: { left: margin, right: margin },
  });
  y = doc.lastAutoTable.finalY + 6;

  const headMov = [['Fecha', 'Tipo op.', 'Orden', 'Trans.', 'Concepto', ...monedas.map((m) => m)]];

  const bodyMov = (filasMovimientos || []).map((r) => {
    const mv = r.montosValor || {};
    return [
      r.fecha,
      r.tipoOp,
      r.orden,
      r.trans,
      r.concepto,
      ...monedas.map((mon) => pdfCcCeldaMontoMovimiento(mv[mon], mon)),
    ];
  });

  if (bodyMov.length === 0) {
    bodyMov.push([
      '-',
      '-',
      '-',
      '-',
      'Sin movimientos en el período (no anulados)',
      ...monedas.map(() => ({ content: PDF_SIN_MONTO, styles: { halign: 'right', textColor: [115, 115, 115] } })),
    ]);
  }

  autoTable(doc, {
    startY: y,
    head: headMov,
    body: bodyMov,
    theme: 'striped',
    tableWidth: tableW,
    styles: {
      fontSize: 7.5,
      cellPadding: { top: 1.4, right: 1.2, bottom: 1.4, left: 1.2 },
      overflow: 'linebreak',
      valign: 'top',
    },
    headStyles: { fillColor: [45, 85, 120], textColor: 255 },
    columnStyles: {
      0: { cellWidth: wFecha, halign: 'left' },
      1: { cellWidth: wTipo, halign: 'left' },
      2: { cellWidth: wOrd, halign: 'center' },
      3: { cellWidth: wTrans, halign: 'center' },
      4: { cellWidth: wConceptoMov, halign: 'left' },
      ...Object.fromEntries(
        monedas.map((_, i) => [
          5 + i,
          {
            cellWidth: wMonMov,
            halign: 'right',
            overflow: 'linebreak',
            valign: 'middle',
            fontSize: 7.1,
            cellPadding: { top: 1.4, right: 0.85, bottom: 1.4, left: 0.85 },
          },
        ]),
      ),
    },
    didParseCell: (data) => {
      if (data.section === 'head' && data.column.index >= 5) data.cell.styles.halign = 'right';
    },
    margin: { left: margin, right: margin },
  });
  y = doc.lastAutoTable.finalY + 6;

  const saldoFinRow = [
    'Saldo final (inicial + movimientos del período)',
    ...monedas.map((mon) => pdfCcCeldaMontoSaldo(saldoFinalPorMoneda[mon], mon)),
  ];
  const leyendaFinRow = [
    '',
    ...monedas.map((mon) => pdfCcCeldaLeyendaDeudaSaldoFinal(saldoFinalPorMoneda[mon])),
  ];
  autoTable(doc, {
    startY: y,
    head: headSaldo,
    body: [saldoFinRow, leyendaFinRow],
    theme: 'grid',
    tableWidth: tableW,
    styles: { fontSize: 9, cellPadding: { top: 2, right: 1.5, bottom: 2, left: 1.5 }, valign: 'middle' },
    headStyles: { fillColor: [22, 101, 52], textColor: 255 },
    columnStyles: {
      0: { cellWidth: wConceptoSaldo, halign: 'left' },
      ...Object.fromEntries(
        monedas.map((_, i) => [
          1 + i,
          {
            cellWidth: wMonSaldo,
            halign: 'right',
            overflow: 'linebreak',
            cellPadding: { top: 2, right: 0.9, bottom: 2, left: 0.9 },
          },
        ]),
      ),
    },
    didParseCell: (data) => {
      if (data.section === 'head' && data.column.index >= 1) data.cell.styles.halign = 'right';
    },
    margin: { left: margin, right: margin },
  });
  y = doc.lastAutoTable.finalY + 8;

  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text(String(emitidoTexto || ''), margin, Math.min(y, doc.internal.pageSize.getHeight() - 10), {
    maxWidth: pageW - margin * 2,
  });

  const slug = safeFileSlug(clienteNombre);
  doc.save(`CC_Cliente_${slug}_${desde}_${hasta}.pdf`);
}
