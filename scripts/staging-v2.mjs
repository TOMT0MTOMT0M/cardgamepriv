// STAGING V2 (07/11) — un 2e projet Convex « cardgamepriv-v2 » pour le lien admin https://v2.cardgamepriv.pages.dev.
// Jamais branché sur la base des joueurs : .env.local (prod) n'est lu QUE pour copier des variables et exporter les données.
//   node scripts/staging-v2.mjs init      → crée le projet Convex (une fois), écrit .env.v2.local, copie les variables
//                                           d'environnement SAUF webhook / bot Discord, importe une copie de la base prod
//   node scripts/staging-v2.mjs refresh   → remplace les données du staging par un export tout frais de la prod
//   node scripts/staging-v2.mjs deploy    → envoie le code convex/ sur le staging (mettre-en-ligne-v2.cmd)
//   node scripts/staging-v2.mjs name      → affiche le nom du déploiement de staging (pour --deployment)
// Options : --team=<slug> --project=<slug> (init), --force (init : recrée un projet même si .env.v2.local existe).
// Relançable : si .env.v2.local existe déjà, `init` saute la création du projet et refait les étapes suivantes.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const PROD_ENV = path.join(ROOT, '.env.local');
const V2_ENV = path.join(ROOT, '.env.v2.local');
const V2_SITE = 'https://v2.cardgamepriv.pages.dev';
/** variables copiées de la prod vers le staging (connexion Discord, code du club, clé des retours) */
const COPY_VARS = ['DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'DISCORD_GUILD_ID', 'ALLOWED_DISCORD_IDS', 'CLUB_CODE', 'MAX_PLAYERS', 'FEEDBACK_READ_KEY'];
/** JAMAIS copiées : le staging ne doit ni poster dans le Discord des joueurs ni leur envoyer de MP */
const NEVER = ['DISCORD_WEBHOOK_URL', 'DISCORD_BOT_TOKEN'];

const args = Object.fromEntries(process.argv.slice(3).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const cmd = process.argv[2];
const CONVEX = path.join(ROOT, 'node_modules', 'convex', 'bin', 'main.js');

const parseEnv = (file) => Object.fromEntries(readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/\s+#.*$/, '').trim()]; }));
const depName = (env) => (env.CONVEX_DEPLOYMENT ?? '').replace(/^dev:/, '').split(/\s/)[0];
const fail = (m) => { console.error(`\nECHEC : ${m}`); process.exit(1); };
function convex(argv, { capture = false, cwd = ROOT } = {}) {
  const r = spawnSync(process.execPath, [CONVEX, ...argv], { cwd, stdio: capture ? ['inherit', 'pipe', 'inherit'] : 'inherit', encoding: 'utf8' });
  if (r.status !== 0) fail(`npx convex ${argv.join(' ')} (code ${r.status})`);
  return capture ? (r.stdout ?? '').trim() : '';
}
const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '-');

/**
 * `convex dev` (même avec --env-file, même avec --configure) REECRIT .env.local avec le déploiement qu'il vient d'utiliser
 * (vu le 07/11 : .env.local s'est retrouvé sur le staging). Donc : copie de .env.local avant, remise à l'identique après,
 * quoi qu'il arrive, et vérification.
 */
function protectProd(fn) {
  const before = readFileSync(PROD_ENV, 'utf8');
  let out;
  try {
    out = fn();
  } finally {
    const now = existsSync(PROD_ENV) ? readFileSync(PROD_ENV, 'utf8') : '';
    if (now !== before) {
      writeFileSync(PROD_ENV, before);
      console.log('      (.env.local avait été réécrit par convex : remis à l\'identique)');
    }
    if (readFileSync(PROD_ENV, 'utf8') !== before) fail('.env.local n\'a pas pu être restauré !');
  }
  return out;
}
/** la base des joueurs est bien celle qu'on croit (avant tout export / lecture de variables en prod) */
function assertProd(name) {
  const now = depName(parseEnv(PROD_ENV));
  if (now !== name) fail(`.env.local pointe sur ${now || 'rien'} au lieu de la prod ${name} — corrige-le avant de continuer`);
}

function prodEnv() {
  if (!existsSync(PROD_ENV)) fail('.env.local (prod) introuvable');
  const env = parseEnv(PROD_ENV);
  if (!depName(env)) fail('.env.local ne contient pas CONVEX_DEPLOYMENT');
  return env;
}
function v2Env() {
  if (!existsSync(V2_ENV)) fail('.env.v2.local introuvable : lance d\'abord creer-staging-v2.cmd');
  const env = parseEnv(V2_ENV);
  const name = depName(env);
  if (!name) fail('.env.v2.local ne contient pas CONVEX_DEPLOYMENT');
  if (name === depName(prodEnv())) fail('.env.v2.local pointe sur la base des joueurs ! Rien n\'a été fait.');
  return env;
}

function init() {
  const prod = prodEnv();
  const prodName = depName(prod);
  const team = args.team || 'gamersardechois';
  const project = args.project || 'cardgamepriv-v2';
  let after;
  if (existsSync(V2_ENV) && !args.force) {
    // reprise (le staging existe déjà : on refait seulement les étapes 2 à 6)
    after = parseEnv(V2_ENV);
    const name = depName(after);
    if (!name || name === prodName) fail('.env.v2.local existe mais est invalide (ou pointe sur la prod) : supprime-le et relance.');
    console.log(`\n[1/6] staging déjà créé : ${name} (.env.v2.local) — reprise des étapes suivantes.`);
  } else {
    // 1. `convex dev --configure` réécrit .env.local : protégé, puis on le remet EXACTEMENT comme avant
    console.log(`\n[1/6] nouveau projet Convex « ${project} » (équipe ${team})...`);
    const r = protectProd(() => {
      const r = spawnSync(process.execPath, [CONVEX, 'dev', '--once', '--configure', 'new', '--team', team, '--project', project, '--dev-deployment', 'cloud'], { cwd: ROOT, stdio: 'inherit' });
      after = existsSync(PROD_ENV) ? parseEnv(PROD_ENV) : {};
      return r;
    });
    if (r.status !== 0) fail(`création du projet (code ${r.status}). Si le projet existe déjà : --project=<autre-nom>, ou supprime-le dans le tableau de bord Convex.`);
    const name = depName(after);
    if (!name || name === prodName) fail(`le déploiement obtenu (${name || 'aucun'}) est celui de la prod — .env.v2.local NON écrit`);
    if (!after.VITE_CONVEX_URL) fail('VITE_CONVEX_URL manquant après la configuration');
    const site = after.VITE_CONVEX_SITE_URL || after.VITE_CONVEX_URL.replace('.convex.cloud', '.convex.site');
    writeFileSync(V2_ENV, [
      `# STAGING V2 (lien admin ${V2_SITE}) — projet Convex ${project}, JAMAIS la base des joueurs.`,
      `# Lu par : vite build --mode v2, et scripts/staging-v2.mjs (lanceurs mettre-en-ligne-v2 / creer-staging-v2).`,
      `CONVEX_DEPLOYMENT=${after.CONVEX_DEPLOYMENT}`,
      `VITE_CONVEX_URL=${after.VITE_CONVEX_URL}`,
      `VITE_CONVEX_SITE_URL=${site}`,
      '',
    ].join('\n'));
    console.log(`      staging : ${name} (${after.VITE_CONVEX_URL}) → .env.v2.local écrit, .env.local (prod) intact.`);
  }
  const name = depName(after);
  const site = after.VITE_CONVEX_SITE_URL || after.VITE_CONVEX_URL.replace('.convex.cloud', '.convex.site');
  assertProd(prodName);
  console.log('\n[2/6] envoi du code convex/ sur le staging...');
  deploy();
  assertProd(prodName);
  console.log('\n[3/6] variables d\'environnement (copiées de la prod, sauf webhook et bot Discord)...');
  copyVars(name);
  console.log('\n[4/6] export de la base des joueurs...');
  assertProd(prodName);
  const zip = exportProd();
  console.log('\n[5/6] import dans le staging (remplace tout)...');
  importV2(name, zip);
  console.log('\n[6/6] Tom et Hugo modérateurs sur le staging...');
  convex(['run', '--deployment', name, 'admin:setModerators']);
  assertProd(prodName);
  console.log(`\nSTAGING PRET.\n  A faire UNE FOIS dans le portail Discord (application du jeu → OAuth2 → Redirects), ajoute :\n    ${site}/auth/discord/callback\n  sinon « Continuer avec Discord » ne marche pas sur le lien V2 (la connexion par pseudo marche déjà).\n  Ensuite : mettre-en-ligne-v2.cmd → ${V2_SITE}/jeu/`);
}

function deploy() {
  v2Env();
  // --env-file : le CLI choisit le déploiement d'après CE fichier… mais réécrit quand même .env.local → protégé
  protectProd(() => convex(['dev', '--once', '--env-file', '.env.v2.local']));
}

function copyVars(name) {
  for (const k of COPY_VARS) {
    const r = spawnSync(process.execPath, [CONVEX, 'env', 'get', k], { cwd: ROOT, stdio: ['inherit', 'pipe', 'pipe'], encoding: 'utf8' });
    const v = (r.stdout ?? '').trim();
    if (r.status !== 0 || !v) { console.log(`      ${k} : absent en prod, ignoré`); continue; }
    convex(['env', 'set', '--deployment', name, k, v]);
  }
  convex(['env', 'set', '--deployment', name, 'FRONTEND_URL', V2_SITE]);
  convex(['env', 'set', '--deployment', name, 'PUBLIC_SITE_URL', V2_SITE]);
  for (const k of NEVER) spawnSync(process.execPath, [CONVEX, 'env', 'remove', '--deployment', name, k], { cwd: ROOT, stdio: 'ignore' });
  console.log(`      ${NEVER.join(', ')} : volontairement ABSENTS du staging (aucune notification aux joueurs).`);
}

function exportProd() {
  mkdirSync(path.join(ROOT, 'sauvegardes'), { recursive: true });
  const zip = path.join('sauvegardes', `pour-staging-${stamp()}.zip`);
  convex(['export', '--include-file-storage', '--path', zip]);
  return zip;
}
function importV2(name, zip) {
  convex(['import', '--deployment', name, '--replace-all', '-y', zip]);
}

function refresh() {
  const name = depName(v2Env());
  assertProd(depName(prodEnv()));
  console.log('\n[1/3] export de la base des joueurs...');
  const zip = exportProd();
  console.log('\n[2/3] import dans le staging (remplace tout)...');
  importV2(name, zip);
  console.log('\n[3/3] Tom et Hugo modérateurs sur le staging...');
  convex(['run', '--deployment', name, 'admin:setModerators']);
  console.log('\nDONNEES DU STAGING RAFRAICHIES.');
}

switch (cmd) {
  case 'init': init(); break;
  case 'refresh': refresh(); break;
  case 'deploy': deploy(); break;
  case 'name': console.log(depName(v2Env())); break;
  default: console.log('usage : node scripts/staging-v2.mjs init | refresh | deploy | name'); process.exit(2);
}
