"""Verificación de paridad: original (mirror WordPress) vs build de Astro.
Compara por URL: título, texto visible, imágenes, hojas de estilo (en orden),
scripts y enlaces. Además comprueba que todo recurso local referenciado exista en dist/."""
import re, os, glob, sys, html as H, urllib.parse, json

S = os.path.dirname(os.path.abspath(__file__))
M = os.path.join(S, 'mirror', 'fundacioneugeniomendoza.com')
D = sys.argv[1]  # dist
DOM = 'https://fundacioneugeniomendoza.com'
AMAP = json.load(open(os.path.join(S, 'assetmap.json')))

def norm_url(u):
    u = H.unescape(u).strip()
    u = u.replace(DOM, '')
    if u.startswith('//fundacioneugeniomendoza.com'):
        u = u[len('//fundacioneugeniomendoza.com'):]
    if re.match(r'^/wp-(content|includes)/', u):
        u = AMAP.get(u, AMAP.get(urllib.parse.unquote(u), re.sub(r'\?ver=.*$', '', u)))
        u = re.sub(r'\.v\d+(\.\w+)$', r'\1', u)
    return urllib.parse.unquote(u)

def strip(h):
    h = re.sub(r'<(script|style|noscript)\b.*?</\1>', ' ', h, flags=re.S | re.I)
    h = re.sub(r'<!--.*?-->', ' ', h, flags=re.S)
    h = re.sub(r'<[^>]+>', ' ', h)
    return re.sub(r'\s+', ' ', H.unescape(h)).strip()

def body_of(h):
    b = re.search(r'<body[^>]*>(.*)</body>', h, re.S)
    return b.group(1) if b else h

def feats(h):
    body = body_of(h)
    return {
        'title': re.sub(r'\s+', ' ', H.unescape((re.search(r'<title>(.*?)</title>', h, re.S) or [None, ''])[1])).strip(),
        'text': strip(body),
        'imgs': sorted(norm_url(u) for u in re.findall(r'<img[^>]+src="([^"]+)"', body)),
        'css': [norm_url(u) for u in re.findall(r"<link rel='stylesheet'[^>]*href='([^']+)'", h)],
        'links': sorted(norm_url(u) for u in re.findall(r'<a\b[^>]*href="([^"]+)"', body)),
        'bodyclass': (re.search(r'<body[^>]*class="([^"]*)"', h) or [None, ''])[1],
    }

fails, n = [], 0
for f in sorted(glob.glob(M + '/**/index.html', recursive=True)):
    rel = os.path.relpath(f, M)
    if rel.startswith('blog-home'):
        continue
    out = os.path.join(D, rel)
    if not os.path.exists(out):
        fails.append((rel, 'FALTA EN BUILD')); continue
    a, b = feats(open(f).read()), feats(open(out).read())
    n += 1
    for k in a:
        if a[k] != b[k]:
            detail = ''
            if isinstance(a[k], list):
                detail = f' solo-orig={sorted(set(a[k]) - set(b[k]))[:3]} solo-nuevo={sorted(set(b[k]) - set(a[k]))[:3]}'
            elif k == 'text':
                i = next((i for i, (x, y) in enumerate(zip(a[k], b[k])) if x != y), min(len(a[k]), len(b[k])))
                detail = f' @{i}: orig="{a[k][i-40:i+60]}" nuevo="{b[k][i-40:i+60]}"'
            fails.append((rel, k + detail))

# Recursos locales referenciados que no existen en dist
missing = set()
for f in glob.glob(D + '/**/*.html', recursive=True):
    h = open(f).read()
    for u in re.findall(r'(?:src|href)=["\'](/[^"\'#?]+)', h) + [x for s in re.findall(r'srcset="([^"]+)"', h) for x in re.findall(r'(/\S+)\s+\d+w', s)]:
        p = urllib.parse.unquote(u)
        if p.startswith(('/api/', '//')):
            continue
        cand = D + p
        if not (os.path.isfile(cand) or os.path.isfile(os.path.join(cand, 'index.html'))):
            missing.add(p)

print(f'páginas comparadas: {n}, diferencias: {len(fails)}')
for x in fails[:60]:
    print('  -', x[0], '|', x[1][:300])
print(f'recursos locales rotos: {len(missing)}')
for m in sorted(missing)[:40]:
    print('  x', m)
