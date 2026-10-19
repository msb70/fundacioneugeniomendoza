import type { APIRoute } from 'astro';
import { allPages } from '../lib/site';
import { isThin } from '../lib/fixes';

// Sitemap único con las URLs indexables (reemplaza a los sitemaps de All in One SEO).
// Etiquetas y fichas de aliados (vacías) quedan fuera: llevan noindex (contenido escaso, revisión 19-10-2026).
const modified = (seo: string) =>
  (seo.match(/article:modified_time" content="([^"]+)"/) ?? seo.match(/"dateModified":"([^"]+)"/) ?? [])[1];

export const GET: APIRoute = ({ site }) => {
  const base = (site?.toString() ?? 'https://fundacioneugeniomendoza.com/').replace(/\/$/, '');
  const urls = allPages()
    .filter((p) => p.route !== '/404/' && !isThin(p.route))
    .map((p) => ({ route: p.route, lastmod: modified(p.seo) }))
    .concat([{ route: '/recursos/', lastmod: undefined }]) // páginas propias de Astro (no migradas de WordPress)
    .sort((a, b) => a.route.localeCompare(b.route))
    .map(
      ({ route, lastmod }) =>
        `  <url><loc>${base}${encodeURI(route)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`,
    )
    .join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
