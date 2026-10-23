#!/usr/bin/env python3
"""Publica (o actualiza) entradas en el WordPress desde carpetas del repo, sin navegador.

Cada entrada es una carpeta contenido/publicar/<slug>/ con:
  entrada.json   título, slug, estado, categorías (slugs), etiquetas (nombres), comentarios,
                 extracto, imagen_destacada (archivo), medios {archivo: {titulo, alt}},
                 evento (opcional: titulo, inicio, fin, hora, lugar) → se añade a
                 src/site/eventos.json SOLO después de que la entrada exista en WP.
  contenido.html bloques de Gutenberg. Marcadores {{media:<archivo>:id}} y {{media:<archivo>:url}}.
  imágenes / PDF referenciados en "medios".

Idempotente: los medios se reutilizan si ya existe uno subido con el mismo nombre de archivo
(guardado en .publicado.json de la carpeta), y la entrada se actualiza si ya existe ese slug.

Uso: python3 tools/wp-publish/publicar.py contenido/publicar/<slug> [...]
     python3 tools/wp-publish/publicar.py --todas      (todas las carpetas sin publicar o cambiadas)
Entorno: WP_APP_USER / WP_APP_PASS (contraseña de aplicación de WordPress; si faltan, se usan
WP_USER / WP_PASS), WP_URL (por defecto el WP temporal).
"""
import hashlib
import json
import mimetypes
import os
import sys
from pathlib import Path

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

ROOT = Path(__file__).resolve().parents[2]
EVENTOS = ROOT / 'src/site/eventos.json'
WP = (os.environ.get('WP_URL') or 'https://fundacioneugeniomendoza-com-726353.hostingersite.com').rstrip('/')
USER = os.environ.get('WP_APP_USER') or os.environ.get('WP_USER')
PASS = (os.environ.get('WP_APP_PASS') or os.environ.get('WP_PASS') or '').replace(' ', '')

S = requests.Session()
S.mount('https://', HTTPAdapter(max_retries=Retry(total=5, backoff_factor=2,
        status_forcelist=(429, 500, 502, 503, 504), allowed_methods=None)))
S.auth = (USER, PASS) if USER and PASS else None
S.headers['User-Agent'] = 'fem-publicar/1.0 (+github actions)'


def api(method, route, **kw):
    r = S.request(method, f'{WP}/wp-json/wp/v2/{route}', timeout=90, **kw)
    if r.status_code >= 400:
        raise SystemExit(f'ERROR {method} {route}: {r.status_code} {r.text[:400]}')
    return r.json()


def comprobar_credencial():
    if not S.auth:
        raise SystemExit('Faltan credenciales: usuario %s, contraseña %s (secretos WP_USER/WP_PASS o WP_APP_USER/WP_APP_PASS).'
                         % ('OK' if USER else 'NO LLEGA', 'OK' if PASS else 'NO LLEGA'))
    me = api('GET', 'users/me', params={'context': 'edit', '_fields': 'id,name,capabilities'})
    if not me.get('capabilities', {}).get('publish_posts'):
        raise SystemExit(f'El usuario {me.get("name")} no puede publicar entradas.')
    print(f'Credencial OK: {me["name"]} (id {me["id"]})')


def huella(carpeta: Path) -> str:
    h = hashlib.sha256()
    for f in sorted(carpeta.iterdir()):
        if f.name != '.publicado.json' and f.is_file():
            h.update(f.name.encode()); h.update(f.read_bytes())
    return h.hexdigest()


def subir_medio(carpeta, nombre, meta, estado):
    previo = estado.get('medios', {}).get(nombre)
    datos = (carpeta / nombre).read_bytes()
    sha = hashlib.sha256(datos).hexdigest()
    if previo and previo.get('sha') == sha:
        try:
            m = api('GET', f'media/{previo["id"]}', params={'_fields': 'id,source_url'})
            return {'id': m['id'], 'url': m['source_url'], 'sha': sha}
        except SystemExit:
            pass  # borrado en WP: se vuelve a subir
    tipo = mimetypes.guess_type(nombre)[0] or 'application/octet-stream'
    m = api('POST', 'media', data=datos, headers={
        'Content-Type': tipo, 'Content-Disposition': f'attachment; filename="{nombre}"'})
    cambios = {k: v for k, v in {'title': meta.get('titulo'), 'alt_text': meta.get('alt')}.items() if v}
    if cambios:
        api('POST', f'media/{m["id"]}', json=cambios)
    print(f'  medio {nombre} → id {m["id"]}')
    return {'id': m['id'], 'url': m['source_url'], 'sha': sha}


def ids_categorias(slugs):
    ids = []
    for s in slugs:
        r = api('GET', 'categories', params={'slug': s, '_fields': 'id'})
        if not r:
            raise SystemExit(f'La categoría «{s}» no existe en WordPress (no se crean automáticamente).')
        ids.append(r[0]['id'])
    return ids


def ids_etiquetas(nombres):
    ids = []
    for n in nombres:
        r = api('GET', 'tags', params={'search': n, 'per_page': 100, '_fields': 'id,name'})
        hit = next((t for t in r if t['name'].strip().lower() == n.strip().lower()), None)
        ids.append(hit['id'] if hit else api('POST', 'tags', json={'name': n})['id'])
    return ids


def anadir_evento(ev, enlace):
    d = json.loads(EVENTOS.read_text(encoding='utf-8'))
    lista = d['eventos']
    nuevo = {k: ev[k] for k in ('titulo', 'inicio', 'fin', 'hora', 'lugar', 'imagen') if ev.get(k)}
    nuevo['enlace'] = enlace
    lista[:] = [e for e in lista if e.get('enlace') != enlace]
    lista.append(nuevo)
    lista.sort(key=lambda e: (e['inicio'], e.get('fin', e['inicio'])))
    EVENTOS.write_text(json.dumps(d, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'  calendario: {enlace} ({nuevo["inicio"]})')


def publicar(carpeta: Path):
    spec = json.loads((carpeta / 'entrada.json').read_text(encoding='utf-8'))
    est_f = carpeta / '.publicado.json'
    estado = json.loads(est_f.read_text()) if est_f.exists() else {}
    print(f'→ {spec["slug"]}')

    medios = {n: subir_medio(carpeta, n, m, estado) for n, m in spec.get('medios', {}).items()}
    html = (carpeta / 'contenido.html').read_text(encoding='utf-8')
    for n, m in medios.items():
        html = html.replace(f'{{{{media:{n}:id}}}}', str(m['id'])).replace(f'{{{{media:{n}:url}}}}', m['url'])
    if '{{media:' in html:
        raise SystemExit('Quedan marcadores {{media:…}} sin resolver: revisa "medios" en entrada.json.')

    datos = {
        'title': spec['titulo'], 'slug': spec['slug'], 'status': spec.get('estado', 'publish'),
        'content': html, 'excerpt': spec.get('extracto', ''),
        'categories': ids_categorias(spec.get('categorias', [])),
        'tags': ids_etiquetas(spec.get('etiquetas', [])),
        'comment_status': 'open' if spec.get('comentarios') else 'closed',
        'ping_status': 'closed',
    }
    if spec.get('imagen_destacada'):
        datos['featured_media'] = medios[spec['imagen_destacada']]['id']

    existe = api('GET', 'posts', params={'slug': spec['slug'], 'status': 'publish,draft,future,pending,private',
                                         '_fields': 'id', 'context': 'edit'})
    post = api('POST', f'posts/{existe[0]["id"]}' if existe else 'posts', json=datos)
    if post['slug'] != spec['slug']:
        print(f'  AVISO: WordPress asignó el slug «{post["slug"]}» (pedido «{spec["slug"]}»)')
    print(f'  entrada {"actualizada" if existe else "creada"}: id {post["id"]} · {post["status"]} · {post["link"]}')

    if spec.get('evento') and post['status'] == 'publish':
        anadir_evento(spec['evento'], f'/{post["slug"]}/')

    estado.update({'post_id': post['id'], 'slug': post['slug'], 'link': post['link'],
                   'medios': medios, 'huella': huella(carpeta)})
    est_f.write_text(json.dumps(estado, ensure_ascii=False, indent=2) + '\n')


def main():
    args = sys.argv[1:]
    if not args:
        raise SystemExit(__doc__)
    if args == ['--todas']:
        base = ROOT / 'contenido/publicar'
        carpetas = []
        for c in sorted(p for p in base.iterdir() if (p / 'entrada.json').exists()):
            est = c / '.publicado.json'
            if not est.exists() or json.loads(est.read_text()).get('huella') != huella(c):
                carpetas.append(c)
    else:
        carpetas = [ROOT / a if not Path(a).is_absolute() else Path(a) for a in args]
    if not carpetas:
        print('Nada nuevo que publicar.')
        return
    comprobar_credencial()
    for c in carpetas:
        publicar(c)


if __name__ == '__main__':
    main()
