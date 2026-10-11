#!/bin/sh
# Arma index.html, styles.css y app.js desde src/. Uso: sh build.sh
set -e
cd "$(dirname "$0")"
V=$(date +%Y%m%d%H%M)
cat src/v1.css src/compat.css src/sections.css > styles.css
cat src/v1.js src/extras2.js > app.js
python3 - "$V" <<'PY'
import sys
p=open('src/page.html').read().replace('{{SECTIONS}}',open('src/sections.html').read()).replace('{{V}}',sys.argv[1])
open('index.html','w').write(p)
PY
echo "build $V"
