// SessionStart : dit à Claude ET à la personne si l'autre (Tom ou Hugo) a poussé des commits qu'on n'a pas encore.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { git, amont, fetchRecent, dir } from './git-commun.mjs';

// Annonces d'équipe : un fichier `.claude/annonces/AAAA-MM-JJ-pour-<hugo|tom|tous>-<sujet>.md` est rappelé à chaque
// début de session à la personne visée, jusqu'à ce que son Claude l'ait appliqué puis marqué par `--vu <nom>`.
// Le suivi est local au PC (dossier .git, partagé avec .wt-master), jamais commité.
const dossierAnnonces = join(dir, '.claude', 'annonces');
function fichierVues() {
  const commun = git('rev-parse --git-common-dir');
  if (!commun) return null;
  return join(/^[A-Za-z]:|^\//.test(commun) ? commun : join(dir, commun), 'claude-annonces-vues.json');
}
function annoncesVues() {
  try { return JSON.parse(readFileSync(fichierVues(), 'utf8')); } catch { return []; }
}
function annoncesEnAttente() {
  const moi = /hugo/i.test(git('config user.name') || '') ? 'hugo' : 'tom';
  let fichiers = [];
  try { fichiers = readdirSync(dossierAnnonces).filter((f) => f.endsWith('.md')).sort(); } catch {}
  const vues = annoncesVues();
  return fichiers
    .map((f) => f.slice(0, -3))
    .filter((nom) => new RegExp(`-pour-(${moi}|tous)-`).test(nom) && !vues.includes(nom))
    .map((nom) => {
      let titre = nom;
      try { titre = readFileSync(join(dossierAnnonces, `${nom}.md`), 'utf8').split(/\r?\n/)[0].replace(/^#\s*/, ''); } catch {}
      return { nom, titre };
    });
}
if (process.argv[2] === '--vu') {
  const nom = (process.argv[3] || '').replace(/\.md$/, '');
  if (!nom || !existsSync(join(dossierAnnonces, `${nom}.md`))) { console.log(`Annonce inconnue : ${nom}`); process.exit(1); }
  const vues = annoncesVues();
  if (!vues.includes(nom)) writeFileSync(fichierVues(), JSON.stringify([...vues, nom]));
  console.log(`Annonce « ${nom} » marquée comme faite : elle ne sera plus rappelée sur ce PC.`);
  process.exit(0);
}

// systemMessage = affiché à la personne ; additionalContext = lu par Claude.
function dire(texte) {
  for (const a of annoncesEnAttente()) {
    texte += [
      '',
      `[annonce d'équipe] ${a.titre}`,
      `AVANT toute autre tâche : lis \`.claude/annonces/${a.nom}.md\` en entier, applique ses étapes dans l'ordre, puis donne à la personne l'explication prévue à la fin du fichier. Ensuite seulement, la tâche demandée.`,
      `Une fois fait : node .claude/hooks/au-demarrage.mjs --vu ${a.nom}`,
    ].join('\n');
  }
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
