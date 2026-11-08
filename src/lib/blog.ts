/**
 * Paginación de /blog/.
 *
 * En WordPress, /blog/ es una página (id 185) cuya plantilla del tema ignora el número de página:
 * /blog/page/2/, /page/3/… devuelven siempre las 10 entradas más recientes. La sincronización copia
 * ese HTML tal cual, así que todas las páginas del blog mostraban lo mismo.
 *
 * Arreglo en el build: se reúnen las tarjetas de todos los listados de categoría (que sí paginan bien)
 * y de /blog/, se quitan duplicados, se ordenan por fecha de publicación y a cada página N del blog
 * se le asigna su tramo de POR_PAGINA entradas. La navegación (1, 2, 3 … 7) la genera WordPress
 * con el total real de entradas y se conserva.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const POR_PAGINA = 10;
const ARTICULO = /<article class="fem-(?:featured|post)-card"[\s\S]*?<\/article>/g;
const INI = '<!-- ===== POST DESTACADO';
const FIN = '<div class="blog-pagination">';

type Tarjeta = { html: string; href: string; fecha: string };

let cache: Tarjeta[] | null = null;

function tramo(h: string): string {
  const i = h.indexOf(INI), j = h.indexOf(FIN);
  return i >= 0 && j > i ? h.slice(i, j) : '';
}

/** Todas las entradas publicadas (una tarjeta por enlace), de la más reciente a la más antigua. */
function todasLasTarjetas(): Tarjeta[] {
  if (cache) return cache;
  const dir = join(process.cwd(), 'src/site/pages');
  let files: string[] = [];
  try {
    files = readdirSync(dir).filter((f) => /^(blog|category__[a-z0-9-]+(__page__\d+)?)\.html$/.test(f));
  } catch {
    return (cache = []);
  }
  const porHref = new Map<string, Tarjeta>();
  // blog.html primero: su insignia es la categoría principal de la entrada, como en el resto de /blog/.
  files.sort((a, b) => (a === 'blog.html' ? -1 : b === 'blog.html' ? 1 : a.localeCompare(b)));
  for (const f of files) {
    for (const a of tramo(readFileSync(join(dir, f), 'utf8')).match(ARTICULO) ?? []) {
      const href = (a.match(/__title">\s*<a href="([^"]+)"/) ?? [])[1];
      const fecha = (a.match(/<time datetime="([^"]+)"/) ?? [])[1];
      if (!href || !fecha || porHref.has(href)) continue;
      // Normaliza a tarjeta de grid.
      const html = a.replace(/fem-featured-card/g, 'fem-post-card')
        .replace(/<h2 class="fem-post-card__title">([\s\S]*?)<\/h2>/, '<h3 class="fem-post-card__title">$1</h3>')
        .replace(/\s*<a class="fem-post-card__link"[^>]*>[^<]*<\/a>/, '')
        .replace(' fetchpriority="high"', ' loading="lazy"');
      porHref.set(href, { html, href, fecha });
    }
  }
  return (cache = [...porHref.values()].sort((a, b) => b.fecha.localeCompare(a.fecha)));
}

/** Número de página de una ruta del blog (/blog/ → 1, /blog/page/3/ → 3) o null si no es del blog. */
export function paginaDelBlog(route: string): number | null {
  if (route === '/blog/') return 1;
  const m = route.match(/^\/blog\/page\/(\d+)\/$/);
  return m ? Number(m[1]) : null;
}

export function paginarBlog(html: string, pagina: number): string {
  const ini = html.indexOf(INI), fin = html.indexOf(FIN);
  if (ini < 0 || fin < 0) return html;
  const todas = todasLasTarjetas();
  const sel = todas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  // Si algo falla al reunir las tarjetas, se deja el HTML de WordPress tal cual.
  if (todas.length < POR_PAGINA || sel.length === 0) return html;

  const [primera, ...resto] = sel;
  const destacada = primera.html
    .replace(/fem-post-card/g, 'fem-featured-card')
    .replace(/<h3 class="fem-featured-card__title">([\s\S]*?)<\/h3>/, '<h2 class="fem-featured-card__title">$1</h2>')
    .replace(' loading="lazy"', pagina === 1 ? ' fetchpriority="high"' : ' loading="lazy"')
    .replace(/(\s*<\/div>\s*<\/article>)$/, `\n    <a class="fem-featured-card__link" href="${primera.href}">Leer más →</a>$1`);
  const nuevo = `<!-- ===== POST DESTACADO (paginación del blog, src/lib/blog.ts) ===== -->\n${destacada}\n` +
    `<div class="blog-grid">\n${resto.map((t) => t.html).join('\n')}\n</div>\n      `;
  return html.slice(0, ini) + nuevo + html.slice(fin);
}
