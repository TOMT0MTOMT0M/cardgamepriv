import { cardImage, ensureCardFonts, gameDesignId, generateCardArtAsync, releaseCardImage } from '../core/art';
import { loadCardImage } from '../core/art/images';
import { cardById } from '../core/cardData';
import { CARD } from '../core/cardModel';
import type { RarityId } from '../core/rarity';
import { isWonderId, wonderCapturePath } from '../core/sets/themes';
import { siteUrl } from '../core/siteRoot';

/**
 * (V2, 08/11) DROP MYTHIQUE SUR DISCORD : la carte tirée, peinte de face en pleine taille (768×1072, le même gabarit
 * que la carte 3D de la vue détail), coins arrondis transparents → image envoyée au serveur, qui la poste sur Discord
 * avec le nom du joueur au-dessus (convex/dropShots.ts). Merveilles : la capture statique de leur design 3D.
 * Tout se fait en arrière-plan, sans rien bloquer : en cas d'échec, le serveur poste l'illustration brute après 45 s.
 */
export const DROP_SHOT_RARITIES = new Set<string>(['mythic', 'secret']);

export async function paintDropShot(cardId: string, rarity: RarityId): Promise<Blob | null> {
  if (isWonderId(cardId)) {
    const r = await fetch(siteUrl(wonderCapturePath(cardId))).catch(() => null);
    if (r?.ok) return await r.blob();
  }
  const cd = cardById(cardId);
  // l'illustration en pleine taille (pas la miniature des grilles) doit être chargée avant la peinture
  const image = cd.image;
  // déjà en mémoire (la carte 3D qu'on vient de révéler l'utilise) : on ne la libère pas après coup
  const had = image ? cardImage(image) : null;
  await Promise.all([ensureCardFonts(), image ? loadCardImage(image, { key: !(cd.photo || cd.cover) }) : undefined]);
  const design = gameDesignId(cd);
  const art = await generateCardArtAsync(cd, rarity, { scale: 1, flatOnly: true, ...(design ? { design } : {}) });
  try {
    const src = art.canvases.flat;
    const W = src.width;
    const H = src.height;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d')!;
    g.beginPath();
    g.roundRect(0, 0, W, H, (W * CARD.r) / CARD.w);
    g.clip();
    g.drawImage(src, 0, 0);
    // WebP très haute qualité (≈ 10× plus léger que le PNG, même rendu) ; navigateur sans encodeur WebP → PNG
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/webp', 0.95));
    c.width = c.height = 0;
    return blob;
  } finally {
    art.dispose();
    for (const cv of Object.values(art.canvases)) cv.width = cv.height = 0;
    if (image && !had) releaseCardImage(image);
  }
}

/** Après le crédit d'un booster : un envoi par 6★ / secrète, l'un après l'autre (jamais en même temps qu'une autre peinture lourde). */
let chain: Promise<unknown> = Promise.resolve();
export function sendDropShots(cards: Array<{ cardId: string; rarity: string; mintNumber: number }>, send: (cardId: string, mint: number, img: Blob) => Promise<unknown>) {
  for (const c of cards) {
    if (!DROP_SHOT_RARITIES.has(c.rarity)) continue;
    chain = chain
      .then(async () => {
        const img = await paintDropShot(c.cardId, c.rarity as RarityId);
        if (img) await send(c.cardId, c.mintNumber, img);
      })
      .catch((e) => console.warn('[drop discord]', c.cardId, e));
  }
}
