/**
 * SYSTÈME DE MOTION du jeu — la table unique des durées, courbes et ressorts (réf. « Dopamine, anticipation et
 * mouvement », 4 nov. 2026). Rien n'est codé en dur ailleurs : l'interface (style.css, variables `--dur-*` posées sur
 * <html> par `bindMotionVars`) et les scènes 3D (opening.ts) lisent ces jetons.
 *
 * Règles :
 *  - plus un élément revient souvent, plus son jeton est court (rien d'emphatique sur ce qu'on touche 10 fois par
 *    session) ; les sorties font ≈ 0,75 × l'entrée ;
 *  - le rebond est réservé aux récompenses (spring.joyeux), le reste de l'interface est amorti (ζ ≥ 0,85) ;
 *  - la cérémonie grandit avec la rareté : ≈ 0,45 s (1–2★) → 0,8 s (3★) → 1,6 s (4★) → 3 s (5★) → 5 s (6★) ;
 *  - mouvement réduit (réglage de l'appareil ou du joueur) : déplacements remplacés par des fondus courts, secousses
 *    et ralentis supprimés, couleurs / lumières / sons conservés.
 */
import { fxReduced } from './fxPref';

const mobile = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

/** Durées d'interface (ms). Desktop ≈ 20 % plus court (l'œil couvre l'écran plus vite, pas de doigt à suivre). */
export const DUR = {
  /** état pressé, ripple, changement de couleur au survol */
  instant: 50,
  /** interrupteurs, infobulles, pastille qui apparaît, sortie de menu */
  rapide: () => (mobile() ? 150 : 120),
  /** changement d'onglet (fondu), sortie de toast, entrée de menu, tuiles */
  standard: () => (mobile() ? 250 : 200),
  /** modale / feuille, container transform, page d'album, éventail de cartes */
  emphatique: () => (mobile() ? 400 : 320),
  /** montée et payoff 4★–5★, résultat de contrat, gain de Pack Battle */
  dramatique: 900,
  /** 6★, secrète, palier majeur de succès */
  ceremonie: 2500,
} as const;

/** Cascade : délai entre deux éléments (ms) et plafond total. */
export const STAGGER = { serre: 20, normal: 40, large: 60, max: 300 } as const;

/** Courbes (valeurs CSS cubic-bezier). */
export const EASING = {
  /** mouvements à l'écran par défaut (M3 standard) */
  standard: 'cubic-bezier(0.2, 0, 0, 1)',
  /** ce qui entre : pages, modales, cartes qui arrivent (M3 emphasized-decelerate) */
  entree: 'cubic-bezier(0.05, 0.7, 0.1, 1)',
  /** ce qui sort (M3 emphasized-accelerate) */
  sortie: 'cubic-bezier(0.3, 0, 0.8, 0.15)',
  /** petit recul avant un retournement rare */
  anticipation: 'cubic-bezier(0.6, -0.28, 0.735, 0.045)',
} as const;

/** Ressorts (raideur / amortissement, masse 1). */
export const SPRING = {
  /** relâchement de geste, boutons (ζ ≈ 0,9, stabilisé ≈ 0,22 s) */
  net: { stiffness: 400, damping: 36 },
  /** retournement et pose des cartes (ζ ≈ 0,75, dépassement ≈ 3 %) */
  carte: { stiffness: 300, damping: 26 },
  /** récompenses : pièces, badge, compteur qui rebondit (ζ ≈ 0,55, dépassement ≈ 10 %) */
  joyeux: { stiffness: 500, damping: 25 },
} as const;

/**
 * PARTITION DE L'OUVERTURE, par palier (tier 0 = 1★ … 5 = 6★ ; la secrète suit sa propre séquence « Un de nous »).
 * Durées en secondes. `pre` = anticipation avant le retournement (soulèvement, palpitations, montée sonore),
 * `flip` = retournement, `hitStop` = gel logique à l'impact (ms), `hold` = temps minimal de savourage avant que la
 * suite puisse repartir, `condensed` = version courte jouée en « Tout révéler » (jamais une accélération ×2 : une
 * version conçue exprès, qui garde l'impact et supprime la montée).
 */
export interface TierBeat {
  pre: number;
  flip: number;
  hitStop: number;
  hold: number;
  dark: number;
  /** secousse d'écran (0 = aucune) */
  shake: number;
  /** motif haptique (Android) à l'impact */
  haptic: number | number[];
  condensed: { pre: number; flip: number; hold: number };
}

// (retours 06/11 : « les cartes se retournent BIEN TROP vite, même en original ») : retournements ≈ ×2,2, savourage
// un peu plus long ; la version condensée (« Tout révéler ») ralentit pareil
/** (retours live 6, C2) retournements encore 30 % plus lents (toutes raretés, version normale et « Tout révéler ») */
const FLIP_K = 1.3;
export const TIER_BEAT: TierBeat[] = [
  { pre: 0, flip: FLIP_K * 0.46, hitStop: 0, hold: 0.18, dark: 0, shake: 0, haptic: 8, condensed: { pre: 0, flip: FLIP_K * 0.38, hold: 0.1 } },
  { pre: 0, flip: FLIP_K * 0.46, hitStop: 0, hold: 0.18, dark: 0, shake: 0, haptic: 8, condensed: { pre: 0, flip: FLIP_K * 0.38, hold: 0.1 } },
  { pre: 0.16, flip: FLIP_K * 0.52, hitStop: 0, hold: 0.5, dark: 0, shake: 0, haptic: 12, condensed: { pre: 0, flip: FLIP_K * 0.42, hold: 0.22 } },
  { pre: 0.5, flip: FLIP_K * 0.6, hitStop: 60, hold: 0.8, dark: 0, shake: 0, haptic: [20, 40, 30], condensed: { pre: 0.3, flip: FLIP_K * 0.5, hold: 0.55 } },
  { pre: 1.0, flip: FLIP_K * 0.7, hitStop: 90, hold: 1.3, dark: 0.35, shake: 2, haptic: [30, 60, 60], condensed: { pre: 0.6, flip: FLIP_K * 0.6, hold: 1.0 } },
  { pre: 1.8, flip: FLIP_K * 0.78, hitStop: 120, hold: 1.6, dark: 0.6, shake: 3, haptic: [40, 80, 40, 80, 120], condensed: { pre: 1.8, flip: FLIP_K * 0.78, hold: 1.6 } },
];

/** 6★ : silence (retrait du son) avant l'impact, en secondes. */
export const MYTHIC_SILENCE = 0.3;
/** 6★ : instant (fraction de `pre`) où la tranche dorée se fend en arc-en-ciel. */
export const MYTHIC_TURN = 0.5;
/** Allumage des tranches face cachée (éventail) : délai entre deux cartes (s) et retard supplémentaire de la 5e. */
export const TEASE_STAGGER = 0.09;
export const TEASE_LAST_EXTRA = 0.2;

/**
 * Ambiance « Éclipse » (Berserk 5★ / 6★, 11/11 — game/eclipse.ts) : des temps LENTS, en secondes. `teinte` : l'aura du
 * sachet fermé vire au cramoisi et la scène s'assombrit · `lever` : le soleil noir et le lac montent une fois le sachet
 * ouvert · `onde` : le cercle qui court sur le lac quand une carte se pose · `coucher` : tout s'efface.
 */
export const ECLIPSE = { teinte: 2.4, lever: 3.2, onde: 2.8, coucher: 1.2 } as const;

/** Vrai si les mouvements doivent être réduits (réglage de l'appareil, ou choix du joueur « Effets réduits »). */
export const reducedMotion = () => fxReduced();

/**
 * Pose les jetons en variables CSS sur <html> (`--dur-instant`, `--dur-rapide`, `--dur-standard`, `--dur-emphatique`,
 * `--dur-sortie`, `--ease-standard`, `--ease-entree`, `--ease-sortie`) et les met à jour quand le type de pointeur change.
 */
export function bindMotionVars(): void {
  if (typeof document === 'undefined') return;
  const apply = () => {
    const r = document.documentElement.style;
    r.setProperty('--dur-instant', `${DUR.instant}ms`);
    r.setProperty('--dur-rapide', `${DUR.rapide()}ms`);
    r.setProperty('--dur-standard', `${DUR.standard()}ms`);
    r.setProperty('--dur-emphatique', `${DUR.emphatique()}ms`);
    r.setProperty('--dur-sortie', `${Math.round(DUR.emphatique() * 0.75)}ms`);
    r.setProperty('--ease-standard', EASING.standard);
    r.setProperty('--ease-entree', EASING.entree);
    r.setProperty('--ease-sortie', EASING.sortie);
    r.setProperty('--ease-anticipation', EASING.anticipation);
  };
  apply();
  if (typeof matchMedia === 'function') matchMedia('(pointer: coarse)').addEventListener?.('change', apply);
}
