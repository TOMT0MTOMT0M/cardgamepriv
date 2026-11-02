/**
 * Images du jeu (/art/…) servies depuis le bucket R2 « cardgamepriv-art » (binding ART, cf. wrangler.jsonc).
 * Le site déployé sur Cloudflare Pages ne contient plus les images (limite de 20 000 fichiers par site) : mêmes adresses
 * qu'avant, donc rien à changer dans le jeu, et pas de souci de CORS pour les textures 3D (même origine).
 * Sans binding, ou si l'image n'est pas (encore) dans R2 : on retombe sur les fichiers du site, comme avant.
 */
export async function onRequest({ request, env, params, waitUntil }) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Méthode non autorisée', { status: 405 });
  if (!env.ART) return env.ASSETS.fetch(request);
  const cache = caches.default;
  const hit = await cache.match(request);
  if (hit) return hit;
  const seg = (s) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  };
  const key = `art/${(Array.isArray(params.path) ? params.path : [params.path]).map(seg).join('/')}`;
  if (key.includes('..')) return new Response('Introuvable', { status: 404 });
  const obj = await env.ART.get(key, { onlyIf: request.headers });
  if (!obj) return env.ASSETS.fetch(request);
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  // une image ne change quasiment jamais : le navigateur la garde une semaine (puis la revalide en douce)
  headers.set('Cache-Control', 'public, max-age=604800, stale-while-revalidate=2592000');
  if (!('body' in obj) || !obj.body) return new Response(null, { status: 304, headers });
  const res = new Response(request.method === 'HEAD' ? null : obj.body, { headers });
  if (request.method === 'GET') waitUntil(cache.put(request, res.clone()));
  return res;
}
