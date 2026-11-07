// Annonce d'ouverture sur Discord (07/11) — par le bot du jeu.
//   node scripts/annonce-discord.mjs          → SIMULATION : liste serveur, salons trouvés, nb de messages à effacer. Rien n'est touché.
//   node scripts/annonce-discord.mjs --go     → vide entièrement le salon « bebou card », puis poste l'annonce @everyone
//                                               dans « discussion » et « bebou card » (épinglée dans bebou card).
// Jeton : fichier local .discord-bot-token (jamais publié).
// Options : --guild=<id> si le bot est sur plusieurs serveurs · --discussion=<nom> · --bebou=<nom> (morceau du nom du salon)
import { readFileSync } from 'node:fs';

const API = 'https://discord.com/api/v10';
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const GO = !!args.go;
const token = readFileSync(new URL('../.discord-bot-token', import.meta.url), 'utf8').trim();
const H = { Authorization: `Bot ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'DiscordBot (bebou-cartes, 1.0)' };

const ANNONCE = `@everyone
🎴 **Bébou Cartes ouvre ce soir à 20 h !**
👉 https://cardgamepriv.pages.dev/jeu/
Connexion avec Discord **ou** un simple pseudo. Tout le monde part de zéro : **15 boosters offerts** + recharge **×2 pendant 24 h**, et la roulette démarre avec un pot de base.
Invite tes potes avec ton lien (onglet Amis) : 10 boosters pour eux, 10 pour toi.
📱 iPhone : ouvre le lien dans Safari → Partager → « Sur l'écran d'accueil » pour l'avoir en plein écran comme une appli.
30 places max.`;

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

// Un bot tout neuf doit s'être connecté une fois au gateway avant de pouvoir écrire : on le fait à chaque lancement (2-3 s).
async function gatewayOnce() {
  if (typeof WebSocket === 'undefined') return console.log('  (gateway : Node trop ancien, étape sautée)');
  await new Promise((resolve) => {
    const ws = new WebSocket('wss://gateway.discord.gg/?v=10&encoding=json');
    const done = () => { try { ws.close(); } catch {} resolve(); };
    const t = setTimeout(done, 15000);
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.op === 10) ws.send(JSON.stringify({ op: 2, d: { token, intents: 0, properties: { os: 'windows', browser: 'bebou', device: 'bebou' } } }));
      if (m.t === 'READY') { clearTimeout(t); done(); }
    };
    ws.onerror = () => { clearTimeout(t); done(); };
  });
}

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

const me = await api('GET', '/users/@me');
console.log(`Bot : ${me.username} (${me.id})`);
const guilds = await api('GET', '/users/@me/guilds');
if (!guilds.length) { console.log('Le bot n\'est sur aucun serveur : invite-le d\'abord.'); process.exit(1); }
const guild = args.guild ? guilds.find((g) => g.id === args.guild) : guilds.length === 1 ? guilds[0] : null;
if (!guild) { console.log('Plusieurs serveurs, précise --guild=<id> :'); for (const g of guilds) console.log(`  ${g.id}  ${g.name}`); process.exit(1); }
console.log(`Serveur : ${guild.name} (${guild.id})`);

const channels = (await api('GET', `/guilds/${guild.id}/channels`)).filter((c) => c.type === 0 || c.type === 5);
const pick = (want) => { const w = norm(want); const f = channels.filter((c) => norm(c.name).includes(w)); return f.length === 1 ? f[0] : { many: f }; };
const discussion = pick(args.discussion ?? 'discussion');
const bebou = pick(args.bebou ?? 'bebou card');
for (const [label, c] of [['discussion', discussion], ['bebou card', bebou]]) {
  if (c.many) { console.log(`Salon « ${label} » : ${c.many.length ? 'plusieurs candidats → ' + c.many.map((x) => '#' + x.name).join(', ') : 'introuvable'}. Salons texte : ${channels.map((x) => '#' + x.name).join(', ')}`); process.exit(1); }
  console.log(`Salon ${label} : #${c.name} (${c.id})`);
}

// tous les messages du salon bebou card
async function allMessages(id) {
  const out = []; let before;
  for (;;) {
    const page = await api('GET', `/channels/${id}/messages?limit=100${before ? `&before=${before}` : ''}`);
    out.push(...page); if (page.length < 100) return out; before = page[page.length - 1].id;
  }
}
const msgs = await allMessages(bebou.id);
const limit = Date.now() - 13.5 * 24 * 3600 * 1000;
const recent = msgs.filter((m) => Date.parse(m.timestamp) > limit), old = msgs.filter((m) => Date.parse(m.timestamp) <= limit);
console.log(`#${bebou.name} : ${msgs.length} messages à effacer (${recent.length} récents en lot, ${old.length} anciens un par un ≈ ${Math.ceil(old.length * 1.1)} s)`);

// droits du bot dans #bebou-card (vider + épingler) : vérifiés dès la simulation
{
  const m = await api('GET', `/guilds/${guild.id}/members/${me.id}`);
  const roles = await api('GET', `/guilds/${guild.id}/roles`);
  let p = 0n; for (const r of roles) if (r.id === guild.id || m.roles.includes(r.id)) p |= BigInt(r.permissions);
  if (!(p & 8n)) {
    const c = await api('GET', `/channels/${bebou.id}`); let a = 0n, d = 0n;
    for (const o of c.permission_overwrites) if (o.id === guild.id) { p &= ~BigInt(o.deny); p |= BigInt(o.allow); }
    for (const o of c.permission_overwrites) if (o.type === 0 && m.roles.includes(o.id)) { a |= BigInt(o.allow); d |= BigInt(o.deny); }
    p = (p & ~d) | a;
    for (const o of c.permission_overwrites) if (o.id === me.id) { p &= ~BigInt(o.deny); p |= BigInt(o.allow); }
    if (!(p & 8192n)) { console.log(`\nDROIT MANQUANT : le bot ne peut pas vider #${bebou.name} (« Gérer les messages »). Ouvre ce lien, choisis ${guild.name}, Autoriser :\nhttps://discord.com/oauth2/authorize?client_id=${me.id}&scope=bot&permissions=2251799813693440`); process.exit(2); }
  }
  console.log('Droits du bot : OK');
}

if (!GO) { console.log('\nSIMULATION : rien n\'a été touché. Relance avec --go pour vider le salon et poster l\'annonce.'); process.exit(0); }

await gatewayOnce();
console.log(`Vidage de #${bebou.name}...`);
for (let i = 0; i < recent.length; i += 100) {
  const ids = recent.slice(i, i + 100).map((m) => m.id);
  if (ids.length === 1) await api('DELETE', `/channels/${bebou.id}/messages/${ids[0]}`);
  else await api('POST', `/channels/${bebou.id}/messages/bulk-delete`, { messages: ids });
}
let n = 0;
for (const m of old) { await api('DELETE', `/channels/${bebou.id}/messages/${m.id}`).catch((e) => { if (e.code !== 10008) throw e; }); if (++n % 25 === 0) console.log(`  ${n}/${old.length}`); }
console.log(`  #${bebou.name} vidé (${msgs.length} messages).`);

const body = { content: ANNONCE, allowed_mentions: { parse: ['everyone'] } };
const a = await api('POST', `/channels/${bebou.id}/messages`, body);
await api('PUT', `/channels/${bebou.id}/pins/${a.id}`).catch((e) => console.log('  (épingle impossible : ' + e.message + ')'));
console.log(`Annonce postée et épinglée dans #${bebou.name}.`);
await api('POST', `/channels/${discussion.id}/messages`, body);
console.log(`Annonce postée dans #${discussion.name}.`);
console.log('OK.');
