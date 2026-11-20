import { tData } from './i18n';
/**
 * SONDAGE « PROCHAINES MISES À JOUR » (v1.0.10, 10/11) — la définition, partagée par le jeu (game/survey.ts) et le
 * serveur (convex/survey.ts, qui refuse toute réponse hors de ces listes).
 * Un nouveau sondage = un nouvel `id` : tout le monde le revoit, les réponses de l'ancien restent en base.
 */
export const SURVEY_ID = 'tele-2026-12';
/** (20/11, demande de Hugo) l'ancien sondage « prochaines mises à jour » : ses résultats restent lisibles par l'équipe */
export const SURVEY_PREV_ID = 'maj-2026-11';

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

/**
 * (20/11, demande de Hugo) MINI-SONDAGE « ÉMISSIONS TÉLÉ » : le prochain ajout de cartes (début décembre) = les émissions
 * télé et leurs candidats / présentateurs préférés. Q1 = quelles émissions (choix multiples), Q2 = quelles 6★ (texte libre,
 * champ `names`). Pas de nouveautés ni de note.
 */
export const SURVEY_TV_SHOWS: SurveyOption[] = [
  O('t', 'koh-lanta', 'Koh-Lanta', 'aventure'),
  O('t', 'pekin-express', 'Pékin Express', 'aventure'),
  O('t', 'fort-boyard', 'Fort Boyard', 'jeu d’aventure'),
  O('t', 'intervilles', 'Intervilles', 'jeu'),
  O('t', 'top-chef', 'Top Chef', 'cuisine'),
  O('t', 'cauchemar-en-cuisine', 'Cauchemar en cuisine', 'cuisine'),
  O('t', 'diner-presque-parfait', 'Un dîner presque parfait', 'cuisine'),
  O('t', 'star-academy', 'Star Academy', 'télé-crochet'),
  O('t', 'the-voice', 'The Voice', 'télé-crochet'),
  O('t', 'nouvelle-star', 'Nouvelle Star', 'télé-crochet'),
  O('t', 'mask-singer', 'Mask Singer', 'divertissement'),
  O('t', 'danse-avec-les-stars', 'Danse avec les stars', 'divertissement'),
  O('t', 'incroyable-talent', 'La France a un incroyable talent', 'divertissement'),
  O('t', 'qui-veut-gagner', 'Qui veut gagner des millions ?', 'jeu'),
  O('t', 'noubliez-pas-les-paroles', 'N’oubliez pas les paroles', 'jeu'),
  O('t', 'questions-pour-un-champion', 'Questions pour un champion', 'jeu'),
  O('t', 'douze-coups-de-midi', 'Les 12 coups de midi', 'jeu'),
  O('t', 'maillon-faible', 'Le Maillon faible', 'jeu'),
  O('t', 'secret-story', 'Secret Story', 'téléréalité'),
  O('t', 'loft-story', 'Loft Story', 'téléréalité'),
  O('t', 'les-marseillais', 'Les Marseillais', 'téléréalité'),
  O('t', 'amour-est-dans-le-pre', 'L’amour est dans le pré', 'téléréalité'),
  O('t', 'tpmp', 'Touche pas à mon poste', 'talk-show'),
  O('t', 'quotidien', 'Quotidien', 'talk-show'),
  O('t', 'cest-pas-sorcier', 'C’est pas sorcier', 'jeunesse'),
];
// i18n-data:fin

export const SURVEY_MAX_FEATURES = 3;

/** les choix de chaque sondage (le serveur refuse tout id hors de ces listes, et tout sondage inconnu) */
export const SURVEYS: Readonly<Record<string, { universes: SurveyOption[]; features: SurveyOption[] }>> = {
  [SURVEY_PREV_ID]: { universes: SURVEY_UNIVERSES, features: SURVEY_FEATURES },
  [SURVEY_ID]: { universes: SURVEY_TV_SHOWS, features: [] },
};

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
export function cleanSurvey(a: SurveyAnswer, surveyId: string = SURVEY_ID): SurveyAnswer {
  const def = SURVEYS[surveyId] ?? { universes: [], features: [] };
  const keep = (ids: string[], opts: SurveyOption[], max = opts.length) => [...new Set(ids)].filter((id) => opts.some((o) => o.id === id)).slice(0, max);
  const txt = (s: string | undefined, n: number) => s?.trim().replace(/\s+\n/g, '\n').slice(0, n) || undefined;
  const r = Math.round(Number(a.rating));
  return {
    universes: keep(a.universes ?? [], def.universes),
    features: keep(a.features ?? [], def.features, SURVEY_MAX_FEATURES),
    names: txt(a.names, 300),
    rating: r >= 1 && r <= 5 ? r : undefined,
    comment: txt(a.comment, 1000),
  };
}

/** une réponse vide ne compte pas */
export const surveyFilled = (a: SurveyAnswer) => a.universes.length + a.features.length > 0 || !!a.names || !!a.comment || !!a.rating;
