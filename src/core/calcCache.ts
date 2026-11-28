/**
 * CACHE DES CALCULS DÉTERMINISTES (audit perf 28/11, n°7) — sons cuits, textures Pokébox, bruits, nom moulé des sachets :
 * ces calculs donnent le même résultat à chaque lancement et tournaient pourtant à chaque fois, en workers (5-6 s de CPU
 * au téléphone : batterie, chauffe). Leur résultat est rangé ici (Cache Storage, comme les cartes de plis), compressé
 * (gzip natif, hors du fil principal), et relu au lancement suivant : plus de worker, plus de calcul.
 *
 * Une entrée = une FAMILLE (`son`, `pokeTex`, `bruit`, `nom`…) + une VERSION + un reste de clé (paramètres du calcul).
 * VERSION : à CHANGER dès que le code qui produit ces octets change (même rôle que CREASE_VERSION dans pack.ts) ; une
 * écriture efface les entrées de la même famille rangées sous une autre version. Pas de cache en `npm run dev` : on
 * retouche ces recettes à la main, une copie périmée y serait trompeuse.
 *
 * Ce cache SURVIT à la mise à jour d'un patch (game/maj.ts, `hardUpdate(cible)`) : les clés sont versionnées, rien à
 * purger ; seul « Réparer » (sans cible) le vide.
 * Stockage refusé, plein, navigateur sans `caches` / flux de compression : on retombe sur le calcul, sans bruit.
 */
const STORE = 'bebou-calc';
const enabled = () => !import.meta.env.DEV && typeof caches !== 'undefined' && typeof Blob !== 'undefined';
const keyOf = (family: string, version: string, rest: string) => `/__calc/${family}/${version}/${encodeURIComponent(rest)}.bin`;
const familyOf = (family: string) => `/__calc/${family}/`;

let handle: Promise<Cache> | null = null;
const open = () => (handle ??= caches.open(STORE).catch((e) => ((handle = null), Promise.reject(e))));

const align = (n: number) => (n + 7) & ~7;

/** Rassemble des morceaux binaires en un seul : [nombre, longueurs…] puis chaque morceau, calés sur 8 octets. */
export function join(parts: ArrayBufferView[]): Uint8Array {
  const head = align(4 * (1 + parts.length));
  let size = head;
  for (const p of parts) size += align(p.byteLength);
  const out = new Uint8Array(size);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, parts.length, true);
  let at = head;
  parts.forEach((p, i) => {
    dv.setUint32(4 * (1 + i), p.byteLength, true);
    out.set(new Uint8Array(p.buffer, p.byteOffset, p.byteLength), at);
    at += align(p.byteLength);
  });
  return out;
}
/** Inverse de `join` : des vues (sans copie) sur le tampon ; `null` si l'entrée est tronquée. */
export function split(buf: Uint8Array): Uint8Array[] | null {
  if (buf.byteLength < 8 || buf.byteOffset % 8) return null;
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const n = dv.getUint32(0, true);
  if (n > 4096) return null;
  let at = align(4 * (1 + n));
  const out: Uint8Array[] = [];
  for (let i = 0; i < n; i++) {
    const len = dv.getUint32(4 * (1 + i), true);
    if (at + len > buf.byteLength) return null;
    out.push(buf.subarray(at, at + len));
    at += align(len);
  }
  return out;
}

async function through(buf: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  return new Uint8Array(await new Response(new Blob([buf as BlobPart]).stream().pipeThrough(stream)).arrayBuffer());
}

/** Les morceaux rangés sous cette clé (vues sur un tampon à eux, alignées sur 8 octets), ou `null` : à calculer. */
export async function calcGet(family: string, version: string, rest = ''): Promise<Uint8Array[] | null> {
  if (!enabled()) return null;
  try {
    const r = await (await open()).match(keyOf(family, version, rest));
    if (!r) return null;
    let buf: Uint8Array = new Uint8Array(await r.arrayBuffer());
    if (r.headers.get('content-type') === 'application/gzip') {
      if (typeof DecompressionStream === 'undefined') return null;
      buf = await through(buf, new DecompressionStream('gzip'));
    }
    // (le tampon décompressé commence à 0 ; un tampon brut aussi — `split` refuse tout décalage)
    return split(buf);
  } catch {
    return null;
  }
}

/**
 * Range le résultat d'un calcul (au calme : l'assemblage, la compression et l'écriture n'ont aucune raison de gêner le
 * démarrage). `max` : nombre d'entrées de la famille gardées (les plus anciennes partent) — pour les clés qui varient
 * avec le contenu (nom d'un sachet d'événement…) ; `compress: false` pour des octets qui ne se compressent pas (échantillons
 * sonores : 5,4 → 5,0 Mo seulement). Les morceaux sont lus tout de suite (copie) : l'appelant garde ses
 * tableaux, qui peuvent être transférés ou modifiés ensuite.
 */
export function calcPut(family: string, version: string, rest: string, parts: ArrayBufferView[], max = 0, compress = true): void {
  if (!enabled()) return;
  let joined: Uint8Array;
  try {
    joined = join(parts);
  } catch {
    return;
  }
  const go = async () => {
    try {
      const gzip = compress && typeof CompressionStream !== 'undefined';
      const body = gzip ? await through(joined, new CompressionStream('gzip')) : joined;
      const cache = await open();
      const mine = familyOf(family);
      const ok = `${mine}${version}/`;
      const keys = (await cache.keys()).map((k) => new URL(k.url).pathname).filter((p) => p.startsWith(mine));
      const key = keyOf(family, version, rest);
      const keep = keys.filter((p) => p.startsWith(ok) && p !== new URL(key, location.href).pathname);
      for (const p of keys) if (!p.startsWith(ok)) void cache.delete(p);
      if (max > 0) for (const p of keep.slice(0, Math.max(0, keep.length - (max - 1)))) void cache.delete(p);
      await cache.put(key, new Response(body as BodyInit, { headers: { 'content-type': gzip ? 'application/gzip' : 'application/octet-stream' } }));
    } catch {
      /* quota, stockage refusé : recalculé au prochain lancement */
    }
  };
  if ('requestIdleCallback' in window) (window as Window & { requestIdleCallback(cb: () => void, o?: { timeout: number }): number }).requestIdleCallback(() => void go(), { timeout: 12000 });
  else setTimeout(() => void go(), 4000);
}
