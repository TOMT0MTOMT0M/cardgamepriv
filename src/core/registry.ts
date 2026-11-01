import type { RegistryEntry } from './Experiment';

/**
 * Liste de toutes les expériences (ordre de création, catégories alternées).
 * Chaque module est chargé à la demande (code-splitting).
 */
export const registry: RegistryEntry[] = [
  {
    id: '001-holo-thinfilm',
    title: 'Holo thin-film',
    category: 'A',
    tags: ['foil', 'iridescence', 'spectral'],
    tech: ['TSL thin-film 12λ', 'MeshPhysicalNodeMaterial', 'bumpMap(normalNode) r187'],
    blurb: 'Interférence de couche mince calculée par longueur d’onde : la couleur naît de l’angle, pas d’un dégradé.',
    hint: 'Survole / incline · drag pour retourner · motifs dans le panneau',
    load: () => import('../experiments/001-holo-thinfilm/index.ts'),
  },
  {
    id: '002-pack-tear',
    title: 'Déchirure du booster',
    category: 'B',
    tags: ['pack', 'stick-slip', 'peel'],
    tech: ['positionNode (pelage)', 'maskNode (découpe bruitée)', 'normal procédurale (froissé)', 'GSAP'],
    blurb: 'La déchirure accroche puis cède par à-coups ; le plastique blanchit le long de la coupe, l’intérieur est argenté.',
    hint: 'Glisse vers la droite sur le paquet pour déchirer · tap = déchirure auto · R pour recommencer',
    load: () => import('../experiments/002-pack-tear/index.ts'),
  },
  {
    id: '003-rarity-leak',
    title: 'Fuite de lumière (indice de rareté)',
    category: 'C',
    tags: ['suspense', 'lumière', 'post'],
    tech: ['RenderPipeline + MRT emissive', 'bloom', 'radialBlur', 'Sprite instancié (poussière)'],
    blurb: 'La lumière vit dans le paquet fermé : elle fuit par les soudures, traverse l’impression, s’étale sur la table. Le rythme dit la rareté.',
    hint: 'Attends… puis tap pour ouvrir · change la rareté (1–6) pour comparer les rythmes',
    load: () => import('../experiments/003-rarity-leak/index.ts'),
  },
  {
    id: '004-emboss-foil',
    title: 'Gaufrage & dorure brossée',
    category: 'A',
    tags: ['emboss', 'anisotropie', 'papier'],
    tech: ['anisotropyNode', 'normal map Sobel (CPU)', 'clearcoat sélectif', 'sheen'],
    blurb: 'Une carte d’imprimeur : papier coton, dorure à chaud brossée, gaufrage biseauté, vernis sélectif. La lampe rasante fait vivre le relief.',
    hint: 'Incline lentement · le métal change avec la rareté (de la gaufrure à sec au chrome noir)',
    load: () => import('../experiments/004-emboss-foil/index.ts'),
  },
  {
    id: '005-burn-dissolve',
    title: 'Combustion',
    category: 'B',
    tags: ['dissolve', 'braise', 'cendres'],
    tech: ['maskNode + champ fBm', 'Sprites sans état (libération analytique)', 'brume de chaleur (post)', 'bloom émissif'],
    blurb: 'Le paquet brûle depuis le point touché ; chaque escarbille se détache exactement quand le front l’atteint. La carte reste intacte.',
    hint: 'Tap sur le paquet pour l’allumer à cet endroit · R pour recommencer',
    load: () => import('../experiments/005-burn-dissolve/index.ts'),
  },
];
