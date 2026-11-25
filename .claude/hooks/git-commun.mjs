// Outils git partagés par les hooks (25/11) : à deux, on ne travaille jamais sur une version en retard.
import { execSync } from 'node:child_process';
import { statSync, writeFileSync } from 'node:fs';

export const dir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

export function git(args, timeout = 15000) {
  try {
    return execSync(`git ${args}`, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout }).trim();
  } catch {
    return null;
  }
}

// Branche distante à suivre : l'amont configuré, sinon origin/master pour un patch, sinon origin/<branche>.
export function amont() {
  const branche = git('rev-parse --abbrev-ref HEAD');
  if (!branche || branche === 'HEAD') return null;
  const up = git('rev-parse --abbrev-ref --symbolic-full-name @{u}');
  if (up) return up;
  if (branche === 'master' || branche.startsWith('patch-')) return 'origin/master';
  return git(`rev-parse --verify --quiet origin/${branche}`) ? `origin/${branche}` : null;
}

// git fetch au plus toutes les 2 minutes (un fetch par modification serait trop lent).
export function fetchRecent(force = false) {
  const stamp = git('rev-parse --git-path claude-fetch-stamp');
  if (!stamp) return;
  const chemin = stamp.match(/^[A-Za-z]:|^\//) ? stamp : `${dir}/${stamp}`;
  let age = Infinity;
  try { age = Date.now() - statSync(chemin).mtimeMs; } catch {}
  if (!force && age < 120000) return;
  if (git('fetch origin --quiet', 20000) !== null) {
    try { writeFileSync(chemin, String(Date.now())); } catch {}
  }
}
