// Annonce d'un patch sur Discord (08/11) — par le bot du jeu, @everyone dans le salon « bebou card ».
//   node scripts/annonce-patch.mjs          → SIMULATION : serveur, salon trouvé, texte. Rien n'est posté.
//   node scripts/annonce-patch.mjs --go     → poste l'annonce (une seule fois : un fichier local .annonce-<id>.fait
//                                             empêche de la reposter si le lanceur est relancé ; --force pour reposter).
// Jeton : fichier local .discord-bot-token (jamais publié).
// Options : --guild=<id> si le bot est sur plusieurs serveurs · --salon=<nom> (morceau du nom du salon, défaut « bebou card »)
//           --aussi=<nom> pour la poster aussi dans un 2e salon (ex. --aussi=discussion)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const ID = 'patch-2026-11-08'; // = ANNONCE_ID de src/game/updates.data.ts
const API = 'https://discord.com/api/v10';
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const GO = !!args.go;
const DONE = new URL(`../.annonce-${ID}.fait`, import.meta.url);
const token = readFileSync(new URL('../.discord-bot-token', import.meta.url), 'utf8').trim();
const H = { Authorization: `Bot ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'DiscordBot (bebou-cartes, 1.0)' };

const ANNONCE = `@everyone
🎴 **Mise à jour de Bébou Cartes !**
✨ **GOD PACK** : 1 booster sur 1 000 est un god pack. Que des 4★ et plus, au moins une 5★ et une 6★, avec sa propre animation à l'ouverture.
🤝 **Échanges réparés** : « Accepter » marche à nouveau (il ouvre une confirmation « Oui, échanger »).
🙂 **Visages** : plus de 600 cartes recadrées, le visage n'est plus coupé ni caché sous le nom.
🚫 Patrick Bruel et tout ce qui le concerne sont retirés du jeu.
Et depuis la V1 : Pack Battle plus lisible, Battle Royale de 1 à 5 boosters, bouton « Image à revoir », 27 nouvelles illustrations 5★/6★, raretés revues, rôle « Card » pour les joueurs connectés avec Discord…
📜 Tout le détail s'ouvre tout seul à ta prochaine visite (page Mises à jour) :
👉 https://cardgamepriv.pages.dev/jeu/#/maj`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(method, path, body) {
  for (;;) {
    const res = await fetch(API + path, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
    if (res.status === 429) { const j = await res.json().catch(() => ({})); await sleep(((j.retry_after ?? 1) * 1000) + 100); continue; }
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) { const e = new Error(`${method} ${path} → ${res.status} ${data?.message ?? text} (code ${data?.code ?? '?'})`); e.code = data?.code; throw e; }
    return data;
  }
}

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

if (ANNONCE.length > 2000) { console.log(`Annonce trop longue (${ANNONCE.length} > 2000 caractères).`); process.exit(1); }
if (GO && existsSync(DONE) && !args.force) { console.log(`Annonce « ${ID} » déjà postée (fichier ${DONE.pathname.split('/').pop()}) : rien à faire. --force pour la reposter.`); process.exit(0); }

const me = await api('GET', '/users/@me');
console.log(`Bot : ${me.username} (${me.id})`);
const guilds = await api('GET', '/users/@me/guilds');
if (!guilds.length) { console.log('Le bot n\'est sur aucun serveur.'); process.exit(1); }
const guild = args.guild ? guilds.find((g) => g.id === args.guild) : guilds.length === 1 ? guilds[0] : null;
if (!guild) { console.log('Plusieurs serveurs, précise --guild=<id> :'); for (const g of guilds) console.log(`  ${g.id}  ${g.name}`); process.exit(1); }
console.log(`Serveur : ${guild.name} (${guild.id})`);

const channels = (await api('GET', `/guilds/${guild.id}/channels`)).filter((c) => c.type === 0 || c.type === 5);
const pick = (want) => { const w = norm(want); const f = channels.filter((c) => norm(c.name).includes(w)); return f.length === 1 ? f[0] : { many: f }; };
const targets = [pick(args.salon ?? 'bebou card')];
if (args.aussi) targets.push(pick(args.aussi));
for (const c of targets) {
  if (c.many) { console.log(`Salon : ${c.many.length ? 'plusieurs candidats → ' + c.many.map((x) => '#' + x.name).join(', ') : 'introuvable'}. Salons texte : ${channels.map((x) => '#' + x.name).join(', ')}`); process.exit(1); }
  console.log(`Salon : #${c.name} (${c.id})`);
}
console.log(`\n${ANNONCE}\n`);

if (!GO) { console.log('SIMULATION : rien n\'a été posté. Relance avec --go pour poster l\'annonce.'); process.exit(0); }

const body = { content: ANNONCE, allowed_mentions: { parse: ['everyone'] } };
for (const c of targets) {
  await api('POST', `/channels/${c.id}/messages`, body);
  console.log(`Annonce postée dans #${c.name}.`);
}
writeFileSync(DONE, new Date().toISOString() + '\n');
console.log('OK.');
