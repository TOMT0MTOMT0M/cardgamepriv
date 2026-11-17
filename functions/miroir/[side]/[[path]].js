import { onRequest as art } from '../../art/[[path]].js';

/**
 * COMPARATEUR LIVE / V3 (17/11) : les deux copies de démo vivent dans /miroir/live/ et /miroir/v3/ (scripts/miroir/build.mjs).
 * Elles ne contiennent que la page du jeu et son code : tout le reste (illustrations R2, fx, audio, icônes, modèles 3D)
 * est demandé sous leur propre dossier (SITE_ROOT relatif) et servi ici depuis la racine du site, sans copie.
 */
export async function onRequest(ctx) {
  const { request, env, params } = ctx;
  if (params.side !== 'live' && params.side !== 'v3') return env.ASSETS.fetch(request);
  const parts = Array.isArray(params.path) ? params.path : params.path ? [params.path] : [];
  const url = new URL(request.url);
  if (parts[0] === 'art') {
    url.pathname = '/' + parts.join('/');
    return art({ ...ctx, request: new Request(url, request), params: { path: parts.slice(1) } });
  }
  const own = await env.ASSETS.fetch(request);
  if (own.status !== 404) return own;
  url.pathname = '/' + parts.join('/');
  return env.ASSETS.fetch(new Request(url, request));
}
