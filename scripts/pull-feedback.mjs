/**
 * Récupère les retours du labo envoyés en ligne (bouton « ☁ Envoyer ») :
 *   node scripts/pull-feedback.mjs
 * → feedback/latest.json (brut), feedback/latest.md (lisible : par expérience, votes et notes),
 *   feedback/retours-AAAA-MM-JJ.json (archive du jour).
 * Lit l'URL du serveur dans .env.local (VITE_CONVEX_SITE_URL) et la clé de lecture dans .feedback-key
 * (la même clé est posée dans Convex par deployer.cmd). Aucune dépendance.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const env = Object.fromEntries(
  (await readFile('.env.local', 'utf8').catch(() => ''))
    .split(/\r?\n/)
    .filter((l) => /^\s*[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const site = (process.env.VITE_CONVEX_SITE_URL || env.VITE_CONVEX_SITE_URL || '').replace(/\/$/, '');
const key = (process.env.FEEDBACK_READ_KEY || (await readFile('.feedback-key', 'utf8').catch(() => ''))).trim();
if (!site || !key) {
  console.error('Il faut VITE_CONVEX_SITE_URL (.env.local) et la clé (.feedback-key).');
  process.exit(1);
}
const res = await fetch(`${site}/lab/feedback?key=${encodeURIComponent(key)}`);
if (!res.ok) {
  console.error(`Échec ${res.status} : ${await res.text()}`);
  process.exit(1);
}
const data = await res.json();
await mkdir('feedback', { recursive: true });
const day = new Date().toISOString().slice(0, 10);
const json = JSON.stringify(data, null, 2);
await writeFile('feedback/latest.json', json);
await writeFile(`feedback/retours-${day}.json`, json);

const lines = [`# Retours du labo — ${new Date(data.exportedAt).toLocaleString('fr-FR')}`, ''];
lines.push(`${data.testers.length} testeur(s) : ${data.testers.map((t) => `${t.tester} (${t.entries.length} retours, ${t.meta?.backend ?? '?'}, maj ${t.updatedAt.slice(0, 16).replace('T', ' ')})`).join(' · ') || '—'}`, '');
for (const e of data.experiments) {
  lines.push(`## ${e.id} — ${e.title}`);
  lines.push(`👍 ${e.up.length}${e.up.length ? ` (${e.up.join(', ')})` : ''} · 👎 ${e.down.length}${e.down.length ? ` (${e.down.join(', ')})` : ''}`);
  for (const n of e.notes) lines.push(`- **${n.tester}** ${n.vote > 0 ? '👍' : n.vote < 0 ? '👎' : ''} ${n.note.replace(/\s+/g, ' ').trim()}`);
  lines.push('');
}
await writeFile('feedback/latest.md', lines.join('\n'));
console.log(`${data.testers.length} testeur(s), ${data.experiments.length} expérience(s) commentée(s) → feedback/latest.md`);
