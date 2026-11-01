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
];
