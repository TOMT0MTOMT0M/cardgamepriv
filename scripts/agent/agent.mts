/**
 * AGENT CLAUDE (26/11) — utilise les 100 $/mois d'API de Tom sur ce qu'une session Claude Code fait mal : traiter des
 * milliers de cartes d'un coup (API Batch, −50 %) et des audits qui tournent seuls. LECTURE SEULE : l'agent ne modifie
 * ni le jeu, ni Convex, ni R2 ; il écrit des rapports dans docs/rapports-agent/ que Tom ou Hugo valident.
 *
 *   npm run agent -- etat                      dépenses du mois, lots en cours
 *   npm run agent -- images     [--max N] [--tout]   bonne image pour la bonne carte (Haiku, vision, Batch)
 *   npm run agent -- cadrage    [--max N]      point de cadrage des 5★/6★ sans visage connu (Sonnet, vision, Batch)
 *   npm run agent -- catalogue  [--max N]      rareté, doublons, familles, orthographe (Sonnet, Batch)
 *   npm run agent -- traduction [--max N]      noms anglais du catalogue (Sonnet, Batch)
 *   npm run agent -- convex                    audit des quotas Convex (Opus + insights de la prod)
 *   npm run agent -- perf                      audit de perf mobile (Opus + build + mesures)
 *   npm run agent -- suivre                    récupère les lots terminés et écrit les rapports
 *
 * Sans `--go` : estimation seulement, rien n'est envoyé ni dépensé. `--plafond N` relève le plafond de la tâche.
 * Clé : AGENT_CLAUDE_KEY dans .env.local. Doc : docs/AGENT-CLAUDE.md.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, statSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import sharp from 'sharp';
import { ALL_THEMES, artPath, subthemeById, type CatalogEntry } from '../../src/core/sets/themes';
import { CATALOG_EN } from '../../src/core/sets/catalog.en';
import FACE_FOCUS from '../../src/core/art/faceFocus.json';
import {
  MODELS, OUT, ROOT, type BatchRequest, type ModelId, type Opts, batchMapFile, batches, checkBudget, claude, costOf, estimate, fail,
  monthBudget, noOpenBatch, opts, parseJsonLoose, readJson, recordSpend, saveBatch, spends, spentThisMonth, submitBatches, textOf, today, usd, writeCsv, writeJson,
} from './lib.mts';
import { runAudit } from './audit.mts';

const STARS: Record<string, number> = { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5, mythic: 6, secret: 7 };
const strip = (p: string) => p.split('?')[0].replace(/^\//, '');
const fileOf = (c: CatalogEntry) => join(ROOT, 'public', strip(artPath(c)));
const focusKey = (c: CatalogEntry) => strip(artPath(c)).replace(/^art\//, '');
const famille = (c: CatalogEntry) => subthemeById(c.subthemeId)?.label ?? c.subthemeId;
const allCards = (): CatalogEntry[] => ALL_THEMES.flatMap((t) => t.cards as CatalogEntry[]);
const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const jsonFormat = (schema: Record<string, unknown>) => ({ type: 'json_schema' as const, schema });
const obj = (properties: Record<string, unknown>) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

// =================================================================================================================
// 1. IMAGES — la photo montre-t-elle bien le sujet de la carte ? (Haiku 5.5, vision, Batch)
// Déjà en place, non refait ici : check:images (fichier présent), la purge des placeholders du 08/11 (curation.ts).
// =================================================================================================================
const IMG_SEEN = join(OUT, 'images-vus.json');
const IMG_SYSTEM = `Tu contrôles les illustrations d'un jeu de cartes à collectionner privé (public français). Chaque carte a un nom, une famille (sous-thème) et une rareté (1★ à 6★).
Pour chaque image, dis si elle convient à la carte :
- "ok" : le sujet nommé est bien représenté et l'image est exploitable ;
- "douteux" : tu n'es pas sûr (personne peu connue, sujet ambigu) ;
- "mauvais" : un défaut net.
Problèmes possibles : mauvais_sujet (autre personne, autre objet, homonyme : ex. un footballeur à la place d'un chanteur du même nom), filigrane (logo d'agence photo, texte « Getty », « Alamy », « shutterstock »…), texte_parasite (capture d'écran, légende, bandeau incrusté), floue_pixelisee, sujet_coupe (tête ou sujet coupé, sujet minuscule), placeholder (image générique, silhouette, drapeau ou logo à la place du sujet), choquante, autre, aucun.
Les jaquettes de jeux vidéo, pochettes d'album, affiches et logos de marques sont normaux quand la carte représente ce jeu, cet album, ce film ou cette marque. Sois factuel et bref (note ≤ 15 mots, en français). N'invente pas : si tu ne connais pas la personne, "douteux" seulement si l'image paraît incohérente avec le nom ou la famille, sinon "ok".`;
const IMG_SCHEMA = obj({ cartes: { type: 'array', items: obj({ n: { type: 'integer' }, verdict: { type: 'string', enum: ['ok', 'douteux', 'mauvais'] }, probleme: { type: 'string', enum: ['aucun', 'mauvais_sujet', 'filigrane', 'texte_parasite', 'floue_pixelisee', 'sujet_coupe', 'placeholder', 'choquante', 'autre'] }, note: { type: 'string' } }) } });
const IMG_PER_REQ = 12;
const IMG_EST_IN = 420; // tokens par carte (image 512 px ≈ 350 + texte)
const IMG_EST_OUT = 45;

async function taskImages(o: Opts) {
  noOpenBatch('images');
  const seen = readJson<Record<string, string>>(IMG_SEEN, {});
  const cards = allCards().filter((c) => c.file && !c.id.startsWith('mrv-') && (o.tout || seen[c.id] !== c.file));
  const todo = cards.slice(0, o.max);
  const est = estimate(MODELS.haiku, todo.length * IMG_EST_IN + Math.ceil(todo.length / IMG_PER_REQ) * 600, todo.length * IMG_EST_OUT, true);
  console.log(`Images à contrôler : ${todo.length} (déjà contrôlées et inchangées : ${allCards().filter((c) => c.file && seen[c.id] === c.file).length})`);
  checkBudget(est, o.plafond || 10, 'images');
  if (!o.go || !todo.length) return console.log(o.go ? 'Rien à faire.' : '\nEstimation seulement. Ajoute --go pour lancer.');

  const local: (string | number)[][] = [];
  // par paquets de 2 400 cartes : les images préparées ne restent pas toutes en mémoire
  for (const [pi, part] of chunk(todo, 2400).entries()) {
    console.log(`Préparation des images ${pi * 2400 + 1}-${pi * 2400 + part.length}…`);
    const prepared = await pool(part, 16, async (c) => {
      const f = fileOf(c);
      if (!existsSync(f)) { local.push([c.id, c.name, famille(c), STARS[c.rarity], 'mauvais', 'fichier_absent', 'fichier absent de public/art', strip(artPath(c))]); return null; }
      try {
        const img = sharp(f);
        const m = await img.metadata();
        if (Math.min(m.width ?? 0, m.height ?? 0) < 300) local.push([c.id, c.name, famille(c), STARS[c.rarity], 'douteux', 'basse_resolution', `${m.width}×${m.height} px`, strip(artPath(c))]);
        const buf = await img.resize(512, 512, { fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 78 }).toBuffer();
        return { c, data: buf.toString('base64') };
      } catch (e) {
        local.push([c.id, c.name, famille(c), STARS[c.rarity], 'mauvais', 'image_cassee', (e as Error).message.slice(0, 80), strip(artPath(c))]);
        return null;
      }
    });
    const ok = prepared.filter((x): x is { c: CatalogEntry; data: string } => !!x);
    const reqs: BatchRequest[] = [];
    const meta: Record<string, unknown> = {};
    for (const [ri, g] of chunk(ok, IMG_PER_REQ).entries()) {
      const id = `img-${Date.now().toString(36)}-${pi}-${ri}`;
      const content: Anthropic.Messages.ContentBlockParam[] = [];
      g.forEach((x, n) => {
        content.push({ type: 'text', text: `#${n + 1} · ${x.c.name} · famille : ${famille(x.c)} · ${STARS[x.c.rarity]}★${x.c.kind ? ` · ${x.c.kind}` : ''}` });
        content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: x.data } });
      });
      content.push({ type: 'text', text: `Donne un verdict pour chacune des ${g.length} cartes (n = numéro après #).` });
      reqs.push({ custom_id: id, params: { model: MODELS.haiku, max_tokens: 4000, thinking: { type: 'disabled' }, output_config: { effort: 'low', format: jsonFormat(IMG_SCHEMA) }, system: IMG_SYSTEM, messages: [{ role: 'user', content }] } });
      meta[id] = g.map((x) => ({ id: x.c.id, file: x.c.file }));
    }
    await submitBatches('images', MODELS.haiku, reqs, meta, (est * part.length) / todo.length);
  }
  if (local.length) {
    const f = join(OUT, `images-local-${today()}.csv`);
    writeCsv(f, ['id', 'nom', 'famille', 'etoiles', 'verdict', 'probleme', 'note', 'fichier'], local);
    console.log(`Défauts trouvés sans IA (fichier absent, basse résolution) : ${local.length} → ${relative(ROOT, f)}`);
  }
}

function handleImages(results: Map<string, unknown>, meta: Record<string, { id: string; file: string }[]>, batchId: string) {
  const seen = readJson<Record<string, string>>(IMG_SEEN, {});
  const byId = new Map(allCards().map((c) => [c.id, c]));
  const rows: (string | number)[][] = [];
  for (const [cid, parsed] of results) {
    const list = meta[cid] ?? [];
    const p = parsed as { cartes?: { n: number; verdict: string; probleme: string; note: string }[] } | null;
    if (!p?.cartes) continue;
    for (const v of p.cartes) {
      const m = list[v.n - 1];
      const c = m && byId.get(m.id);
      if (!c) continue;
      if (v.verdict !== 'ok') rows.push([c.id, c.name, famille(c), STARS[c.rarity], v.verdict, v.probleme, v.note, strip(artPath(c))]);
    }
    for (const m of list) seen[m.id] = m.file; // contrôlée pour ce fichier : une ré-illustration (nouveau nom) sera recontrôlée
  }
  writeJson(IMG_SEEN, seen, false);
  rows.sort((a, b) => (a[4] === b[4] ? Number(b[3]) - Number(a[3]) : a[4] === 'mauvais' ? -1 : 1));
  const f = join(OUT, `images-${today()}-${batchId.slice(-6)}.csv`);
  writeCsv(f, ['id', 'nom', 'famille', 'etoiles', 'verdict', 'probleme', 'note', 'fichier'], rows);
  return `${rows.length} images à revoir → ${relative(ROOT, f)}`;
}

// =================================================================================================================
// 2. CADRAGE — 5★/6★ sans visage connu (pochettes, objets, monuments, illustrations) : point à garder au centre
// Déjà en place : visages détectés par YuNet (src/core/art/faceFocus.json). Ici : seulement les cartes absentes de ce fichier.
// =================================================================================================================
const CAD_SYSTEM = `Tu aides à recadrer les illustrations d'un jeu de cartes. Chaque carte 5★ ou 6★ peut être affichée en plein écran (format portrait ≈ 0,7 de large pour 1 de haut) : on découpe l'image autour d'un POINT FOCAL.
Pour chaque image, donne :
- sujet : ce qu'on doit voir en priorité (≤ 8 mots) ;
- x, y : le point focal en fraction de la largeur et de la hauteur (0 = gauche / haut, 1 = droite / bas), centré sur le sujet principal (visage, titre de la pochette, monument, objet) ;
- plein_ecran : true si un recadrage portrait autour de ce point garde l'essentiel (sujet entier, titre lisible), false sinon (paysage trop large, texte coupé, plusieurs sujets éloignés) ;
- note : ≤ 12 mots en français.`;
const CAD_SCHEMA = obj({ cartes: { type: 'array', items: obj({ n: { type: 'integer' }, sujet: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' }, plein_ecran: { type: 'boolean' }, note: { type: 'string' } }) } });
const CAD_PER_REQ = 6;

async function taskCadrage(o: Opts) {
  noOpenBatch('cadrage');
  const faces = FACE_FOCUS as unknown as Record<string, [number, number]>;
  const cands = allCards().filter((c) => c.file && !c.id.startsWith('mrv-') && STARS[c.rarity] >= 5 && STARS[c.rarity] <= 6 && !faces[focusKey(c)] && existsSync(fileOf(c)));
  const metas = await pool(cands, 16, async (c) => ({ c, m: await sharp(fileOf(c)).metadata().catch(() => null) }));
  // les photos déjà verticales tiennent telles quelles : seulement carrées et horizontales
  const todo = metas.filter((x) => x.m?.width && x.m.height && x.m.width / x.m.height >= 0.82).map((x) => ({ c: x.c, w: x.m!.width!, h: x.m!.height! })).slice(0, o.max);
  const est = estimate(MODELS.sonnet, todo.length * 700 + Math.ceil(todo.length / CAD_PER_REQ) * 500, todo.length * 260, true);
  console.log(`5★/6★ carrées ou horizontales sans visage connu : ${todo.length}`);
  checkBudget(est, o.plafond || 10, 'cadrage');
  if (!o.go || !todo.length) return console.log(o.go ? 'Rien à faire.' : '\nEstimation seulement. Ajoute --go pour lancer.');
  const reqs: BatchRequest[] = [];
  const meta: Record<string, unknown> = {};
  for (const [ri, g] of chunk(todo, CAD_PER_REQ).entries()) {
    const id = `cad-${Date.now().toString(36)}-${ri}`;
    const content: Anthropic.Messages.ContentBlockParam[] = [];
    for (const [n, x] of g.entries()) {
      const buf = await sharp(fileOf(x.c)).resize(768, 768, { fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 80 }).toBuffer();
      content.push({ type: 'text', text: `#${n + 1} · ${x.c.name} · ${famille(x.c)} · ${STARS[x.c.rarity]}★ · image ${x.w}×${x.h}` });
      content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: buf.toString('base64') } });
    }
    content.push({ type: 'text', text: `Donne le point focal des ${g.length} images.` });
    reqs.push({ custom_id: id, params: { model: MODELS.sonnet, max_tokens: 8000, output_config: { effort: 'medium', format: jsonFormat(CAD_SCHEMA) }, system: CAD_SYSTEM, messages: [{ role: 'user', content }] } });
    meta[id] = g.map((x) => ({ id: x.c.id, key: focusKey(x.c), w: x.w, h: x.h }));
  }
  await submitBatches('cadrage', MODELS.sonnet, reqs, meta, est);
}

function handleCadrage(results: Map<string, unknown>, meta: Record<string, { id: string; key: string; w: number; h: number }[]>, batchId: string) {
  const byId = new Map(allCards().map((c) => [c.id, c]));
  const focus: Record<string, [number, number]> = {};
  const rows: (string | number)[][] = [];
  for (const [cid, parsed] of results) {
    const p = parsed as { cartes?: { n: number; sujet: string; x: number; y: number; plein_ecran: boolean; note: string }[] } | null;
    for (const v of p?.cartes ?? []) {
      const m = meta[cid]?.[v.n - 1];
      const c = m && byId.get(m.id);
      if (!c) continue;
      const x = Math.min(1, Math.max(0, v.x));
      const y = Math.min(1, Math.max(0, v.y));
      if (v.plein_ecran) focus[m.key] = [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000];
      rows.push([c.id, c.name, famille(c), STARS[c.rarity], v.plein_ecran ? 'oui' : 'non', v.sujet, x.toFixed(3), y.toFixed(3), `${m.w}×${m.h}`, v.note, m.key]);
    }
  }
  const stamp = `${today()}-${batchId.slice(-6)}`;
  writeJson(join(OUT, `cadrage-${stamp}.json`), focus);
  writeCsv(join(OUT, `cadrage-${stamp}.csv`), ['id', 'nom', 'famille', 'etoiles', 'plein_ecran', 'sujet', 'x', 'y', 'taille', 'note', 'cle'], rows);
  return `${rows.length} cartes, ${Object.keys(focus).length} proposées en plein écran → docs/rapports-agent/cadrage-${stamp}.json (format faceFocus.json, à valider à l'œil avant fusion)`;
}

// =================================================================================================================
// 3. CATALOGUE — rareté incohérente, doublons, mauvaise famille, orthographe (Sonnet 5.5, Batch). Rapport seulement.
// =================================================================================================================
const CAT_SYSTEM = `Tu relis le catalogue d'un jeu de cartes à collectionner privé (≈ 45 joueurs français, culture populaire occidentale). Rareté : 1★ (commun) à 6★ (icône mondiale) ; la rareté reflète la notoriété en France / Europe / États-Unis (« prisme occidental » : une célébrité surtout locale hors Occident ne doit pas être 5★ ou 6★).
On te donne une famille de cartes (id | nom | étoiles | infos). Signale UNIQUEMENT les anomalies nettes :
- rarete_incoherente : écart d'au moins 2★ avec ce que mérite la notoriété (ex. une superstar en 1★, un inconnu en 6★) — propose le nombre d'étoiles ;
- doublon : même sujet deux fois (même personne, même objet sous deux noms) ;
- mauvaise_famille : la carte n'a rien à faire dans cette famille ;
- orthographe : nom mal écrit, accents manquants, nom tronqué ou générique (« Joueur 3 ») ;
- autre.
Ne propose JAMAIS de changer un id. Détail ≤ 20 mots en français. Si tout va bien, liste vide.`;
const CAT_SCHEMA = obj({ problemes: { type: 'array', items: obj({ id: { type: 'string' }, type: { type: 'string', enum: ['rarete_incoherente', 'doublon', 'mauvaise_famille', 'orthographe', 'autre'] }, detail: { type: 'string' }, suggestion: { type: 'string' } }) } });

function catLine(c: CatalogEntry) {
  const extra = [c.kind, c.year ? String(c.year) : ''].filter(Boolean).join(', ');
  return `${c.id} | ${c.name} | ${STARS[c.rarity]}★${extra ? ` | ${extra}` : ''}`;
}

async function taskCatalogue(o: Opts) {
  noOpenBatch('catalogue');
  const bySub = new Map<string, CatalogEntry[]>();
  for (const c of allCards()) (bySub.get(c.subthemeId) ?? bySub.set(c.subthemeId, []).get(c.subthemeId)!).push(c);
  // familles découpées par 250 cartes max, puis petites familles regroupées dans une même requête (≤ 250 cartes)
  const parts: { sub: string; cards: CatalogEntry[] }[] = [];
  for (const [sub, cs] of bySub) for (const g of chunk(cs, 250)) parts.push({ sub, cards: g });
  let left = o.max;
  const sel = parts.filter((g) => (left -= g.cards.length) + g.cards.length > 0);
  const packs: { sub: string; cards: CatalogEntry[] }[][] = [];
  for (const p of sel) {
    const last = packs[packs.length - 1];
    if (last && last.reduce((a, x) => a + x.cards.length, 0) + p.cards.length <= 250) last.push(p);
    else packs.push([p]);
  }
  const n = sel.reduce((a, g) => a + g.cards.length, 0);
  const est = estimate(MODELS.sonnet, n * 22 + packs.length * 700, packs.length * 2500, true);
  console.log(`Cartes relues : ${n} en ${packs.length} requêtes`);
  checkBudget(est, o.plafond || 10, 'catalogue');
  if (!o.go) return console.log('\nEstimation seulement. Ajoute --go pour lancer.');
  const reqs: BatchRequest[] = [];
  const meta: Record<string, unknown> = {};
  for (const [ri, pack] of packs.entries()) {
    const id = `cat-${Date.now().toString(36)}-${ri}`;
    const text = pack
      .map((g) => { const st = subthemeById(g.sub); return `## Famille : ${st?.label ?? g.sub} (thème ${st?.themeId ?? '?'}) — ${g.cards.length} cartes\n${g.cards.map(catLine).join('\n')}`; })
      .join('\n\n');
    reqs.push({ custom_id: id, params: { model: MODELS.sonnet, max_tokens: 12000, output_config: { effort: 'medium', format: jsonFormat(CAT_SCHEMA) }, system: CAT_SYSTEM, messages: [{ role: 'user', content: text }] } });
    meta[id] = pack.map((g) => g.sub);
  }
  await submitBatches('catalogue', MODELS.sonnet, reqs, meta, est);
}

function handleCatalogue(results: Map<string, unknown>, _meta: Record<string, string[]>, batchId: string) {
  const byId = new Map(allCards().map((c) => [c.id, c]));
  const rows: (string | number)[][] = [];
  for (const parsed of results.values()) {
    for (const p of (parsed as { problemes?: { id: string; type: string; detail: string; suggestion: string }[] } | null)?.problemes ?? []) {
      const c = byId.get(p.id);
      rows.push([p.id, c?.name ?? '(id inconnu)', c ? famille(c) : '', c ? STARS[c.rarity] : '', p.type, p.detail, p.suggestion]);
    }
  }
  const f = join(OUT, `catalogue-${today()}-${batchId.slice(-6)}.csv`);
  writeCsv(f, ['id', 'nom', 'famille', 'etoiles', 'type', 'detail', 'suggestion'], rows);
  return `${rows.length} remarques → ${relative(ROOT, f)} (à trier par Hugo ; corrections dans donnees/ ou curation.ts, jamais dans les fichiers générés)`;
}

// =================================================================================================================
// 4. TRADUCTION — noms anglais (CATALOG_EN, générés par make-catalogue-en.py) : contresens, homonymes Wikipédia
// =================================================================================================================
const TR_SYSTEM = `Tu vérifies les noms ANGLAIS des cartes d'un jeu de cartes à collectionner (version anglaise du jeu). Chaque ligne : id | nom français | nom anglais | famille.
Règle du jeu : noms officiels anglais (Pokémon, champions, jeux, films) ; les personnes gardent leur nom ; chansons, albums et artistes gardent leur titre d'origine. Les noms anglais viennent souvent du titre de l'article Wikipédia anglais lié : signale les erreurs nettes seulement :
- mauvais article (homonyme, autre personne, article de liste ou de catégorie, « (disambiguation) », précision entre parenthèses inutile comme « (footballer, born 1990) ») ;
- contresens ou traduction littérale fautive ;
- titre d'œuvre traduit alors qu'il devait rester d'origine, ou l'inverse.
Propose le nom correct. Raison ≤ 15 mots en français. Si tout va bien, liste vide.`;
const TR_SCHEMA = obj({ problemes: { type: 'array', items: obj({ id: { type: 'string' }, propose: { type: 'string' }, raison: { type: 'string' } }) } });

async function taskTraduction(o: Opts) {
  noOpenBatch('traduction');
  const en = CATALOG_EN.cards;
  const pairs = allCards().filter((c) => en[c.id] && en[c.id] !== c.name).slice(0, o.max);
  const groups = chunk(pairs, 300);
  const est = estimate(MODELS.sonnet, pairs.length * 30 + groups.length * 600, groups.length * 1500, true);
  console.log(`Noms anglais à vérifier : ${pairs.length} en ${groups.length} requêtes`);
  checkBudget(est, o.plafond || 5, 'traduction');
  if (!o.go || !pairs.length) return console.log(o.go ? 'Rien à faire.' : '\nEstimation seulement. Ajoute --go pour lancer.');
  const reqs: BatchRequest[] = groups.map((g, ri) => ({
    custom_id: `tr-${Date.now().toString(36)}-${ri}`,
    params: { model: MODELS.sonnet, max_tokens: 10000, output_config: { effort: 'low', format: jsonFormat(TR_SCHEMA) }, system: TR_SYSTEM, messages: [{ role: 'user', content: g.map((c) => `${c.id} | ${c.name} | ${en[c.id]} | ${famille(c)}`).join('\n') }] },
  }));
  await submitBatches('traduction', MODELS.sonnet, reqs, Object.fromEntries(reqs.map((r) => [r.custom_id, 1])), est);
}

function handleTraduction(results: Map<string, unknown>, _meta: unknown, batchId: string) {
  const byId = new Map(allCards().map((c) => [c.id, c]));
  const rows: (string | number)[][] = [];
  for (const parsed of results.values()) {
    for (const p of (parsed as { problemes?: { id: string; propose: string; raison: string }[] } | null)?.problemes ?? []) {
      const c = byId.get(p.id);
      rows.push([p.id, c?.name ?? '', CATALOG_EN.cards[p.id] ?? '', p.propose, p.raison, c ? famille(c) : '']);
    }
  }
  const f = join(OUT, `traduction-${today()}-${batchId.slice(-6)}.csv`);
  writeCsv(f, ['id', 'nom_fr', 'nom_en_actuel', 'nom_en_propose', 'raison', 'famille'], rows);
  return `${rows.length} noms anglais à revoir → ${relative(ROOT, f)} (correction : scripts/data/en/manuel-*.json puis make-catalogue-en.py build)`;
}

// =================================================================================================================
// 5. CONVEX — quotas dépassés (Database I/O 40,6 GB pour 1 GB inclus au 26/11) : audit du code + insights de la prod
// =================================================================================================================
function sh(cmd: string, timeout = 180_000): string {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 50 * 1024 * 1024 });
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message: string };
    return `(échec : ${(err.stderr || err.message).slice(0, 600)})\n${err.stdout ?? ''}`;
  }
}
const CONVEX_SYSTEM = `Tu es un expert Convex chargé de réduire la facture d'un jeu de cartes à collectionner privé (≈ 45 joueurs, mobile, three.js). Le déploiement de prod dépasse l'offre : Database I/O ≈ 40,6 GB sur le mois pour 1 GB inclus, 675 k appels de fonctions / 1 M, egress 1,23 GB / 1 GB. Objectif : diviser l'I/O par 10 ou plus, sans changer l'expérience des joueurs.
Méthode :
1. Lis d'abord .claude/rules/convex.md (règles de compatibilité et de coût) et, dans docs/V2-FLUIDITE.md, les « Lot 4 », « Lot 5 » et « 5. Coûts » (déjà faits : ne pas les reproposer).
2. Lis convex/schema.ts, convex/crons.ts, puis les fonctions les plus appelées (requêtes réactives de l'accueil, de la collection, du chat, du classement, de la présence) et les migrations relancées à chaque mise en ligne (lanceurs/mettre-en-ligne-prod.cmd, convex/migrations.ts : purgeCards, remapCards, resyncRarities…).
3. Pour chaque cause, ESTIME l'I/O : documents lus × taille × fréquence (une requête réactive se ré-exécute à chaque écriture d'un document qu'elle a lu, pour chaque abonné). Pièges typiques : .collect() / .filter() sur une grosse table sans index, requête réactive qui lit l'inventaire entier, écriture fréquente sur un document lu par beaucoup d'abonnés (users, compteurs), cron qui balaie une table, migrations qui relisent tout à chaque déploiement, pagination absente.
4. Les « insights » de la prod (conflits OCC, limites) fournis plus bas pointent des fonctions précises : relie-les au code.
Contraintes : schéma compatible (nouveaux champs en v.optional, jamais de type changé), transformation de données = migration idempotente, aucun service payant en plus.
Rapport final en Markdown, en français, concis :
## Résumé (3 lignes : d'où vient l'I/O, gain total estimé)
## Causes classées (tableau : rang · fonction (fichier:ligne) · pourquoi ça coûte · I/O estimée / mois · correctif · risque)
## Lots proposés (un lot = un commit : fichiers, changement, comment mesurer avant / après avec npx convex insights ou le tableau de bord Usage)
## À vérifier dans le tableau de bord Convex (ce que le code seul ne permet pas de trancher)
Cite toujours fichier:ligne. N'invente pas de fonction : vérifie dans le code.`;

async function taskConvex(o: Opts) {
  const cap = o.plafond || 10;
  checkBudget(cap, cap, 'audit Convex (plafond, coût réel souvent inférieur)');
  if (!o.go) return console.log('\nEstimation seulement. Ajoute --go pour lancer (lit les insights de la prod en lecture seule : npx convex insights --prod).');
  console.log('Lecture des insights de la prod (72 h)…');
  const insights = sh('npx convex insights --prod --details --json').slice(0, 40_000);
  const usage = existsSync(join(OUT, 'convex-usage.txt')) ? readFileSync(join(OUT, 'convex-usage.txt'), 'utf8').slice(0, 20_000) : '';
  const first = `Insights de la prod (npx convex insights --prod --details --json) :\n\`\`\`\n${insights}\n\`\`\`\n${usage ? `\nRelevé du tableau de bord Usage (copié à la main dans docs/rapports-agent/convex-usage.txt) :\n\`\`\`\n${usage}\n\`\`\`\n` : ''}\nCommence l'audit.`;
  const { report, cost } = await runAudit('convex', CONVEX_SYSTEM, first, cap);
  const f = join(OUT, `convex-${today()}.md`);
  writeFileSync(f, `<!-- audit Convex par l'agent Claude (Opus 5.5), ${today()}, coût ${usd(cost)} — à valider avant tout changement -->\n\n${report}\n`);
  console.log(`\nRapport : ${relative(ROOT, f)} (${usd(cost)})`);
}

// =================================================================================================================
// 6. PERF MOBILE — build réel (tailles des fichiers) + dernières mesures scripts/mesure + lecture du code
// =================================================================================================================
const PERF_SYSTEM = `Tu es un expert performance web mobile (three.js r187 WebGPU + TSL, Vite, Convex) pour un jeu de cartes à collectionner privé joué surtout sur téléphone (iPhone Safari, Android Chrome milieu de gamme). Les joueurs trouvent le jeu lent sur mobile. Objectif : démarrage plus rapide, navigation et ouverture de boosters fluides, moins de chaleur / batterie.
Méthode :
1. Lis d'abord docs/V2-FLUIDITE.md en entier (mesures, lots DÉJÀ faits, « 6. Ce qui reste ») : ne repropose pas ce qui est fait.
2. Lis CLAUDE.md (section « Pièges connus » et « Contraintes produit ») : MSAA ×4 en WebGPU / ×2 en WebGL2 au téléphone, ne jamais couper la boucle 3D (setAnimationLoop(null)), durées uniquement via src/core/motion.ts, DA et animations 6★ identiques à l'œil.
3. Pars des tailles du build et des mesures fournies plus bas, puis lis le code concerné : point d'entrée (main.ts), rendu 3D (renderer, boucle, post-traitement, résolution / pixel ratio), chargement des images (src/game/cardImages.ts), polices, CSS, abonnements Convex au démarrage.
4. Cherche : gros morceaux JS chargés au démarrage qui pourraient attendre (import()), travail répété à chaque image, pixel ratio trop haut au téléphone, textures non compressées / trop grandes, shaders compilés au premier usage (saccade), listes DOM longues sans virtualisation, écouteurs / timers jamais retirés, re-rendus déclenchés par des requêtes réactives.
Rapport final en Markdown, en français, concis :
## Résumé (3 lignes)
## Constats classés par gain ressenti sur téléphone (tableau : rang · où (fichier:ligne) · problème · gain attendu · effort · risque pour la DA)
## Lots proposés (un lot = un commit ; comment le mesurer avant / après avec scripts/mesure/mesure.py, profil mobile)
Cite toujours fichier:ligne. N'invente rien : vérifie dans le code. Un lot sans gain mesurable n'a pas sa place.`;

function buildSizes(dir: string): string {
  const files: [string, number][] = [];
  const walk = (d: string) => { for (const e of readdirSync(d, { withFileTypes: true })) { const f = join(d, e.name); if (e.isDirectory()) walk(f); else files.push([relative(dir, f).replace(/\\/g, '/'), statSync(f).size]); } };
  walk(dir);
  const code = files.filter(([f]) => /\.(js|css|wasm|html)$/.test(f)).sort((a, b) => b[1] - a[1]);
  const total = code.reduce((a, [, s]) => a + s, 0);
  return `Total JS/CSS/HTML : ${Math.round(total / 1024)} Ko (non compressé)\n` + code.slice(0, 40).map(([f, s]) => `${String(Math.round(s / 1024)).padStart(6)} Ko  ${f}`).join('\n');
}

async function taskPerf(o: Opts) {
  const cap = o.plafond || 10;
  checkBudget(cap, cap, 'audit perf mobile (plafond, coût réel souvent inférieur)');
  if (!o.go) return console.log('\nEstimation seulement. Ajoute --go pour lancer (fait un build dans .cache/agent/dist, ~1-3 min).');
  console.log('Build de mesure (.cache/agent/dist)…');
  const outDir = join(ROOT, '.cache', 'agent', 'dist');
  mkdirSync(outDir, { recursive: true });
  const log = sh(`npx vite build --outDir "${outDir}" --emptyOutDir`, 600_000);
  const sizes = existsSync(join(outDir, 'jeu')) || readdirSync(outDir).length ? buildSizes(outDir) : `(build échoué)\n${log.slice(-2000)}`;
  // dernières mesures de scripts/mesure (res-<étiquette>-<profil>.json), si quelqu'un en a fait
  const res = [ROOT, join(ROOT, 'scripts', 'mesure')].flatMap((d) => (existsSync(d) ? readdirSync(d).filter((f) => /^res-.*\.json$/.test(f)).map((f) => join(d, f)) : []))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs).slice(0, 2);
  const mesures = res.map((f) => `${relative(ROOT, f)} :\n${readFileSync(f, 'utf8').slice(0, 8000)}`).join('\n\n') || '(aucune mesure récente : base dans docs/V2-FLUIDITE.md)';
  const first = `Tailles du build de production (vite build) :\n\`\`\`\n${sizes}\n\`\`\`\n\nDernières mesures :\n\`\`\`\n${mesures}\n\`\`\`\n\nCommence l'audit.`;
  const { report, cost } = await runAudit('perf', PERF_SYSTEM, first, cap);
  const f = join(OUT, `perf-${today()}.md`);
  writeFileSync(f, `<!-- audit perf mobile par l'agent Claude (Opus 5.5), ${today()}, coût ${usd(cost)} — à valider et MESURER avant tout lot -->\n\n${report}\n`);
  console.log(`\nRapport : ${relative(ROOT, f)} (${usd(cost)})`);
}

// =================================================================================================================
// SUIVRE — récupère les lots terminés, calcule le coût réel, écrit les rapports
// =================================================================================================================
type Handler = (results: Map<string, unknown>, meta: never, batchId: string) => string;
const HANDLERS: Record<string, Handler> = { images: handleImages, cadrage: handleCadrage, catalogue: handleCatalogue, traduction: handleTraduction } as Record<string, Handler>;

async function taskSuivre() {
  const open = batches().filter((b) => b.statut === 'en_cours');
  if (!open.length) return console.log('Aucun lot en cours.');
  for (const b of open) {
    const st = await claude().messages.batches.retrieve(b.id);
    const rc = st.request_counts;
    if (st.processing_status !== 'ended') { console.log(`${b.tache} ${b.id} : en cours (${rc.succeeded + rc.errored}/${b.requetes} traitées)`); continue; }
    const results = new Map<string, unknown>();
    let cost = 0;
    let errors = 0;
    for await (const r of await claude().messages.batches.results(b.id)) {
      if (r.result.type !== 'succeeded') { errors++; continue; }
      const m = r.result.message;
      cost += costOf(b.modele as ModelId, m.usage, true);
      results.set(r.custom_id, m.stop_reason === 'refusal' ? null : parseJsonLoose(textOf(m.content)));
    }
    const meta = readJson<Record<string, unknown>>(batchMapFile(b.id), {});
    const summary = HANDLERS[b.tache]?.(results, meta as never, b.id) ?? '(tâche inconnue)';
    recordSpend({ tache: b.tache, modele: b.modele, cout: cost, lot: b.id, note: `${results.size} réponses, ${errors} erreurs` });
    saveBatch({ ...b, statut: 'recupere' });
    console.log(`${b.tache} ${b.id} : terminé · coût réel ${usd(cost)} (estimé ${usd(b.estime)})${errors ? ` · ${errors} requêtes en erreur (relancer la tâche les reprendra)` : ''}\n  ${summary}`);
  }
}

function taskEtat() {
  const s = spends().filter((x) => x.date.startsWith(new Date().toISOString().slice(0, 7)));
  const byTask = new Map<string, number>();
  for (const x of s) byTask.set(x.tache, (byTask.get(x.tache) ?? 0) + x.cout);
  console.log(`Dépensé ce mois : ${usd(spentThisMonth())} / ${usd(monthBudget())}`);
  for (const [t, c] of byTask) console.log(`  ${t.padEnd(11)} ${usd(c)}`);
  const open = batches().filter((b) => b.statut === 'en_cours');
  console.log(open.length ? `Lots en cours : ${open.map((b) => `${b.tache} (${b.id})`).join(', ')} → npm run agent -- suivre` : 'Aucun lot en cours.');
}

// =================================================================================================================
const [cmd = 'etat', ...rest] = process.argv.slice(2);
const o = opts(rest);
const TASKS: Record<string, () => unknown> = {
  etat: taskEtat,
  images: () => taskImages(o),
  cadrage: () => taskCadrage(o),
  catalogue: () => taskCatalogue(o),
  traduction: () => taskTraduction(o),
  convex: () => taskConvex(o),
  perf: () => taskPerf(o),
  suivre: taskSuivre,
};
if (!TASKS[cmd]) fail(`commande inconnue « ${cmd} ». Commandes : ${Object.keys(TASKS).join(', ')}`);
await TASKS[cmd]();
