import { defineConfig } from 'astro/config';

// Las URLs se mantienen idénticas a las de WordPress (/slug/ con barra final)
// para no romper enlaces entrantes ni SEO al sustituir el sitio.
export default defineConfig({
  site: 'https://fundacioneugeniomendoza.com',
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory', assets: '_astro' },
  // El HTML se conserva tal cual para garantizar paridad visual con el original.
  compressHTML: false,
});
