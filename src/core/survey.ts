/**
 * SONDAGE « PROCHAINES MISES À JOUR » (v1.0.10, 10/11) — la définition, partagée par le jeu (game/survey.ts) et le
 * serveur (convex/survey.ts, qui refuse toute réponse hors de ces listes).
 * Un nouveau sondage = un nouvel `id` : tout le monde le revoit, les réponses de l'ancien restent en base.
 */
export const SURVEY_ID = 'maj-2026-11';

export interface SurveyOption {
  id: string;
  label: string;
  hint: string;
}

/** Q1 — quels univers ajouter (choix multiples) */
export const SURVEY_UNIVERSES: SurveyOption[] = [
  { id: 'anime', label: 'Animes & mangas', hint: 'nouvelles séries, persos' },
  { id: 'jv', label: 'Jeux vidéo', hint: 'licences, héros, skins' },
  { id: 'ecran', label: 'Films & séries', hint: 'ciné, séries, dessins animés' },
  { id: 'sport', label: 'Sport', hint: 'clubs, joueurs, légendes' },
  { id: 'musique', label: 'Musique', hint: 'artistes, albums' },
  { id: 'esport', label: 'Esport & streamers', hint: 'équipes, créateurs' },
  { id: 'monde', label: 'Le Monde', hint: 'lieux, animaux, plats' },
  { id: 'nous', label: 'Nos cartes', hint: 'plus de cartes de la bande' },
];

/** Q2 — quelles nouveautés de jeu (3 au plus) */
export const SURVEY_FEATURES: SurveyOption[] = [
  { id: 'jeux', label: 'Nouveaux mini-jeux', hint: 'dans l’espace Jeux' },
  { id: 'events', label: 'Événements limités', hint: 'boosters et cartes du moment' },
  { id: 'defis', label: 'Défis entre amis', hint: 'paris, objectifs à plusieurs' },
  { id: 'echanges', label: 'Échanges & marché', hint: 'plus simple, plus rapide' },
  { id: 'saisons', label: 'Saisons & classements', hint: 'récompenses de fin de saison' },
  { id: 'missions', label: 'Missions & succès', hint: 'plus d’objectifs' },
  { id: 'profil', label: 'Personnaliser son profil', hint: 'cadres, titres, vitrine' },
  { id: 'ouvertures', label: 'Animations d’ouverture', hint: 'à débloquer' },
  { id: 'appli', label: 'Appli & notifications', hint: 'comme une vraie appli' },
];

export const SURVEY_MAX_FEATURES = 3;

export interface SurveyAnswer {
  universes: string[];
  features: string[];
  /** « des noms précis ? » (texte libre) */
  names?: string;
  /** note du jeu, 1 à 5 */
  rating?: number;
  /** un mot pour nous (texte libre) */
  comment?: string;
}

export interface SurveyResults {
  surveyId: string;
  total: number;
  /** id → nombre de joueurs qui l'ont coché */
  universes: Record<string, number>;
  features: Record<string, number>;
  /** nombre de notes 1..5 (index 0 = 1★) */
  ratings: number[];
  /** les réponses écrites, les plus récentes d'abord */
  texts: Array<{ author: string; names?: string; comment?: string; rating?: number; createdAt: number }>;
}

/** Ne garde que les ids connus, sans doublon (et 3 nouveautés au plus) : même règle côté jeu et serveur. */
export function cleanSurvey(a: SurveyAnswer): SurveyAnswer {
  const keep = (ids: string[], opts: SurveyOption[], max = opts.length) => [...new Set(ids)].filter((id) => opts.some((o) => o.id === id)).slice(0, max);
  const txt = (s: string | undefined, n: number) => s?.trim().replace(/\s+\n/g, '\n').slice(0, n) || undefined;
  const r = Math.round(Number(a.rating));
  return {
    universes: keep(a.universes ?? [], SURVEY_UNIVERSES),
    features: keep(a.features ?? [], SURVEY_FEATURES, SURVEY_MAX_FEATURES),
    names: txt(a.names, 300),
    rating: r >= 1 && r <= 5 ? r : undefined,
    comment: txt(a.comment, 1000),
  };
}

/** une réponse vide ne compte pas */
export const surveyFilled = (a: SurveyAnswer) => a.universes.length + a.features.length > 0 || !!a.names || !!a.comment || !!a.rating;
