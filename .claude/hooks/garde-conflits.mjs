// PreToolUse (Edit/Write) : bloque la modification d'un fichier que l'autre a changé sur GitHub
// tant qu'on n'a pas récupéré ses changements. Remplace la « réservation » à la main.
import path from 'node:path';
import { git, amont, fetchRecent } from './git-commun.mjs';

let entree = '';
for await (const morceau of process.stdin) entree += morceau;
let donnees = {};
try { donnees = JSON.parse(entree) ?? {}; } catch {}
const racine = git('rev-parse --show-toplevel');
if (!racine) process.exit(0);

// Fichiers à contrôler : celui qu'Edit/Write va modifier, ou ceux qu'un « git commit » (lancé en Bash) va enregistrer
// — ce second cas rattrape les modifications faites autrement (sed, scripts…).
let fichiers = [];
const commande = donnees?.tool_input?.command;
if (typeof commande === 'string') {
  if (!/\bgit\b[^\n;&|]*\bcommit\b/.test(commande)) process.exit(0);
  const tout = /\bcommit\b[^\n;&|]*\s-[a-zA-Z]*a/.test(commande);
  const listes = [git('diff --cached --name-only'), tout ? git('diff --name-only') : ''];
  fichiers = [...new Set(listes.join('\n').split('\n').map((f) => f.trim()).filter(Boolean))];
} else {
  const fichier = donnees?.tool_input?.file_path;
  if (!fichier) process.exit(0);
  const rel = path.relative(path.resolve(racine), path.resolve(fichier)).replace(/\\/g, '/');
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) process.exit(0);
  fichiers = [rel];
}
if (!fichiers.length) process.exit(0);

fetchRecent();
const up = amont();
if (!up) process.exit(0);
const bloques = [];
for (const rel of fichiers) {
  const changements = git(`log --format="%h %an, %ar : %s" HEAD..${up} -- "${rel}"`);
  if (changements) bloques.push(`${rel} :`, ...changements.split('\n').slice(0, 3).map((l) => `  ${l}`));
}
if (bloques.length) {
  process.stderr.write([
    `[garde-fou] BLOQUÉ : modifié sur GitHub (${up}) depuis ta version :`,
    ...bloques,
    'Fais d\'abord : git pull --rebase --autostash, vérifie que tout compile, puis refais la modification ou le commit.',
  ].join('\n') + '\n');
  process.exit(2);
}
