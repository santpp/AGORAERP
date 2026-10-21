"""
PLANTILLA para un formato nuevo: <EMPRESA> · <CONTRATO>.

Copia este archivo como formatos/<empresa>_<contrato>.py (minúsculas, sin acentos ni espacios)
y sigue CALIBRACION.md. Los archivos que empiezan por _ nunca se cargan como formato.
"""
import os

import pymupdf

from motor import (CARPETA_PLANTILLAS, ajustar_tamano, aplicar_borrado, base_de, buscar, cubrir, escribir,
                   fuentes_inter, justificar, origen_y, poner_firmas)

NOMBRE = "<Empresa> · <Contrato>"
# PDF original sin firmar que entrega la empresa (no se sube a Git)
ORIGINAL = os.path.join(CARPETA_PLANTILLAS, "<empresa>", "<contrato>.pdf")
MAX_MESES = 12
# Cajas de firma del cliente: (página desde 0, (x0, y0, x1, y1)), medidas con inspeccionar.py
CAJAS_CLIENTE = []


def llenar(datos, salida, firma_png):
    doc = pymupdf.open(ORIGINAL)
    regular, negrita = fuentes_inter()

    # ----- página 1
    p = doc[0]
    # 1. Marca con cubrir() el texto de ejemplo del original y bórralo una sola vez por página.
    #    Prefiere buscar() con una zona: si la empresa cambia el PDF, falla con un mensaje claro.
    nombre = buscar(p, "<NOMBRE DE EJEMPLO EN EL ORIGINAL>", zona=(0, 0, 612, 200))
    cubrir(p, nombre)
    aplicar_borrado(p)
    # 2. Escribe el dato en la línea base del original. ajustar_tamano() evita pisar el texto vecino.
    texto = datos["nombre"].upper()
    tamano = ajustar_tamano(negrita, texto, nombre.width, 9, 7)
    escribir(p, (nombre.x0, origen_y(p, nombre)), texto, negrita, tamano)

    # ----- páginas siguientes: mismo patrón (buscar, cubrir, aplicar_borrado, escribir)

    poner_firmas(doc, CAJAS_CLIENTE, firma_png)
    justificar(doc)            # quítalo si el contrato no debe justificarse
    doc.save(salida, garbage=3, deflate=True)
    doc.close()
