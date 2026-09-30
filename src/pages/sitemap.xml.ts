import type { APIRoute } from 'astro';
import { allPages } from '../lib/site';

// Sitemap único con todas las URLs públicas (reemplaza a los sitemaps de All in One SEO).
export const GET: APIRoute = ({ site }) => {
  const base = (site?.toString() ?? 'https://fundacioneugeniomendoza.com/').replace(/\/$/, '');
  const urls = allPages()
    .filter((p) => p.route !== '/404/')
    .map((p) => p.route)
    .sort()
    .map((r) => `  <url><loc>${base}${encodeURI(r)}</loc></url>`)
    .join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
