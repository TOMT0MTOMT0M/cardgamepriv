/** English texts of src/game/views/leaderboard.ts (keys: ../fr/game.views.leaderboard.ts). */
import type { PartOf } from '../../i18n';
import type { fr } from '../fr/game.views.leaderboard';

export const en: PartOf<typeof fr> = {
  'lb.completion': 'Completion',
  'lb.pctUnit': '{pct} · {n} cards',
  'lb.season': 'Season',
  'lb.trades': 'Trades',
  'lb.streak': 'Streak',
  'lb.endsIn': 'ends in {t}',
  'lb.rule': 'Score: the different cards earned since the start of the month. The ranking freezes at the end of the month, then everything resets.{joining}',
  'lb.first': '{packs} · “Season champion” title · “Season podium” frame',
  'lb.second': '{a} / {b} · “Season podium” frame',
  'lb.others': 'the others',
  'lb.played': '{packs} from one card earned',
  'lb.firstSoon': 'The first season starts within the hour: from then on, every different card earned counts.',
  'lb.past': 'Past seasons',
  'lb.noPast': 'No finished season yet: the first podium will be engraved here at the end of the month.',
  'lb.seasonOf': 'Season {s}',
  'lb.you': 'You: {rank}',
  'lb.gained': { one: '· +{cards} · {packs} received', other: '· +{cards} · {packs} received' },
  'lb.nobody': 'Nobody on the leaderboard yet.',
  'lb.youLead': 'You’re in the lead',
  'lb.youAre': 'You’re {r} of {n}',
  'lb.toPass': 'You need <b>{gap}</b> to pass {name}',
  'lb.behind': '{name} is {gap} behind you',
  'lb.king': 'The main ranking: overall collection completion. First place gets the “Number one” title.',
  'lb.joining': ' <b>You join the season within the hour</b>: your cards count from then on.',
  'lb.mythics': '6★ & secrets',
};
