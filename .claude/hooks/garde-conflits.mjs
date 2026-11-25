// PreToolUse (Edit/Write) : bloque la modification d'un fichier que l'autre a changé sur GitHub
// tant qu'on n'a pas récupéré ses changements. Remplace la « réservation » à la main.
import path from 'node:path';
import { git, amont, fetchRecent } from './git-commun.mjs';

let entree = '';
for await (const morceau of process.stdin) entree += morceau;
let fichier;
try { fichier = JSON.parse(entree)?.tool_input?.file_path; } catch {}
if (!fichier) process.exit(0);

const racine = git('rev-parse --show-toplevel');
if (!racine) process.exit(0);
const rel = path.relative(path.resolve(racine), path.resolve(fichier)).replace(/\\/g, '/');
if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) process.exit(0);

fetchRecent();
const up = amont();
if (!up) process.exit(0);
const changements = git(`log --format="%h %an, %ar : %s" HEAD..${up} -- "${rel}"`);
if (changements) {
  process.stderr.write([
    `BLOQUÉ : ${rel} a été modifié sur GitHub (${up}) depuis ta version :`,
    ...changements.split('\n').slice(0, 5),
    'Fais d\'abord : git pull --rebase --autostash, vérifie que tout compile, puis refais la modification.',
  ].join('\n') + '\n');
  process.exit(2);
}
