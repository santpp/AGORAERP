"""
Genera plantillas/pruebas/sintetico.pdf: un «contrato» de prueba sin datos de ningún cliente, para que la
integración continua pueda probar el motor de PDF (los originales de las empresas no están en Git).

Uso:  python3 tools/pdf/pruebas/generar_sintetico.py
El PDF generado se sube a Git; solo hace falta volver a generarlo si cambia este script.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pymupdf  # noqa: E402

from motor import CARPETA_PLANTILLAS, FUENTE_INTER_B, FUENTE_INTER_R  # noqa: E402

SALIDA = os.path.join(CARPETA_PLANTILLAS, "pruebas", "sintetico.pdf")

PARRAFO = ("El cliente se compromete a pagar las cuotas en las fechas indicadas en el cronograma de este "
           "convenio de prueba, sin que este texto tenga valor legal alguno. Este párrafo existe solo para "
           "comprobar que el motor justifica las líneas de cuerpo que continúan un párrafo y deja intactos los "
           "títulos y la última línea, tal como hace con los contratos reales de cada empresa.")


def generar():
    doc = pymupdf.open()
    p = doc.new_page(width=612, height=792)
    p.insert_font(fontname="IR", fontfile=FUENTE_INTER_R)
    p.insert_font(fontname="IB", fontfile=FUENTE_INTER_B)
    p.insert_text((50, 60), "CONVENIO DE PRUEBA", fontname="IB", fontsize=14)
    p.insert_text((50, 100), "Yo, NOMBRE DE EJEMPLO, cédula 00000000, acepto este convenio.", fontname="IR", fontsize=9)
    p.insert_text((50, 118), "Cuota mensual: 999 por 99 meses.", fontname="IR", fontsize=9)
    p.insert_text((50, 150), "CLÁUSULA 1: PAGOS", fontname="IB", fontsize=9)
    p.insert_textbox(pymupdf.Rect(50, 158, 560, 230), PARRAFO, fontname="IR", fontsize=9, lineheight=1.6)
    p.insert_text((50, 260), "En la ciudad de Prueba, a los 99 días del mes de ejemplo del año 2099", fontname="IR", fontsize=9)
    # Caja de firma: marco gris como en los contratos reales
    p.draw_rect(pymupdf.Rect(50, 300, 250, 350), color=(0.8, 0.8, 0.85), width=0.75)
    p.insert_text((50, 365), "Firma del cliente", fontname="IR", fontsize=8)
    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    doc.set_metadata({"title": "Convenio de prueba", "creator": "generar_sintetico.py", "producer": "plataforma",
                      "creationDate": "D:20260101000000", "modDate": "D:20260101000000"})
    doc.subset_fonts()
    doc.save(SALIDA, garbage=4, deflate=True, no_new_id=True)
    print(SALIDA)


if __name__ == "__main__":
    generar()
