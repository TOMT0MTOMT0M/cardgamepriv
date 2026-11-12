import { abs, cameraPosition, clamp, float, length, luminance, max, min, mix, modelWorldMatrixInverse, pow, smoothstep, step, texture, time, uniform, uv, vec2, vec4, atan } from 'three/tsl';
import type { CardArt } from '../art';
import { cardImage } from '../art/images';
import type { CardData } from '../cardData';
import type { CardLayers } from '../cardMaterial';
import { CARD } from '../cardModel';
import type { N } from '../tsl';
import { POKE_BY_ID } from './fx';
import { createPokeTextures, type PokeTextures } from './tex';

/**
 * REFLETS DES CARTES DU JEU (visio Tom et Hugo du 07/11, labo 044 « Reflets Pokébox ») :
 *  - 1★ à 4★ : « holo classique » (Holo Rare), intensité 0,35 — dans le décor de l'illustration
 *  - 5★      : « illustration rare », intensité 0,2 — toute la carte, sujet compris hors texte
 *  - 6★      : « double rare placé », intensité 0,6 — confettis sur le décor structuré, éclats sur l'équipement
 * Les cartes photo (Bébous, KCDQ) n'en ont pas. Mêmes calculs que le labo : lumière = projection de l'œil sur la carte,
 * masque = zone nette × (1,16 − 0,35 × clarté de l'illustration), mélanges en espace écran (sRGB).
 */
export const POKE_TIERS: Array<{ fx: string; k: number }> = [
  { fx: 'regular-holo', k: 0.35 },
  { fx: 'regular-holo', k: 0.35 },
  { fx: 'regular-holo', k: 0.35 },
  { fx: 'regular-holo', k: 0.35 },
  { fx: 'illustration-rare', k: 0.2 },
  { fx: 'double-rare-placed', k: 0.6 },
];
/** Multiplicateur global (option « Effets réduits » → 0,5). Uniform : agit sur toutes les faces sans recompiler. */
export const pokeFx = { k: uniform(1) };

let T: PokeTextures | null = null;
/** Textures de matière partagées par toutes les faces (créées une fois, jamais libérées : quelques Mo au total). */
const tex = () => (T ??= createPokeTextures());

const toS = (c: N): N => mix(c.mul(12.92), pow(max(c, 0.0031308), 1 / 2.4).mul(1.055).sub(0.055), step(0.0031308, c));
const toL = (c: N): N => mix(c.div(12.92), pow(c.add(0.055).div(1.055), 2.4), step(0.04045, c));

/** Illustration détourée ? Même règle que le peintre (core/art) : couverture, photo ou image opaque = non. */
export function cardHasCutout(cd: CardData): boolean {
  const im = cd.subject === 'image' ? cardImage(cd.image) : null;
  return !(cd.photo || cd.cover || im?.opaque);
}

/** Point focal du gabarit « Pleine illustration » (designs/fullart : art.to = [384, 470]). */
const FOCUS = vec2(0.5, 1 - 470 / 1072);

/**
 * Couleur de la face AVEC le reflet de sa rareté (linéaire, à la place de `L.color`). `amount` (0..1) : apparition
 * (révélation de l'ouverture) ; `cut` : 1 si l'illustration est détourée (uniform → un seul shader par palier).
 */
export function pokeFaceColor(art: CardArt, L: CardLayers, tier: number, amount: N, cut: N): N {
  const choice = POKE_TIERS[Math.max(0, Math.min(5, tier))];
  const def = POKE_BY_ID[choice.fx];
  if (!def) return L.color;
  const u = uv();
  // zones (cf. labo 044 / kit 043) : encre = texte clair du gabarit, sujet hors texte, décor = le reste
  const ink = L.frame.a.mul(smoothstep(0.35, 0.7, luminance(L.frame.rgb)));
  const notInk = ink.oneMinus();
  const subj = L.subject.a.mul(notInk);
  const decor = subj.oneMinus().mul(L.fg.a.oneMinus()).mul(notInk);
  // intérieur du liseré du gabarit (roundRect(20, 20, W − 40, H − 40, 26))
  const p = u.sub(0.5).mul(vec2(CARD.w, CARD.h));
  const rr = (26 * CARD.w) / 768;
  const q = abs(p).sub(vec2(((384 - 20) / 768) * CARD.w, ((536 - 20) / 1072) * CARD.h)).add(rr);
  const sdf = length(max(q, 0)).add(min(max(q.x, q.y), 0)).sub(rr);
  const inner = smoothstep(0.0015, -0.0015, sdf);
  const bgUV = L.uvAt(0.03), sjUV = L.uvAt(0.014);
  // (audit 12/11, E4-05) un seul calcul par niveau : chaque appel créait 2 lectures de texture, et les niveaux 0 et 1
  // étaient demandés deux fois chacun (4 lectures en double sur les 6★, mêmes coordonnées, même niveau)
  const lumCache = new Map<number, N>();
  const lumAt = (lvl: number): N => {
    let v = lumCache.get(lvl);
    if (!v) {
      const b = texture(art.bg, bgUV).level(float(lvl));
      const s = texture(art.subject, sjUV).level(float(lvl));
      lumCache.set(lvl, (v = max(luminance(mix(b.rgb, s.rgb, s.a)), 0).sqrt() as N));
    }
    return v;
  };
  const zone = def.zone === 'fond' ? decor.mul(inner) : decor;
  const mask = zone.mul(clamp(float(1.16).sub(lumAt(1).mul(0.35)), 0, 1));
  // carte de placement (6★)
  let place: { decor: N; struct: N; equip: N } | undefined;
  if (def.id === 'double-rare-placed') {
    const hp = lumAt(1).sub(lumAt(3)).abs();
    const struct = smoothstep(0.02, 0.09, hp);
    const core = smoothstep(0.85, 0.99, texture(art.subject, sjUV).level(float(3.5)).a);
    const equip = subj.mul(core).mul(smoothstep(0.07, 0.15, hp)).mul(smoothstep(0.6, 0.85, lumAt(0)));
    const fe = float(1).sub(smoothstep(0.6, 1.1, u.sub(FOCUS).div(vec2(0.36, 0.42)).length()));
    const noCutEquip = fe.mul(notInk).mul(smoothstep(0.05, 0.12, hp)).mul(smoothstep(0.42, 0.7, lumAt(0)));
    const noCutDecor = notInk.mul(fe.oneMinus());
    place = { decor: mix(noCutDecor, decor.mul(inner), cut), struct, equip: mix(noCutEquip, equip, cut) };
  }
  // lumière : l'œil dans le repère de la carte → point regardé (≈ 4,5 largeurs de carte de distance, comme Pokébox)
  const eye = modelWorldMatrixInverse.mul(vec4(cameraPosition, 1)).xyz;
  const tn = eye.xy.div(max(eye.z, 0.01));
  const pointer = clamp(tn.mul(4.5).add(0.5), 0, 1);
  const bgv = pointer.mul(0.26).add(0.37);
  const pfc = min(pointer.sub(0.5).length().mul(2), 1);
  const base = toS(clamp(L.color, 0, 1));
  const out = def.fn({
    uv: u,
    base,
    mask,
    foil: float(0),
    hasFoil: false,
    pointer,
    bg: bgv,
    pfc,
    rotX: atan(eye.x, eye.z).mul(-180 / Math.PI),
    time,
    op: float(choice.k),
    T: tex(),
    place,
  });
  const col = mix(base, out.color, smoothstep(0, 0.02, out.area));
  return toL(clamp(mix(base, col, clamp(amount, 0, 1).mul(pokeFx.k)), 0, 1));
}
