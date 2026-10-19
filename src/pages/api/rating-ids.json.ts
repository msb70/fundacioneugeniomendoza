import type { APIRoute } from 'astro';
import { allPages } from '../../lib/site';

// Lista de IDs con caja de valoración en el sitio. rating.php la usa para aceptar votos de
// entradas nuevas (publicadas después de sembrar ratings.json), sin admitir IDs arbitrarios.
export const GET: APIRoute = () => {
  const ids = new Set<number>();
  for (const p of allPages()) {
    for (const m of p.body.matchAll(/class="fem-rating-box" data-post-id="(\d+)"/g)) ids.add(Number(m[1]));
  }
  return new Response(JSON.stringify([...ids].sort((a, b) => a - b)), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
