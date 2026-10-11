#!/bin/sh
# Arma index.html, styles.css y app.js desde src/. Uso: sh build.sh
set -e
cd "$(dirname "$0")"
V=$(date +%Y%m%d%H%M)
cat src/base.css src/extras.css > styles.css
cat src/base.js src/extras.js src/extras2.js > app.js
python3 - "$V" <<'PY'
import sys
p=open('src/page.html').read().replace('{{SECTIONS}}',open('src/sections.html').read()).replace('{{MID}}',open('src/mid.html').read()).replace('{{V}}',sys.argv[1])
open('index.html','w').write(p)
PY
echo "build $V"
