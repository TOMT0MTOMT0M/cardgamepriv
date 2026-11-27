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

/**
 * (14/11, personnalisation du profil) BOUCLES D'AMBIANCE des éléments équipés (cadres, titres, accords) — en ms. Ce ne
 * sont pas des transitions : des mouvements lents qui tournent tant que l'élément est à l'écran (`--amb-*` en CSS).
 */
export const AMBIANCE = {
  /** rotation lente d'un cadre (pointillé, engrenage, galaxie) : un tour */
  tour: 48000,
  /** aiguille des « Crans » : un tour, cran par cran */
  cadran: 60000,
  /** respiration d'une flamme */
  souffle: 1200,
  /** flottement (auréole) et scintillement (étoiles, confettis) */
  flotte: 3200,
  scintille: 2400,
  /** tube néon qui grésille, titre qui se dérègle */
  neon: 3400,
  /** particule d'un accord qui traverse la photo (braise, étoile, confetti) */
  particule: 2600,
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

/**
 * Ambiance « Éclipse » (Berserk 5★ / 6★, 11/11 — game/eclipse.ts) : des temps LENTS, en secondes. `teinte` : l'aura du
 * sachet fermé vire au cramoisi et la scène s'assombrit · `lever` : le soleil noir et le lac montent une fois le sachet
 * ouvert · `onde` : le cercle qui court sur le lac quand une carte se pose · `coucher` : tout s'efface · `suite` : gros
 * booster (×5 / ×10), le morceau qui contient la carte arrive sans sachet : la pénombre tombe et l'horizon rougeoit
 * (temps 1 condensé) avant le lever.
 */
export const ECLIPSE = { teinte: 2.4, lever: 3.2, onde: 2.8, coucher: 1.2, suite: 1.1 } as const;

/**
 * (27/11, V3) Ouverture « Retroussé » : le sachet se retourne vers le bas et laisse les cartes debout. Secondes. Lu par
 * la scène (opening.ts) ET par la cuisson (scripts/bake-tear/retrousse.mts : levée des cartes pendant la sortie
 * enregistrée) — donc aucune valeur qui dépende du pointeur (`DUR.rapide` & co varient entre mobile et bureau).
 * `auto` : ouverture automatique au toucher · `autoSerie` : en série (×5 / ×10) · `lache` : le doigt lâche le sachet
 * (B.follow → 0) · `levee` (unités) / `leve` : les cartes se soulèvent dans le sachet retroussé (EASE.glide) ·
 * `range` : rangement des cartes · `chute` : départ du sachet vide · `ouvert` : la pile est prête.
 * (27/11, scène seulement — la cuisson ne les lit pas) `pose` : durée du rangement (celle de la Déchirure) · `decale` :
 * décalage d'une carte à l'autre au rangement (idem) · `tombe` : durée de la chute du sachet (idem, EASE.heave) ·
 * `grain` : écart mini entre deux grains du froissement (idem) · `coup` : écart mini entre deux claquements (crans
 * franchis dans la même image : un double coup au plus par `coup`) · `grainMax` : durée maxi ajoutée à un grain du
 * froissement (elle s'allonge avec la course parcourue depuis le grain précédent) · `lacheGrain` : durée ajoutée au
 * froissement de fin de lâcher, à pleine intensité (× land.f) · `verrou` : durée du claquement du verrou (la soudure
 * du haut qui cède).
 */
export const RETROUSSE = {
  auto: 1.0,
  autoSerie: DUR.dramatique / 1000,
  lache: (2 * DUR.instant) / 1000,
  levee: 0.05,
  leve: 0.25,
  range: 0.45,
  chute: 0.35,
  ouvert: 0.8,
  pose: 0.65,
  decale: 0.03,
  tombe: 0.85,
  grain: 0.09,
  coup: STAGGER.normal / 1000,
  grainMax: 0.2,
  lacheGrain: 0.06,
  verrou: (DUR.instant * 2.4) / 1000,
} as const;
/**
 * (27/11) FENÊTRE (scènes/opening.ts ; l'avancée de la pile, sa sortie et la chute du panneau viennent de la cuisson,
 * en-tête `window` de scripts/bake-tear/fenetre.mts — rien ici n'est lu par la cuisson). `auto` / `autoSerie` :
 * ouverture automatique (toucher, série) · `lache` : la main lâche le sachet (B.follow → 0) · `chute` : la main lâche le
 * sachet percé · `recul` / `reculZ` : il RECULE derrière la pile (durée, unités ; retours de Tom 27/11 : il n'est pas
 * ouvert en haut, il ne doit pas tomber devant les cartes comme la Déchirure), puis tombe · `tombe` : durée de sa
 * chute (EASE.heave), après le recul · `range` : rangement des cartes · `pose` / `decale` : durée du
 * rangement et décalage d'une carte à l'autre (ceux de la Déchirure) · `ouvert` : la pile est prête · `coup` : écart
 * mini entre deux coins qui percent · `grain` : écart mini entre deux grains du crépitement des fronts · `grainMax` :
 * durée maxi d'un grain · `sec` : durée du coup sec final (le dernier lien du contour).
 */
export const FENETRE = {
  auto: 1.0,
  autoSerie: DUR.dramatique / 1000,
  lache: (2 * DUR.instant) / 1000,
  chute: 0.5,
  recul: 0.45,
  reculZ: -0.6,
  tombe: 0.85,
  range: 0.55,
  pose: 0.65,
  decale: 0.03,
  ouvert: 0.95,
  coup: STAGGER.serre / 1000,
  grain: 0.07,
  grainMax: 0.16,
  sec: (DUR.instant * 2) / 1000,
} as const;

const motionQuery = typeof matchMedia === 'function' ? matchMedia('not all') : null;
/**
 * (v2.0.6, décision de Tom) TOUJOURS FAUX : les animations du jeu ne suivent plus le réglage « réduire les animations »
 * de l'appareil (il coupait aussi les skins CS en 3D et les dessins animés des Jeux). Partout, la requête
 * `(prefers-reduced-motion: reduce)` est remplacée par `not all` (jamais vraie), en CSS comme en code.
 * AVANT : vrai si les mouvements doivent être réduits : réglage « réduire les animations » de l'APPAREIL, seul signal depuis
 * la suppression du mode « Effets réduits » du jeu (audit 12/11, décision 4 de Tom).
 */
export const reducedMotion = (): boolean => !!motionQuery?.matches;
/** S'abonne au réglage de l'appareil ; `f` est appelé tout de suite avec la valeur actuelle. Renvoie la désinscription. */
export function onReducedMotionChange(f: (on: boolean) => void): () => void {
  f(reducedMotion());
  const h = () => f(reducedMotion());
  motionQuery?.addEventListener?.('change', h);
  return () => motionQuery?.removeEventListener?.('change', h);
}

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
    for (const [k, v] of Object.entries(AMBIANCE)) r.setProperty(`--amb-${k}`, `${v}ms`);
  };
  apply();
  if (typeof matchMedia === 'function') matchMedia('(pointer: coarse)').addEventListener?.('change', apply);
}
