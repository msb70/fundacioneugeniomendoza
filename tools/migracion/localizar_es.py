"""Corrige restos en inglés heredados del WordPress (idempotente).

- lang="en-US" -> lang="es"; og:locale en_US -> es_VE; inLanguage en-US -> es
- og:site_name "Fundación Eugenio Mendoza -" -> sin guion final
- Título de la home ("Front Page") y descripción de la home
- Migas de pan "Home"/"Page N" -> "Inicio"/"Página N"
- Fechas "26 de September" -> "26 de septiembre"
- Textos del formulario de comentarios

Uso: python3 tools/migracion/localizar_es.py   (desde la raíz del repo)
"""
import glob
import json
import re

PAGES = 'src/site/pages'

MESES = {
    'January': 'enero', 'February': 'febrero', 'March': 'marzo', 'April': 'abril',
    'May': 'mayo', 'June': 'junio', 'July': 'julio', 'August': 'agosto',
    'September': 'septiembre', 'October': 'octubre', 'November': 'noviembre', 'December': 'diciembre',
}
RE_FECHA = re.compile(r'\b(\d{1,2}) de (' + '|'.join(MESES) + r')\b')

HTML_TEXTOS = [
    ('>Cancel reply<', '>Cancelar respuesta<'),
    ('<label for="comment">Comment ', '<label for="comment">Comentario '),
    ('<label for="author">Name ', '<label for="author">Nombre '),
    ('<label for="email">Email ', '<label for="email">Correo electrónico '),
    ('<label for="url">Website<', '<label for="url">Sitio web<'),
    ('Save my name, email, and website in this browser for the next time I comment.',
     'Guardar mi nombre, correo electrónico y sitio web en este navegador para la próxima vez que comente.'),
    ('Leave a Reply', 'Deja un comentario'),
    ('Your email address will not be published.', 'Tu correo electrónico no será publicado.'),
    ('Required fields are marked', 'Los campos obligatorios están marcados con'),
    ('value="Post Comment"', 'value="Publicar comentario"'),
]

HOME_TITLE = 'Fundación Eugenio Mendoza | Desarrollo social en Venezuela desde 1951'
HOME_DESC = ('Institución privada sin fines de lucro creada en 1951. Programas de primera infancia, '
             'fortalecimiento de familias y emprendedores, y cultura en Venezuela y América Latina.')


def html(path: str) -> bool:
    s = open(path, encoding='utf-8').read()
    o = s
    s = RE_FECHA.sub(lambda m: f'{m.group(1)} de {MESES[m.group(2)]}', s)
    for a, b in HTML_TEXTOS:
        s = s.replace(a, b)
    if s != o:
        open(path, 'w', encoding='utf-8').write(s)
    return s != o


def meta(path: str) -> bool:
    raw = open(path, encoding='utf-8').read()
    m = json.loads(raw)
    m['htmlAttrs'] = m['htmlAttrs'].replace('lang="en-US"', 'lang="es"')
    seo = m['seo']
    seo = seo.replace('og:locale" content="en_US"', 'og:locale" content="es_VE"')
    seo = seo.replace('"inLanguage":"en-US"', '"inLanguage":"es"')
    seo = seo.replace('og:site_name" content="Fundación Eugenio Mendoza -"', 'og:site_name" content="Fundación Eugenio Mendoza"')
    seo = seo.replace('"name":"Home"', '"name":"Inicio"')
    seo = re.sub(r'\bPage (\d+)\b', r'Página \1', seo)
    if m['route'] == '/':
        old = 'Front Page - Fundación Eugenio Mendoza'
        seo = seo.replace(f'<title>{old}</title>', f'<title>{HOME_TITLE}</title>')
        seo = seo.replace(f'content="{old}"', f'content="{HOME_TITLE}"')
        seo = seo.replace('"name":"Front Page - Fundaci\\u00f3n Eugenio Mendoza"',
                          '"name":"' + HOME_TITLE.replace('ó', '\\u00f3') + '"')
        if 'name="description"' not in seo:
            seo = seo.replace(f'<title>{HOME_TITLE}</title>',
                              f'<title>{HOME_TITLE}</title>\n<meta name="description" content="{HOME_DESC}" />', 1)
            seo = seo.replace('<meta property="og:url"',
                              f'<meta property="og:description" content="{HOME_DESC}" />\n<meta property="og:url"', 1)
    m['seo'] = seo
    out = json.dumps(m, indent=1, ensure_ascii=False)
    if raw.endswith('\n'):
        out += '\n'
    if out != raw:
        open(path, 'w', encoding='utf-8').write(out)
    return out != raw


if __name__ == '__main__':
    n_html = sum(html(p) for p in glob.glob(f'{PAGES}/*.html'))
    n_json = sum(meta(p) for p in glob.glob(f'{PAGES}/*.json'))
    print(f'HTML modificados: {n_html} · metadatos modificados: {n_json}')
