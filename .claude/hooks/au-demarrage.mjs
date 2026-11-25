// SessionStart : dit à Claude si l'autre (Tom ou Hugo) a poussé des commits qu'on n'a pas encore.
import { git, amont, fetchRecent } from './git-commun.mjs';

const branche = git('rev-parse --abbrev-ref HEAD');
if (!branche) process.exit(0);
fetchRecent(true);
const up = amont();
if (!up) { console.log(`Branche ${branche} : pas de branche GitHub à suivre.`); process.exit(0); }
const retard = git(`log --format="%h %an : %s" HEAD..${up}`);
if (retard) {
  const lignes = retard.split('\n');
  console.log([
    `ATTENTION : GitHub (${up}) a ${lignes.length} commit(s) que ce dossier n'a pas :`,
    ...lignes.slice(0, 10),
    'Première action de la session, avant toute modification : git pull --rebase --autostash.',
  ].join('\n'));
} else {
  console.log(`Branche ${branche} à jour avec ${up}.`);
}
