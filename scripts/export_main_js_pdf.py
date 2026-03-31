#!/usr/bin/env python3
"""Exporta main.js a PDF (monoespaciado, con números de línea) para documentación / manual."""
from pathlib import Path

from fpdf import FPDF

ROOT = Path(__file__).resolve().parent.parent
MAIN_JS = ROOT / "main.js"
OUT_PDF = ROOT / "main_js.pdf"
FONT_FILE = Path(__file__).resolve().parent / "fonts" / "DejaVuSansMono.ttf"

FONT_SIZE = 5.5
LINE_HEIGHT_MM = 2.0
MARGIN = 8
MAX_CHARS = 175  # A4 apaisado ~5.5pt Courier


def wrap_chunks(text: str) -> list[str]:
    if len(text) <= MAX_CHARS:
        return [text]
    return [text[i : i + MAX_CHARS] for i in range(0, len(text), MAX_CHARS)]


def main() -> None:
    if not MAIN_JS.is_file():
        raise SystemExit(f"No existe {MAIN_JS}")
    if not FONT_FILE.is_file():
        raise SystemExit(
            f"Falta la fuente Unicode: {FONT_FILE}\n"
            "Descargá DejaVuSansMono.ttf en esa carpeta o ejecutá desde el repo con scripts/fonts/."
        )

    pdf = FPDF(orientation="L", unit="mm", format="A4")
    pdf.set_margins(MARGIN, MARGIN, MARGIN)
    pdf.set_auto_page_break(True, margin=MARGIN)
    pdf.add_font("DejaVuSansMono", "", str(FONT_FILE))
    pdf.add_page()
    pdf.set_font("DejaVuSansMono", "", FONT_SIZE)

    usable_w = pdf.w - 2 * MARGIN

    with MAIN_JS.open(encoding="utf-8", errors="replace") as f:
        for n, line in enumerate(f, 1):
            raw = line.rstrip("\n\r")
            prefix = f"{n:5d}| "
            first = True
            for chunk in wrap_chunks(raw):
                if first:
                    row = prefix + chunk
                    first = False
                else:
                    row = " " * len(prefix) + chunk
                pdf.multi_cell(usable_w, LINE_HEIGHT_MM, row, new_x="LMARGIN", new_y="NEXT")

    pdf.output(str(OUT_PDF))
    print(f"OK: {OUT_PDF} ({OUT_PDF.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
