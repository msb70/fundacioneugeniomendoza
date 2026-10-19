"""Genera public/assets/fa/: Font Awesome Free reducido a los iconos que el sitio usa de verdad.

Antes cada página cargaba el Font Awesome completo desde cdnjs (CSS de ~100 KB que bloquea el
pintado + fuentes de ~150 KB cada una). Este script busca las clases fa-* en el contenido, el tema y
los scripts, y crea una hoja de estilos y unas fuentes con solo esos iconos. src/lib/fixes.ts sustituye
los enlaces de Font Awesome por /assets/fa/fa.css.

Se ejecuta en cada sincronización con WordPress (una entrada nueva puede traer iconos nuevos) y a mano
tras añadir iconos. Requiere: npm ci (paquete @fortawesome/fontawesome-free) y pip install fonttools brotli.
"""
import glob
import os
import re
import subprocess
import sys

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
FA = os.path.join(REPO, 'node_modules', '@fortawesome', 'fontawesome-free')
OUT = os.path.join(REPO, 'public', 'assets', 'fa')

css = open(os.path.join(FA, 'css', 'all.min.css'), encoding='utf-8').read()
css = re.sub(r'^/\*.*?\*/', '', css, flags=re.S)  # cabecera de licencia: se reescribe abajo

# Reglas de icono: ".fa-x:before,.fa-y:before{content:"\f000"}"
icon_rule = re.compile(r'((?:\.fa-[a-z0-9-]+:before,?)+)\{content:"\\([0-9a-f]+)"\}')
by_name = {}
for m in icon_rule.finditer(css):
    for name in re.findall(r'\.(fa-[a-z0-9-]+):before', m.group(1)):
        by_name[name] = m.group(2)

# Clases fa-* usadas en contenido, plantillas y scripts
sources = (glob.glob(os.path.join(REPO, 'src', '**', '*.*'), recursive=True)
           + glob.glob(os.path.join(REPO, 'public', '**', '*.js'), recursive=True)
           + glob.glob(os.path.join(REPO, 'public', '**', '*.html'), recursive=True))
used = set()
for f in sources:
    if '/node_modules/' in f or '/assets/fa/' in f or not os.path.isfile(f):
        continue
    try:
        txt = open(f, encoding='utf-8', errors='ignore').read()
    except OSError:
        continue
    used |= set(re.findall(r'\bfa-[a-z0-9-]+', txt)) & by_name.keys()
codepoints = sorted({by_name[n] for n in used})
if not codepoints:
    sys.exit('No se encontró ningún icono: revisar las rutas antes de publicar.')


def keep(m):
    names = re.findall(r'\.(fa-[a-z0-9-]+):before', m.group(1))
    return m.group(0) if any(n in used for n in names) else ''


small = icon_rule.sub(keep, css)
small = re.sub(r',?src:url\(\.\./webfonts/([a-z0-9-]+)\.woff2\) format\("woff2"\),url\(\.\./webfonts/[a-z0-9-]+\.ttf\) format\("truetype"\)',
               r'src:url(\1.woff2) format("woff2")', small)
small = small.replace('font-display:block', 'font-display:swap')
small = re.sub(r'@font-face\{[^}]*fa-v4compatibility[^}]*\}', '', small)  # compatibilidad v4: no se usa

os.makedirs(OUT, exist_ok=True)
for font in ('fa-solid-900', 'fa-regular-400', 'fa-brands-400'):
    subprocess.run([sys.executable, '-m', 'fontTools.subset', os.path.join(FA, 'webfonts', font + '.woff2'),
                    '--unicodes=' + ','.join('U+' + c for c in codepoints), '--flavor=woff2',
                    '--output-file=' + os.path.join(OUT, font + '.woff2'), '--no-hinting', '--layout-features='],
                   check=True, capture_output=True)

header = ('/*! Font Awesome Free 6.5.1 (subconjunto) by @fontawesome - https://fontawesome.com '
          'License - https://fontawesome.com/license/free (Icons: CC BY 4.0, Fonts: SIL OFL 1.1, Code: MIT License) */\n'
          f'/* Generado por tools/fa_subset.py: {len(used)} clases, {len(codepoints)} iconos. */\n')
open(os.path.join(OUT, 'fa.css'), 'w', encoding='utf-8').write(header + small)
size = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
print(f'Font Awesome reducido: {len(codepoints)} iconos, {size / 1024:.0f} KB en total ({", ".join(sorted(used))})')
