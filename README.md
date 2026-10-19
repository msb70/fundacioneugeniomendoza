# Fundación Eugenio Mendoza — sitio web

Migración de `fundacioneugeniomendoza.com` desde WordPress a un sitio estático con **Astro**.
Mismo diseño, mismas URLs, mismas fotos y mismo contenido; sin base de datos ni PHP de WordPress.

| Entorno | URL | Rama que publica |
|---|---|---|
| Producción | https://fundacioneugeniomendoza.com | `deploy` (auto) |
| Pruebas | https://pruebas.fundacioneugeniomendoza.com | `deploy-staging` (auto, siempre noindex) |

## Cómo funciona

```
push a main → GitHub Actions: npm ci + astro build → fuerza dist/ a la rama deploy
            → Hostinger (hPanel → Git, auto-deploy) publica deploy en public_html
```

- `main`: código fuente. **Nunca** conectar `main` a Hostinger (publicaría `tools/`, etc.).
- `deploy`: solo el sitio compilado. La genera el CI; no se edita a mano.
- `deploy-staging`: el mismo sitio compilado en modo pruebas (noindex, robots bloqueado). La genera el CI en cada push.

## Publicación automática desde WordPress

El equipo sigue publicando en el WordPress temporal. El workflow **Sincronizar blog desde WordPress**
(`.github/workflows/sync-wordpress.yml`) se ejecuta cada hora, o al momento desde
Actions → *Sincronizar blog desde WordPress* → *Run workflow*:

1. `tools/sync/sync_wp.py` pide a la API REST de WordPress las entradas, categorías y etiquetas
   publicadas, descarga esas páginas y las convierte con `tools/migracion/assets.py` y `convert.py`.
2. Copia al repo solo entradas, listados, categorías, etiquetas, home y medios. Las páginas fijas,
   aliados, cabecera, pie y `/recursos/` no se tocan. El homenaje temporal de la home se conserva.
3. Una entrada borrada en WordPress se retira y se redirige con 301 a su nueva URL o a `/blog/`
   (bloque `sync-redirects` de `.htaccess`).
4. Genera WebP de las imágenes nuevas y recalcula el subconjunto de Font Awesome.
5. Compila, hace commit en `main` y publica (llama a `deploy.yml`).

Salvaguardas: si la API falla, devuelve menos del 80 % de las entradas o desaparecerían más de 3
entradas de golpe, el workflow se detiene sin tocar nada y GitHub avisa por correo del fallo.
Si el WordPress se protege con contraseña, crear los secretos `WP_USER` y `WP_PASS` en
Settings → Secrets and variables → Actions. Si cambia de dirección, crear la variable `WP_URL`.

## Rendimiento

- Imágenes: `tools/optimizar_imagenes.py` crea una `.webp` junto a cada JPG/PNG y el build la sirve.
- Fuentes Inter y Playfair Display auto-alojadas en `public/assets/fonts/` (antes Google Fonts).
- Iconos: `tools/fa_subset.py` genera `public/assets/fa/` con solo los iconos usados (antes Font
  Awesome completo desde cdnjs). Tras añadir iconos nuevos: `npm ci && python3 tools/fa_subset.py`.

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

**SMTP autenticado (recomendado):** crear el buzón `no-reply@fundacioneugeniomendoza.com` en hPanel y,
con el Administrador de archivos, el archivo `fem-data/smtp.php` (carpeta hermana de `public_html`,
nunca dentro):

```php
<?php return ['host' => 'smtp.hostinger.com', 'port' => 465, 'secure' => 'ssl',
              'user' => 'no-reply@fundacioneugeniomendoza.com', 'pass' => 'CONTRASEÑA_DEL_BUZÓN'];
```

Sin ese archivo, o si SMTP falla, se usa `mail()` de PHP.

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
