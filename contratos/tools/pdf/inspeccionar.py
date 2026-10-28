"""
Herramienta de calibración: muestra dónde está cada texto de un PDF original.

Uso:
  python3 inspeccionar.py original.pdf                    lista todos los textos con coordenadas
  python3 inspeccionar.py original.pdf --pagina 1         solo la página 1 (numeración desde 1)
  python3 inspeccionar.py original.pdf --buscar "CÉDULA"  rectángulos donde aparece ese texto
  python3 inspeccionar.py original.pdf --rejilla carpeta  PNG de cada página con una rejilla en puntos

Coordenadas en puntos PDF (1/72 de pulgada), origen arriba a la izquierda, igual que en los formatos.
"""
import argparse
import os

import pymupdf


def listar(doc, paginas):
    for n in paginas:
        p = doc[n]
        print(f"\n=== Página {n + 1}  ({p.rect.width:.0f} × {p.rect.height:.0f} pt)")
        for b in p.get_text("dict")["blocks"]:
            for l in b.get("lines", []):
                for s in l["spans"]:
                    if not s["text"].strip():
                        continue
                    x0, y0, x1, y1 = s["bbox"]
                    print(f"  ({x0:6.1f}, {y0:6.1f}, {x1:6.1f}, {y1:6.1f})  base {s['origin'][1]:6.1f}  "
                          f"{s['font']} {s['size']:.1f}  «{s['text']}»")
        dibujos = [d["rect"] for d in p.get_drawings() if d["rect"].width < 500 or d["rect"].height < 600]
        if dibujos:
            print(f"  -- {len(dibujos)} trazos (cajas, líneas de tabla); primeros:")
            for r in dibujos[:12]:
                print(f"     ({r.x0:6.1f}, {r.y0:6.1f}, {r.x1:6.1f}, {r.y1:6.1f})")


def buscar(doc, paginas, texto):
    for n in paginas:
        for r in doc[n].search_for(texto):
            print(f"Página {n + 1}: ({r.x0:.1f}, {r.y0:.1f}, {r.x1:.1f}, {r.y1:.1f})")


def rejilla(doc, paginas, carpeta, dpi=110):
    """Dibuja una rejilla cada 10 pt (marcada cada 50 pt) sobre una copia y la guarda como PNG."""
    os.makedirs(carpeta, exist_ok=True)
    copia = pymupdf.open()
    copia.insert_pdf(doc)
    for n in paginas:
        p = copia[n]
        w, h = p.rect.width, p.rect.height
        for x in range(0, int(w) + 1, 10):
            fuerte = x % 50 == 0
            p.draw_line((x, 0), (x, h), color=(1, 0, 0) if fuerte else (1, 0.75, 0.75), width=0.4 if fuerte else 0.2)
            if fuerte:
                p.insert_text((x + 1, 8), str(x), fontsize=6, color=(1, 0, 0))
        for y in range(0, int(h) + 1, 10):
            fuerte = y % 50 == 0
            p.draw_line((0, y), (w, y), color=(0, 0, 1) if fuerte else (0.75, 0.75, 1), width=0.4 if fuerte else 0.2)
            if fuerte:
                p.insert_text((1, y - 1), str(y), fontsize=6, color=(0, 0, 1))
        ruta = os.path.join(carpeta, f"pagina-{n + 1}.png")
        p.get_pixmap(dpi=dpi).save(ruta)
        print(ruta)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pdf")
    ap.add_argument("--pagina", type=int, help="número de página (desde 1)")
    ap.add_argument("--buscar")
    ap.add_argument("--rejilla", metavar="CARPETA")
    a = ap.parse_args()
    doc = pymupdf.open(a.pdf)
    paginas = [a.pagina - 1] if a.pagina else list(range(len(doc)))
    if a.buscar:
        buscar(doc, paginas, a.buscar)
    elif a.rejilla:
        rejilla(doc, paginas, a.rejilla)
    else:
        listar(doc, paginas)
