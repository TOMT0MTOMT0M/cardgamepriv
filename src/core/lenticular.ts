import { cos, float, floor, fract, fwidth, max, mix, normalize, smoothstep, uv, vec2, vec3 } from 'three/tsl';
import { CARD } from './cardModel';
import type { N } from './tsl';

/**
 * REVÊTEMENT LENTICULAIRE (11/11, carte KCDQ Teto) — les cartes « flip » à l'ancienne : deux images qui se remplacent
 * selon qu'on regarde la carte par la gauche ou par la droite.
 *
 * Comment c'est fait en vrai : les deux images sont découpées en fines bandes et entrelacées (A B A B…) sous une
 * feuille de plastique épaisse et transparente moulée en NERVURES parallèles — des demi-cylindres, les lenticules
 * (≈ 75 à 100 par pouce sur une carte). Chaque nervure est une petite lentille dont le foyer tombe sur l'image
 * imprimée : selon l'angle de vue, elle grossit la bande A ou la bande B qui se trouve dessous, au point de remplir
 * toute sa largeur. Pour un basculement gauche / droite, les nervures sont VERTICALES (parallèles à l'axe de rotation).
 * Ce que l'œil voit, et qu'on reproduit ici :
 *  - le basculement n'est pas un fondu : chaque nervure passe de A à B, et comme l'angle de vue varie le long de la
 *    carte (perspective), la bascule BALAIE la carte d'un bord à l'autre ;
 *  - pendant la bascule, des rayures fines des deux images (une nervure ne bascule pas d'un bloc : aberration de la
 *    lentille) et une légère bande sombre (le liseré entre deux bandes imprimées) ;
 *  - au-delà de l'angle utile de la lentille, le cycle recommence (on revoit A tout au bout, à gauche) ;
 *  - la feuille elle-même : un plastique épais et brillant, strié — chaque nervure accroche la lumière en un fin
 *    reflet allongé qui court d'une nervure à l'autre quand on bouge la carte.
 *
 * Tout est calculé en espace OBJET (la direction de vue de la carte) : vrai quelle que soit la façon dont la carte est
 * posée ou tournée dans la scène. Les nervures courent le long de l'axe X de la texture (le petit côté de la carte
 * portrait = la verticale de la carte posée à l'horizontale) : le basculement se fait en penchant à gauche / à droite.
 */
export const LENTICULAR = {
  /** pas des nervures (unités carte : 1 = 10 cm) — 0,6 mm : un revêtement épais, nervures visibles à l'œil */
  pitch: 0.006,
  /** « focale » : décalage de bande (en fraction de nervure) par unité de tan(angle) — ≈ 60° d'angle utile */
  focal: 0.9,
  /** angle (degrés) où se fait la bascule : de face on voit franchement l'image 1, au-delà vers la droite l'image 2 */
  switchDeg: 5,
  /** aberration : écart de phase d'un bord à l'autre d'une nervure (rayures pendant la bascule) */
  aberration: 0.07,
  /** netteté de la bascule (plus petit = plus franc) */
  soft: 0.22,
  /** grossissement de la bande par la lentille (0 = aucun ; 1 = une seule couleur par nervure) */
  magnify: 0.18,
  /** relief des nervures pour la lumière (pente du bord d'une nervure) */
  ridge: 0.35,
};

export interface LensNodes {
  /** poids de l'image 2 (0 = image 1, 1 = image 2) */
  t: N;
  /** coordonnées de lecture des images (grossissement par nervure) */
  uvAt: (base: N) => N;
  /** assombrissement du liseré pendant la bascule (1 = rien) */
  shade: N;
  /** normale des nervures en espace tangent (encodée 0..1, pour normalMap) */
  normalTS: N;
  /** 1 quand les nervures sont visibles à l'écran, 0 quand elles deviennent plus fines qu'un pixel */
  aa: N;
}

export function lenticularLens(V: N, uvNode: N = uv()): LensNodes {
  const P = LENTICULAR.pitch;
  const y = uvNode.y.mul(CARD.h / P); // position en nervures
  const cell = floor(y);
  const local = fract(y).sub(0.5); // −0,5 … 0,5 dans la nervure
  // nervures plus fines qu'≈ 1,5 px : plus de relief ni de rayures (pas de moiré), le basculement reste
  const aa = float(1).sub(smoothstep(float(0.35), float(0.75), fwidth(y)));
  // carte posée à l'horizontale, penchée vers la droite (souris / téléphone à droite) = direction de vue vers +Y
  const tanA = V.y.div(max(V.z, 0.2));
  const s0 = 0.5 - Math.tan((LENTICULAR.switchDeg * Math.PI) / 180) * LENTICULAR.focal;
  const s = fract(tanA.mul(LENTICULAR.focal).add(s0).add(local.mul(LENTICULAR.aberration).mul(aa)));
  // −1 au milieu de la bande 1 (s = 0,25), +1 au milieu de la bande 2 (s = 0,75), 0 aux deux liserés (0 et 0,5)
  const g = cos(s.sub(0.25).mul(Math.PI * 2)).negate();
  const t = smoothstep(float(-LENTICULAR.soft), float(LENTICULAR.soft), g);
  const shade = mix(float(1), float(0.88), smoothstep(float(0.3), float(0), g.abs()));
  const uvAt = (base: N) => {
    // la lentille grossit la bande sous elle : on lit l'image un peu « tassée » vers le centre de la nervure
    const cy = cell.add(0.5).mul(P / CARD.h);
    return vec2(base.x, mix(base.y, cy.add(base.y.sub(uvNode.y)), float(LENTICULAR.magnify).mul(aa)));
  };
  // profil d'un demi-cylindre : la normale penche vers les bords de la nervure (axe Y de la texture)
  const n = normalize(vec3(0, local.mul(2 * LENTICULAR.ridge).mul(aa), 1));
  return { t, uvAt, shade, normalTS: n.mul(0.5).add(0.5), aa };
}
