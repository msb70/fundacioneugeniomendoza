// Acceso a los datos del sitio (extraídos del WordPress original).
import fragments from '../site/fragments.json';

export type MenuState = {
  overrides: Record<string, string>; // menu-item-id -> clases completas del <li>
  aria: string[]; // ids de menú con aria-current="page"
  logoCurrent: boolean;
  hrefs?: Record<string, string>; // menu-item-id -> href propio de esa página (p. ej. anclas en la home)
};

export type PageMeta = {
  route: string;
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

export function allPages(): Page[] {
  return Object.entries(metas).map(([path, meta]) => {
    const key = path.split('/').pop()!.replace(/\.json$/, '');
    const body = bodies[path.replace(/\.json$/, '.html')] ?? '';
    return { ...meta, key, body };
  });
}

export function pageByRoute(route: string): Page | undefined {
  return allPages().find((p) => p.route === route);
}

export function fragment(hash: string): string {
  const html = (fragments as Record<string, string>)[hash];
  if (html === undefined) throw new Error(`Fragmento inexistente: ${hash}`);
  return html;
}

export const SITE_ENV = import.meta.env.PUBLIC_SITE_ENV ?? 'staging';
export const IS_PRODUCTION = SITE_ENV === 'production';

/** Convierte 'lang="es" dir="ltr"' en objeto de atributos. */
export function parseAttrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(/([\w:-]+)="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}
