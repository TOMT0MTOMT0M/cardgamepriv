import { tData } from './i18n';
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

/** (version anglaise) libellés lus à l'affichage : le français ici (réponses, admin), l'anglais dans i18n/en/data.ts */
const O = (k: string, id: string, label: string, hint: string): SurveyOption => ({
  id,
  get label() {
    return tData(`sv.${k}.${id}`, label);
  },
  get hint() {
    return tData(`sv.${k}.${id}.hint`, hint);
  },
});
/** Q1 — quels univers ajouter (choix multiples) */
// i18n-data:début
export const SURVEY_UNIVERSES: SurveyOption[] = [
  O('u', 'anime', 'Animes & mangas', 'nouvelles séries, persos'),
  O('u', 'jv', 'Jeux vidéo', 'licences, héros, skins'),
  O('u', 'ecran', 'Films & séries', 'ciné, séries, dessins animés'),
  O('u', 'sport', 'Sport', 'clubs, joueurs, légendes'),
  O('u', 'musique', 'Musique', 'artistes, albums'),
  O('u', 'esport', 'Esport & streamers', 'équipes, créateurs'),
  O('u', 'monde', 'Le Monde', 'lieux, animaux, plats'),
  O('u', 'nous', 'Nos cartes', 'plus de cartes de la bande'),
];

/** Q2 — quelles nouveautés de jeu (3 au plus) */
export const SURVEY_FEATURES: SurveyOption[] = [
  O('f', 'jeux', 'Nouveaux mini-jeux', 'dans l’espace Jeux'),
  O('f', 'events', 'Événements limités', 'boosters et cartes du moment'),
  O('f', 'defis', 'Défis entre amis', 'paris, objectifs à plusieurs'),
  O('f', 'echanges', 'Échanges & marché', 'plus simple, plus rapide'),
  O('f', 'saisons', 'Saisons & classements', 'récompenses de fin de saison'),
  O('f', 'missions', 'Missions & succès', 'plus d’objectifs'),
  O('f', 'profil', 'Personnaliser son profil', 'cadres, titres, vitrine'),
  O('f', 'ouvertures', 'Animations d’ouverture', 'à débloquer'),
  O('f', 'appli', 'Appli & notifications', 'comme une vraie appli'),
];
// i18n-data:fin

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
