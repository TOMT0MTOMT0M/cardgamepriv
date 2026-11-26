// SessionStart : dit à Claude ET à la personne si l'autre (Tom ou Hugo) a poussé des commits qu'on n'a pas encore.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { git, amont, fetchRecent, dir } from './git-commun.mjs';

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

// Fins de ligne : `v2` garde les .cmd normalisés (58d5fae), `master` les a encore en CRLF. Sans ce réglage, reporter
// sur v2 un patch de master qui touche un lanceur fait un conflit sur tout le fichier. Réglage local du dépôt,
// partagé avec .wt-master ; posé une fois.
if (git('config --get merge.renormalize') !== 'true') git('config merge.renormalize true');

// Présence d'équipe (lanceur Claude) : un veilleur détaché dit à l'autre qu'on est en ligne et sur quelles sessions.
// Sans effet si le fichier n'existe pas (branche master) ou si un veilleur tourne déjà.
try {
  const veilleur = join(dir, 'outils', 'lanceur', 'presence.mjs');
  if (existsSync(veilleur)) {
    spawn(process.execPath, [veilleur, '--veille'], { detached: true, stdio: 'ignore', windowsHide: true, cwd: dir }).unref();
  }
} catch {}

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
