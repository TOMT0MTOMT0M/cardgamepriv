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
];
