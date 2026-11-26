// Lanceur Claude pleine page (26/11/2026). Petit serveur local (127.0.0.1 seulement) : il lit git, EN-COURS.md,
// les tags, les sessions Claude et la présence de l'équipe, et ouvre les terminaux. La page : index.html.
// Lancé par LANCEUR-CLAUDE.cmd (via outils/lanceur-claude.vbs). S'arrête tout seul quand la fenêtre est fermée.
import { execFile, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EN_LIGNE_MS, etatLanceur, lirePresence, moi, nomAuteur, racine, sessionsLocales, titreSession } from './presence.mjs';

const ici = dirname(fileURLToPath(import.meta.url));
const master = join(racine, '.wt-master');
const tmp = join(racine, '.claude-tmp');
const fichierEnCours = join(racine, 'docs', 'chantiers', 'EN-COURS.md');
const fichierNote = join(tmp, 'lanceur-note.json');
const journal = join(racine, 'logs', 'lanceur-claude.log');
const PORT = 4517;
const SANS_FENETRE = process.argv.includes('--sans-fenetre'); // pour les essais

function noter(texte) {
  try { mkdirSync(dirname(journal), { recursive: true }); appendFileSync(journal, `${new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 19)} ${texte}\r\n`); } catch {}
}
function lireJson(chemin) {
  try { return JSON.parse(readFileSync(chemin, 'utf8')); } catch { return null; }
}
function git(dossier, args, timeout = 20000) {
  return new Promise((ok) => {
    execFile('git', args, {
      cwd: dossier, encoding: 'utf8', timeout, windowsHide: true, maxBuffer: 8 << 20,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
    }, (err, sortie) => ok(err ? null : sortie.trim()));
  });
}

// ---------- dépôt ----------
async function etatDossier(dossier, nom) {
  if (!existsSync(dossier)) return null;
  const branche = await git(dossier, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (!branche) return null;
  let amont = await git(dossier, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  if (!amont) amont = branche === 'master' || branche.startsWith('patch-') ? 'origin/master' : `origin/${branche}`;
  const compte = await git(dossier, ['rev-list', '--left-right', '--count', `HEAD...${amont}`]);
  const [avance, retard] = compte ? compte.split(/\s+/).map(Number) : [null, null];
  // sans les fichiers dont seules les fins de ligne diffèrent (.gitattributes : les .cmd paraissent modifiés)
  const modifs = await git(dossier, ['diff', '--ignore-cr-at-eol', '--numstat', 'HEAD']);
  return { nom, branche, amont, avance, retard, modifs: modifs ? modifs.split('\n').length : 0 };
}

let dernierFetch = 0;
async function recuperer() {
  const ok = await git(racine, ['fetch', '--quiet', '--no-write-fetch-head', 'origin'], 40000);
  if (ok !== null) dernierFetch = Date.now();
  return ok !== null;
}

// ---------- EN-COURS.md ----------
let enCours = { mtime: 0, donnees: null };
function lireEnCours() {
  let st;
  try { st = statSync(fichierEnCours); } catch { return { maj: null, chantiers: [], sections: [], pieges: [] }; }
  if (enCours.mtime === st.mtimeMs) return enCours.donnees;
  const lignes = readFileSync(fichierEnCours, 'utf8').split(/\r?\n/);
  const donnees = { maj: null, chantiers: [], sections: [], pieges: [], modifie: st.mtimeMs };
  let partie = '';
  let section = null;
  let dernier = null;
  for (const l of lignes) {
    const maj = l.match(/^_Mis à jour : (\S+)/);
    if (maj) { donnees.maj = maj[1]; continue; }
    if (l.startsWith('## ')) { partie = l.slice(3).trim(); section = null; dernier = null; continue; }
    if (/^Chantiers/i.test(partie)) {
      if (!l.startsWith('|') || /^\|\s*-/.test(l) || /^\|\s*Qui\s*\|/.test(l)) continue;
      const c = l.split('|').slice(1, -1).map((x) => x.trim());
      if (c.length >= 4) donnees.chantiers.push({ qui: c[0], dossier: c[1], chantier: c[2], etat: c.slice(3).join(' | ') });
    } else if (/^Reste/i.test(partie)) {
      if (l.startsWith('### ')) { section = { titre: l.slice(4).trim(), items: [] }; donnees.sections.push(section); dernier = null; continue; }
      if (!l.trim()) continue;
      if (!section) { section = { titre: 'Divers', items: [] }; donnees.sections.push(section); }
      const coche = l.match(/^- \[( |x|X)\] (.*)$/);
      if (coche) { dernier = { type: 'tache', fait: coche[1] !== ' ', texte: coche[2], sous: [] }; section.items.push(dernier); continue; }
      const sous = l.match(/^\s+- (.*)$/);
      if (sous && dernier) { dernier.sous.push(sous[1]); continue; }
      const puce = l.match(/^- (.*)$/);
      if (puce) { section.items.push({ type: 'note', texte: puce[1] }); dernier = null; continue; }
      section.items.push({ type: 'titre', texte: l.trim() }); dernier = null;
    } else if (/^Pi[èe]ges/i.test(partie)) {
      const puce = l.match(/^- (.*)$/);
      if (puce) donnees.pieges.push(puce[1]);
    }
  }
  enCours = { mtime: st.mtimeMs, donnees };
  return donnees;
}

// ---------- patchs (tags v2.X.Y) ----------
const stats = new Map(); // "prev..tag" -> { fichiers, plus, moins, sujets }
let patchs = [];
function versionsCitees(texte) {
  const v = [];
  for (const m of texte.matchAll(/v(\d+)\.(\d+)\.(\d+)(?:-(\d+))?/g)) {
    const fin = m[4] ? Number(m[4]) : Number(m[3]);
    for (let n = Number(m[3]); n <= fin && n < Number(m[3]) + 20; n++) v.push(`v${m[1]}.${m[2]}.${n}`);
  }
  return v;
}
async function lirePatchs() {
  const brut = await git(racine, ['for-each-ref', '--sort=-creatordate', '--count=40',
    '--format=%(refname:short)%09%(creatordate:unix)%09%(taggername)%09%(*objectname)%09%(objectname)', 'refs/tags/v2.*']);
  if (brut === null) return;
  const tags = brut.split('\n').filter(Boolean).map((l) => {
    const [tag, date, tagueur, cible, objet] = l.split('\t');
    return { tag, date: Number(date) * 1000, tagueur, commit: cible || objet };
  });
  const table = new Map();
  for (const c of lireEnCours().chantiers) {
    const cites = versionsCitees(c.chantier);
    // une ligne qui couvre plusieurs versions ne donne pas le titre : chaque tag prend le sien (doc ou commit)
    for (const v of cites) if (!table.has(v)) table.set(v, { ...c, partage: cites.length > 1 });
  }
  const liste = [];
  for (let i = 0; i < tags.length; i++) {
    const t = tags[i];
    const prec = tags[i + 1]?.tag;
    const cle = `${prec}..${t.tag}`;
    if (prec && !stats.has(cle)) {
      const court = await git(racine, ['diff', '--shortstat', prec, t.tag]);
      const sujets = await git(racine, ['log', '--no-merges', '--format=%s', '-4', `${prec}..${t.tag}`]);
      stats.set(cle, {
        fichiers: Number(court?.match(/(\d+) file/)?.[1] || 0),
        plus: Number(court?.match(/(\d+) insertion/)?.[1] || 0),
        moins: Number(court?.match(/(\d+) deletion/)?.[1] || 0),
        sujets: sujets ? sujets.split('\n') : [],
      });
    }
    const s = stats.get(cle) || { fichiers: 0, plus: 0, moins: 0, sujets: [] };
    const ligne = table.get(t.tag);
    let titre = ligne && !ligne.partage ? ligne.chantier.replace(/^patchs?\s+v[\d.\- etv]+:\s*/i, '') : null;
    const doc = join(racine, 'docs', 'chantiers', `${t.tag}.md`);
    const aDoc = existsSync(doc);
    if (!titre && aDoc) {
      try { titre = readFileSync(doc, 'utf8').split(/\r?\n/)[0].replace(/^#\s*(Patchs?\s+)?v[\d.]+((\s+et\s+|\s*[,-]\s*)v?[\d.]+)*\s*[—:-]\s*/i, '').replace(/\s*—\s*EN LIGNE.*$/i, '').replace(/\s*\([^)]*\)\s*$/, ''); } catch {}
    }
    if (!titre && s.sujets[0]) titre = s.sujets[0].replace(/\s*\(patch v[\d.]+\)\s*$/i, '').replace(/^\w+(\([^)]*\))?:\s*/, '');
    if (!titre) titre = t.tag;
    liste.push({
      tag: t.tag, date: t.date, commit: t.commit.slice(0, 7),
      qui: ligne ? ligne.qui.replace(/\s*\+\s*Claude/i, '') : nomAuteur(t.tagueur),
      titre, doc: aDoc, fichiers: s.fichiers, plus: s.plus, moins: s.moins, sujets: s.sujets,
    });
  }
  patchs = liste;
}

// ---------- activité (commits) ----------
let commits = [];
async function lireCommits() {
  const brut = await git(racine, ['log', '-60', '--format=%h%x09%an%x09%ct%x09%s', 'origin/v2']);
  if (brut === null) return;
  const manquants = new Set(((await git(racine, ['rev-list', '--abbrev-commit', 'HEAD..origin/v2'])) || '').split('\n').map((x) => x.slice(0, 7)));
  commits = brut.split('\n').filter(Boolean).map((l) => {
    const [sha, an, ct, ...sujet] = l.split('\t');
    return { sha, qui: nomAuteur(an), date: Number(ct) * 1000, sujet: sujet.join('\t'), nouveau: manquants.has(sha.slice(0, 7)) };
  });
}

// ---------- sites en ligne (version.json) ----------
const SITES = [
  { id: 'prod', nom: 'Site des joueurs', url: 'https://cardgamepriv.pages.dev' },
  { id: 'v3', nom: 'Lien V3 (équipe)', url: 'https://v2.cardgamepriv.pages.dev' },
];
let sites = SITES.map((s) => ({ ...s, version: null, at: null, ok: null }));
async function lireSites() {
  sites = await Promise.all(SITES.map(async (s) => {
    try {
      const r = await fetch(`${s.url}/version.json`, { signal: AbortSignal.timeout(8000), cache: 'no-store' });
      const j = await r.json();
      return { ...s, version: String(j.id || ''), at: j.at || null, ok: true };
    } catch {
      const avant = sites.find((x) => x.id === s.id);
      return { ...s, version: avant?.version ?? null, at: avant?.at ?? null, ok: false };
    }
  }));
}

// ---------- journaux des lanceurs ----------
function lireJournaux() {
  const liste = [];
  for (const [dossier, ou] of [[join(racine, 'logs'), 'racine'], [join(master, 'logs'), '.wt-master']]) {
    let fichiers = [];
    try { fichiers = readdirSync(dossier).filter((f) => f.endsWith('.log') && f !== 'lanceur-claude.log'); } catch {}
    for (const f of fichiers) {
      try {
        const st = statSync(join(dossier, f));
        if (Date.now() - st.mtimeMs > 7 * 86400000) continue;
        liste.push({ nom: f.replace(/\.log$/, ''), ou, date: st.mtimeMs, chemin: join(dossier, f) });
      } catch {}
    }
  }
  liste.sort((a, b) => b.date - a.date);
  return liste.slice(0, 6).map(({ chemin, ...j }) => {
    let verdict = null;
    try {
      const fin = readFileSync(chemin, 'latin1').slice(-3000);
      if (/ECHEC|=== ERREUR/i.test(fin)) verdict = 'echec';
      else if (/===[^=\r\n]*\bOK\b[^=\r\n]*===/.test(fin)) verdict = 'ok';
    } catch {}
    return { ...j, verdict };
  });
}

// ---------- sessions récentes (à reprendre) ----------
function sessionsRecentes(ouvertes) {
  const liste = [];
  for (const [dossier, ou] of [[racine, 'racine'], [master, '.wt-master']]) {
    const dir = join(homedir(), '.claude', 'projects', dossier.replace(/[^A-Za-z0-9]/g, '-'));
    let fichiers = [];
    try { fichiers = readdirSync(dir).filter((f) => f.endsWith('.jsonl')); } catch {}
    for (const f of fichiers) {
      const id = f.slice(0, -6);
      if (ouvertes.has(id)) continue;
      try {
        const st = statSync(join(dir, f));
        if (Date.now() - st.mtimeMs < 7 * 86400000) liste.push({ id, dossier: ou, chemin: dossier, date: st.mtimeMs });
      } catch {}
    }
  }
  liste.sort((a, b) => b.date - a.date);
  const sortie = [];
  for (const s of liste) {
    const titre = titreSession(s.chemin, s.id);
    if (titre) sortie.push({ id: s.id, dossier: s.dossier, date: s.date, titre });
    if (sortie.length >= 8) break;
  }
  return sortie;
}

// ---------- présence ----------
let distants = [];
let presenceOk = null;
function rafraichirPresence() {
  const p = lirePresence(); // ≈ 0,6 s
  presenceOk = p !== null;
  if (p) distants = p;
}
function equipe(locales) {
  const note = lireJson(fichierNote)?.note || '';
  const gens = [{ qui: moi(), moi: true, enLigne: true, at: Date.now(), lanceur: true, note, sessions: locales.map(({ id, ...s }) => s) }];
  for (const e of distants) {
    if (e.qui === moi()) continue;
    gens.push({
      qui: e.qui, moi: false, at: e.at, lanceur: !!e.lanceur, note: String(e.note || '').slice(0, 200),
      enLigne: !e.hors && Date.now() - e.at < EN_LIGNE_MS,
      sessions: Array.isArray(e.sessions) ? e.sessions.slice(0, 12) : [],
    });
  }
  for (const nom of ['Tom', 'Hugo']) {
    if (!gens.some((g) => g.qui === nom)) gens.push({ qui: nom, moi: false, enLigne: false, at: null, lanceur: false, note: '', sessions: [], jamais: true });
  }
  return gens;
}

// ---------- rafraîchissements ----------
let dossiers = [];
async function rafraichirGit(avecFetch) {
  if (avecFetch) await recuperer();
  dossiers = (await Promise.all([etatDossier(racine, 'racine'), etatDossier(master, '.wt-master')])).filter(Boolean);
  await lirePatchs();
  await lireCommits();
}
let enCoursGit = false;
async function tourGit(avecFetch) {
  if (enCoursGit) return;
  enCoursGit = true;
  try { await rafraichirGit(avecFetch); } catch (e) { noter(`ERREUR git : ${e.message}`); }
  enCoursGit = false;
}

function versionPage() {
  try { return statSync(join(ici, 'index.html')).mtimeMs; } catch { return 0; }
}
function etatComplet() {
  const locales = sessionsLocales();
  const ec = lireEnCours();
  const prod = sites.find((s) => s.id === 'prod');
  const enLigne = prod?.version ? patchs.find((p) => prod.version.endsWith(p.commit)) : null;
  return {
    maintenant: Date.now(),
    page: versionPage(),
    moi: moi(),
    equipe: equipe(locales),
    presenceOk,
    dossiers,
    dernierFetch,
    aMaster: existsSync(master),
    patchs: patchs.map((p) => ({ ...p, enLigne: enLigne?.tag === p.tag })),
    commits,
    sites,
    journaux: lireJournaux(),
    recentes: sessionsRecentes(new Set(locales.map((s) => s.id))),
    enCours: ec,
  };
}

// ---------- actions ----------
function terminal(dossier, titre, ligne) {
  noter(`action ${titre} : ${ligne} dans ${dossier}`);
  const repli = () => spawn('cmd.exe', ['/c', 'start', titre, '/d', dossier, 'cmd.exe', '/k', ligne], { detached: true, stdio: 'ignore', windowsHide: false }).unref();
  try {
    const p = spawn('wt.exe', ['-d', dossier, '--title', titre, 'cmd', '/k', ligne], { detached: true, stdio: 'ignore' });
    p.on('error', repli);
    p.unref();
  } catch { repli(); }
}
function ouvrir(cible) {
  spawn('cmd.exe', ['/c', 'start', '', cible], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}
async function depotWeb() {
  const url = await git(racine, ['remote', 'get-url', 'origin']);
  return url ? url.replace(/^(https?:\/\/)[^@/]*@/, '$1').replace(/\.git$/, '') : null;
}
const LIENS = {
  joueurs: 'https://cardgamepriv.pages.dev/jeu/',
  v3: 'https://v2.cardgamepriv.pages.dev/jeu/',
  miroir: 'https://v2.cardgamepriv.pages.dev/miroir/',
  admin: 'https://cardgamepriv.pages.dev/admin/',
};
const DOSSIERS = { racine, '.wt-master': master };
async function action(id, arg) {
  switch (id) {
    case 'patch': if (!existsSync(master)) return 'Pas de dossier .wt-master sur ce PC'; terminal(master, 'PATCH', 'claude'); return null;
    case 'v3': terminal(racine, 'V3', 'claude --model opus'); return null;
    case 'continuer': terminal(racine, 'V3 (reprise)', 'claude --continue'); return null;
    case 'reprendre': {
      const dossier = DOSSIERS[arg?.dossier];
      if (!dossier || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(arg?.id || '')) return 'Session inconnue';
      terminal(dossier, 'REPRISE', `claude --resume ${arg.id}`);
      return null;
    }
    case 'lien': {
      if (LIENS[arg]) { ouvrir(LIENS[arg]); return null; }
      if (arg === 'github') { const u = await depotWeb(); if (u) ouvrir(u); return u ? null : 'Adresse GitHub introuvable'; }
      if (arg === 'encours') { spawn('notepad.exe', [fichierEnCours], { detached: true, stdio: 'ignore' }).unref(); return null; }
      if (arg === 'guide') { spawn('notepad.exe', [join(racine, 'docs', 'GUIDE-CLAUDE.md')], { detached: true, stdio: 'ignore' }).unref(); return null; }
      if (arg === 'dossier') { ouvrir(racine); return null; }
      if (arg === 'journaux') { ouvrir(join(racine, 'logs')); return null; }
      if (typeof arg === 'string' && /^doc:v\d+\.\d+\.\d+$/.test(arg)) {
        const doc = join(racine, 'docs', 'chantiers', `${arg.slice(4)}.md`);
        if (existsSync(doc)) { spawn('notepad.exe', [doc], { detached: true, stdio: 'ignore' }).unref(); return null; }
      }
      return 'Lien inconnu';
    }
    case 'note': {
      const note = String(arg || '').replace(/[\r\n]+/g, ' ').slice(0, 140);
      mkdirSync(tmp, { recursive: true });
      writeFileSync(fichierNote, JSON.stringify({ note }));
      return null;
    }
    case 'rafraichir': await tourGit(true); rafraichirPresence(); await lireSites(); return null;
    default: return 'Action inconnue';
  }
}

// ---------- serveur ----------
const jeton = randomBytes(18).toString('hex');
const clients = new Set();
let port = PORT;

function repondre(res, code, corps, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(typeof corps === 'string' ? corps : JSON.stringify(corps));
}
const serveur = createServer(async (req, res) => {
  try {
    if (req.headers.host !== `127.0.0.1:${port}`) return repondre(res, 403, { erreur: 'hôte refusé' });
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (url.pathname === '/ping') return repondre(res, 200, { lanceur: true });
    if (url.pathname === '/' && req.method === 'GET') return repondre(res, 200, readFileSync(join(ici, 'index.html'), 'utf8'), 'text/html; charset=utf-8');
    if (!url.pathname.startsWith('/api/')) return repondre(res, 404, { erreur: 'inconnu' });
    if ((req.headers['x-jeton'] || url.searchParams.get('k')) !== jeton) return repondre(res, 403, { erreur: 'jeton refusé' });
    if (url.pathname === '/api/etat') return repondre(res, 200, etatComplet());
    if (url.pathname === '/api/vie') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      res.write('retry: 2000\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    if (url.pathname === '/api/action' && req.method === 'POST') {
      let corps = '';
      for await (const bout of req) { corps += bout; if (corps.length > 4000) return repondre(res, 413, { erreur: 'trop long' }); }
      const { id, arg } = JSON.parse(corps || '{}');
      const erreur = await action(id, arg);
      return repondre(res, erreur ? 400 : 200, erreur ? { erreur } : { ok: true });
    }
    return repondre(res, 404, { erreur: 'inconnu' });
  } catch (e) {
    noter(`ERREUR requête : ${e.message}`);
    try { repondre(res, 500, { erreur: e.message }); } catch {}
  }
});

function navigateur(url) {
  const pf = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles, process.env.LOCALAPPDATA].filter(Boolean);
  const candidats = [
    ...pf.map((p) => join(p, 'Microsoft', 'Edge', 'Application', 'msedge.exe')),
    ...pf.map((p) => join(p, 'Google', 'Chrome', 'Application', 'chrome.exe')),
  ];
  const exe = candidats.find((c) => existsSync(c));
  if (!exe) { noter('navigateur : par défaut'); ouvrir(url); return; }
  // profil à part : la fenêtre s'ouvre toujours seule, agrandie, sans onglets ni barre d'adresse
  const profil = join(process.env.LOCALAPPDATA || tmp, 'cardgamepriv-lanceur');
  noter(`navigateur : ${exe}`);
  spawn(exe, [`--app=${url}`, '--start-maximized', `--user-data-dir=${profil}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions'],
    { detached: true, stdio: 'ignore' }).unref();
}

async function dejaOuvert() {
  const e = lireJson(etatLanceur);
  if (!e?.port || !e.jeton) return false;
  try {
    const r = await fetch(`http://127.0.0.1:${e.port}/ping`, { signal: AbortSignal.timeout(1500) });
    if (!(await r.json()).lanceur) return false;
  } catch { return false; }
  noter('lanceur déjà ouvert : nouvelle fenêtre sur le même');
  if (!SANS_FENETRE) navigateur(`http://127.0.0.1:${e.port}/?k=${e.jeton}`);
  return true;
}

function fermer() {
  noter('lanceur fermé');
  try { if (lireJson(etatLanceur)?.pid === process.pid) rmSync(etatLanceur); } catch {}
  process.exit(0);
}

async function demarrer() {
  if (!SANS_FENETRE && await dejaOuvert()) return;
  await new Promise((ok) => {
    serveur.once('error', () => { port = 0; serveur.listen(0, '127.0.0.1', ok); });
    serveur.listen(SANS_FENETRE ? 0 : PORT, '127.0.0.1', ok);
  });
  port = serveur.address().port;
  mkdirSync(tmp, { recursive: true });
  if (!SANS_FENETRE) writeFileSync(etatLanceur, JSON.stringify({ pid: process.pid, port, jeton }));
  noter(`lanceur ouvert (port ${port}, ${moi()}${SANS_FENETRE ? ', essai' : ''})`);

  // le veilleur pousse notre présence (sessions, note) tant que le lanceur ou une session Claude est ouvert
  if (!SANS_FENETRE) spawn(process.execPath, [join(ici, 'presence.mjs'), '--veille'], { detached: true, stdio: 'ignore', windowsHide: true, cwd: racine }).unref();

  tourGit(false).then(() => tourGit(true));
  lireSites();
  setTimeout(rafraichirPresence, 300);
  setInterval(() => tourGit(Date.now() - dernierFetch > 110000), 20000);
  setInterval(rafraichirPresence, 40000);
  setInterval(lireSites, 120000);
  setInterval(() => { for (const c of clients) c.write(': vie\n\n'); }, 20000);

  // plus aucune fenêtre depuis 20 s : on s'arrête
  let seulDepuis = Date.now() + 40000;
  setInterval(() => {
    if (clients.size) { seulDepuis = Date.now(); return; }
    if (!SANS_FENETRE && Date.now() - seulDepuis > 20000) fermer();
  }, 5000);

  if (!SANS_FENETRE) navigateur(`http://127.0.0.1:${port}/?k=${jeton}`);
  else console.log(`http://127.0.0.1:${port}/?k=${jeton}`);
}

process.on('uncaughtException', (e) => noter(`ERREUR : ${e.stack || e.message}`));
demarrer().catch((e) => { noter(`ERREUR démarrage : ${e.message}`); process.exit(1); });
