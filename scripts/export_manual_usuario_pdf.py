#!/usr/bin/env python3
"""
Genera un PDF reducido orientado al manual de usuario:
- Textos de interfaz y ayudas desde index.html (BeautifulSoup)
- Líneas de main.js que muestran mensajes al usuario (showToast, showConfirm)

Salida: manual_usuario.pdf (y manual_usuario_fuente.txt opcional para revisión)
"""
from __future__ import annotations

import re
from pathlib import Path

from bs4 import BeautifulSoup
from fpdf import FPDF

ROOT = Path(__file__).resolve().parent.parent
INDEX_HTML = ROOT / "index.html"
MAIN_JS = ROOT / "main.js"
OUT_TXT = ROOT / "manual_usuario_fuente.txt"
OUT_PDF = ROOT / "manual_usuario.pdf"
FONT_FILE = Path(__file__).resolve().parent / "fonts" / "DejaVuSansMono.ttf"

FONT_SIZE = 8
LINE_HEIGHT_MM = 3.6
MARGIN = 14
MAX_CHARS = 98  # A4 vertical ~8pt monoespacio


def wrap_chunks(text: str) -> list[str]:
    text = text.replace("\r", "")
    if len(text) <= MAX_CHARS:
        return [text] if text else []
    return [text[i : i + MAX_CHARS] for i in range(0, len(text), MAX_CHARS)]


def norm_key(s: str) -> str:
    return " ".join(s.lower().split())


def add_unique(bucket: list[str], seen: set[str], text: str, min_len: int = 2) -> None:
    t = " ".join(text.split())
    if len(t) < min_len or len(t) > 600:
        return
    k = norm_key(t)
    if k in seen:
        return
    seen.add(k)
    bucket.append(t)


def extract_html_content(html: str) -> tuple[list[str], list[str], list[str]]:
    """Ayudas, resto de UI (etiquetas, títulos, tablas), y metadatos."""
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()
    for svg in soup.find_all("svg"):
        svg.decompose()

    seen: set[str] = set()
    ayudas: list[str] = []
    ui: list[str] = []

    for el in soup.select(".help-popover"):
        txt = el.get_text(" ", strip=True)
        add_unique(ayudas, seen, txt, min_len=5)

    # Evita que labels / títulos dupliquen textos largos de ayuda
    for el in soup.select(".help-popover"):
        el.decompose()
    for el in soup.select(".help-inline"):
        el.decompose()

    title_tag = soup.find("title")
    meta = []
    if title_tag and title_tag.string:
        meta.append(f"Título de la app: {title_tag.string.strip()}")

    # Encabezados, menú, celdas, labels, botones, opciones, placeholders
    for selector in (
        "h1",
        "h2",
        "h3",
        "h4",
        ".menu-label",
        "label",
        "thead th",
        "button",
        "fieldset legend",
        "[placeholder]:not([placeholder=''])",
    ):
        for el in soup.select(selector):
            if el.find_parent(class_="help-popover"):
                continue
            txt = el.get_text(" ", strip=True)
            if selector == "button" and len(txt) > 80:
                continue
            add_unique(ui, seen, txt, min_len=1)

    for opt in soup.select("select option"):
        txt = opt.get_text(" ", strip=True)
        v = opt.get("value") or ""
        if v and txt and txt != v:
            add_unique(ui, seen, txt, min_len=1)

    for inp in soup.select("input[placeholder]"):
        ph = inp.get("placeholder") or ""
        if ph.strip() and ph not in ("0",):
            add_unique(ui, seen, f"Placeholder: {ph.strip()}", min_len=3)

    return ayudas, ui, meta


def extract_main_js_user_lines(path: Path) -> list[str]:
    out: list[str] = []
    pat = re.compile(r"showToast\s*\(|showConfirm\s*\(")
    with path.open(encoding="utf-8", errors="replace") as f:
        for n, line in enumerate(f, 1):
            if pat.search(line):
                s = line.rstrip()
                if len(s) > 220:
                    s = s[:217] + "…"
                out.append(f"L{n}: {s}")
    return out


def build_document() -> str:
    html = INDEX_HTML.read_text(encoding="utf-8", errors="replace")
    ayudas, ui, meta = extract_html_content(html)
    js_lines = extract_main_js_user_lines(MAIN_JS)

    ayudas.sort(key=norm_key)
    ui.sort(key=norm_key)

    parts: list[str] = []
    parts.append("Pandi — material condensado para manual de usuario (generado automáticamente)")
    parts.append("")
    parts.append("=" * 60)
    parts.append("METADATOS")
    parts.append("=" * 60)
    parts.extend(meta or ["(sin título en <title>)"])
    parts.append("")
    parts.append("=" * 60)
    parts.append(f"AYUDAS CONTEXTUALES (help-popover) — {len(ayudas)} textos")
    parts.append("=" * 60)
    for i, a in enumerate(ayudas, 1):
        parts.append(f"{i}. {a}")
    parts.append("")
    parts.append("=" * 60)
    parts.append(f"INTERFAZ: etiquetas, menú, tablas, botones — {len(ui)} textos únicos")
    parts.append("=" * 60)
    for i, u in enumerate(ui, 1):
        parts.append(f"{i}. {u}")
    parts.append("")
    parts.append("=" * 60)
    parts.append(f"MENSAJES AL USUARIO (main.js: showToast / showConfirm) — {len(js_lines)} líneas")
    parts.append("=" * 60)
    parts.extend(js_lines)
    parts.append("")
    parts.append("— Fin —")

    return "\n".join(parts)


def write_pdf(text: str, out_path: Path) -> None:
    if not FONT_FILE.is_file():
        raise SystemExit(f"Falta la fuente: {FONT_FILE}")

    pdf = FPDF(orientation="P", unit="mm", format="A4")
    pdf.set_margins(MARGIN, MARGIN, MARGIN)
    pdf.set_auto_page_break(True, margin=MARGIN)
    pdf.add_font("DejaVuSansMono", "", str(FONT_FILE))
    pdf.add_font("DejaVuSansMono", "B", str(FONT_FILE))
    pdf.add_page()
    pdf.set_font("DejaVuSansMono", "", FONT_SIZE)

    usable_w = pdf.w - 2 * MARGIN

    for line in text.split("\n"):
        is_heading = line.startswith("=") and line.endswith("=") and len(line) >= 20
        if is_heading:
            pdf.set_font("DejaVuSansMono", "B", FONT_SIZE + 0.5)
        else:
            pdf.set_font("DejaVuSansMono", "", FONT_SIZE)

        chunks = wrap_chunks(line) or [""]
        for chunk in chunks:
            pdf.multi_cell(usable_w, LINE_HEIGHT_MM, chunk, new_x="LMARGIN", new_y="NEXT")

        if is_heading:
            pdf.set_font("DejaVuSansMono", "", FONT_SIZE)

    pdf.output(str(out_path))


def main() -> None:
    if not INDEX_HTML.is_file() or not MAIN_JS.is_file():
        raise SystemExit("Faltan index.html o main.js en la raíz del proyecto.")

    doc = build_document()
    OUT_TXT.write_text(doc, encoding="utf-8")
    write_pdf(doc, OUT_PDF)

    n_kb = OUT_PDF.stat().st_size // 1024
    n_lines = doc.count("\n") + 1
    print(f"OK: {OUT_TXT} y {OUT_PDF} (~{n_lines} líneas, PDF ~{n_kb} KB)")


if __name__ == "__main__":
    main()
