/**
 * EXPORT DES RÉPONSES AU SONDAGE (11/11) — lecture seule, ne modifie rien en ligne.
 * Lit la table `surveyAnswers` du déploiement de .env.local (la base des joueurs) avec `npx convex data`, remplace
 * l'id du joueur par son nom affiché, et écrit logs/sondage-reponses.json (comptes + réponses une à une).
 * La table `users` n'est lue qu'en mémoire : seul le nom affiché sort dans le fichier.
 * Lancé par lanceurs/exporter-sondage.cmd.
 */
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const SURVEY_ID = process.argv[2] || 'maj-2026-11';
const data = (table) => {
  const out = execSync(`npx convex data ${table} --limit 2000 --format jsonArray`, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] });
  const start = out.indexOf('[');
  return start < 0 ? [] : JSON.parse(out.slice(start));
};

const rows = data('surveyAnswers').filter((r) => r.surveyId === SURVEY_ID).sort((a, b) => a.createdAt - b.createdAt);
const names = new Map(data('users').map((u) => [u._id, u.displayName]));

const count = (key) => {
  const c = {};
  for (const r of rows) for (const id of r[key] ?? []) c[id] = (c[id] ?? 0) + 1;
  return Object.fromEntries(Object.entries(c).sort((a, b) => b[1] - a[1]));
};
const rated = rows.filter((r) => r.rating);
const result = {
  surveyId: SURVEY_ID,
  exportedAt: new Date().toISOString(),
  total: rows.length,
  players: names.size,
  averageRating: rated.length ? +(rated.reduce((s, r) => s + r.rating, 0) / rated.length).toFixed(2) : null,
  universes: count('universes'),
  features: count('features'),
  answers: rows.map((r) => ({
    author: names.get(r.userId) ?? '?',
    date: new Date(r.createdAt).toISOString(),
    universes: r.universes,
    features: r.features,
    names: r.names,
    rating: r.rating,
    comment: r.comment,
  })),
};

mkdirSync('logs', { recursive: true });
writeFileSync('logs/sondage-reponses.json', JSON.stringify(result, null, 2));
console.log(`${rows.length} reponse(s) sur ${names.size} joueur(s) -> logs/sondage-reponses.json`);
