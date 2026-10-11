#!/usr/bin/env python3
"""Genera public_html/en.html (versión en inglés) a partir de public_html/index.html.

Uso:  python3 tools/build-en.py
Cada texto visible o atributo (alt, aria-label, placeholder…) se busca en tools/en.json.
Si cambias un texto en index.html, agrega su traducción a en.json y vuelve a ejecutar.
El script avisa de los textos en español que quedaron sin traducir.
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'public_html', 'index.html')
OUT = os.path.join(ROOT, 'public_html', 'en.html')
EN = json.load(open(os.path.join(ROOT, 'tools', 'en.json'), encoding='utf-8'))

html = open(SRC, encoding='utf-8').read()
cut = html.index('<body')
head, body = html[:cut], html[cut:]
missing = []

def tr(text):
    core = text.strip()
    if core in EN:
        return text.replace(core, EN[core], 1)
    if re.search(r'[áéíóúñ¿¡]', core):
        missing.append(core)
    return text

# Texto entre etiquetas (sin tocar <script> ni el sprite de íconos)
parts = re.split(r'(?s)(<script.*?</script>|<svg class="sprite".*?</svg>)', body)
for i in range(0, len(parts), 2):
    parts[i] = re.sub(r'>([^<>]+)<', lambda m: '>' + tr(m.group(1)) + '<', parts[i])
    parts[i] = re.sub(r'\b(alt|aria-label|placeholder|title|data-say|data-label)="([^"]+)"',
                      lambda m: '%s="%s"' % (m.group(1), tr(m.group(2))), parts[i])
body = ''.join(parts)

# Cabecera: idioma, título, metadatos y enlaces alternos
head = head.replace('<html lang="es-419"', '<html lang="en"')
head = re.sub(r'(<meta (?:name|property)="(?:description|og:title|og:description|og:image:alt)" content=")([^"]*)(")',
              lambda m: m.group(1) + tr(m.group(2)) + m.group(3), head)
head = head.replace('content="es_LA"', 'content="en_US"')
head = head.replace('<link rel="canonical" href="https://landing.agoradigital.app/">',
                    '<link rel="canonical" href="https://landing.agoradigital.app/en.html">')
head = head.replace('<meta property="og:url" content="https://landing.agoradigital.app/">',
                    '<meta property="og:url" content="https://landing.agoradigital.app/en.html">')
head = head.replace('"inLanguage":"es-419"', '"inLanguage":"en"').replace('"availableLanguage":["es"]', '"availableLanguage":["es","en"]')
head = head.replace('"slogan":"Cada conversación, una oportunidad."', '"slogan":"Every conversation, an opportunity."')
head = head.replace('"description":"CRM con WhatsApp, Athena (agente de IA) y finanzas para pymes: conversaciones, seguimiento, contratos y cobranza en un solo lugar."',
                    '"description":"CRM with WhatsApp, Athena (AI agent) and finance for small businesses: conversations, follow-up, contracts and collections in one place."')

# Selector de idioma: en la versión inglesa apunta al español
body = body.replace('<a class="lang-btn" href="en.html" hreflang="en" lang="en" aria-label="Read this page in English">EN</a>',
                    '<a class="lang-btn" href="index.html" hreflang="es" lang="es" aria-label="Ver esta página en español">ES</a>')
body = body.replace('<a class="m-lang" href="en.html" hreflang="en" lang="en">English</a>',
                    '<a class="m-lang" href="index.html" hreflang="es" lang="es">Español</a>')

open(OUT, 'w', encoding='utf-8').write(head + body)
if missing:
    print('Sin traducir (%d):' % len(set(missing)))
    for m in sorted(set(missing)):
        print('  -', m)
    sys.exit(1)
print('en.html generado')
