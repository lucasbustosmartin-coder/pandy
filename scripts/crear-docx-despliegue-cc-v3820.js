/**
 * Genera docs/CC_DESPLIEGUE_V3_8_20_CAMBIOS_Y_CAUSAS.docx
 * desde docs/CC_DESPLIEGUE_V3_8_20_CAMBIOS_Y_CAUSAS.md
 *
 * Uso: node scripts/crear-docx-despliegue-cc-v3820.js
 */
const fs = require('fs');
const path = require('path');
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ShadingType,
  VerticalAlign,
} = require('docx');

const ROOT = path.join(__dirname, '..');
const MD = path.join(ROOT, 'docs', 'CC_DESPLIEGUE_V3_8_20_CAMBIOS_Y_CAUSAS.md');
const OUT = path.join(ROOT, 'docs', 'CC_DESPLIEGUE_V3_8_20_CAMBIOS_Y_CAUSAS.docx');

const NAVY = '1F4E79';
const NAVY_LIGHT = 'D6E3F0';
const BORDER = { style: BorderStyle.SINGLE, size: 4, color: '8FA4B8' };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

function runsFromMarkdownLine(line, extra) {
  const trimmed = String(line || '');
  if (!trimmed) return [new TextRun({ text: '', ...extra })];
  const parts = trimmed.split(/`([^`]+)`/g);
  const out = [];
  for (let p = 0; p < parts.length; p++) {
    const chunk = parts[p];
    if (!chunk) continue;
    if (p % 2 === 1) {
      out.push(new TextRun({ text: chunk, font: 'Consolas', size: 18, ...extra }));
      continue;
    }
    const boldBits = chunk.split(/\*\*(.+?)\*\*/g);
    for (let i = 0; i < boldBits.length; i++) {
      if (!boldBits[i]) continue;
      out.push(
        new TextRun({
          text: boldBits[i],
          bold: i % 2 === 1 || !!(extra && extra.bold),
          size: (extra && extra.size) || 22,
          font: (extra && extra.font) || 'Calibri',
          color: extra && extra.color,
        })
      );
    }
  }
  return out.length ? out : [new TextRun({ text: trimmed, ...extra })];
}

function splitRow(line) {
  const raw = line.trim();
  const inner = raw.startsWith('|') ? raw.slice(1) : raw;
  const cut = inner.endsWith('|') ? inner.slice(0, -1) : inner;
  return cut.split('|').map((c) => c.trim());
}

function isSeparatorRow(cells) {
  return cells.every((c) => /^[\s:\-]*$/.test(c) || /^:?-+:?$/.test(c));
}

function tableFromRows(rows) {
  if (!rows.length) return null;
  const colCount = Math.max(...rows.map((r) => r.length));
  const colPct = Math.floor(100 / colCount);
  const tableRows = rows.map((cells, ri) => {
    const padded = [...cells];
    while (padded.length < colCount) padded.push('');
    const isHead = ri === 0;
    return new TableRow({
      tableHeader: isHead,
      children: padded.map(
        (text) =>
          new TableCell({
            width: { size: colPct, type: WidthType.PERCENTAGE },
            borders: BORDERS,
            verticalAlign: VerticalAlign.CENTER,
            shading: {
              type: ShadingType.CLEAR,
              fill: isHead ? NAVY : ri % 2 === 0 ? NAVY_LIGHT : 'FFFFFF',
            },
            margins: { top: 40, bottom: 40, left: 60, right: 60 },
            children: [
              new Paragraph({
                children: runsFromMarkdownLine(text, {
                  bold: isHead,
                  color: isHead ? 'FFFFFF' : '1A1A1A',
                  size: isHead ? 18 : 18,
                }),
              }),
            ],
          })
      ),
    });
  });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: tableRows,
  });
}

function main() {
  const raw = fs.readFileSync(MD, 'utf8');
  const lines = raw.split(/\r?\n/);
  const children = [];
  let tableBuf = [];

  const flushTable = () => {
    if (!tableBuf.length) return;
    const parsed = tableBuf.map(splitRow).filter((c) => !isSeparatorRow(c));
    const tbl = tableFromRows(parsed);
    if (tbl) {
      children.push(tbl);
      children.push(new Paragraph({ text: '', spacing: { after: 160 } }));
    }
    tableBuf = [];
  };

  for (const line of lines) {
    const t = line.trimEnd();
    if (t.startsWith('|') && t.includes('|')) {
      tableBuf.push(t);
      continue;
    }
    flushTable();

    if (t === '---') {
      children.push(new Paragraph({ text: '', spacing: { after: 140 } }));
      continue;
    }
    if (!t.trim()) {
      children.push(new Paragraph({ text: '', spacing: { after: 80 } }));
      continue;
    }
    if (t.startsWith('# ')) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.TITLE,
          children: runsFromMarkdownLine(t.slice(2), { size: 40, bold: true, color: NAVY }),
          spacing: { before: 120, after: 200 },
        })
      );
      continue;
    }
    if (t.startsWith('## ')) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: runsFromMarkdownLine(t.slice(3), { size: 28, bold: true, color: NAVY }),
          spacing: { before: 320, after: 120 },
        })
      );
      continue;
    }
    if (t.startsWith('### ')) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: runsFromMarkdownLine(t.slice(4), { size: 24, bold: true, color: '2E5A88' }),
          spacing: { before: 220, after: 100 },
        })
      );
      continue;
    }
    const numbered = t.match(/^(\d+)\.\s+(.*)$/);
    if (numbered) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: numbered[1] + '. ', bold: true, size: 22, font: 'Calibri' }),
            ...runsFromMarkdownLine(numbered[2]),
          ],
          spacing: { after: 80 },
          indent: { left: 280 },
        })
      );
      continue;
    }
    if (t.startsWith('- ')) {
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          children: runsFromMarkdownLine(t.slice(2)),
          spacing: { after: 60 },
        })
      );
      continue;
    }
    children.push(
      new Paragraph({
        children: runsFromMarkdownLine(t),
        spacing: { after: 120 },
      })
    );
  }
  flushTable();

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 22 },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, bottom: 720, left: 720, right: 720 },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc).then((buf) => {
    fs.writeFileSync(OUT, buf);
    console.log('Creado:', OUT);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
