/**
 * Type principal (affiché) des Pokémon 6★ — décide du décor de leur révélation (expérience 041, « rencontre sauvage »).
 * Données pures, sans import. Absent de la table → 'plante' (le décor de base : la prairie de nuit aux lucioles du 026).
 * Pour un double type, on garde celui qui donne la scène la plus parlante (Lugia : psy plutôt que vol, Rayquaza : dragon…).
 */
export type PokemonType =
  | 'plante' | 'feu' | 'eau' | 'electrik' | 'psy' | 'spectre' | 'tenebres' | 'dragon' | 'fee'
  | 'combat' | 'acier' | 'normal' | 'poison' | 'insecte' | 'roche' | 'sol' | 'vol' | 'glace';

/** n° de Pokédex → type de la scène */
export const POKEMON_MYTHIC_TYPE: Record<number, PokemonType> = {
  1: 'plante', // Bulbizarre
  6: 'feu', // Dracaufeu
  59: 'feu', // Arcanin
  94: 'spectre', // Ectoplasma
  133: 'normal', // Évoli
  150: 'psy', // Mewtwo
  151: 'psy', // Mew
  197: 'tenebres', // Noctali
  245: 'eau', // Suicune
  249: 'psy', // Lugia (psy / vol)
  251: 'plante', // Celebi (psy / plante : la forêt)
  258: 'eau', // Gobou
  282: 'fee', // Gardevoir (psy / fée)
  380: 'dragon', // Latias
  384: 'dragon', // Rayquaza
  385: 'acier', // Jirachi (acier / psy)
  386: 'psy', // Deoxys
  448: 'combat', // Lucario (combat / acier)
  489: 'eau', // Phione
  490: 'eau', // Manaphy
  491: 'tenebres', // Darkrai
  492: 'plante', // Shaymin
  493: 'normal', // Arceus
  494: 'feu', // Victini (psy / feu)
  644: 'electrik', // Zekrom (dragon / électrik)
  647: 'eau', // Keldeo (eau / combat)
  648: 'normal', // Meloetta (normal / psy)
  649: 'insecte', // Genesect (insecte / acier)
  658: 'eau', // Amphinobi (eau / ténèbres)
  700: 'fee', // Nymphali
  719: 'roche', // Diancie (roche / fée)
  720: 'spectre', // Hoopa (psy / spectre)
  721: 'feu', // Volcanion (feu / eau)
  778: 'spectre', // Mimiqui (spectre / fée)
  801: 'acier', // Magearna (acier / fée)
  802: 'combat', // Marshadow (combat / spectre)
  807: 'electrik', // Zeraora
  808: 'acier', // Meltan
  809: 'acier', // Melmetal
  888: 'fee', // Zacian
  893: 'tenebres', // Zarude (ténèbres / plante)
  1025: 'poison', // Pêchaminus (poison / spectre)
};
