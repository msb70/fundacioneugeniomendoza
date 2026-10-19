// Acceso a los datos del sitio (extraídos del WordPress original).
import fragments from '../site/fragments.json';
import { fixBody, fixHead, fixSeo, isTag, postCount } from './fixes';

export type MenuState = {
  overrides: Record<string, string>; // menu-item-id -> clases completas del <li>
  aria: string[]; // ids de menú con aria-current="page"
  logoCurrent: boolean;
  hrefs?: Record<string, string>; // menu-item-id -> href propio de esa página (p. ej. anclas en la home)
};

export type PageMeta = {
  route: string;
  mainId?: string; // id del <main> (destino del enlace "Saltar al contenido")
  htmlAttrs: string;
  bodyClass: string;
  seo: string;
  head: string[];
  pre: string;
  tail: string[];
  menu: MenuState;
};

const metas = import.meta.glob<PageMeta>('../site/pages/*.json', { eager: true, import: 'default' });
const bodies = import.meta.glob<string>('../site/pages/*.html', { eager: true, query: '?raw', import: 'default' });

export type Page = PageMeta & { key: string; body: string };

export const SITE_ENV = import.meta.env.PUBLIC_SITE_ENV ?? 'staging';
export const IS_PRODUCTION = SITE_ENV === 'production';

let cache: Page[] | undefined;

/**
 * Todas las páginas migradas, con las correcciones de src/lib/fixes.ts aplicadas.
 * Las etiquetas sin ninguna entrada (restos de entradas borradas en WordPress) no se generan:
 * public/.htaccess las redirige a /blog/.
 */
export function allPages(): Page[] {
  cache ??= Object.entries(metas)
    .map(([path, meta]) => {
      const key = path.split('/').pop()!.replace(/\.json$/, '');
      const raw = bodies[path.replace(/\.json$/, '.html')] ?? '';
      const { body, mainId } = fixBody(raw, meta.route, meta.seo);
      return { ...meta, key, body, mainId, seo: fixSeo(meta.seo, meta.route) };
    })
    .filter((p) => !(isTag(p.route) && postCount(p.body) === 0));
  return cache;
}

/** Rutas de etiquetas vacías que se dejan de generar (para la redirección 301). */
export function emptyTagRoutes(): string[] {
  return Object.entries(metas)
    .filter(([path, meta]) => isTag(meta.route) && postCount(bodies[path.replace(/\.json$/, '.html')] ?? '') === 0)
    .map(([, meta]) => meta.route);
}

export function pageByRoute(route: string): Page | undefined {
  return allPages().find((p) => p.route === route);
}

export function fragment(hash: string): string {
  const html = (fragments as Record<string, string>)[hash];
  if (html === undefined) throw new Error(`Fragmento inexistente: ${hash}`);
  return fixHead(html);
}

/** Convierte 'lang="es" dir="ltr"' en objeto de atributos. */
export function parseAttrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(/([\w:-]+)="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}
