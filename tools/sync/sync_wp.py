"""Sincroniza el blog del WordPress temporal con el sitio Astro (automático, idempotente).

Qué hace
  1. Pide a la API REST de WordPress la lista de entradas, categorías y etiquetas publicadas.
  2. Descarga el HTML de esas URLs (más home, /blog/ y sus paginaciones) a un directorio de trabajo,
     reescribiendo el dominio temporal por el de producción.
  3. Reutiliza tools/migracion/assets.py y convert.py (los mismos de la migración) sobre ese espejo.
  4. Copia al repo SOLO entradas, listados, categorías, etiquetas, home y medios nuevos.
     No toca páginas fijas, aliados, cabecera, pie, /recursos/ ni las correcciones de src/lib/fixes.ts.
  5. Entradas que ya no existen en WordPress: se retiran y se redirigen (301) a su nueva URL o a /blog/.
  6. Ejecuta localizar_es.py y deja el repo listo para compilar. El commit lo hace el workflow.

Salvaguardas (salida con código 2 = abortar sin tocar nada)
  - La API no responde o devuelve menos del 80 % de las entradas que ya hay en el repo.
  - Desaparecen más de MAX_REMOVED entradas de golpe.
  - Alguna página nueva no tiene cabecera/pie (plantilla rota) o convert.py informa problemas.

Uso:  python3 tools/sync/sync_wp.py [--dry-run]
Entorno: WP_URL (por defecto el WP temporal), WP_USER / WP_PASS si el WP está protegido con contraseña
         (protección por directorio de Hostinger = autenticación HTTP básica).
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.parse

import requests

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
PAGES = os.path.join(REPO, 'src', 'site', 'pages')
MIG = os.path.join(REPO, 'tools', 'migracion')
HTACCESS = os.path.join(REPO, 'public', '.htaccess')
PROD = 'https://fundacioneugeniomendoza.com'
SRC = (os.environ.get('WP_URL') or 'https://fundacioneugeniomendoza-com-726353.hostingersite.com').rstrip('/')
AUTH = (os.environ['WP_USER'], os.environ['WP_PASS']) if os.environ.get('WP_USER') else None
MAX_REMOVED = 3
DRY = '--dry-run' in sys.argv

S = requests.Session()
S.auth = AUTH
S.headers['User-Agent'] = 'FEM-sync/1.0 (+https://fundacioneugeniomendoza.com)'


def abort(msg):
    print('ABORTADO:', msg)
    sys.exit(2)


def api(kind):
    out, page = [], 1
    while True:
        r = S.get(f'{SRC}/wp-json/wp/v2/{kind}', params={'per_page': 100, 'page': page, '_fields': 'link,count,slug'}, timeout=60)
        if r.status_code != 200:
            abort(f'la API de WordPress respondió {r.status_code} en {kind}')
        out += r.json()
        if page >= int(r.headers.get('X-WP-TotalPages', 1)):
            return out
        page += 1


def path_of(url):
    return urllib.parse.unquote(urllib.parse.urlparse(url).path)


def key_of(route):
    return route.strip('/').replace('/', '__') or 'home'


def rewrite(html):
    host = urllib.parse.urlparse(SRC).netloc
    for a, b in ((SRC, PROD), (SRC.replace('/', '\\/'), PROD.replace('/', '\\/')),
                 (urllib.parse.quote(SRC, safe=''), urllib.parse.quote(PROD, safe='')),
                 ('//' + host, '//fundacioneugeniomendoza.com')):
        html = html.replace(a, b)
    return html


# ---------- 1. qué hay publicado ----------
posts = [p for p in api('posts')]
cats = [c for c in api('categories') if c['count'] > 0]
tags = [t for t in api('tags') if t['count'] > 0]
post_routes = {path_of(p['link']) for p in posts}

existing_posts = {}
for f in os.listdir(PAGES):
    if f.endswith('.json'):
        m = json.load(open(os.path.join(PAGES, f), encoding='utf-8'))
        if '"BlogPosting"' in m['seo']:
            existing_posts[m['route']] = f[:-5]
if len(post_routes) < 0.8 * len(existing_posts):
    abort(f'WordPress devuelve {len(post_routes)} entradas y el repo tiene {len(existing_posts)}')

routes = {'/', '/blog/', '/tag/fem/'} | post_routes | {path_of(c['link']) for c in cats} | {path_of(t['link']) for t in tags}

# ---------- 2. espejo ----------
work = tempfile.mkdtemp(prefix='fem-sync-')
mig = os.path.join(work, 'migracion')
shutil.copytree(MIG, mig, ignore=shutil.ignore_patterns('mirror', '__pycache__', 'assetmap.json'))
mirror = os.path.join(mig, 'mirror', 'fundacioneugeniomendoza.com')


def save(route, html):
    dest = os.path.join(mirror, route.strip('/'), 'index.html') if route != '/__404.html' else os.path.join(mirror, '__404.html')
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    open(dest, 'w', encoding='utf-8').write(rewrite(html))


todo, done = sorted(routes), set()
while todo:
    route = todo.pop()
    if route in done:
        continue
    done.add(route)
    r = S.get(SRC + urllib.parse.quote(route), timeout=60)
    if r.status_code != 200:
        abort(f'{route} respondió {r.status_code}')
    r.encoding = 'utf-8'
    save(route, r.text)
    # paginaciones de listados (/blog/page/2/, /category/x/page/2/…)
    if route == '/blog/' or route.startswith(('/blog/page/', '/category/', '/tag/')):
        base = re.sub(r'page/\d+/$', '', route)
        for n in re.findall(re.escape(SRC + urllib.parse.quote(base)) + r'page/(\d+)/', r.text):
            todo.append(f'{base}page/{n}/')
r = S.get(SRC + '/fem-sync-no-existe/', timeout=60)
r.encoding = 'utf-8'
save('/__404.html', r.text)
print(f'espejo: {len(done)} URLs ({len(post_routes)} entradas, {len(cats)} categorías, {len(tags)} etiquetas)')

# ---------- 3. assets + conversión (scripts de la migración) ----------
out = os.path.join(work, 'out')
os.makedirs(os.path.join(out, 'public'))
env = dict(os.environ, FEM_ASSET_SRC=SRC, FEM_REPO_PUBLIC=os.path.join(REPO, 'public'))
for script, arg in (('assets.py', os.path.join(out, 'public')), ('convert.py', out)):
    res = subprocess.run([sys.executable, os.path.join(mig, script), arg], env=env, capture_output=True, text=True)
    print(res.stdout.strip()[-600:])
    if res.returncode != 0:
        abort(f'{script} falló: {res.stderr[-800:]}')
    if script == 'convert.py' and not re.search(r"problems \[\]", res.stdout):
        abort('convert.py detectó páginas sin cabecera/pie')

# ---------- 4. copiar al repo lo sincronizable ----------
new_pages = os.path.join(out, 'src', 'site', 'pages')
SYNCABLE = re.compile(r'^(home|blog|blog__page__\d+|category__.+|tag__.+)$')


def is_syncable(key, meta):
    return bool(SYNCABLE.match(key)) or '"BlogPosting"' in meta['seo']


def template_menu(prefix):
    """Menú (estado activo) de una página existente del mismo tipo, para páginas nuevas."""
    for f in sorted(os.listdir(PAGES)):
        if f.endswith('.json') and (f.startswith(prefix) if prefix else True):
            m = json.load(open(os.path.join(PAGES, f), encoding='utf-8'))
            if prefix or '"BlogPosting"' in m['seo']:
                return m['menu']
    return None


HOMENAJE = re.compile(r'<!-- Homenaje.*?<!-- /Homenaje -->\s*', re.S)
added, updated, keys_now = [], [], set()
for f in sorted(os.listdir(new_pages)):
    if not f.endswith('.json'):
        continue
    key = f[:-5]
    meta = json.load(open(os.path.join(new_pages, f), encoding='utf-8'))
    if not is_syncable(key, meta):
        continue
    keys_now.add(key)
    body = open(os.path.join(new_pages, key + '.html'), encoding='utf-8').read()
    old_json = os.path.join(PAGES, f)
    if os.path.exists(old_json):
        old = json.load(open(old_json, encoding='utf-8'))
        meta['menu'] = old['menu']  # la cabecera del sitio nuevo es propia (Recursos sin desplegable)
        if key == 'home':
            old_body = open(os.path.join(PAGES, 'home.html'), encoding='utf-8').read()
            h = HOMENAJE.search(old_body)
            if h:  # el homenaje temporal vive solo en el repo: se reinserta en el mismo sitio
                body = HOMENAJE.sub('', body)
                inside_main = re.search(r'<main\b[^>]*>\s*$', old_body[:h.start()])
                m = re.search(r'<main\b[^>]*>\s*', body) if inside_main else None
                body = body[:m.end()] + h.group(0) + body[m.end():] if m else h.group(0) + body
            meta['seo'] = old['seo']  # título y descripción propios de la home
    else:
        prefix = 'tag__' if key.startswith('tag__') else 'category__' if key.startswith('category__') else 'blog__page__' if key.startswith('blog__page__') else ''
        meta['menu'] = template_menu(prefix) or meta['menu']
    new_json = json.dumps(meta, ensure_ascii=False, indent=1)
    if os.path.exists(old_json):
        changed = open(old_json, encoding='utf-8').read().rstrip() != new_json.rstrip() or \
            open(os.path.join(PAGES, key + '.html'), encoding='utf-8').read() != body
        (updated if changed else []).append(key)
    else:
        added.append(key)
    if not DRY:
        open(old_json, 'w', encoding='utf-8').write(new_json)
        open(os.path.join(PAGES, key + '.html'), 'w', encoding='utf-8').write(body)

# Entradas, etiquetas y categorías que ya no existen en WordPress
removed, redirects = [], {}
for f in sorted(os.listdir(PAGES)):
    if not f.endswith('.json'):
        continue
    key = f[:-5]
    meta = json.load(open(os.path.join(PAGES, f), encoding='utf-8'))
    if is_syncable(key, meta) and key not in keys_now:
        removed.append(key)
        if '"BlogPosting"' in meta['seo']:
            r = S.get(SRC + urllib.parse.quote(meta['route']), allow_redirects=False, timeout=60)
            loc = r.headers.get('location', '') if r.status_code in (301, 302, 308) else ''
            redirects[meta['route']] = path_of(loc) if loc else '/blog/'
posts_removed = [k for k in removed if k in existing_posts.values()]
if len(posts_removed) > MAX_REMOVED:
    abort(f'desaparecerían {len(posts_removed)} entradas: {posts_removed}. Revisar a mano.')
if not DRY:
    for key in removed:
        for ext in ('.json', '.html'):
            os.remove(os.path.join(PAGES, key + ext))

# Redirecciones gestionadas por la sincronización (bloque propio en .htaccess)
if redirects and not DRY:
    ht = open(HTACCESS, encoding='utf-8').read()
    block = re.search(r'# BEGIN sync-redirects\n(.*?)# END sync-redirects\n', ht, re.S)
    lines = block.group(1).splitlines() if block else []
    for old, new in redirects.items():
        pat = '^' + re.escape(urllib.parse.quote(old.strip('/'), safe='/-')).replace('\\-', '-').replace('\\/', '/') + '/?$'
        lines.append(f'RewriteRule {pat} {new} [L,R=301,NE]')
    new_block = '# BEGIN sync-redirects\n' + '\n'.join(dict.fromkeys(lines)) + '\n# END sync-redirects\n'
    if block:
        ht = ht.replace(block.group(0), new_block)
    else:
        ht = ht.replace('# Endpoints de WordPress que ya no existen', new_block + '\n# Endpoints de WordPress que ya no existen')
    open(HTACCESS, 'w', encoding='utf-8').write(ht)

# Fragmentos <head>/cola: unión con los existentes y poda de los que ya nadie usa
frag_path = os.path.join(REPO, 'src', 'site', 'fragments.json')
frags = json.load(open(frag_path, encoding='utf-8'))
frags.update(json.load(open(os.path.join(out, 'src', 'site', 'fragments.json'), encoding='utf-8')))
used = set()
for f in os.listdir(PAGES):
    if f.endswith('.json'):
        m = json.load(open(os.path.join(PAGES, f), encoding='utf-8'))
        used |= set(m['head']) | set(m['tail'])
if not DRY:
    json.dump({k: v for k, v in frags.items() if k in used}, open(frag_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)

# Medios y CSS/JS del tema: se añaden o actualizan; nunca se borra nada de public/
SKIP = ('blog-home', '404.html')
n_assets = 0
src_pub = os.path.join(out, 'public')
for root, _, files in os.walk(src_pub):
    rel_root = os.path.relpath(root, src_pub)
    if rel_root.split(os.sep)[0] in SKIP:
        continue
    for fn in files:
        if rel_root == '.' and fn in SKIP:
            continue
        a = os.path.join(root, fn)
        b = os.path.join(REPO, 'public', rel_root, fn)
        if os.path.exists(b) and open(a, 'rb').read() == open(b, 'rb').read():
            continue
        n_assets += 1
        if not DRY:
            os.makedirs(os.path.dirname(b), exist_ok=True)
            shutil.copyfile(a, b)

# ---------- 5. correcciones de idioma (idempotente) ----------
if not DRY:
    subprocess.run([sys.executable, os.path.join(MIG, 'localizar_es.py')], cwd=REPO, check=True)

shutil.rmtree(work, ignore_errors=True)
summary = {
    'nuevas': added, 'actualizadas': updated, 'retiradas': removed,
    'redirecciones': redirects, 'archivos_publicos': n_assets, 'dry_run': DRY,
}
print(json.dumps(summary, ensure_ascii=False, indent=1))
with open(os.environ.get('GITHUB_STEP_SUMMARY', os.devnull), 'a', encoding='utf-8') as fh:
    fh.write('### Sincronización con WordPress\n\n')
    for k in ('nuevas', 'actualizadas', 'retiradas'):
        fh.write(f'- **{k}** ({len(summary[k])}): {", ".join(summary[k]) or "—"}\n')
    fh.write(f'- **archivos públicos nuevos o cambiados**: {n_assets}\n')
