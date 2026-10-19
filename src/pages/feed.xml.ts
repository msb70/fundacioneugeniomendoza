import type { APIRoute } from 'astro';
import { allPages } from '../lib/site';

// Feed RSS 2.0 de las entradas del blog. /feed/ (la URL de WordPress) redirige aquí desde .htaccess.
const pick = (s: string, re: RegExp) => (s.match(re) ?? [])[1] ?? '';
const xml = (s: string) => s.replace(/&(?!(?:amp|lt|gt|quot|#\d+);)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const GET: APIRoute = ({ site }) => {
  const base = (site?.toString() ?? 'https://fundacioneugeniomendoza.com/').replace(/\/$/, '');
  const items = allPages()
    .filter((p) => p.seo.includes('"BlogPosting"'))
    .map((p) => ({
      title: pick(p.seo, /<title>([^<]*)<\/title>/).replace(/\s*[-|]\s*(FEM - )?Fundación Eugenio Mendoza\s*$/, ''),
      link: base + encodeURI(p.route),
      date: pick(p.seo, /article:published_time" content="([^"]+)"/),
      desc: pick(p.seo, /<meta name="description" content="([^"]*)"/),
    }))
    .filter((i) => i.date)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 30);

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>Fundación Eugenio Mendoza</title>
  <link>${base}/blog/</link>
  <description>Noticias e historias de impacto de la Fundación Eugenio Mendoza</description>
  <language>es</language>
  <atom:link href="${base}/feed.xml" rel="self" type="application/rss+xml" />
${items
  .map(
    (i) => `  <item>
    <title>${xml(i.title)}</title>
    <link>${i.link}</link>
    <guid isPermaLink="true">${i.link}</guid>
    <pubDate>${new Date(i.date).toUTCString()}</pubDate>
    <description>${xml(i.desc)}</description>
  </item>`,
  )
  .join('\n')}
</channel>
</rss>
`;
  return new Response(body, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
};
