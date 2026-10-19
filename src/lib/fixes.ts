// Correcciones aplicadas en el build sobre el HTML heredado de WordPress.
// Viven aquí (y no en src/site/pages/*.html) para que sobrevivan a cada sincronización
// con el WordPress: los scripts de tools/migracion reescriben las páginas, no este archivo.
// Revisión del sitio del 19-10-2026 (hallazgos C1, M3, M4, M5, M6, M7, M8, B1, B2, B4).
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import seo from '../site/seo.json';

const SITE = 'https://fundacioneugeniomendoza.com';
const HONEYPOT = 'sitio_web_alt'; // mismo nombre que FEM_HONEYPOT en public/api/lib.php

export const isTag = (route: string) => route.startsWith('/tag/');
export const isCategory = (route: string) => route.startsWith('/category/');
/** Fichas de aliados: hoy están vacías en WordPress (solo título). */
export const isAlly = (route: string) => /^\/aliados\/[^/]+\/$/.test(route);
/** Páginas sin contenido propio suficiente: noindex, follow y fuera del sitemap (M5). */
export const isThin = (route: string) => isTag(route) || isAlly(route);

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
/** Recorta a ~155 caracteres sin partir palabras. */
function clip(s: string, max = 155): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  return cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:.\s-]+$/, '') + '…';
}

/** Número de entradas listadas en una página de archivo (etiqueta o categoría). */
export const postCount = (body: string) => (body.match(/<article\b/g) ?? []).length;

/** Título sin el sufijo de marca, p. ej. "Emprendimiento". */
const bareTitle = (seoHtml: string) =>
  ((seoHtml.match(/<title>([^<]*)<\/title>/) ?? [])[1] ?? '').replace(/\s*[-|]\s*(FEM - )?Fundación Eugenio Mendoza\s*$/, '').trim();

/** Descripción para páginas que no la traen de WordPress. */
function describe(route: string, seoHtml: string): string | undefined {
  const fixed = (seo.descriptions as Record<string, string>)[route];
  if (fixed) return fixed;
  const name = bareTitle(seoHtml);
  if (isTag(route)) return `Artículos de la Fundación Eugenio Mendoza etiquetados como «${name}».`;
  if (isCategory(route)) return clip(`${name}: artículos, noticias e historias de impacto de la Fundación Eugenio Mendoza sobre ${name.toLowerCase()} en Venezuela y la región.`);
  if (route.startsWith('/blog/page/')) return (seo.descriptions as Record<string, string>)['/blog/'];
  if (isAlly(route)) {
    return clip(`${name}, aliado de la Fundación Eugenio Mendoza en sus programas de desarrollo social, primera infancia y cultura.`);
  }
  return undefined;
}

/** Ajustes del bloque SEO del <head>. */
export function fixSeo(seoHtml: string, route: string): string {
  let s = seoHtml;
  const url = SITE + encodeURI(route);

  // B2: canónica y og:url con la misma codificación que el sitemap (%F0… en mayúsculas).
  s = s.replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${url}$2`);
  s = s.replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${url}$2`);

  // M4: meta description donde falte.
  if (!/<meta name="description"/.test(s)) {
    const d = describe(route, s);
    if (d) {
      const tags = `<meta name="description" content="${esc(d)}" />` +
        (/og:description/.test(s) ? '' : `\n<meta property="og:description" content="${esc(d)}" />`);
      s = s.replace(/(<\/title>)/, `$1\n${tags}`);
    }
  }

  // M4: imagen para compartir por defecto en archivos (etiquetas y categorías no la traían).
  if (!/og:image/.test(s)) {
    const img = SITE + seo.defaultOgImage;
    s += `\n<meta property="og:image" content="${img}" />\n<meta name="twitter:card" content="summary_large_image" />\n<meta name="twitter:image" content="${img}" />`;
  }

  // M4: título de etiqueta distinto del de la categoría homónima.
  if (isTag(route)) s = s.replace(/<title>/, '<title>Etiqueta: ');

  // M5: el noindex de etiquetas y aliados lo pone Base.astro, que es quien fija robots por entorno.
  return s;
}

// ---------- Rendimiento (M6) ----------
const PUBLIC = join(process.cwd(), 'public');
const webpCache = new Map<string, boolean>();
const IMG = /(\/(?:wp-content|assets)\/[^"'\s,()<>?#]+?)\.(?:jpe?g|png)(?=[?"'\s,)<>]|$)/gi;

/** Sirve la versión .webp (tools/optimizar_imagenes.py) de cada JPG/PNG local cuando existe. */
// Fondos en línea con nombres que llevan espacios: url('/…/Mi foto.png')
const IMG_QUOTED = /(url\(\s*(['"]))(\/(?:wp-content|assets)\/[^'"]+?)\.(?:jpe?g|png)(?=\2\s*\))/gi;

function hasWebp(stem: string): boolean {
  let ok = webpCache.get(stem);
  if (ok === undefined) {
    let p = stem;
    try { p = decodeURI(stem); } catch { /* ruta con % sueltos: se usa tal cual */ }
    ok = existsSync(join(PUBLIC, p + '.webp'));
    webpCache.set(stem, ok);
  }
  return ok;
}

export function toWebp<T extends string | undefined>(html: T): T {
  if (!html) return html;
  return html
    .replace(IMG_QUOTED, (m, pre: string, _q: string, stem: string) => (hasWebp(stem) ? pre + stem + '.webp' : m))
    .replace(IMG, (m, stem: string) => (hasWebp(stem) ? stem + '.webp' : m)) as T;
}

/** Hojas de estilo y scripts compartidos (fragments.json). */
export function fixHead(html: string): string {
  return html
    // M6: "Segoe UI" no existe en Google Fonts (devolvía 400 en las 158 páginas).
    .replace(/<link rel='stylesheet' id='fem-conversion-font-css'[^>]*\/>\s*/g, '')
    // M3: scripts del timeline horizontal de Elementor. La página usa el timeline vertical (solo CSS),
    // y estos scripts necesitan Elementor (elementorModules) y además se cargaban dos veces.
    .replace(/<script id="twae-js-[^"]*" src="[^"]*twae-horizontal(?:\.min)?\.js"><\/script>\s*/g, '')
    // M6: fuentes auto-alojadas (antes Google Fonts) e iconos reducidos (antes Font Awesome completo
    // desde cdnjs, más una segunda copia de Essential Blocks). Ver tools/fa_subset.py.
    .replace(/<link rel='stylesheet' id='fem-google-fonts-css'[^>]*\/>/g,
      `<link rel="preload" href="/assets/fonts/inter-latin.woff2" as="font" type="font/woff2" crossorigin />` +
      `<link rel="preload" href="/assets/fonts/playfair-display-latin.woff2" as="font" type="font/woff2" crossorigin />` +
      `<link rel='stylesheet' id='fem-google-fonts-css' href='/assets/fonts/fonts.css' media='all' />`)
    .replace(/<link rel='stylesheet' id='fontawesome-css' href='https:\/\/cdnjs\.cloudflare\.com\/[^']*' media='all' \/>/g,
      `<link rel='stylesheet' id='fontawesome-css' href='/assets/fa/fa.css' media='all' />`)
    .replace(/<link rel='stylesheet' id='essential-blocks-fontawesome-css'[^>]*\/>\s*/g, '')
    .replace(/<link rel='dns-prefetch' href='\/\/(?:fonts\.googleapis\.com|cdnjs\.cloudflare\.com)' \/>\s*/g, '')
    // B4: restos de WordPress sin uso.
    .replace(/<link rel='dns-prefetch' href='\/\/www\.googletagmanager\.com' \/>\s*/g, '')
    .replace(/<link rel="https:\/\/api\.w\.org\/"[^>]*>\s*/g, '')
    .replace(/<link rel="EditURI"[^>]*>\s*/g, '')
    .replace(/"eb_admin_url":"\/wp-admin\/",/g, '')
    .replace(/"rest_rootURL":"\/wp-json\/",/g, '');
}

/** Cuerpo de cada página. Devuelve el HTML corregido y el id del <main> para el enlace "Saltar al contenido". */
export function fixBody(body: string, route: string, seoHtml: string): { body: string; mainId: string } {
  let b = body;

  // M8: campo trampa anti-spam en los formularios propios (los bots lo rellenan; las personas no lo ven).
  const trap =
    `<p class="fem-hp" aria-hidden="true"><label>No rellenar este campo ` +
    `<input type="text" name="${HONEYPOT}" value="" tabindex="-1" autocomplete="off" /></label></p>`;
  b = b.replace(/(<form\b[^>]*\baction="\/api\/(?:contact|comment|careers)\.php"[^>]*>)/g, `$1${trap}`);

  // M7: id en el <main> para el enlace de salto.
  let mainId = 'contenido';
  b = b.replace(/<main\b([^>]*)>/, (m, attrs: string) => {
    const id = attrs.match(/\bid="([^"]+)"/);
    if (id) {
      mainId = id[1];
      return m;
    }
    return `<main id="contenido"${attrs}>`;
  });

  // M4: la home no tenía H1 (el carrusel es solo imágenes).
  if (route === '/' && !/<h1\b/.test(b)) {
    b = b.replace(
      /(<main\b[^>]*>)/,
      '$1<h1 class="fem-sr-only">Fundación Eugenio Mendoza: desarrollo social, primera infancia y cultura en Venezuela desde 1951</h1>',
    );
  }

  // M4: en categorías el H1 decía solo "Blog".
  if (isCategory(route)) {
    const name = bareTitle(seoHtml);
    if (name) b = b.replace(/<h1>Blog/, `<h1>Blog: ${name}`);
  }

  // B1: enlaces rotos heredados del WordPress.
  b = b
    .replace(/(zoom\.us\/meeting\/register\/[A-Za-z0-9_-]+)\.(")/g, '$1$2')
    .replace(/href="(https:\/\/fundacioneugeniomendoza\.com)?\/colaborar"/g, 'href="/colaborar/"');

  // M7: enlaces que abren pestaña nueva sin rel de seguridad.
  b = b.replace(/<a\b(?![^>]*\brel=)([^>]*\btarget="_blank")/g, '<a rel="noopener"$1');

  // M6: imágenes en WebP.
  b = toWebp(b);

  return { body: b, mainId };
}
