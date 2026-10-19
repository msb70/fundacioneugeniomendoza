// Calendario de eventos de /category/eventos/ (datos en src/site/eventos.json).
// El HTML lleva la lista completa de eventos (funciona sin JS) y los datos en JSON;
// /assets/eventos/agenda.js dibuja el calendario del mes actual y filtra la lista.
import data from '../site/eventos.json';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type Evento = {
  titulo: string; inicio: string; fin?: string; hora?: string; lugar?: string; enlace: string;
};

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** "23 y 24 de octubre de 2026", "27 al 29 de octubre de 2026", "30 de septiembre al 2 de octubre de 2026" */
export function rangoFechas(e: Evento): string {
  const [y1, m1, d1] = e.inicio.split('-').map(Number);
  if (!e.fin || e.fin === e.inicio) return `${d1} de ${MESES[m1 - 1]} de ${y1}`;
  const [y2, m2, d2] = e.fin.split('-').map(Number);
  if (y1 === y2 && m1 === m2) return `${d1} ${d2 - d1 === 1 ? 'y' : 'al'} ${d2} de ${MESES[m1 - 1]} de ${y1}`;
  if (y1 === y2) return `${d1} de ${MESES[m1 - 1]} al ${d2} de ${MESES[m2 - 1]} de ${y1}`;
  return `${d1} de ${MESES[m1 - 1]} de ${y1} al ${d2} de ${MESES[m2 - 1]} de ${y2}`;
}

export function eventos(): Evento[] {
  return [...(data.eventos as Evento[])].sort((a, b) => a.inicio.localeCompare(b.inicio));
}

function item(e: Evento): string {
  const [, m, d] = e.inicio.split('-').map(Number);
  return `<li class="fem-agenda__evento" data-inicio="${e.inicio}" data-fin="${e.fin ?? e.inicio}">
  <span class="fem-agenda__fecha" aria-hidden="true"><b>${d}</b>${MESES[m - 1].slice(0, 3)}</span>
  <div class="fem-agenda__info">
    <a class="fem-agenda__titulo" href="${esc(e.enlace)}">${esc(e.titulo)}</a>
    <p class="fem-agenda__meta"><time datetime="${e.inicio}">${rangoFechas(e)}</time>${e.hora ? ` · ${esc(e.hora)}` : ''}</p>
    ${e.lugar ? `<p class="fem-agenda__lugar">${esc(e.lugar)}</p>` : ''}
  </div>
</li>`;
}

/** Bloque del calendario para insertar antes del listado de entradas. */
export function agendaHtml(scriptSrc: string): string {
  const evs = eventos();
  if (!evs.length) return '';
  return `
  <!-- ===== CALENDARIO DE EVENTOS (src/site/eventos.json, src/lib/agenda.ts) ===== -->
  <section class="fem-agenda" aria-labelledby="fem-agenda-titulo">
    <div class="container">
      <div class="fem-agenda__panel">
        <div class="fem-agenda__cal" hidden>
          <div class="fem-agenda__cabecera">
            <button type="button" class="fem-agenda__nav" data-dir="-1" aria-label="Mes anterior">&#8249;</button>
            <h2 id="fem-agenda-titulo" class="fem-agenda__mes" aria-live="polite">Calendario de eventos</h2>
            <button type="button" class="fem-agenda__nav" data-dir="1" aria-label="Mes siguiente">&#8250;</button>
          </div>
          <table class="fem-agenda__grid">
            <thead><tr><th scope="col" abbr="lunes">L</th><th scope="col" abbr="martes">M</th><th scope="col" abbr="miércoles">X</th><th scope="col" abbr="jueves">J</th><th scope="col" abbr="viernes">V</th><th scope="col" abbr="sábado">S</th><th scope="col" abbr="domingo">D</th></tr></thead>
            <tbody></tbody>
          </table>
          <p class="fem-agenda__leyenda"><span class="fem-agenda__punto"></span> Día con evento <span class="fem-agenda__hoy-muestra"></span> Hoy</p>
        </div>
        <div class="fem-agenda__lista-wrap">
          <div class="fem-agenda__lista-cabecera">
            <h3 class="fem-agenda__subtitulo">Todos los eventos</h3>
            <button type="button" class="fem-agenda__todo" hidden>Ver todo el mes</button>
          </div>
          <ul class="fem-agenda__lista">
${evs.map(item).join('\n')}
          </ul>
          <p class="fem-agenda__vacio" hidden>No hay eventos este mes.</p>
        </div>
      </div>
    </div>
  </section>
  <script src="${scriptSrc}" defer></script>
`;
}

/**
 * Listado de /category/eventos/: ordena las tarjetas por fecha del evento (la más reciente primero)
 * en lugar de por fecha de publicación, y muestra la fecha del evento en la tarjeta.
 * Las entradas sin fecha en eventos.json usan su fecha de publicación.
 */
const ARTICULO = /<article class="fem-(?:featured|post)-card"[\s\S]*?<\/article>/g;

/** Tarjetas de las páginas 2, 3… de la categoría Eventos (src/site/pages/category__eventos__page__N.html). */
function tarjetasDeOtrasPaginas(): string[] {
  const dir = join(process.cwd(), 'src/site/pages');
  let files: string[] = [];
  try {
    files = readdirSync(dir).filter((f) => /^category__eventos__page__\d+\.html$/.test(f));
  } catch {
    return [];
  }
  return files.flatMap((f) => {
    const h = readFileSync(join(dir, f), 'utf8');
    const i = h.indexOf('<!-- ===== POST DESTACADO'), j = h.indexOf('<div class="blog-pagination">');
    return (i >= 0 && j > i ? h.slice(i, j) : h).match(ARTICULO) ?? [];
  });
}

export function ordenarListadoEventos(html: string): string {
  const ini = html.indexOf('<!-- ===== POST DESTACADO');
  const fin = html.indexOf('<div class="blog-pagination">');
  if (ini < 0 || fin < 0) return html;
  const tramo = html.slice(ini, fin);
  // Todas las entradas de Eventos en una sola página: el calendario filtra por mes en el navegador
  // y no puede mostrar las de septiembre si están en /page/2/. Se quita la paginación.
  const vistos = new Set<string>();
  const arts = [...(tramo.match(ARTICULO) ?? []), ...tarjetasDeOtrasPaginas()].filter((a) => {
    const href = (a.match(/__title">\s*<a href="([^"]+)"/) ?? [])[1] ?? a;
    if (vistos.has(href)) return false;
    vistos.add(href);
    return true;
  });
  if (arts.length < 2) return html;

  const porEnlace = new Map(eventos().map((e) => [e.enlace, e]));
  const tarjetas = arts.map((a) => {
    // Normaliza todo a tarjeta de grid
    let g = a.replace(/fem-featured-card/g, 'fem-post-card')
      .replace(/<h2 class="fem-post-card__title">([\s\S]*?)<\/h2>/, '<h3 class="fem-post-card__title">$1</h3>')
      .replace(/\s*<a class="fem-post-card__link"[^>]*>[^<]*<\/a>/, '')
      .replace(' fetchpriority="high"', ' loading="lazy"');
    const href = (g.match(/<h3 class="fem-post-card__title">\s*<a href="([^"]+)"/) ?? [])[1] ?? '';
    const ev = porEnlace.get(href);
    const pub = (g.match(/<time datetime="([^"]+)"/) ?? [])[1]?.slice(0, 10) ?? '';
    if (ev) {
      g = g.replace(/<time datetime="[^"]*">[^<]*<\/time>/, `<time datetime="${ev.inicio}">Evento: ${rangoFechas(ev)}</time>`);
    }
    const desde = ev ? ev.inicio : pub, hasta = ev ? ev.fin ?? ev.inicio : pub;
    g = g.replace(/^<article class="fem-post-card"/, `<article class="fem-post-card" data-inicio="${desde}" data-fin="${hasta}"`);
    return { g, fecha: desde, href };
  });
  tarjetas.sort((a, b) => b.fecha.localeCompare(a.fecha));

  const destacada = tarjetas[0].g
    .replace(/fem-post-card/g, 'fem-featured-card')
    .replace(/<h3 class="fem-featured-card__title">([\s\S]*?)<\/h3>/, '<h2 class="fem-featured-card__title">$1</h2>')
    .replace(' loading="lazy"', ' fetchpriority="high"')
    .replace(/(\s*<\/div>\s*<\/article>)$/, `\n    <a class="fem-featured-card__link" href="${tarjetas[0].href}">Leer más →</a>$1`);
  const nuevo = `<!-- ===== POST DESTACADO (ordenado por fecha del evento, src/lib/agenda.ts) ===== -->\n${destacada}\n` +
    `<div class="blog-grid">\n${tarjetas.slice(1).map((t) => t.g).join('\n')}\n</div>\n` +
    `<p class="fem-agenda__sin-entradas" hidden>No hay entradas de eventos en este mes.</p>\n      `;
  const resto = html.slice(fin).replace(/<div class="blog-pagination">[\s\S]*?<\/nav>\s*<\/div>/, '');
  return html.slice(0, ini) + nuevo + resto;
}
