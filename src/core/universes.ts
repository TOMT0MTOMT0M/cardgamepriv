/**
 * Univers d'origine des cartes (inventés pour le lab). Chaque carte affiche son nom et celui de son univers —
 * pas de statistiques, pas de texte d'ambiance. La rareté se lit en étoiles, couleurs et effets.
 */
export type UniverseId = 'cendre' | 'marees' | 'lune' | 'monts' | 'ronces' | 'abime';

export interface Universe {
  id: UniverseId;
  name: string;
  /** nom court (étiquettes serrées) */
  short: string;
  /** teinte signature de l'univers (sRGB) */
  hex: string;
}

export const UNIVERSES: Record<UniverseId, Universe> = {
  cendre: { id: 'cendre', name: 'Royaume de Cendre', short: 'Cendre', hex: '#c4572f' },
  marees: { id: 'marees', name: 'Archipel des Marées', short: 'Marées', hex: '#2f6a62' },
  lune: { id: 'lune', name: 'Cour de la Lune Pâle', short: 'Lune Pâle', hex: '#8d93a6' },
  monts: { id: 'monts', name: 'Les Monts Muets', short: 'Monts Muets', hex: '#8a7656' },
  ronces: { id: 'ronces', name: 'Forêt des Ronces', short: 'Ronces', hex: '#5d6b3a' },
  abime: { id: 'abime', name: 'Le Grand Abîme', short: 'Abîme', hex: '#33456e' },
};

export function universe(id: UniverseId): Universe {
  return UNIVERSES[id];
}
