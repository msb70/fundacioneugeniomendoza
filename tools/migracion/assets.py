"""Paso 1: inventario completo de assets locales referenciados (HTML + CSS),
descarga de los que falten y copia a public/ con nombres limpios.
Genera assetmap.json: url-original (con query) -> ruta pública."""
import re, os, glob, json, shutil, subprocess, urllib.parse, sys

S = os.path.dirname(os.path.abspath(__file__))
M = os.path.join(S, 'mirror', 'fundacioneugeniomendoza.com')
PUB = sys.argv[1]  # repo/public
DOM = 'https://fundacioneugeniomendoza.com'

ref_re = re.compile(r'(?:https?:)?//fundacioneugeniomendoza\.com(/(?:wp-content|wp-includes)/[^\s"\'()<>,]+)|(?<=["\'(\s,])(/(?:wp-content|wp-includes)/[^\s"\'()<>,]+)')

refs = set()
for f in glob.glob(M + '/**/*', recursive=True):
    if not os.path.isfile(f):
        continue
    if not (f.endswith('.html') or '.css' in os.path.basename(f)):
        continue
    txt = open(f, encoding='utf-8', errors='ignore').read()
    txt = txt.replace('\\/', '/')  # JSON escapado
    for a, b in ref_re.findall(txt):
        p = (a or b).rstrip('\\')
        p = p.replace('&#038;', '&').replace('&amp;', '&')
        refs.add(p)
    # url(...) relativas dentro de CSS locales
    if '.css' in os.path.basename(f) and '/wp-' in f:
        base = '/' + os.path.relpath(os.path.dirname(f), M).replace(os.sep, '/') + '/'
        for u in re.findall(r'url\(\s*[\'"]?([^\'")]+)', txt):
            if u.startswith(('data:', 'http', '//', '#', '/')):
                continue
            refs.add(urllib.parse.urljoin(base, u))

# Solo nos interesan los que cuelgan de wp-content / wp-includes
refs = {r for r in refs if r.startswith(('/wp-content/', '/wp-includes/'))}
# Ignorar endpoints dinámicos
refs = {r for r in refs if not r.endswith(('.php','/')) and 'admin-ajax' not in r and '*' not in r and '$' not in r and '{' not in r}

def local_file(path_q):
    """Archivo en el mirror para path con query (wget guarda query en el nombre)."""
    p = urllib.parse.unquote(path_q)
    for cand in (M + p, M + p.split('#')[0], M + urllib.parse.unquote(p.split('?')[0])):
        if os.path.isfile(cand):
            return cand
    return None

missing = []
for r in sorted(refs):
    if not local_file(r):
        missing.append(r)
print('refs', len(refs), 'missing', len(missing))
for r in missing:
    dest = M + urllib.parse.unquote(r.split('#')[0])
    try:
        os.makedirs(os.path.dirname(dest), exist_ok=True)
    except OSError as e:
        print('  SKIP', r, e); continue
    rc = subprocess.run(['curl', '-sS', '-f', '-m', '60', '-o', dest, DOM + r.split('#')[0]], capture_output=True)
    if rc.returncode != 0:
        print('  FAIL', r, rc.stderr.decode()[:80])
        if os.path.exists(dest) and os.path.getsize(dest) == 0:
            os.remove(dest)

# Mapa a nombres públicos: sin query; si hay 2 versiones distintas del mismo archivo, se sufija
by_base = {}
for r in refs:
    base = urllib.parse.unquote(r.split('?')[0].split('#')[0])
    by_base.setdefault(base, set()).add(r.split('#')[0])

amap = {}
for base, variants in by_base.items():
    srcs = [(v, local_file(v)) for v in sorted(variants)]
    srcs = [(v, f) for v, f in srcs if f]
    if not srcs:
        continue
    contents = {}
    for v, f in srcs:
        contents.setdefault(open(f, 'rb').read(), []).append((v, f))
    multi = len(contents) > 1
    for i, (blob, items) in enumerate(contents.items()):
        pub = base
        if multi:
            root, ext = os.path.splitext(base)
            pub = f'{root}.v{i+1}{ext}'
        dest = PUB + pub
        try:
            os.makedirs(os.path.dirname(dest), exist_ok=True)
        except OSError as e:
            print('  SKIPPUB', pub, e); continue
        with open(dest, 'wb') as fh:
            fh.write(blob)
        for v, _ in items:
            amap[v] = pub
            amap[urllib.parse.unquote(v)] = pub

# CSS locales: reescribir url() con query a su versión limpia
for pub in set(amap.values()):
    if pub.endswith('.css'):
        fp = PUB + pub
        css = open(fp, encoding='utf-8', errors='ignore').read()
        css2 = re.sub(r'(url\(\s*[\'"]?)([^\'")?#]+)\?[^\'")#]*', r'\1\2', css)
        css2 = css2.replace(DOM + '/', '/')
        if css2 != css:
            open(fp, 'w', encoding='utf-8').write(css2)

json.dump(amap, open(os.path.join(S, 'assetmap.json'), 'w'), indent=0, ensure_ascii=False)
print('public files', len(set(amap.values())))
