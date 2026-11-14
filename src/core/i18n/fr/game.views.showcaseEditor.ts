/** Textes de src/game/views/showcaseEditor.ts : chargés avec lui (module à la demande), enregistrés par addFr. */
import { addFr } from '../../i18n';

export const fr = {
  'sce.cardA': 'carte de la vitrine, déplaçable',
  'sce.remove': 'Retirer de la vitrine',
  'sce.full': 'Vitrine pleine : touche la carte à remplacer dans la vitrine, ou glisse celle-ci dessus.',
  'sce.cap': '{n} sur {total} · affine ta recherche ou filtre par étoiles',
  'sce.noFilter': 'Aucune carte avec ce filtre.',
  'sce.none': 'Aucune carte.',
  'sce.fullShort': 'La vitrine est déjà pleine.',
  'sce.nothingLeft': 'Plus aucune carte à ajouter.',
  'sce.replace': 'Choisis une carte pour <b>remplacer la case {n}</b> · retouche la case pour annuler',
  'sce.touch': 'Touche pour ajouter ou retirer · <b>maintiens</b> puis glisse sur une case',
  'sce.mouse': 'Clique pour ajouter ou retirer · <b>glisse</b> sur une case pour la placer',
} as const satisfies Record<string, string | { one?: string; other: string }>;
addFr(fr);
