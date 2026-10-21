"""
Formato de prueba sobre plantillas/pruebas/sintetico.pdf (sin datos de clientes).

Ejercita todo el motor (buscar, borrar, escribir en la línea base, ajustar tamaño, justificar y firmas) para
que la integración continua detecte cualquier cambio de comportamiento sin necesitar los PDF de las empresas.
"""
import os

import pymupdf

from motor import (CARPETA_PLANTILLAS, aplicar_borrado, buscar, cubrir, escribir, escribir_en_ancho, fuentes_inter,
                   justificar, origen_y, poner_firmas)

NOMBRE = "Prueba · Convenio sintético"
ORIGINAL = os.path.join(CARPETA_PLANTILLAS, "pruebas", "sintetico.pdf")
MAX_MESES = 99
CAJAS_CLIENTE = [(0, (50, 300, 250, 350))]


def llenar(datos, salida, firma_png):
    doc = pymupdf.open(ORIGINAL)
    regular, negrita = fuentes_inter()
    p = doc[0]
    campos = {
        "nombre": buscar(p, "NOMBRE DE EJEMPLO", zona=(40, 85, 580, 105)),
        "cedula": buscar(p, "00000000", zona=(40, 85, 580, 105)),
        "cuota": buscar(p, "999", zona=(40, 105, 580, 122)),
        "meses": buscar(p, "99 meses.", zona=(40, 105, 580, 122)),
        "cierre": buscar(p, "En la ciudad de Prueba", zona=(40, 248, 580, 265)),
    }
    bases = {k: origen_y(p, r) for k, r in campos.items()}
    for r in campos.values():
        cubrir(p, r)
    cubrir(p, pymupdf.Rect(campos["cierre"].x0 - 1, campos["cierre"].y0, 580, campos["cierre"].y1))
    aplicar_borrado(p)

    escribir_en_ancho(p, (campos["nombre"].x0, bases["nombre"]), datos["nombre"].upper(), negrita,
                      campos["nombre"].width, 9, 7)
    escribir(p, (campos["cedula"].x0, bases["cedula"]), datos["cedula"], negrita, 9)
    escribir(p, (campos["cuota"].x0, bases["cuota"]), datos["cuota"], negrita, 9)
    escribir(p, (campos["meses"].x0, bases["meses"]), f'{datos["meses"]} meses.', regular, 9)
    escribir(p, (campos["cierre"].x0, bases["cierre"]),
             f'En la ciudad de Prueba, a los {datos["fecha_dia"]} días del mes de {datos["fecha_mes"].lower()} '
             f'del año {datos["fecha_anio"]}', regular, 9)

    poner_firmas(doc, CAJAS_CLIENTE, firma_png)
    justificar(doc)
    doc.save(salida, garbage=3, deflate=True)
    doc.close()
