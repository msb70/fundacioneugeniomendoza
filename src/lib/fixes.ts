// Correcciones aplicadas en el build sobre el HTML heredado de WordPress.
// Viven aquí (y no en src/site/pages/*.html) para que sobrevivan a cada sincronización
// con el WordPress: los scripts de tools/migracion reescriben las páginas, no este archivo.
// Revisión del sitio del 19-10-2026 (hallazgos C1, M3, M4, M5, M6, M7, M8, B1, B2, B4).
import seo from '../site/seo.json';
import carrusel from '../site/carrusel.json';
import { agendaHtml, ordenarListadoEventos, eventos, rangoFechas } from './agenda';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SITE = 'https://fundacioneugeniomendoza.com';
/**
 * URL de un archivo propio de public/ con ?v=<hash del contenido>. El CDN de Hostinger y los
 * navegadores guardan /assets/* 30 días (max-age=2592000): sin versión, un cambio en fem-static.js
 * o fem-fixes.css no llega a los visitantes (el menú móvil no respondía por eso, 19-10-2026).
 */
const assetCache = new Map<string, string>();
export function asset(path: string): string {
  let url = assetCache.get(path);
  if (!url) {
    const hash = createHash('sha1').update(readFileSync(join(process.cwd(), 'public', path))).digest('hex').slice(0, 10);
    url = `${path}?v=${hash}`;
    assetCache.set(path, url);
  }
  return url;
}

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

/** Hojas de estilo y scripts compartidos (fragments.json). */
export function fixHead(html: string): string {
  return html
    // QA-10: el icono es PNG (no x-icon); además existe /favicon.ico para quien lo pida directamente.
    .replace('<link rel="icon" href="/favicon.png" type="image/x-icon">',
      '<link rel="icon" href="/favicon.png" type="image/png"><link rel="icon" href="/favicon.ico" sizes="any">')
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
      `<link rel='stylesheet' id='fem-google-fonts-css' href='${asset('/assets/fonts/fonts.css')}' media='all' />`)
    .replace(/<link rel='stylesheet' id='fontawesome-css' href='https:\/\/cdnjs\.cloudflare\.com\/[^']*' media='all' \/>/g,
      `<link rel='stylesheet' id='fontawesome-css' href='${asset('/assets/fa/fa.css')}' media='all' />`)
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

  // Diapositivas propias del carrusel de la home (src/site/carrusel.json).
  if (route === '/') b = addSlides(b);

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

  // Contenido añadido a una entrada fuera de WordPress (src/site/extras/<slug>.html).
  b = addExtras(b, route);

  // Calendario de eventos encima del listado de la categoría Eventos (src/site/eventos.json).
  if (route === '/category/eventos/') {
    b = b.replace(/(\s*<!-- ===== POSTS)/, agendaHtml(asset('/assets/eventos/agenda.js')) + '$1');
    b = ordenarListadoEventos(b);
  }

  // QA-06: campos que solo tenían placeholder (formulario de la portada): nombre accesible.
  b = b.replace(/<(input|textarea)\b(?![^>]*\baria-label)([^>]*?\bplaceholder="([^"]+)")/g, (m, tag, rest, ph) =>
    /\bid="/.test(rest) && b.includes(`for="${(rest.match(/\bid="([^"]+)"/) ?? [])[1]}"`) ? m : `<${tag} aria-label="${ph}"${rest}`);

  // B1: enlaces rotos heredados del WordPress.
  b = b
    .replace(/(zoom\.us\/meeting\/register\/[A-Za-z0-9_-]+)\.(")/g, '$1$2')
    .replace(/href="(https:\/\/fundacioneugeniomendoza\.com)?\/colaborar"/g, 'href="/colaborar/"');

  // M7: enlaces que abren pestaña nueva sin rel de seguridad.
  b = b.replace(/<a\b(?![^>]*\brel=)([^>]*\btarget="_blank")/g, '<a rel="noopener"$1');

  return { body: b, mainId };
}

/**
 * Bloques extra de una entrada: src/site/extras/<slug>.html se inserta antes del último H2 de la
 * entrada (o al final del contenido si no hay H2). Sirve cuando no se puede editar la entrada en
 * WordPress; la sincronización no toca src/site/extras. Si la entrada de WordPress ya trae un
 * elemento con el mismo id que el primer encabezado del extra (p. ej. id="agenda"), no se duplica.
 */
function addExtras(html: string, route: string): string {
  const slug = route.replace(/^\/|\/$/g, '');
  if (!slug || slug.includes('/')) return html;
  let extra: string;
  try {
    extra = readFileSync(join(process.cwd(), 'src/site/extras', `${slug}.html`), 'utf8');
  } catch {
    return html;
  }
  const id = extra.match(/<h2\b[^>]*\bid="([^"]+)"/)?.[1];
  if (id && new RegExp(`\\bid="${id}"`).test(html)) return html;
  const content = html.match(/<div class="single-content"[^>]*>/);
  if (!content || content.index === undefined) return html;
  const start = content.index;
  const h2s = [...html.matchAll(/<h2 class="wp-block-heading"[^>]*>/g)].filter((m) => (m.index ?? 0) > start);
  const at = h2s.length ? h2s[h2s.length - 1].index! : -1;
  if (at < 0) return html;
  return html.slice(0, at) + extra + '\n' + html.slice(at);
}

type Slide = {
  id: string; imagen: string; enlace?: string; nuevaPestana?: boolean; texto: string;
  movil?: string; primera?: boolean; hasta?: string | null; evento?: boolean;
};

/** Imagen destacada (la mayor del srcset) de una entrada ya sincronizada en src/site/pages. */
function imagenDestacada(enlace: string): string | undefined {
  const slug = enlace.replace(/^\/|\/$/g, '');
  let html: string;
  try {
    html = readFileSync(join(process.cwd(), 'src/site/pages', `${slug}.html`), 'utf8');
  } catch {
    return undefined;
  }
  const img = html.match(/<img\b[^>]*\bwp-post-image\b[^>]*>/)?.[0];
  if (!img) return undefined;
  const set = img.match(/\bsrcset="([^"]+)"/)?.[1];
  if (set) {
    const best = set.split(',').map((c) => c.trim().split(/\s+/))
      .map(([u, w]) => ({ u, w: parseInt(w, 10) || 0 })).sort((a, b) => b.w - a.w)[0];
    if (best?.u) return best.u;
  }
  return img.match(/\bsrc="([^"]+)"/)?.[1];
}

/**
 * Diapositivas automáticas: una por cada evento de eventos.json que aún no ha terminado
 * (fin, o inicio si dura un día, >= hoy). Usa la imagen destacada de su entrada; si la entrada
 * aún no está sincronizada o no tiene imagen, se omite. Si una diapositiva manual de carrusel.json
 * enlaza al mismo evento, manda la manual.
 */
function slidesDeEventos(today: string, manuales: Slide[]): Slide[] {
  const enlaces = new Set(manuales.map((s) => s.enlace));
  return eventos()
    .filter((e) => (e.fin ?? e.inicio) >= today && !enlaces.has(e.enlace))
    .flatMap((e) => {
      const imagen = (e as { imagen?: string }).imagen ?? imagenDestacada(e.enlace);
      if (!imagen) return [];
      const slug = e.enlace.replace(/^\/|\/$/g, '');
      return [{
        id: `evento-${slug}`, imagen, enlace: e.enlace, primera: true, hasta: e.fin ?? e.inicio, evento: true,
        texto: `Evento: ${e.titulo}, ${rangoFechas(e)}${e.lugar ? `, ${e.lugar}` : ''}`,
      }];
    });
}

// Posiciones de fondo que el tema asigna por orden (style.css del tema, .fem-hero-slide:nth-child(n)).
// Al insertar diapositivas delante, se mantienen para las originales.
const CADUCIDAD_JS = `<script>(function(){var c=document.querySelector('.fem-hero-carousel');if(!c)return;var now=Date.now(),act=false;
c.querySelectorAll('[data-fem-hasta]').forEach(function(el){if(now>Date.parse(el.getAttribute('data-fem-hasta')+'T23:59:59-04:00')){if(el.classList.contains('active'))act=true;el.remove();}});
if(act){var s=c.querySelector('.fem-hero-slide'),d=c.querySelector('.fem-hero-dots button');if(s)s.classList.add('active');if(d)d.classList.add('active');}})();</script>`;

const THEME_POS = { tablet: ['75% center', '75% center', '75% center'], movil: ['78% center', '80% center', '85% center'] };

/** Inserta en el carrusel de la home las diapositivas vigentes de carrusel.json. */
export function addSlides(html: string, today = new Date().toISOString().slice(0, 10)): string {
  const manuales = (carrusel.slides as Slide[]).filter((s) => !s.hasta || s.hasta >= today);
  // Orden: manuales marcadas como primeras, eventos próximos (el más cercano primero), el resto.
  const slides = [...manuales.filter((s) => s.primera), ...slidesDeEventos(today, manuales), ...manuales.filter((s) => !s.primera)];
  if (!slides.length || !html.includes('<div class="fem-hero-track">')) return html;
  const first = slides.filter((s) => s.primera);
  const last = slides.filter((s) => !s.primera);

  const slideHtml = (s: Slide, active: boolean) =>
    `\n    <!-- Diapositiva propia: ${s.id} (src/site/carrusel.json) -->\n` +
    `    <a class="fem-hero-slide fem-slide--${s.id}${s.evento ? ' fem-slide--evento' : ''}${active ? ' active' : ''}" href="${esc(s.enlace ?? '#')}"` +
    (s.nuevaPestana ? ' target="_blank" rel="noopener"' : '') +
    (s.hasta ? ` data-fem-hasta="${s.hasta}"` : '') +
    (s.evento
      ? ` style="--fem-slide-img: url('${esc(s.imagen)}');"`
      : ` style="background-image: url('${esc(s.imagen)}');"`) +
    ` aria-label="${esc(s.texto)}"></a>\n`;
  const dot = (s: Slide, active: boolean) =>
    `\n    <button${active ? ' class="active"' : ''} type="button"${s.hasta ? ` data-fem-hasta="${s.hasta}"` : ''} aria-label="Ver: ${esc(s.texto.split(',')[0])}"></button>`;

  let h = html;
  if (first.length) {
    h = h.replace('class="fem-hero-slide active"', 'class="fem-hero-slide"');
    h = h.replace(/(<div class="fem-hero-dots"[^>]*>\s*<button) class="active"/, '$1');
  }
  h = h.replace('<div class="fem-hero-track">', '<div class="fem-hero-track">' + first.map((s, i) => slideHtml(s, i === 0)).join(''));
  if (last.length) {
    h = h.replace(/(<div class="fem-hero-track">[\s\S]*?)(\n\s*<\/div>\s*<button class="fem-hero-arrow)/,
      (_m, a: string, z: string) => a + last.map((s) => slideHtml(s, false)).join('') + z);
  }
  h = h.replace(/(<div class="fem-hero-dots"[^>]*>)/, '$1' + first.map((s, i) => dot(s, i === 0)).join(''));
  if (last.length) h = h.replace(/(<div class="fem-hero-dots"[^>]*>[\s\S]*?)(\n\s*<\/div>)/, (_m, a: string, z: string) => a + last.map((s) => dot(s, false)).join('') + z);

  // CSS: posición en móvil de las nuevas y la que tenían las originales antes de desplazarse.
  const n = first.length;
  const shift = (bp: 'tablet' | 'movil') =>
    THEME_POS[bp].map((p, i) => `.fem-hero-track > .fem-hero-slide:nth-child(${i + 1 + n}){background-position:${p} !important}`).join('');
  const own = slides.filter((s) => s.movil).map((s) => `.fem-hero-slide.fem-slide--${s.id}{background-position:${s.movil} !important}`).join('');
  const css = `<style>@media (min-width:769px) and (max-width:1180px){${n ? shift('tablet') : ''}}` +
    `@media (max-width:768px){${n ? shift('movil') : ''}${own}}</style>`;
  h = h.replace('<section class="fem-hero-carousel"', css + '\n  <section class="fem-hero-carousel"');
  // Retira en el navegador las diapositivas cuya fecha ya pasó (hora de Caracas), aunque no haya
  // habido un build nuevo. Corre antes que el script del carrusel (DOMContentLoaded).
  return h.replace(/(<section class="fem-hero-carousel"[\s\S]*?<\/section>)/, '$1\n' + CADUCIDAD_JS);
}
