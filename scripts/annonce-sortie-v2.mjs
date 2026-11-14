// Annonce de la sortie V2 (14/11) — par le bot du jeu : @everyone dans « bebou card », puis un MP à chaque membre du rôle « Card ».
//   node scripts/annonce-sortie-v2.mjs        → SIMULATION : serveur, salon, rôle, nombre de MP, texte. Rien n'est envoyé.
//   node scripts/annonce-sortie-v2.mjs --go   → envoie. Le salon une seule fois (.annonce-sortie-v2.fait) ; les MP déjà
//                                               envoyés sont notés dans .annonce-sortie-v2-mp.fait (relance sans doublon).
// Jeton : fichier local .discord-bot-token (jamais publié). Options : --guild=<id> · --salon=<nom> · --role=<nom>
import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';

const API = 'https://discord.com/api/v10';
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const GO = !!args.go;
const DONE = new URL('../.annonce-sortie-v2.fait', import.meta.url);
const DONE_MP = new URL('../.annonce-sortie-v2-mp.fait', import.meta.url);
const token = readFileSync(new URL('../.discord-bot-token', import.meta.url), 'utf8').trim();
const H = { Authorization: `Bot ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'DiscordBot (bebou-cartes, 1.0)' };

const CORPS = `🛠️ **La V2 sort ce soir !**
⏳ Le site sera **fermé de 18 h à 20 h** pour installer la V2.
🎁 **50 boosters offerts** à tout le monde pour la sortie.
👉 Rendez-vous à 20 h : https://cardgamepriv.pages.dev/jeu/`;
const ANNONCE = `@everyone\n${CORPS}`;

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

const me = await api('GET', '/users/@me');
const guilds = await api('GET', '/users/@me/guilds');
const guild = args.guild ? guilds.find((g) => g.id === args.guild) : guilds.length === 1 ? guilds[0] : null;
if (!guild) { console.log('Plusieurs serveurs, précise --guild=<id> :'); for (const g of guilds) console.log(`  ${g.id}  ${g.name}`); process.exit(1); }
console.log(`Bot : ${me.username} · Serveur : ${guild.name}`);

const channels = (await api('GET', `/guilds/${guild.id}/channels`)).filter((c) => c.type === 0 || c.type === 5);
const want = norm(args.salon ?? 'bebou card');
const found = channels.filter((c) => norm(c.name).includes(want));
if (found.length !== 1) { console.log(`Salon : ${found.length ? 'plusieurs → ' + found.map((x) => '#' + x.name).join(', ') : 'introuvable'}`); process.exit(1); }
const salon = found[0];
console.log(`Salon : #${salon.name}`);

const roles = await api('GET', `/guilds/${guild.id}/roles`);
const role = roles.find((r) => !r.managed && norm(r.name) === norm(args.role ?? 'Card')); // « card » géré = rôle du bot lui-même
if (!role) { console.log(`Rôle « ${args.role ?? 'Card'} » introuvable.`); process.exit(1); }
// Sans l'intent « Server Members », le bot ne peut pas lister le serveur : on balaie la recherche par début de pseudo.
const parId = new Map();
for (const q of [...'abcdefghijklmnopqrstuvwxyz0123456789_.-éèêàâçôîïù']) {
  const page = await api('GET', `/guilds/${guild.id}/members/search?query=${encodeURIComponent(q)}&limit=1000`);
  for (const m of page) parId.set(m.user.id, m);
  await sleep(250);
}
const members = [...parId.values()];
const cibles = members.filter((m) => !m.user.bot && m.roles.includes(role.id));
const deja = new Set(existsSync(DONE_MP) ? readFileSync(DONE_MP, 'utf8').split('\n').filter(Boolean) : []);
const reste = cibles.filter((m) => !deja.has(m.user.id));
console.log(`Rôle « ${role.name} » : ${cibles.length} membre(s), ${reste.length} MP à envoyer${deja.size ? ` (${deja.size} déjà faits)` : ''}`);
console.log(`\n--- Texte (${ANNONCE.length} car.) ---\n${ANNONCE}\n---`);
if (!GO) { console.log('SIMULATION : rien n\'a été envoyé. Relance avec --go.'); process.exit(0); }

if (existsSync(DONE)) console.log('Salon : déjà posté, on passe aux MP.');
else {
  await api('POST', `/channels/${salon.id}/messages`, { content: ANNONCE, allowed_mentions: { parse: ['everyone'] } });
  writeFileSync(DONE, new Date().toISOString());
  console.log(`Posté dans #${salon.name}.`);
}
let ok = 0; const rates = [];
for (const m of reste) {
  try {
    const dm = await api('POST', '/users/@me/channels', { recipient_id: m.user.id });
    await api('POST', `/channels/${dm.id}/messages`, { content: CORPS, allowed_mentions: { parse: [] } });
    appendFileSync(DONE_MP, m.user.id + '\n');
    ok++;
  } catch (e) { rates.push(`${m.nick ?? m.user.global_name ?? m.user.username} (${e.code === 50007 ? 'MP fermés' : e.message})`); }
  await sleep(400);
}
console.log(`MP envoyés : ${ok}/${reste.length}.${rates.length ? ' Ratés : ' + rates.join(', ') : ''}`);
