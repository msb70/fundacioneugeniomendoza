# Fundación Eugenio Mendoza — sitio web

Migración de `fundacioneugeniomendoza.com` desde WordPress a un sitio estático con **Astro**.
Mismo diseño, mismas URLs, mismas fotos y mismo contenido; sin base de datos ni PHP de WordPress.

| Entorno | URL | Rama que publica |
|---|---|---|
| Producción | https://fundacioneugeniomendoza.com | `deploy` (auto) |
| Pruebas | sitio de Hostinger a conectar en hPanel → Git | `deploy-staging` (auto, siempre noindex) |

## Cómo funciona

```
push a main → GitHub Actions: npm ci + astro build → fuerza dist/ a la rama deploy
            → Hostinger (hPanel → Git, auto-deploy) publica deploy en public_html
```

- `main`: código fuente. **Nunca** conectar `main` a Hostinger (publicaría `tools/`, etc.).
- `deploy`: solo el sitio compilado. La genera el CI; no se edita a mano.
- `deploy-staging`: el mismo sitio compilado en modo pruebas (noindex, robots bloqueado). La genera el CI en cada push.

## Correcciones que sobreviven a la sincronización con WordPress

Las páginas de `src/site/pages/` se regeneran desde el WordPress. Por eso las correcciones de la
revisión del 19-10-2026 no están en ellas, sino en capas que la sincronización no toca:

| Dónde | Qué corrige |
|---|---|
| `src/lib/fixes.ts` | meta descriptions, og:image por defecto, canónicas, H1 de la home y categorías, campo anti-spam en formularios, id del `<main>`, enlaces rotos, `rel="noopener"`, fuentes rotas, scripts de Elementor sobrantes |
| `src/site/seo.json` | textos de las meta descriptions de las páginas principales |
| `src/layouts/Base.astro` | robots: etiquetas y fichas de aliados vacías con `noindex, follow`; enlace "Saltar al contenido"; feed RSS |
| `public/assets/fem-fixes.css` | contraste, menú móvil, desbordes en móvil, tamaños táctiles |
| `tools/migracion/localizar_es.py` | quita el `@import` vacío del `style.css` del tema (ejecutar tras cada sincronización) |

Las etiquetas sin entradas no se generan y `.htaccess` las redirige a `/blog/`. Etiquetas y aliados
quedan fuera del sitemap hasta que tengan contenido propio.

## Estructura

```
src/
  layouts/Base.astro        layout único (head, cabecera, pie, scripts)
  components/Header.astro   menú principal con estado activo idéntico al tema de WP
  components/Footer.astro   pie
  pages/[...route].astro    genera todas las URLs a partir de src/site/pages
  pages/sitemap.xml.ts      sitemap
  pages/robots.txt.ts       robots (bloquea todo en pruebas)
  lib/site.ts               carga de datos
  site/
    header.html, footer.html
    fragments.json          CSS/JS del <head> y de cierre, compartidos entre páginas
    pages/<ruta>.json       metadatos de cada URL (SEO, clases, orden de estilos, menú activo)
    pages/<ruta>.html       contenido de cada URL
public/
  wp-content/, wp-includes/ imágenes, PDFs, CSS y JS del tema (mismas rutas que WP)
  api/*.php                 formularios y valoraciones (ver abajo)
  assets/fem-static.js      avisos de formularios y refresco de valoraciones
  .htaccess                 404, barra final, redirecciones de WP, caché
tools/migracion/            scripts usados para extraer el sitio de WordPress
```

## Funciones que antes resolvía WordPress

| Función | Antes | Ahora |
|---|---|---|
| Formulario de contacto (home y /contacto/) | `admin-post.php` | `api/contact.php` → correo a contacto@ |
| Trabaja con nosotros (CV adjunto) | `admin-ajax.php` | `api/careers.php` → correo con adjunto |
| Valoración con estrellas | `admin-ajax.php` + BD | `api/rating.php` → `../fem-data/ratings.json` (fuera de public_html) |
| Comentarios | `wp-comments-post.php` | `api/comment.php` → correo para moderación (no se publican solos) |

Todos los formularios llevan un campo trampa anti-spam (`sitio_web_alt`) y guardan copia de cada envío en
`../fem-data/envios/AAAA-MM.log` (fuera de public_html), para que un fallo de correo no pierda mensajes.
El formulario de empleo funciona con y sin JavaScript.

Destinatario y remitente de correos: `public/api/lib.php` (`FEM_TO`, `FEM_FROM`).

## Desarrollo local

```bash
npm install
npm run dev            # http://localhost:4321
npm run build:staging  # compila en dist/ como en pruebas
```

## Editar contenido

Cada página es un par `src/site/pages/<ruta>.json` + `<ruta>.html`. Editar el `.html`,
commit y push a `main`. En ~1–2 minutos queda publicado.

Limitación actual: los listados del blog (`/blog/`, categorías, etiquetas) son HTML estático.
Una entrada nueva exige actualizar también esos listados.

## Paso a producción

1. En GitHub → Settings → Variables → `SITE_ENV = production` (quita el noindex de pruebas).
2. Revisar el meta `robots`: el WordPress original tiene **noindex, nofollow en todas las páginas**
   (se ha copiado igual). Si no es intencional, corregirlo antes de publicar.
3. Hacer backup completo del WordPress.
4. hPanel → Git del dominio principal → conectar este repo, rama `deploy`.
