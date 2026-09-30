"""Paso 2: convierte el mirror de WordPress en datos para el proyecto Astro.

Salida (dentro del repo):
  src/data/header.html        cabecera base (sin estado activo)
  src/data/footer.html        pie (idéntico en todo el sitio)
  src/data/fragments.json     registro de fragmentos <head>/cola compartidos (hash -> html)
  src/content/pages/<key>.json  metadatos + orden de fragmentos de cada URL
  src/content/pages/<key>.html  cuerpo de la página (entre header y footer)
  public/blog-home/index.html  página huérfana con plantilla distinta (copiada tal cual)
"""
import re, os, glob, json, hashlib, sys, urllib.parse

S = os.path.dirname(os.path.abspath(__file__))
M = os.path.join(S, 'mirror', 'fundacioneugeniomendoza.com')
R = sys.argv[1]
DOM = 'https://fundacioneugeniomendoza.com'
AMAP = json.load(open(os.path.join(S, 'assetmap.json')))

os.makedirs(R + '/src/site', exist_ok=True)
os.makedirs(R + '/src/site/pages', exist_ok=True)

# ---------- utilidades ----------
asset_re = re.compile(r'/wp-(?:content|includes)/[^\s"\'()<>,]+')

def map_asset(m):
    u = m.group(0)
    for k in (u, u.replace('&#038;', '&').replace('&amp;', '&'), urllib.parse.unquote(u)):
        if k in AMAP:
            return AMAP[k]
        kk = k.split('#')[0]
        if kk in AMAP:
            return AMAP[kk]
    # sin query conocida: al menos quitar ?ver=
    return re.sub(r'\?ver=[^"\'\s#&]*', '', u)

def localize(html):
    """URLs absolutas del dominio -> relativas; assets -> nombres limpios."""
    html = html.replace(DOM + '/', '/').replace('//fundacioneugeniomendoza.com/', '/')
    html = re.sub(r'(href|src|action)=(["\'])' + re.escape(DOM) + r'\2', r'\1=\2/\2', html)
    html = asset_re.sub(map_asset, html)
    return html

def fix_dynamic(html):
    """Sustituye endpoints de WordPress por los endpoints PHP del sitio nuevo."""
    html = html.replace('action="/wp-admin/admin-post.php"', 'action="/api/contact.php"')
    html = html.replace('action="/wp-comments-post.php"', 'action="/api/comment.php"')
    html = re.sub(r'<input type="hidden" id="(?:fem|tcn)_nonce" name="(?:fem|tcn)_nonce" value="[^"]*" />', '', html)
    html = html.replace("'/wp-admin/admin-ajax.php'", "'/api/careers.php'")
    return html

tok_re = re.compile(
    r'<!--.*?-->'
    r'|<(script|style|title|noscript)\b[^>]*>.*?</\1\s*>'
    r'|<(?:meta|link|base)\b[^>]*>',
    re.S | re.I)

def tokens(chunk):
    return [m.group(0) for m in tok_re.finditer(chunk)]

DROP_PATTERNS = [
    r'wp-emoji', r'speculationrules', r'rel="https://api\.w\.org/"', r'rel="EditURI"',
    r"rel='shortlink'", r'rel="alternate"', r'rel=\'dns-prefetch\' href=\'//s\.w\.org',
    r'name="generator" content="WordPress', r'name="generator" content="Site Kit',
    r'comment-reply', r'LiteSpeed', r'<!--\s*$', r'rel="pingback"',
    r'id="wp-(?:hooks|i18n|url|api-fetch|private-apis)-js',
]
def is_dropped(t):
    head = t[:400]
    if t.startswith('<script') and 'wp-emoji' in t:
        return True
    return any(re.search(p, head) for p in DROP_PATTERNS)

SEO_START = '<!-- All in One SEO'
def split_seo(ts):
    """Separa el bloque AIOSEO (title/meta/og/ld+json) del resto del head."""
    seo, rest, inseo = [], [], False
    for t in ts:
        if t.startswith('<!-- All in One SEO') and 'aioseo.com' in t:
            inseo = True; continue
        if t.startswith('<!-- All in One SEO -->'):
            inseo = False; continue
        if t.startswith('<title'):
            seo.append(t); continue
        (seo if inseo else rest).append(t)
    return seo, rest

registry = {}
def reg(html):
    h = hashlib.sha1(html.encode()).hexdigest()[:12]
    registry[h] = html
    return h

def route_of(f):
    rel = os.path.relpath(f, M).replace(os.sep, '/')
    return '/' + rel[:-len('index.html')] if rel.endswith('index.html') else '/' + rel

def key_of(route):
    k = route.strip('/').replace('/', '__') or 'home'
    return k

# ---------- cabecera base y overrides de menú ----------
base_header = localize(re.search(r'<header class="site-header">.*?</header>',
                                 open(M + '/tag/fem/index.html').read(), re.S).group(0))
# estado "neutro": sin current_page_parent en Blog
base_header = base_header.replace(' current_page_parent menu-item-197', ' menu-item-197')
open(R + '/src/site/header.html', 'w').write(base_header)
base_li = dict(re.findall(r'<li id="menu-item-(\d+)" class="([^"]*)"', base_header))
href_re = re.compile(r'<li id="menu-item-(\d+)"[^>]*><a(?: target="_blank")? href="([^"]*)"')
base_href = dict(href_re.findall(base_header))

footer_html = None
report = []

files = sorted(glob.glob(M + '/**/index.html', recursive=True))
files.append(M + '/__404.html')
for f in files:
    route = route_of(f)
    h = open(f, encoding='utf-8').read()
    if route in ('/blog-home/', '/__404.html'):
        # plantilla de bloques huérfana (noindex): se publica tal cual, localizada
        out = R + ('/public/blog-home/index.html' if route == '/blog-home/' else '/public/404.html')
        os.makedirs(os.path.dirname(out), exist_ok=True)
        open(out, 'w').write(fix_dynamic(localize(h)))
        report.append((route, 'raw'))
        continue
    head = h[h.find('<head>') + 6:h.find('</head>')]
    body_open = re.search(r'<body([^>]*)>', h)
    body_class = re.search(r'class="([^"]*)"', body_open.group(1)).group(1)
    html_attrs = re.search(r'<html([^>]*)>', h).group(1).strip()
    b0 = body_open.end()
    hm = re.search(r'<header class="site-header">.*?</header>', h, re.S)
    fm = re.search(r'<footer class="fem-footer">.*?</footer>', h, re.S)
    if not hm or not fm:
        report.append((route, 'SIN HEADER/FOOTER — revisar'))
        continue
    pre = h[b0:hm.start()]
    body = h[hm.end():fm.start()]
    tail = h[fm.end():h.rfind('</body>')]
    if footer_html is None:
        footer_html = localize(fm.group(0))
        open(R + '/src/site/footer.html', 'w').write(footer_html)

    # overrides del menú activo
    cur = dict(re.findall(r'<li id="menu-item-(\d+)" class="([^"]*)"', hm.group(0)))
    overrides = {k: v for k, v in cur.items() if base_li.get(k) != v}
    aria_items = re.findall(r'<li id="menu-item-(\d+)"[^>]*><a[^>]*aria-current="page"', hm.group(0))
    logo_current = 'rel="home" aria-current="page"' in hm.group(0)
    hrefs = {k: v for k, v in href_re.findall(localize(hm.group(0))) if base_href.get(k) != v}

    seo, rest = split_seo(tokens(head))
    head_keys = []
    for t in rest:
        if is_dropped(t) or t.startswith('<meta charset') or t.startswith('<meta name="viewport'):
            continue
        t2 = localize(t)
        if 'FEMRating' in t2:
            t2 = re.sub(r'"ajaxUrl":"[^"]*"', '"ajaxUrl":"/api/rating.php"', t2)
        head_keys.append(reg(t2))
    tail_keys = []
    for t in tokens(tail):
        if is_dropped(t):
            continue
        t2 = localize(t)
        if 'FEMRating' in t2:
            t2 = re.sub(r'"ajaxUrl":"[^"]*"', '"ajaxUrl":"/api/rating.php"', t2)
            t2 = t2.replace('https:\\/\\/fundacioneugeniomendoza.com\\/wp-admin\\/admin-ajax.php', '/api/rating.php')
        tail_keys.append(reg(t2))
    # SEO: se conserva absoluto (canónicas y og apuntan al dominio de producción)
    seo_html = '\n'.join(seo)

    body_l = fix_dynamic(localize(body))
    if 'FEMRating' in body_l:
        body_l = re.sub(r'"ajaxUrl":"[^"]*"', '"ajaxUrl":"/api/rating.php"', body_l)
    body_l = body_l.replace('https:\\/\\/fundacioneugeniomendoza.com\\/wp-admin\\/admin-ajax.php', '/api/rating.php')

    key = '404' if route.endswith('__404.html') else key_of(route)
    if key == '404':
        route = '/404/'
    meta = {
        'route': route,
        'htmlAttrs': html_attrs,
        'bodyClass': body_class,
        'seo': seo_html,
        'head': head_keys,
        'pre': localize(pre).strip(),
        'tail': tail_keys,
        'menu': {'overrides': overrides, 'aria': aria_items, 'logoCurrent': logo_current, 'hrefs': hrefs},
    }
    json.dump(meta, open(f'{R}/src/site/pages/{key}.json', 'w'), ensure_ascii=False, indent=1)
    open(f'{R}/src/site/pages/{key}.html', 'w').write(body_l)
    report.append((route, 'ok'))

json.dump(registry, open(R + '/src/site/fragments.json', 'w'), ensure_ascii=False, indent=0)
bad = [r for r in report if r[1] not in ('ok', 'raw')]
print('pages', len(report), 'fragments', len(registry), 'problems', bad)
# comprobaciones de restos de WordPress
left = []
for f in glob.glob(R + '/src/site/pages/*.html') + [R + '/src/site/footer.html', R + '/src/site/header.html']:
    t = open(f).read()
    for pat in ('admin-ajax', 'wp-admin', 'wp-comments-post', 'fundacioneugeniomendoza.com/wp-content', 'wp-json'):
        if pat in t:
            left.append((os.path.basename(f), pat))
print('restos', sorted(set(left))[:30])
