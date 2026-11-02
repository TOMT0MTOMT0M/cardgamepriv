/**
 * Univers d'origine des cartes (les six premiers sont inventés pour le lab ; `pokemon` = set Pokémon 151). Chaque carte affiche son nom et celui de son univers —
 * pas de statistiques, pas de texte d'ambiance. La rareté se lit en étoiles, couleurs et effets.
 */
export type UniverseId = 'cendre' | 'marees' | 'lune' | 'monts' | 'ronces' | 'abime' | 'pokemon' | 'valorant' | 'lol' | 'cs' | 'bebous' | 'monde' | 'jv';

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
  pokemon: { id: 'pokemon', name: 'Pokémon', short: 'Pokémon', hex: '#d2a23a' },
  valorant: { id: 'valorant', name: 'Valorant', short: 'Valorant', hex: '#ff4655' },
  lol: { id: 'lol', name: 'League of Legends', short: 'League of Legends', hex: '#c89b3c' },
  cs: { id: 'cs', name: 'Counter-Strike', short: 'Counter-Strike', hex: '#de9b35' },
  bebous: { id: 'bebous', name: 'Les Bébous', short: 'Bébous', hex: '#e8927c' },
  monde: { id: 'monde', name: 'Monde Réel', short: 'Monde', hex: '#4c9be0' },
  jv: { id: 'jv', name: 'Jeux vidéo', short: 'Jeux vidéo', hex: '#a77bff' },
};

export function universe(id: UniverseId): Universe {
  return UNIVERSES[id] ?? UNIVERSES.monde;
}
