"""
Llena un convenio en PDF con los datos de un contrato.

Cada contrato de cada empresa tiene su propio formato calibrado a mano en formatos/<nombre>.py
(guía: CALIBRACION.md). El formato se elige con la clave "formato" de los datos; sin ella se usa
el convenio de ASOCIM.

Uso:
  python3 llenar_convenio.py datos.json salida.pdf [firma.png]
"""
import importlib
import json
import os
import re
import sys

# El directorio del script se añade a mano: con python -I no está en sys.path.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

FORMATO_POR_DEFECTO = "asocim_convenio"


def cargar_formato(nombre):
    """Módulo del formato. Solo nombres simples: nada de rutas ni módulos internos (los que empiezan por _)."""
    if not re.fullmatch(r"[a-z0-9][a-z0-9_]*", nombre or ""):
        raise ValueError(f"Nombre de formato no válido: {nombre!r}")
    return importlib.import_module(f"formatos.{nombre}")


def llenar(datos, salida, firma_png):
    formato = cargar_formato(datos.get("formato") or FORMATO_POR_DEFECTO)
    formato.llenar(datos, salida, firma_png)


if __name__ == "__main__":
    datos = json.load(open(sys.argv[1], encoding="utf-8"))
    llenar(datos, sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
    print("ok", sys.argv[2])
