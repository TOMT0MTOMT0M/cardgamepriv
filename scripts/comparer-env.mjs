/**
 * VARIABLES D'ENVIRONNEMENT CONVEX : staging (V2) contre prod — les NOMS seulement, jamais les valeurs (bilan avant la
 * sortie V2, 13/11). La V2 lit 15 variables côté serveur ; une absente en prod = une fonction muette (notifications,
 * drops Discord, rôles) ou un plafond par défaut (MAX_PLAYERS).
 *
 *   node scripts/comparer-env.mjs [fichier-env-staging] [fichier-env-prod]
 *   (par défaut : .env.v2.local puis .env.local — les mêmes que les lanceurs)
 *
 * Lance `npx convex env list --env-file <fichier>` pour chacun ; les valeurs sont jetées dès la lecture (rien n'est
 * affiché, rien n'est écrit). Lecture seule.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const [staging = '.env.v2.local', prod = '.env.local'] = process.argv.slice(2);
/** variables lues par le code serveur de la V2 (convex/*.ts, process.env.X) */
const USED = ['ALLOWED_DISCORD_IDS', 'CLUB_CODE', 'DISCORD_BOT_TOKEN', 'DISCORD_CARD_ROLE_ID', 'DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'DISCORD_GUILD_ID', 'DISCORD_WEBHOOK_URL', 'FEEDBACK_READ_KEY', 'FRONTEND_URL', 'MAX_PLAYERS', 'PUBLIC_SITE_URL', 'VAPID_PRIVATE_KEY', 'VAPID_PUBLIC_KEY', 'VAPID_SUBJECT'];

function names(envFile) {
  if (!existsSync(envFile)) throw new Error(`Fichier introuvable : ${envFile}`);
  const out = execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['convex', 'env', 'list', '--env-file', envFile], { encoding: 'utf8', shell: process.platform === 'win32' });
  // « NOM=valeur » par ligne : on ne garde que le nom
  return new Set(out.split(/\r?\n/).map((l) => /^([A-Z0-9_]+)=/.exec(l)?.[1]).filter(Boolean));
}

const S = names(staging);
const P = names(prod);
console.log(`Staging (${staging}) : ${S.size} variables · prod (${prod}) : ${P.size} variables`);
const onlyS = [...S].filter((n) => !P.has(n)).sort();
const onlyP = [...P].filter((n) => !S.has(n)).sort();
console.log(onlyS.length ? `MANQUENT EN PROD : ${onlyS.join(', ')}` : 'Rien ne manque en prod par rapport au staging.');
if (onlyP.length) console.log(`Seulement en prod : ${onlyP.join(', ')}`);
const unusedMissing = USED.filter((n) => !P.has(n));
if (unusedMissing.length) console.log(`Lues par la V2 mais absentes en prod : ${unusedMissing.join(', ')}`);
console.log('MAX_PLAYERS : à vérifier à la main dans le tableau de bord Convex (la valeur n\'est pas affichée ici) — le club passe à 40-50.');
process.exitCode = onlyS.length ? 1 : 0;
