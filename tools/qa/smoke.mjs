// Comprobación automática del sitio compilado (dist/) antes de publicar.
// Recomendada por la auditoría QA del 19-10-2026: cero excepciones JS, cero recursos propios con
// error 4xx/5xx (bloquean la publicación) y, como aviso, un único <h1> por página y ningún campo
// de formulario sin nombre accesible (el contenido viene de WordPress: un aviso no frena el blog).
// Uso: node tools/qa/smoke.mjs  (requiere `npx playwright install chromium`)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const DIST = path.resolve('dist');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.xml': 'application/xml', '.pdf': 'application/pdf' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let f = path.join(DIST, p);
  if (!f.startsWith(DIST)) { res.writeHead(400).end(); return; }
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!fs.existsSync(f)) { res.writeHead(404, { 'content-type': TYPES['.html'] }); fs.createReadStream(path.join(DIST, '404.html')).pipe(res); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f).toLowerCase()] ?? 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const ORIGIN = `http://localhost:${server.address().port}`;

const xml = fs.readFileSync(path.join(DIST, 'sitemap.xml'), 'utf8');
const routes = [...new Set([...xml.matchAll(/<loc>https?:\/\/[^/]+([^<]*)<\/loc>/g)].map((m) => m[1])
  .concat(['/category/eventos/', '/trabaja-con-nosotros/', '/qa-ruta-inexistente/']))];

const browser = await chromium.launch();
const ctx = await browser.newContext();
// Solo se prueba lo propio: lo externo (YouTube, mapas, analítica…) se bloquea.
await ctx.route((u) => !u.href.startsWith(ORIGIN), (r) => r.abort());
const fallos = [], avisos = [];
for (const route of routes) {
  const page = await ctx.newPage();
  const errs = [], warns = [];
  page.on('pageerror', (e) => errs.push(`excepción JS: ${e.message.split('\n')[0]}`));
  page.on('response', (r) => {
    const u = r.url();
    if (u.startsWith(ORIGIN) && r.status() >= 400 && !(route === '/qa-ruta-inexistente/' && u === ORIGIN + route))
      errs.push(`${r.status()} ${u.slice(ORIGIN.length)}`);
  });
  try {
    await page.goto(ORIGIN + route, { waitUntil: 'load', timeout: 30000 });
    const a = await page.evaluate(() => ({
      h1: document.querySelectorAll('h1').length,
      sinNombre: [...document.querySelectorAll('input:not([type=hidden]):not([type=submit]),textarea,select')]
        .filter((i) => i.offsetParent !== null && !(i.labels && i.labels.length) && !i.getAttribute('aria-label') && !i.getAttribute('aria-labelledby'))
        .map((i) => i.name || i.id),
    }));
    if (a.h1 !== 1) warns.push(`${a.h1} encabezados h1`);
    if (a.sinNombre.length) warns.push(`campos sin nombre accesible: ${a.sinNombre.join(', ')}`);
  } catch (e) {
    errs.push(`no carga: ${e.message.split('\n')[0]}`);
  }
  if (errs.length) fallos.push(`${route}\n  - ${[...new Set(errs)].join('\n  - ')}`);
  if (warns.length) avisos.push(`${route}\n  - ${warns.join('\n  - ')}`);
  await page.close();
}
await browser.close();
server.close();

console.log(`QA: ${routes.length} páginas revisadas, ${fallos.length} con errores, ${avisos.length} con avisos.`);
if (avisos.length) console.log('AVISOS (no bloquean):\n' + avisos.join('\n'));
if (fallos.length) { console.log('ERRORES:\n' + fallos.join('\n')); process.exit(1); }
