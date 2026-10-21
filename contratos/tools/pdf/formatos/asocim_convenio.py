"""
ASOCIM · Convenio de pago (Academic & Sociocultural Institute of Modern Languages ASOCIM C.A.).

Calibración a mano sobre el PDF original de ASOCIM (plantillas/convenio_original.pdf, 8 páginas).
El resultado tiene 6 páginas: la cláusula 3 cabe en la página 1 y el anexo comparte página con la tabla.
Coordenadas en puntos PDF, origen arriba a la izquierda.
"""
import io
import os

import pymupdf
from PIL import Image

from motor import (CARPETA_PLANTILLAS, ajustar_tamano, aplicar_borrado, base_de, buscar, cubrir, es_negrita,
                   escribir, fuentes_inter, justificar, origen_y, poner_firmas)

NOMBRE = "ASOCIM · Convenio de pago"
ORIGINAL = os.path.join(CARPETA_PLANTILLAS, "convenio_original.pdf")

# Filas de la tabla (página 8 del original): línea base de la fila 1 y alto de fila
FILA_1_BASE = 75.8
ALTO_FILA = 23.25
COL_N, COL_MES, COL_ANIO, COL_MOD = 61.5, 129.9, 231.4, 373.8
FILAS_TABLA = 20           # filas con línea en el formato original
MAX_MESES = FILAS_TABLA
# Cajas de firma del cliente (páginas del documento antes de borrar la página 2)
CAJAS_CLIENTE = [
    (0, (473, 696, 569, 720)),    # cláusula 3 (página 1, junto a la última línea)
    (5, (361, 361, 502, 391)),    # cláusula 9 (página 6)
    (5, (48, 661, 297, 704)),     # estudiante (página 6)
]


def subir_clausula_3(doc):
    """Sube el título y el párrafo de la cláusula 3 y trae a la página 1 las líneas que estaban en la 2.

    La página 2 solo tenía el final de la cláusula 3 y la caja de firma; se elimina al final.
    """
    subida = 20
    f_regular, f_bold = fuentes_inter()
    p = doc[0]
    lineas = [
        l for b in p.get_text("dict")["blocks"] if b.get("type") == 0
        for l in b["lines"] if 610 < l["bbox"][1] < 680
    ]
    for l in lineas:
        cubrir(p, pymupdf.Rect(l["bbox"]))
    aplicar_borrado(p)
    for l in lineas:
        for s in l["spans"]:
            if not s["text"].strip():
                continue
            fuente = f_bold if es_negrita(s) else f_regular
            escribir(p, (s["origin"][0], s["origin"][1] - subida), s["text"], fuente, 9)
    # Líneas sobrantes (página 2) copiadas tal cual: la primera queda 18 pt (interlineado) bajo la última de la cláusula
    primera_destino = 666.3 - subida + 18.0
    desplazamiento = primera_destino - 37.0
    original = pymupdf.open(ORIGINAL)
    p.show_pdf_page(pymupdf.Rect(0, 30 + desplazamiento, 612, 69 + desplazamiento), original, 1, clip=pymupdf.Rect(0, 30, 612, 69))
    p.show_pdf_page(pymupdf.Rect(0, 70 + desplazamiento, 320, 90 + desplazamiento), original, 1, clip=pymupdf.Rect(0, 70, 320, 90))
    original.close()
    p.draw_rect(pymupdf.Rect(473.6, 696, 568.9, 720), color=(0.9176, 0.9255, 0.9412), width=0.75)


def llenar(datos, salida, firma_png):
    doc = pymupdf.open(ORIGINAL)
    f_inter_r, f_inter_b = fuentes_inter()
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
    aplicar_borrado(p)
    r = pymupdf.Rect(275.9, 162.3, 347.5, 173.2)
    escribir(p, (r.x0, base_de(r, 9)), f'{datos["meses_texto"]} ({n}) meses', f_inter_b, 9)
    nombre = datos["nombre"].upper()
    tamano_nombre = ajustar_tamano(f_inter_b, nombre, 209.8 - 61.0 - 2, 9, 7)
    escribir(p, (61.0, base_de(pymupdf.Rect(61.0, 108.3, 209.8, 119.2), tamano_nombre)), nombre, f_inter_b, tamano_nombre)
    escribir(p, (r20.x0, base_de(r20, 9)), datos["inscripcion"] + "$", f_inter_r, 9)
    x_ced = pymupdf.Rect(380.8, 108.3, 423.6, 119.2)
    escribir(p, (x_ced.x0, base_de(x_ced, 9)), datos["cedula"], f_inter_b, 9)
    x_pre = pymupdf.Rect(209.7, 270.3, 236.3, 281.2)
    escribir(p, (x_pre.x0, base_de(x_pre, 9)), datos["precio"], f_inter_b, 9)
    x_cuo = pymupdf.Rect(516.7, 270.3, 534.4, 281.2)
    escribir(p, (x_cuo.x0, base_de(x_cuo, 9)), datos["cuota"], f_inter_b, 9)
    subir_clausula_3(doc)

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
    aplicar_borrado(p)

    def poner(clave, texto, fuente, tamano=9):
        escribir(p, (rects[clave].x0, lineas[clave]), texto, fuente, tamano)
    poner("inscr", datos["inscripcion"] + "$", f_inter_r)
    poner("desc", datos["descuento"] + "%", f_inter_r)
    poner("mod", datos["modalidad"], f_inter_b)
    poner("dia", datos["fecha_dia"], f_inter_r)
    poner("mes", datos["fecha_mes"].lower(), f_inter_r)
    poner("anio", datos["fecha_anio"], f_inter_r)
    # Inter, no Open Sans: la fuente embebida del original no tiene todas las letras (p. ej. la "d" minúscula)
    nombre_firma = datos["nombre"].upper()
    escribir(p, (48.0, 633.0), nombre_firma, f_inter_r, ajustar_tamano(f_inter_r, nombre_firma, 300 - 48 - 4, 12, 9))
    escribir(p, (48.0, 651.0), f'{datos["cedula"]} {datos["telefono"]}', f_inter_r, 12)
    escribir(p, (310.1, 633.0), datos["staff"], f_inter_r, 12)

    # ----- página 7 (anexo): se traslada a la página de la tabla y la página 7 se elimina
    p = doc[6]
    cubrir(p, buscar(p, "1 Cuota Mensual"))
    aplicar_borrado(p)
    r = buscar(p, "Elegida:")
    escribir(p, (r.x1 + 3, base_de(r, 9)), datos["modalidad"], f_inter_r, 9)

    # ----- página 8 (tabla)
    p = doc[7]
    zona = pymupdf.Rect(50, 58, 430, 58 + FILAS_TABLA * ALTO_FILA)
    cubrir(p, zona)
    aplicar_borrado(p)
    for i, fila in enumerate(datos["cronograma"], start=1):
        base = FILA_1_BASE + (i - 1) * ALTO_FILA
        escribir(p, (0, base), str(i), f_os, 12, centro=COL_N)
        escribir(p, (0, base), fila["mes"], f_os, 12, centro=COL_MES)
        escribir(p, (0, base), fila["anio"], f_os, 12, centro=COL_ANIO)
        escribir(p, (0, base), fila["modalidad"], f_inter_b, 12, centro=COL_MOD)

    # ----- página 8: encabezado con logo (reducido al 80 %), anexo y tabla; la página 7 se elimina
    escala = 0.8
    subida = 186
    tmp = pymupdf.open()
    tmp.insert_pdf(doc, from_page=6, to_page=7)       # copia de la página 7 (anexo con logo) y la 8 (tabla)
    nueva = doc.new_page(-1, width=612, height=792)
    # marca de agua: solo el logo grande central (recorte de la imagen de página del original)
    xref_fondo = doc[6].get_images(full=True)[0][0]
    fondo = Image.open(io.BytesIO(doc.extract_image(xref_fondo)["image"])).convert("RGB")
    buf = io.BytesIO()
    # transparencia: el blanco del fondo desaparece y el color de la marca se conserva
    recorte = fondo.crop((263, 942, 1378, 1790)).convert("RGBA")
    alfa = recorte.convert("L").point(lambda v: 255 - v)
    recorte.putalpha(alfa)
    recorte.save(buf, format="PNG")
    nueva.show_pdf_page(pymupdf.Rect(32, 14, 32 + 535 * escala, 14 + 96 * escala), tmp, 0,
                        clip=pymupdf.Rect(40, 18, 575, 114))
    nueva.show_pdf_page(pymupdf.Rect(0, subida, 612, 792), tmp, 1, clip=pymupdf.Rect(0, 0, 612, 792 - subida))
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
    poner_firmas(doc, CAJAS_CLIENTE, firma_png)

    # la página 2 quedó vacía: sus líneas y la caja de firma ya están en la página 1
    doc.delete_page(1)
    justificar(doc)
    doc.save(salida, garbage=3, deflate=True)
    doc.close()
