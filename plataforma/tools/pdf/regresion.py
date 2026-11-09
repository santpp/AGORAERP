"""
Pruebas de regresión de los formatos de PDF.

Cada caso es una carpeta casos/<formato>/<caso>/ con:
  datos.json      datos del contrato (como los que envía PHP)
  firma           (opcional) archivo vacío: si existe, se firma con firma_ejemplo.png
  esperado.json   huella aprobada del PDF

Uso:
  python3 regresion.py                      prueba todos los formatos
  python3 regresion.py asocim_convenio      prueba un formato
  python3 regresion.py asocim_convenio --aprobar   guarda las huellas actuales como aprobadas
  python3 regresion.py --estricto           falla también si falta el PDF original de un formato
Los PDF originales de las empresas no están en Git: sin el original, el formato se omite (en la integración
continua solo se prueba el formato sintético). En el servidor, usar --estricto.
"""
import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from huella import diferencias, huella  # noqa: E402
from llenar_convenio import cargar_formato  # noqa: E402

AQUI = os.path.dirname(os.path.abspath(__file__))
CASOS = os.path.join(AQUI, "casos")
FIRMA = os.path.join(AQUI, "firma_ejemplo.png")


def probar(formato, aprobar, estricto):
    modulo = cargar_formato(formato)
    carpeta = os.path.join(CASOS, formato)
    fallos = 0
    if not os.path.exists(modulo.ORIGINAL):
        print(f"{'FALLA' if estricto else 'OMITIDO':<9} {formato}: falta el PDF original ({os.path.relpath(modulo.ORIGINAL)})")
        return 1 if estricto else 0
    for caso in sorted(os.listdir(carpeta)):
        dir_caso = os.path.join(carpeta, caso)
        datos = json.load(open(os.path.join(dir_caso, "datos.json"), encoding="utf-8"))
        firma = FIRMA if os.path.exists(os.path.join(dir_caso, "firma")) else None
        with tempfile.TemporaryDirectory() as tmp:
            salida = os.path.join(tmp, "salida.pdf")
            modulo.llenar(datos, salida, firma)
            obtenida = huella(salida)
        ruta_esperada = os.path.join(dir_caso, "esperado.json")
        if aprobar:
            json.dump(obtenida, open(ruta_esperada, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
            print(f"APROBADO  {formato}/{caso}")
            continue
        esperada = json.load(open(ruta_esperada, encoding="utf-8"))
        if esperada == obtenida:
            print(f"OK        {formato}/{caso}")
        else:
            fallos += 1
            print(f"FALLA     {formato}/{caso}")
            for linea in diferencias(esperada, obtenida):
                print("          " + linea)
    return fallos


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    aprobar = "--aprobar" in sys.argv
    estricto = "--estricto" in sys.argv
    formatos = args or sorted(os.listdir(CASOS))
    total = sum(probar(f, aprobar, estricto) for f in formatos)
    sys.exit(1 if total else 0)
