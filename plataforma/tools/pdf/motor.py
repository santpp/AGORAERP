"""
Motor común para llenar convenios en PDF.

Cada formato (un contrato de una empresa) vive en formatos/<nombre>.py y usa estas
funciones con sus propias coordenadas. Aquí no hay nada propio de ninguna empresa.
"""
import os

import pymupdf

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
CARPETA_PLANTILLAS = os.path.join(RAIZ, "plantillas")
FUENTE_INTER_R = os.path.join(CARPETA_PLANTILLAS, "fuentes", "Inter-Regular.otf")
FUENTE_INTER_B = os.path.join(CARPETA_PLANTILLAS, "fuentes", "Inter-Bold.otf")


def fuentes_inter():
    """(regular, negrita) de Inter, la tipografía de reemplazo para texto nuevo."""
    return pymupdf.Font(fontfile=FUENTE_INTER_R), pymupdf.Font(fontfile=FUENTE_INTER_B)


def base_de(rect, tamano):
    """Línea base aproximada de un texto de ese tamaño dentro del rectángulo."""
    return rect.y1 - 0.244 * tamano


def ajustar_tamano(fuente, texto, ancho, tamano, minimo):
    """Reduce el tamaño hasta que el texto quepa en el hueco original (sin pisar el texto vecino)."""
    while tamano > minimo and fuente.text_length(texto, fontsize=tamano) > ancho:
        tamano -= 0.25
    return tamano


def buscar(pagina, texto, zona=None, nth=0):
    """Rectángulo del texto en la página. Falla con un mensaje claro si la plantilla cambió."""
    rects = pagina.search_for(texto, clip=zona) if zona else pagina.search_for(texto)
    if len(rects) <= nth:
        raise RuntimeError(f"No encontré «{texto}» en la página (zona {zona})")
    return rects[nth]


def origen_y(pagina, rect):
    """Línea base del texto original que está en ese rectángulo (más exacta que medir el recuadro)."""
    cx, cy = (rect.x0 + rect.x1) / 2, (rect.y0 + rect.y1) / 2
    for b in pagina.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            for sp in l["spans"]:
                bb = pymupdf.Rect(sp["bbox"])
                if bb.contains(pymupdf.Point(cx, cy)):
                    return sp["origin"][1]
    return base_de(rect, 9)


def cubrir(pagina, rect):
    """Marca el rectángulo para borrar su texto (sin tapar imágenes ni líneas al aplicar)."""
    pagina.add_redact_annot(rect, fill=None)


def aplicar_borrado(pagina):
    """Borra el texto marcado con cubrir(); imágenes y líneas quedan intactas."""
    pagina.apply_redactions(images=0, graphics=0, text=pymupdf.PDF_REDACT_TEXT_REMOVE)


_ALIAS = {}


def escribir(pagina, punto, texto, fuente, tamano, centro=None, estrechar=1.0):
    """Escribe texto en negro. Con centro, el texto se centra en esa coordenada x.
    estrechar < 1 comprime el texto en horizontal desde su inicio (lo usa escribir_en_ancho)."""
    if centro is not None:
        ancho = fuente.text_length(texto, fontsize=tamano) * estrechar
        punto = (centro - ancho / 2, punto[1])
    alias = f"ZX{len(_ALIAS)}"
    _ALIAS[alias] = True
    pagina.insert_font(fontname=alias, fontbuffer=fuente.buffer)
    if estrechar < 1.0:
        pagina.insert_text(punto, texto, fontname=alias, fontsize=tamano, color=(0, 0, 0),
                           morph=(pymupdf.Point(punto), pymupdf.Matrix(estrechar, 1)))
    else:
        pagina.insert_text(punto, texto, fontname=alias, fontsize=tamano, color=(0, 0, 0))


def escribir_en_ancho(pagina, punto, texto, fuente, ancho, tamano, minimo):
    """Escribe el texto sin pasar del ancho disponible, para que nunca pise el texto vecino.

    Primero reduce el tamaño hasta el mínimo legible; si aun así no cabe, lo estrecha en horizontal lo justo.
    Devuelve el tamaño usado.
    """
    tamano = ajustar_tamano(fuente, texto, ancho, tamano, minimo)
    largo = fuente.text_length(texto, fontsize=tamano)
    escribir(pagina, punto, texto, fuente, tamano, estrechar=min(1.0, ancho / largo) if largo > 0 else 1.0)
    return tamano


def es_negrita(span):
    return "Bold" in span["font"] or bool(span["flags"] & 16)


def es_titulo(texto, spans):
    """Títulos y subtítulos: en mayúsculas o todo en negrita."""
    letras = [c for c in texto if c.isalpha()]
    if letras and sum(c.isupper() for c in letras) / len(letras) > 0.8:
        return True
    return all(es_negrita(s) for s in spans)


def justificar(doc, tamano=9.0):
    """Justifica las líneas de cuerpo (del tamaño indicado) que continúan un párrafo.

    No cambia saltos de línea ni posiciones: solo reparte el espacio sobrante entre palabras.
    Se omiten títulos, líneas dentro de tablas o rectángulos dibujados, y la última línea de cada párrafo.
    """
    regular, negrita = fuentes_inter()
    fuentes = {False: regular, True: negrita}
    for numero, pg in enumerate(doc):
        # Se ignoran los fondos de página completa; sí cuentan tablas y filetes.
        dibujos = [d["rect"] for d in pg.get_drawings() if not (d["rect"].width > 500 and d["rect"].height > 600)]
        bloques = [b for b in pg.get_text("dict")["blocks"] if b.get("type") == 0]
        lineas = [l for b in bloques for l in b["lines"] if any(s["text"].strip() for s in l["spans"])]
        candidatas = []
        for b in bloques:
            ancho_bloque = b["bbox"][2]
            for l in b["lines"]:
                spans = [s for s in l["spans"] if s["text"].strip()]
                if not spans or any(abs(s["size"] - tamano) > 0.15 for s in spans):
                    continue
                texto = "".join(s["text"] for s in spans)
                if len(texto.split()) < 6 or es_titulo(texto, spans):
                    continue
                rect = pymupdf.Rect(l["bbox"])
                if any(rect.intersects(r + (-0.5, -0.5, 0.5, 0.5)) for r in dibujos):
                    continue
                # ¿hay otra línea debajo que continúe el párrafo?
                continua = any(
                    abs(o["bbox"][0] - l["bbox"][0]) < 2 and 0 < o["bbox"][1] - l["bbox"][1] < 24
                    for o in lineas
                )
                if not continua:
                    continue
                candidatas.append((rect, spans, l, ancho_bloque))
        if not candidatas:
            continue
        # Tokens (palabra, negrita) de cada línea y su espacio sobrante
        planes = []
        for rect, spans, l, ancho_bloque in candidatas:
            # El bloque de PyMuPDF puede ser tan ancho como su línea más larga: se usa el borde derecho de la columna.
            borde = max([ancho_bloque] + [o["bbox"][2] for o in lineas if abs(o["bbox"][0] - rect.x0) < 2])
            tokens = []
            for s in spans:
                for palabra in s["text"].split():
                    tokens.append((palabra, es_negrita(s)))
            if len(tokens) < 2:
                continue
            espacio_normal = fuentes[False].text_length(" ", fontsize=tamano)
            natural = sum(fuentes[neg].text_length(t, fontsize=tamano) for t, neg in tokens) + espacio_normal * (len(tokens) - 1)
            objetivo = borde - rect.x0
            sobrante = objetivo - natural
            if sobrante <= 0 or sobrante > 0.25 * objetivo:
                continue
            planes.append((rect, tokens, espacio_normal + sobrante / (len(tokens) - 1), spans[0]["origin"][1], rect.x0))
        if not planes:
            continue
        for rect, *_ in planes:
            pg.add_redact_annot(rect, fill=None)
        pg.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE, graphics=pymupdf.PDF_REDACT_LINE_ART_NONE)
        alias = {}
        for neg in (False, True):
            alias[neg] = f"JUS{numero}{int(neg)}"
            pg.insert_font(fontname=alias[neg], fontbuffer=fuentes[neg].buffer)
        for rect, tokens, espacio, base, x in planes:
            cursor = x
            for i, (palabra, neg) in enumerate(tokens):
                pg.insert_text((cursor, base), palabra, fontname=alias[neg], fontsize=tamano, color=(0, 0, 0))
                cursor += fuentes[neg].text_length(palabra, fontsize=tamano)
                if i < len(tokens) - 1:
                    cursor += espacio


def poner_firmas(doc, cajas, firma_png):
    """Copia la firma del cliente en cada caja: lista de (página, (x0, y0, x1, y1))."""
    if not firma_png:
        return
    for pag, (x0, y0, x1, y1) in cajas:
        pg = doc[pag]
        # Blanco dentro del marco: tapa la marca de agua de la plantilla, sin tocar el borde
        pg.draw_rect(pymupdf.Rect(x0 + 1.5, y0 + 1.5, x1 - 1.5, y1 - 1.5), color=None, fill=(1, 1, 1))
        caja = pymupdf.Rect(x0 + 6, y0 + 4, x1 - 6, y1 - 4)
        pg.insert_image(caja, filename=firma_png, keep_proportion=True)
