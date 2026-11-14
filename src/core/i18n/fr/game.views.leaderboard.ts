/** Textes de src/game/views/leaderboard.ts : chargés avec lui (module à la demande), enregistrés par addFr. */
import { addFr } from '../../i18n';

export const fr = {
  'lb.completion': 'Complétion',
  'lb.pctUnit': '{pct} · {n} cartes',
  'lb.season': 'Saison',
  'lb.trades': 'Échanges',
  'lb.streak': 'Série',
  'lb.endsIn': 'fin dans {t}',
  'lb.rule': 'Score : les cartes différentes gagnées depuis le début du mois. Le classement est figé à la fin du mois, puis tout repart à zéro.{joining}',
  'lb.first': '{packs} · titre « Champion de saison » · cadre « Podium de saison »',
  'lb.second': '{a} / {b} · cadre « Podium de saison »',
  'lb.others': 'les autres',
  'lb.played': '{packs} dès une carte gagnée',
  'lb.firstSoon': 'La première saison démarre dans l’heure : à partir de là, chaque carte différente gagnée compte.',
  'lb.past': 'Saisons passées',
  'lb.noPast': 'Aucune saison terminée pour l’instant : le premier podium sera gravé ici à la fin du mois.',
  'lb.seasonOf': 'Saison {s}',
  'lb.you': 'Toi : {rank}',
  'lb.gained': { one: '· +{cards} · {packs} reçu', other: '· +{cards} · {packs} reçus' },
  'lb.nobody': 'Personne au classement pour l’instant.',
  'lb.king': 'Le classement roi : la complétion globale de la collection. Le premier gagne le titre « Numéro un ».',
  'lb.joining': ' <b>Tu entres dans la saison dans l’heure</b> : tes cartes comptent à partir de là.',
  'lb.mythics': '6★ & secrets',
} as const satisfies Record<string, string | { one?: string; other: string }>;
addFr(fr);
