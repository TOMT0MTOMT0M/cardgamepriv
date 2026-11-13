/**
 * Textes du jeu en français : LA SOURCE des clés (src/core/i18n.ts). Une clé ajoutée ici doit l'être aussi dans
 * `en.ts` (sinon le typecheck casse). Pluriels : `{ one, other }` choisis sur le paramètre `n` (Intl.PluralRules).
 */
export const fr = {
  // ───── langue (sélecteur de l'en-tête) ─────
  'lang.label': 'Langue',
  'lang.aria': 'Langue : français. Passer en anglais',
  'lang.title': 'Langue du jeu : français (toucher pour passer en anglais)',
  'lang.later': 'La langue changera à la fin de l’ouverture.',
  'lang.failed': 'La langue n’a pas pu changer (réseau ?). Réessaie dans un instant.',

  // ───── titres de l'onglet du navigateur ─────
  'title.shop': 'Bébou — boutique',
  'title.collection': 'Bébou — collection',
  'title.contrats': 'Bébou — contrats',
  'title.echanges': 'Bébou — échanges',
  'title.amis': 'Bébou — amis',
  'title.profil': 'Bébou — profil',
  'title.jeux': 'Bébou — jeux',
  'title.classement': 'Bébou — classement',
  'title.succes': 'Bébou — succès',
  'title.suggestions': 'Bébou — suggestions',
  'title.maj': 'Bébou — mises à jour',
  'title.tuto': 'Bébou — tutoriel',
} as const satisfies Record<string, string | { one?: string; other: string }>;
