"""
Huella de un PDF para pruebas de regresión: número de páginas y, por página, cada palabra con su
posición (redondeada a 0,1 pt) y cada imagen con su rectángulo. Dos PDF con la misma huella se ven igual.
"""
import pymupdf


def huella(ruta):
    doc = pymupdf.open(ruta)
    paginas = []
    for p in doc:
        palabras = [[round(w[0], 1), round(w[1], 1), round(w[2], 1), round(w[3], 1), w[4]] for w in p.get_text("words")]
        imagenes = [[round(v, 1) for v in p.get_image_bbox(i)] for i in p.get_images(full=True)]
        paginas.append({"palabras": palabras, "imagenes": imagenes})
    doc.close()
    return {"paginas": len(paginas), "contenido": paginas}


def diferencias(esperada, obtenida, maximo=15):
    """Lista legible de las primeras diferencias entre dos huellas."""
    salida = []
    if esperada["paginas"] != obtenida["paginas"]:
        salida.append(f"páginas: se esperaban {esperada['paginas']}, hay {obtenida['paginas']}")
    for n, (a, b) in enumerate(zip(esperada["contenido"], obtenida["contenido"]), start=1):
        if a["imagenes"] != b["imagenes"]:
            salida.append(f"página {n}: imágenes distintas")
        pa = {tuple(w) for w in a["palabras"]}
        pb = {tuple(w) for w in b["palabras"]}
        for w in sorted(pa - pb)[:maximo]:
            salida.append(f"página {n}: falta «{w[4]}» en ({w[0]}, {w[1]})")
        for w in sorted(pb - pa)[:maximo]:
            salida.append(f"página {n}: sobra «{w[4]}» en ({w[0]}, {w[1]})")
    return salida[:maximo * 2]
