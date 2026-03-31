/**
 * Genera docs/PLAN_PWA_OPERACION_OFFLINE.docx desde docs/PLAN_PWA_OPERACION_OFFLINE.md
 * Uso: node scripts/crear-plan-pwa-offline-docx.js
 */
const fs = require('fs');
const path = require('path');
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
} = require('docx');

const ROOT = path.join(__dirname, '..');
const MD = path.join(ROOT, 'docs', 'PLAN_PWA_OPERACION_OFFLINE.md');
const OUT = path.join(ROOT, 'docs', 'PLAN_PWA_OPERACION_OFFLINE.docx');

function runsFromMarkdownLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return [new TextRun('')];
  const parts = trimmed.split(/\*\*(.+?)\*\*/g);
  const runs = [];
  for (let i = 0; i < parts.length; i++) {
    if (!parts[i]) continue;
    if (i % 2 === 1) runs.push(new TextRun({ text: parts[i], bold: true }));
    else runs.push(new TextRun(parts[i]));
  }
  return runs.length ? runs : [new TextRun(trimmed)];
}

function main() {
  const raw = fs.readFileSync(MD, 'utf8');
  const lines = raw.split(/\r?\n/);
  const children = [];

  for (const line of lines) {
    const t = line.trimEnd();
    if (t === '---') {
      children.push(new Paragraph({ text: '', spacing: { after: 120 } }));
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
          children: runsFromMarkdownLine(t.slice(2)),
          spacing: { before: 240, after: 160 },
        })
      );
      continue;
    }
    if (t.startsWith('## ')) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: runsFromMarkdownLine(t.slice(3)),
          spacing: { before: 280, after: 120 },
        })
      );
      continue;
    }
    if (t.startsWith('### ')) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: runsFromMarkdownLine(t.slice(4)),
          spacing: { before: 200, after: 100 },
        })
      );
      continue;
    }
    if (/^\|[\s\-:|]+\|/.test(t) && /^[\s|:\-]+$/.test(t.replace(/[^|\-:\s]/g, 'x'))) {
      continue;
    }
    if (t.startsWith('|') && t.includes('|')) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: t, font: 'Consolas' })],
          spacing: { after: 80 },
        })
      );
      continue;
    }
    if (t.startsWith('- [ ]') || t.startsWith('- ')) {
      const rest = t.replace(/^- \[[ x]\]\s*/, '').replace(/^- /, '');
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          children: runsFromMarkdownLine(rest),
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

  const doc = new Document({
    sections: [
      {
        properties: {},
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
