# Fundación Eugenio Mendoza — sitio web

Migración de `fundacioneugeniomendoza.com` desde WordPress a un sitio estático con **Astro**.
Mismo diseño, mismas URLs, mismas fotos y mismo contenido; sin base de datos ni PHP de WordPress.

| Entorno | URL | Rama que publica |
|---|---|---|
| Pruebas | https://rosybrown-partridge-192653.hostingersite.com | `deploy` (auto) |
| Producción (pendiente) | https://fundacioneugeniomendoza.com | — (sigue en WordPress) |

## Cómo funciona

```
push a main → GitHub Actions: npm ci + astro build → fuerza dist/ a la rama deploy
            → Hostinger (hPanel → Git, auto-deploy) publica deploy en public_html
```

- `main`: código fuente. **Nunca** conectar `main` a Hostinger (publicaría `tools/`, etc.).
- `deploy`: solo el sitio compilado. La genera el CI; no se edita a mano.

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
