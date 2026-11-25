// SessionStart : dit à Claude ET à la personne si l'autre (Tom ou Hugo) a poussé des commits qu'on n'a pas encore.
import { git, amont, fetchRecent } from './git-commun.mjs';

// systemMessage = affiché à la personne ; additionalContext = lu par Claude.
function dire(texte) {
  console.log(JSON.stringify({
    systemMessage: texte,
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: texte },
  }));
  process.exit(0);
}

const branche = git('rev-parse --abbrev-ref HEAD');
if (!branche) process.exit(0);
fetchRecent(true);
const up = amont();
if (!up) dire(`[garde-fou] Branche ${branche} : pas de branche GitHub à suivre.`);
const retard = git(`log --format="%h %an : %s" HEAD..${up}`);
if (retard) {
  const lignes = retard.split('\n');
  // Récupération automatique quand c'est sans risque : aucun fichier suivi modifié et aucun commit local non poussé.
  const modifie = git('status --porcelain --untracked-files=no');
  const avance = git(`rev-list --count ${up}..HEAD`);
  if (modifie === '' && avance === '0' && git(`merge --ff-only --quiet ${up}`) !== null) {
    dire([
      `[garde-fou] ${lignes.length} commit(s) récupéré(s) automatiquement depuis ${up} :`,
      ...lignes.slice(0, 10),
      'Dossier à jour, tu peux travailler.',
    ].join('\n'));
  }
  dire([
    `[garde-fou] ATTENTION : GitHub (${up}) a ${lignes.length} commit(s) que ce dossier n'a pas :`,
    ...lignes.slice(0, 10),
    'Première action de la session, avant toute modification : git pull --rebase --autostash.',
  ].join('\n'));
}
dire(`[garde-fou] Branche ${branche} à jour avec ${up}.`);
