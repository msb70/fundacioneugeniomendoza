import type { APIRoute } from 'astro';
import { IS_PRODUCTION } from '../lib/site';

export const GET: APIRoute = () => {
  const body = IS_PRODUCTION
    ? 'User-agent: *\nDisallow: /api/\n\nSitemap: https://fundacioneugeniomendoza.com/sitemap.xml\n'
    : 'User-agent: *\nDisallow: /\n';
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
