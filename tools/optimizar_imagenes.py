"""Genera una versión WebP junto a cada JPG/PNG de public/ (idempotente: solo las que faltan).

El build (src/lib/fixes.ts) sirve la .webp en lugar del original cuando existe; si la WebP no
reduce el peso al menos un 10 %, no se crea y se sigue usando el original.
Se ejecuta a mano tras añadir imágenes y automáticamente en cada sincronización con WordPress.

Uso:  python3 tools/optimizar_imagenes.py      (requiere Pillow)
"""
import os
import sys

from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public')
DIRS = ('wp-content/uploads', 'wp-content/themes', 'assets/img', 'assets/recursos')
EXT = ('.jpg', '.jpeg', '.png')
SKIP_MARK = '.nowebp'  # archivo vacío junto al original: la WebP no compensaba
MAX_SIDE = 2560        # fotos de cámara enormes: se limitan a este lado en la versión WebP

made = skipped = 0
for d in DIRS:
    for root, _, files in os.walk(os.path.join(ROOT, d)):
        for fn in files:
            if not fn.lower().endswith(EXT):
                continue
            src = os.path.join(root, fn)
            webp = os.path.splitext(src)[0] + '.webp'
            mark = src + SKIP_MARK
            # Ya procesada (las fechas de archivo no sirven: git no las conserva).
            if os.path.exists(webp) or os.path.exists(mark):
                continue
            try:
                im = Image.open(src)
                im.load()
            except Exception as e:  # noqa: BLE001
                print('  no se pudo leer', src, e, file=sys.stderr)
                continue
            if max(im.size) > MAX_SIDE:
                im.thumbnail((MAX_SIDE, MAX_SIDE))
            has_alpha = im.mode in ('RGBA', 'LA') or (im.mode == 'P' and 'transparency' in im.info)
            im = im.convert('RGBA' if has_alpha else 'RGB')
            tmp = webp + '.tmp'
            if fn.lower().endswith('.png') and has_alpha:
                im.save(tmp, 'WEBP', quality=90, method=6)  # logos/ilustraciones con transparencia
            else:
                im.save(tmp, 'WEBP', quality=80, method=6)
            if os.path.getsize(tmp) < 0.9 * os.path.getsize(src):
                os.replace(tmp, webp)
                made += 1
            else:
                os.remove(tmp)
                open(mark, 'w').close()
                if os.path.exists(webp):
                    os.remove(webp)
                skipped += 1
print(f'WebP generadas: {made} · sin ventaja (se usa el original): {skipped}')

# Fondos de las hojas de estilo del tema: url(...jpg|png) → .webp cuando existe.
# (Esas CSS vienen del WordPress y la sincronización las sobrescribe; por eso se hace aquí, después.)
import re  # noqa: E402

CSS = ('wp-content/themes/fem-conversion-theme/style.css',
       'wp-content/themes/fem-conversion-theme/assets/css/custom.css',
       'assets/recursos/recursos.css')
pat = re.compile(r"(url\(\s*['\"]?)(/[^'\")?#]+?)\.(?:jpe?g|png)(?=['\")?#])", re.I)
for rel in CSS:
    p = os.path.join(ROOT, rel)
    if not os.path.exists(p):
        continue
    css = open(p, encoding='utf-8').read()
    out = pat.sub(lambda m: m.group(1) + m.group(2) + '.webp'
                  if os.path.exists(os.path.join(ROOT, m.group(2).lstrip('/') + '.webp')) else m.group(0), css)
    if out != css:
        open(p, 'w', encoding='utf-8').write(out)
        print('CSS con fondos WebP:', rel)
