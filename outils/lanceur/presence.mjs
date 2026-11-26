// Présence d'équipe (26/11/2026) : qui est en ligne et sur quelles sessions Claude.
// Chaque PC pousse un petit fichier etat.json sur GitHub dans refs/presence/<nom> (hors branches : aucun build,
// aucun coût). Tout passe par un dépôt à part, .claude-tmp/presence.git : le dépôt de travail n'est jamais touché
// (ni index, ni FETCH_HEAD, ni objets en plus).
// Bibliothèque pour serveur.mjs ; lancé avec --veille, bat tant qu'une session Claude ou le lanceur est ouvert.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, statSync, openSync, readSync, closeSync, utimesSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const racine = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const tmp = join(racine, '.claude-tmp');
const depot = join(tmp, 'presence.git');
const verrou = join(tmp, 'presence-veille.json');
export const etatLanceur = join(tmp, 'lanceur-etat.json');

export const BATTEMENT_MS = 180000; // un battement toutes les 3 min au repos
const ECART_MIN_MS = 45000; // jamais plus d'un push toutes les 45 s
export const EN_LIGNE_MS = 8 * 60000; // au-delà de 8 min sans battement : hors ligne

function git(dossier, args, { input, timeout = 20000 } = {}) {
  try {
    return execFileSync('git', args, {
      cwd: dossier, input, encoding: 'utf8', timeout, windowsHide: true,
      stdio: ['pipe', 'pipe', 'ignore'],
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
    }).trim();
  } catch {
    return null;
  }
}
export const gitRacine = (args, opts) => git(racine, args, opts);

// Hugo commite sous « Hugo », Tom sous « Claude (Card Lab) » : même règle que les hooks (%an).
export function nomAuteur(an) {
  return /hugo/i.test(an || '') ? 'Hugo' : 'Tom';
}
let moiCache = null;
export function moi() {
  if (!moiCache) moiCache = nomAuteur(gitRacine(['config', 'user.name']));
  return moiCache;
}

function vivant(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

function lireJson(chemin) {
  try { return JSON.parse(readFileSync(chemin, 'utf8')); } catch { return null; }
}

// Dernier titre donné par Claude Code à une session (ligne « ai-title » de son journal), lu dans la fin du fichier.
const titres = new Map(); // chemin -> { mtime, titre }
export function titreSession(cwd, sessionId) {
  const chemin = join(homedir(), '.claude', 'projects', cwd.replace(/[^A-Za-z0-9]/g, '-'), `${sessionId}.jsonl`);
  let st;
  try { st = statSync(chemin); } catch { return null; }
  const connu = titres.get(chemin);
  if (connu && connu.mtime === st.mtimeMs) return connu.titre;
  let titre = connu?.titre ?? null;
  try {
    const taille = Math.min(st.size, 400000);
    const buf = Buffer.alloc(taille);
    const fd = openSync(chemin, 'r');
    readSync(fd, buf, 0, taille, st.size - taille);
    closeSync(fd);
    const tous = [...buf.toString('utf8').matchAll(/"type":"(?:ai-title|custom-title)","(?:aiTitle|customTitle|title)":"((?:[^"\\]|\\.)*)"/g)];
    if (tous.length) titre = JSON.parse(`"${tous[tous.length - 1][1]}"`);
  } catch {}
  titres.set(chemin, { mtime: st.mtimeMs, titre });
  return titre;
}

function dossierCourt(cwd) {
  const rel = resolve(cwd).slice(racine.length).replace(/^[\\/]/, '');
  return rel === '' ? 'racine' : rel.split(sep).join('/');
}

const branches = new Map(); // cwd -> { at, branche }
function brancheDe(cwd) {
  const c = branches.get(cwd);
  if (c && Date.now() - c.at < 30000) return c.branche;
  const branche = git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'], { timeout: 5000 });
  branches.set(cwd, { at: Date.now(), branche });
  return branche;
}

// Sessions Claude Code ouvertes sur ce PC dans ce dépôt (fichiers ~/.claude/sessions/<pid>.json).
export function sessionsLocales() {
  const dossier = join(homedir(), '.claude', 'sessions');
  let fichiers = [];
  try { fichiers = readdirSync(dossier).filter((f) => /^\d+\.json$/.test(f)); } catch {}
  const base = racine.toLowerCase();
  const sessions = [];
  for (const f of fichiers) {
    const s = lireJson(join(dossier, f));
    if (!s?.cwd || !s.pid || !vivant(s.pid)) continue;
    const cwd = resolve(s.cwd);
    const bas = cwd.toLowerCase();
    if (bas !== base && !bas.startsWith(base + sep)) continue;
    sessions.push({
      id: s.sessionId,
      nom: s.name || null,
      titre: titreSession(s.cwd, s.sessionId),
      dossier: dossierCourt(cwd),
      branche: brancheDe(cwd),
      statut: s.status || null,
      depuis: s.startedAt || null,
      maj: s.statusUpdatedAt || s.updatedAt || null,
    });
  }
  return sessions.sort((a, b) => (a.depuis || 0) - (b.depuis || 0));
}

// Le mot laissé à l'autre depuis le lanceur (« je touche market.ts jusqu'à 18 h »).
export function noteLocale() {
  return String(lireJson(join(tmp, 'lanceur-note.json'))?.note || '').slice(0, 140);
}

export function lanceurOuvert() {
  const e = lireJson(etatLanceur);
  return !!(e?.pid && vivant(e.pid));
}

function preparerDepot() {
  if (existsSync(join(depot, 'HEAD'))) return true;
  const url = gitRacine(['remote', 'get-url', 'origin']);
  if (!url) return false;
  mkdirSync(depot, { recursive: true });
  if (git(depot, ['init', '--bare', '--quiet']) === null) return false;
  return git(depot, ['remote', 'add', 'origin', url]) !== null;
}

let battements = 0;
// Pousse l'état de ce PC. Renvoie false si GitHub n'a pas répondu (hors connexion : sans gravité).
export function battre(horsLigne = false) {
  if (!preparerDepot()) return false;
  const etat = {
    qui: moi(),
    at: Date.now(),
    hors: horsLigne,
    lanceur: lanceurOuvert(),
    note: horsLigne ? '' : noteLocale(),
    sessions: horsLigne ? [] : sessionsLocales().map(({ id, ...reste }) => reste),
  };
  const blob = git(depot, ['hash-object', '-w', '--stdin'], { input: JSON.stringify(etat) });
  if (!blob) return false;
  const arbre = git(depot, ['mktree'], { input: `100644 blob ${blob}\tetat.json\n` });
  if (!arbre) return false;
  const commit = git(depot, ['-c', 'user.name=presence', '-c', 'user.email=presence@local', 'commit-tree', arbre, '-m', 'presence']);
  if (!commit) return false;
  const ok = git(depot, ['push', '--force', '--quiet', 'origin', `${commit}:refs/presence/${moi().toLowerCase()}`], { timeout: 30000 }) !== null;
  // ménage : les anciens battements ne servent plus à rien
  if (++battements % 100 === 0) git(depot, ['gc', '--prune=now', '--quiet'], { timeout: 60000 });
  return ok;
}

// État de tout le monde tel que GitHub le connaît (le nôtre compris, remplacé par l'état local dans le serveur).
export function lirePresence() {
  if (!preparerDepot()) return null;
  if (git(depot, ['fetch', '--quiet', '--prune', '--no-write-fetch-head', 'origin', '+refs/presence/*:refs/presence/*'], { timeout: 30000 }) === null) return null;
  const refs = git(depot, ['for-each-ref', '--format=%(refname)', 'refs/presence']);
  const gens = [];
  for (const ref of (refs || '').split('\n').filter(Boolean)) {
    const brut = git(depot, ['cat-file', 'blob', `${ref}:etat.json`]);
    try {
      const e = JSON.parse(brut);
      if (e && typeof e.qui === 'string' && typeof e.at === 'number') gens.push(e);
    } catch {}
  }
  return gens;
}

function signature() {
  return JSON.stringify([lanceurOuvert(), noteLocale(), sessionsLocales().map((s) => [s.nom, s.titre, s.dossier, s.branche, s.statut === 'busy'])]);
}

// --veille : un seul veilleur par PC ; il s'arrête 1 min après la dernière session et le lanceur fermés.
async function veiller() {
  mkdirSync(tmp, { recursive: true });
  const autre = lireJson(verrou);
  try {
    if (autre?.pid && autre.pid !== process.pid && vivant(autre.pid) && Date.now() - statSync(verrou).mtimeMs < 120000) return;
  } catch {}
  writeFileSync(verrou, JSON.stringify({ pid: process.pid }));
  let dernier = 0;
  let derniereSig = '';
  let videDepuis = 0;
  for (;;) {
    if (lireJson(verrou)?.pid !== process.pid) return; // un autre veilleur a pris la main
    try { utimesSync(verrou, new Date(), new Date()); } catch {}
    const actif = sessionsLocales().length > 0 || lanceurOuvert();
    const maintenant = Date.now();
    if (!actif) {
      videDepuis ||= maintenant;
      if (maintenant - videDepuis > 60000) { battre(true); return; }
    } else {
      videDepuis = 0;
    }
    const sig = signature();
    const ecart = maintenant - dernier;
    if (ecart > BATTEMENT_MS || (sig !== derniereSig && ecart > ECART_MIN_MS)) {
      battre(false);
      dernier = Date.now();
      derniereSig = sig;
    }
    await new Promise((r) => setTimeout(r, 15000));
  }
}

if (process.argv.includes('--veille')) veiller().catch(() => {});
