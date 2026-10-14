"""
Llena el convenio ORIGINAL (PDF de ASOCIM) con los datos de cada contrato.

Solo cambia el texto variable: el resto del PDF (logo, pie de página, líneas
de la tabla, cajas de firma, tipografías) queda intacto.

Uso:
  python3 llenar_convenio.py datos.json salida.pdf [firma.png]
"""
import json
import sys

import pymupdf

ORIGINAL = "/home/user/AGORAERP/contratos/plantillas/convenio_original.pdf"
FUENTE_INTER_R = "/usr/share/fonts/opentype/inter/Inter-Regular.otf"
FUENTE_INTER_B = "/usr/share/fonts/opentype/inter/Inter-Bold.otf"

MESES = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio",
         "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]
# Filas de la tabla (página 8): línea base de la fila 1 y alto de fila
FILA_1_BASE = 75.8
ALTO_FILA = 23.25
COL_N, COL_MES, COL_ANIO, COL_MOD = 61.5, 129.9, 231.4, 373.8
FILAS_TABLA = 20           # filas con línea en el formato original
# Cajas de firma del cliente (puntos PDF, origen arriba-izquierda): página, rectángulo
CAJAS_CLIENTE = [
    (1, (473, 79, 569, 104)),     # cláusula 3 (página 2)
    (5, (361, 361, 502, 391)),    # cláusula 9 (página 6)
    (5, (48, 661, 297, 704)),     # estudiante (página 6)
]


def base_de(rect, tamano):
    return rect.y1 - 0.244 * tamano


def buscar(pagina, texto, zona=None, nth=0):
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
    pagina.add_redact_annot(rect, fill=None)


_ALIAS = {}


def escribir(pagina, punto, texto, fuente, tamano, centro=None):
    if centro is not None:
        ancho = fuente.text_length(texto, fontsize=tamano)
        punto = (centro - ancho / 2, punto[1])
    alias = f"ZX{len(_ALIAS)}"
    _ALIAS[alias] = True
    pagina.insert_font(fontname=alias, fontbuffer=fuente.buffer)
    pagina.insert_text(punto, texto, fontname=alias, fontsize=tamano, color=(0, 0, 0))


def llenar(datos, salida, firma_png):
    doc = pymupdf.open(ORIGINAL)
    f_inter_r = pymupdf.Font(fontfile=FUENTE_INTER_R)
    f_inter_b = pymupdf.Font(fontfile=FUENTE_INTER_B)
    # Open Sans Regular del propio PDF (tiene todas las letras y números que se necesitan)
    xref_os = next(f[0] for f in doc[5].get_fonts(full=True) if f[3].endswith("OpenSans-Regular"))
    f_os = pymupdf.Font(fontbuffer=doc.extract_font(xref_os)[3])

    n = int(datos["meses"])
    if n > FILAS_TABLA:
        raise ValueError(f"Este formato admite hasta {FILAS_TABLA} meses por página de tabla.")

    # ----- página 1
    p = doc[0]
    cubrir(p, buscar(p, "doce (12) meses"))
    cubrir(p, buscar(p, "YULY EUNICE NAVAS CALLASPO"))
    cubrir(p, buscar(p, "14943155"))
    cubrir(p, buscar(p, "1.260"))
    cubrir(p, buscar(p, "105", zona=(500, 265, 560, 285)))
    r20 = buscar(p, "20$")
    cubrir(p, r20)
    p.apply_redactions(images=0, graphics=0, text=pymupdf.PDF_REDACT_TEXT_REMOVE)
    r = pymupdf.Rect(275.9, 162.3, 347.5, 173.2)
    escribir(p, (r.x0, base_de(r, 9)), f'{datos["meses_texto"]} ({n}) meses', f_inter_b, 9)
    escribir(p, (61.0, base_de(pymupdf.Rect(61.0, 108.3, 209.8, 119.2), 9)), datos["nombre"].upper(), f_inter_b, 9)
    escribir(p, (r20.x0, base_de(r20, 9)), datos["inscripcion"] + "$", f_inter_r, 9)
    x_ced = pymupdf.Rect(380.8, 108.3, 423.6, 119.2)
    escribir(p, (x_ced.x0, base_de(x_ced, 9)), datos["cedula"], f_inter_b, 9)
    x_pre = pymupdf.Rect(209.7, 270.3, 236.3, 281.2)
    escribir(p, (x_pre.x0, base_de(x_pre, 9)), datos["precio"], f_inter_b, 9)
    x_cuo = pymupdf.Rect(516.7, 270.3, 534.4, 281.2)
    escribir(p, (x_cuo.x0, base_de(x_cuo, 9)), datos["cuota"], f_inter_b, 9)

    # ----- página 6
    p = doc[5]
    zona_inscr = (40, 455, 200, 472)
    zona_desc = (40, 474, 200, 491)
    zona_mod = (160, 492, 240, 510)
    zona_fecha = (40, 547, 360, 562)
    rects = {
        "inscr": buscar(p, "0$", zona=zona_inscr),
        "desc": buscar(p, "0%", zona=zona_desc),
        "mod": buscar(p, "1 Cuota Mensual", zona=zona_mod),
        "dia": buscar(p, "13", zona=zona_fecha),
        "mes": buscar(p, "October", zona=zona_fecha),
        "anio": buscar(p, "2026", zona=zona_fecha),
        "nombre": buscar(p, "YULY EUNICE NAVAS CALLASPO", zona=(40, 615, 240, 640)),
        "cedula": buscar(p, "14943155 0412-5063751", zona=(40, 636, 240, 658)),
        "staff": buscar(p, "Maria Carvallo", zona=(300, 615, 420, 640)),
    }
    lineas = {k: origen_y(p, rc) for k, rc in rects.items()}
    for rc in rects.values():
        cubrir(p, rc)
    p.apply_redactions(images=0, graphics=0, text=pymupdf.PDF_REDACT_TEXT_REMOVE)
    def poner(clave, texto, fuente, tamano=9):
        escribir(p, (rects[clave].x0, lineas[clave]), texto, fuente, tamano)
    poner("inscr", datos["inscripcion"] + "$", f_inter_r)
    poner("desc", datos["descuento"] + "%", f_inter_r)
    poner("mod", datos["modalidad"], f_inter_b)
    poner("dia", datos["fecha_dia"], f_inter_r)
    poner("mes", datos["fecha_mes"].lower(), f_inter_r)
    poner("anio", datos["fecha_anio"], f_inter_r)
    escribir(p, (48.0, 633.0), datos["nombre"].upper(), f_os, 12)
    escribir(p, (48.0, 651.0), f'{datos["cedula"]} {datos["telefono"]}', f_os, 12)
    escribir(p, (310.1, 633.0), datos["staff"], f_os, 12)

    # ----- página 7 (anexo): se traslada a la página de la tabla y la página 7 se elimina
    p = doc[6]
    cubrir(p, buscar(p, "1 Cuota Mensual"))
    p.apply_redactions(images=0, graphics=0, text=pymupdf.PDF_REDACT_TEXT_REMOVE)
    r = buscar(p, "Elegida:"); escribir(p, (r.x1 + 3, base_de(r, 9)), datos["modalidad"], f_inter_r, 9)

    # ----- página 8 (tabla)
    p = doc[7]
    zona = pymupdf.Rect(50, 58, 430, 58 + FILAS_TABLA * ALTO_FILA)
    p.add_redact_annot(zona, fill=None)
    p.apply_redactions(images=0, graphics=0, text=pymupdf.PDF_REDACT_TEXT_REMOVE)
    for i, fila in enumerate(datos["cronograma"], start=1):
        base = FILA_1_BASE + (i - 1) * ALTO_FILA
        escribir(p, (0, base), str(i), f_os, 12, centro=COL_N)
        escribir(p, (0, base), fila["mes"], f_os, 12, centro=COL_MES)
        escribir(p, (0, base), fila["anio"], f_os, 12, centro=COL_ANIO)
        escribir(p, (0, base), fila["modalidad"], f_inter_b, 12, centro=COL_MOD)

    # ----- página 8: encabezado con logo (reducido al 80 %), anexo y tabla; la página 7 se elimina
    ESCALA = 0.8
    ALTO_ENCABEZADO = 110
    SUBIDA = 186
    tmp = pymupdf.open()
    tmp.insert_pdf(doc, from_page=6, to_page=7)       # copia de la página 7 (anexo con logo) y la 8 (tabla)
    nueva = doc.new_page(-1, width=612, height=792)
    # marca de agua: solo el logo grande central (recorte de la imagen de página del original)
    xref_fondo = doc[6].get_images(full=True)[0][0]
    import io
    from PIL import Image
    fondo = Image.open(io.BytesIO(doc.extract_image(xref_fondo)["image"])).convert("RGB")
    buf = io.BytesIO()
    # transparencia: el blanco del fondo desaparece y el color de la marca se conserva
    recorte = fondo.crop((263, 942, 1378, 1790)).convert("RGBA")
    alfa = recorte.convert("L").point(lambda v: 255 - v)
    recorte.putalpha(alfa)
    recorte.save(buf, format="PNG")
    nueva.show_pdf_page(pymupdf.Rect(32, 14, 32 + 535 * ESCALA, 14 + 96 * ESCALA), tmp, 0,
                        clip=pymupdf.Rect(40, 18, 575, 114))
    nueva.show_pdf_page(pymupdf.Rect(0, SUBIDA, 612, 792), tmp, 1, clip=pymupdf.Rect(0, 0, 612, 792 - SUBIDA))
    nueva.insert_image(pymupdf.Rect(97.3, 318.4, 509.9, 605.3), stream=buf.getvalue(), overlay=True)
    tmp.close()
    doc.delete_page(7)
    doc.delete_page(6)
    pa = doc[6]
    escribir(pa, (0, 108), "ANEXO ÚNICO: CONTROL MANUAL DE PAGOS", f_inter_b, 9, centro=306)
    escribir(pa, (60, 128), "Este anexo complementa el Convenio de Pago y sirve como registro digital de la modalidad de pago", f_inter_r, 9)
    escribir(pa, (60, 140), "elegida por EL ESTUDIANTE/REPRESENTANTE y la consecuente imputación de los pagos recibidos, en", f_inter_r, 9)
    escribir(pa, (60, 152), "consonancia con la Cláusula 2 (Forma y Término de Pago).", f_inter_r, 9)
    escribir(pa, (60, 170), "Modalidad de Pago Elegida: " + datos["modalidad"] + ".", f_inter_r, 9)

    # ----- firmas del cliente: una sola firma copiada en las tres cajas
    if firma_png:
        for pag, (x0, y0, x1, y1) in CAJAS_CLIENTE:
            pg = doc[pag]
            pg.draw_rect(pymupdf.Rect(x0 + 1.5, y0 + 1.5, x1 - 1.5, y1 - 1.5), color=None, fill=None)
            caja = pymupdf.Rect(x0 + 6, y0 + 4, x1 - 6, y1 - 4)
            pg.insert_image(caja, filename=firma_png, keep_proportion=True)

    doc.save(salida, garbage=3, deflate=True)
    doc.close()


if __name__ == "__main__":
    datos = json.load(open(sys.argv[1], encoding="utf-8"))
    llenar(datos, sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
    print("ok", sys.argv[2])
