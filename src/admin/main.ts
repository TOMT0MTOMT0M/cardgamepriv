import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import './admin.css';
import { ConvexHttpClient } from 'convex/browser';
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { CANAL } from '../core/canal';
import { SURVEY_FEATURES, SURVEY_ID, SURVEY_UNIVERSES } from '../core/survey';
import { siteUrl } from '../core/siteRoot';

/**
 * DASHBOARD ADMIN (V2, 10/11) — /admin/, réservé à Tom et Hugo (vérifié côté serveur : convex/adminDash.ts).
 * Page à part du jeu : pas de 3D, pas de temps réel (lectures à la demande : bouton ↻, et l'accueil toutes les
 * minutes quand l'onglet est visible). Même session que le jeu (même site → même jeton dans le navigateur).
 * Onglets : Accueil · Retours (bugs, cartes, ajouts, idées, sondage) · Cartes à corriger · Joueurs · Alertes ·
 * Outils (commandes, lanceurs PC) · Journal (qui a fait quoi depuis le dashboard).
 */

// ───────────────────────────── connexion ─────────────────────────────
const URL_ = (import.meta.env.VITE_CONVEX_URL as string | undefined)?.trim();
const client = URL_ ? new ConvexHttpClient(URL_) : null;
const token = (() => {
  try {
    return localStorage.getItem('cardlab.session_token') ?? '';
  } catch {
    return '';
  }
})();
type Q = FunctionReference<'query'>;
type M = FunctionReference<'mutation'>;
type A = FunctionReference<'action'>;
const withTok = (args: object) => ({ sessionToken: token, ...args });
const ask = <F extends Q>(f: F, args: object = {}): Promise<FunctionReturnType<F>> => client!.query(f, withTok(args) as FunctionArgs<F>);
const call = <F extends M>(f: F, args: object = {}): Promise<FunctionReturnType<F>> => client!.mutation(f, withTok(args) as FunctionArgs<F>);
const run = <F extends A>(f: F, args: object = {}): Promise<FunctionReturnType<F>> => client!.action(f, withTok(args) as FunctionArgs<F>);

type Overview = FunctionReturnType<typeof api.adminDash.overview>;
type Player = FunctionReturnType<typeof api.adminDash.players>[number];
type Sugg = FunctionReturnType<typeof api.suggestions.adminList>['items'][number];
type Fix = FunctionReturnType<typeof api.adminDash.fixes>[number];

// ───────────────────────────── petits outils ─────────────────────────────
const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel)!;
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const nf = new Intl.NumberFormat('fr-FR');
const num = (n: number) => nf.format(n);
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const dateFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Paris' });
const fullDate = (at: number) => dateFmt.format(at);
function ago(at: number) {
  const s = Math.max(0, (Date.now() - at) / 1000);
  if (s < 60) return 'à l’instant';
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  if (s < 30 * 86400) return `il y a ${Math.floor(s / 86400)} j`;
  return fullDate(at);
}
const when = (at: number) => `<time title="${esc(fullDate(at))}">${esc(ago(at))}</time>`;
function errMsg(e: unknown) {
  const d = (e as { data?: unknown })?.data;
  if (typeof d === 'string') return d;
  const m = (e as Error)?.message ?? String(e);
  return m.replace(/^.*Uncaught ConvexError: /s, '').replace(/\n.*$/s, '').slice(0, 300);
}
let toastT = 0;
function toast(msg: string, kind: 'ok' | 'err' = 'ok') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `toast show ${kind}`;
  clearTimeout(toastT);
  toastT = window.setTimeout(() => (t.className = 'toast'), kind === 'err' ? 6000 : 3500);
}
/** bouton occupé pendant l'appel ; message du serveur en toast */
async function busy<T>(btn: HTMLButtonElement | null, fn: () => Promise<T>, ok?: (r: T) => string | void): Promise<T | undefined> {
  if (btn) btn.disabled = true;
  try {
    const r = await fn();
    const m = ok ? ok(r) : typeof r === 'string' ? r : undefined;
    if (m) toast(m);
    return r;
  } catch (e) {
    toast(errMsg(e), 'err');
    return undefined;
  } finally {
    if (btn) btn.disabled = false;
  }
}
async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copié.');
  } catch {
    prompt('Copie ce texte :', text);
  }
}
function download(name: string, text: string, type = 'text/csv;charset=utf-8') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function device(ua?: string) {
  if (!ua) return '';
  const os = /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : '';
  const br = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  const v = /(?:Chrome|Firefox|Version|Edg)\/(\d+)/.exec(ua)?.[1];
  return [os, br && `${br}${v ? ` ${v}` : ''}`].filter(Boolean).join(' · ');
}

const RAR: Record<string, [string, string]> = {
  common: ['Commune', 'r-common'],
  uncommon: ['Peu commune', 'r-uncommon'],
  rare: ['Rare', 'r-rare'],
  epic: ['Épique', 'r-epic'],
  legendary: ['Légendaire', 'r-legendary'],
  mythic: ['Mythique', 'r-mythic'],
  secret: ['Secrète', 'r-secret'],
};
const RAR_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'secret'];
const rarTag = (r?: string) => (r && RAR[r] ? `<span class="rar ${RAR[r][1]}">${RAR[r][0]}</span>` : '');
const KIND: Record<string, [string, string]> = { bug: ['Bug', 'k-bug'], design: ['Carte', 'k-design'], ajout: ['Ajout', 'k-ajout'], autre: ['Idée', 'k-autre'] };
const STATUS: Record<string, string> = { nouvelle: 'Nouvelle', vue: 'Vue', acceptee: 'Acceptée', traitee: 'Traitée', refusee: 'Refusée' };

// ───────────────────────────── catalogue (chargé à la demande) ─────────────────────────────
type Cat = typeof import('../core/sets/themes');
let catP: Promise<Cat> | null = null;
const catalog = () =>
  (catP ??= Promise.all([import('../core/sets/themes'), import('../core/sets/catalogBig')]).then(([t, big]) => {
    t.installCatalog(big);
    return t;
  }));
let cardIndex: Array<{ id: string; key: string }> | null = null;
async function searchCards(q: string) {
  const t = await catalog();
  cardIndex ??= t.THEMES.flatMap((th) => th.cards.map((c) => ({ id: c.id, key: fold(`${c.name} ${t.subthemeById(c.subthemeId)?.label ?? ''} ${c.id}`) })));
  const words = fold(q.trim()).split(/\s+/).filter(Boolean);
  if (!words.length || q.trim().length < 2) return [];
  const out: string[] = [];
  for (const c of cardIndex) {
    if (words.every((w) => c.key.includes(w))) out.push(c.id);
    if (out.length >= 8) break;
  }
  return out;
}
async function cardInfo(id: string) {
  const t = await catalog();
  const e = t.catalogEntry(id);
  if (!e) return null;
  const img = t.isWonderId(id) ? siteUrl(t.wonderCapturePath(id)) : t.hasArt(e) ? siteUrl(t.thumbPath(e)) : '';
  return { id, name: e.name, rarity: e.rarity as string, sub: t.subthemeById(e.subthemeId)?.label ?? e.subthemeId, theme: t.themeById(e.themeId)?.label ?? e.themeId, img };
}
const thumbHtml = (img: string, name: string) => (img ? `<img class="thumb" src="${esc(img)}" alt="" loading="lazy">` : `<span class="thumb none">${esc(name.slice(0, 2))}</span>`);
/** remplit les [data-card] d'un bloc avec miniature + nom (après chargement du catalogue) */
function hydrateCards(root: ParentNode) {
  const els = [...root.querySelectorAll<HTMLElement>('[data-card]')];
  if (!els.length) return;
  void catalog().then(async () => {
    for (const el of els) {
      const c = await cardInfo(el.dataset.card!);
      el.innerHTML = c ? `${thumbHtml(c.img, c.name)}<span><b>${esc(c.name)}</b><small>${esc(c.sub)} · ${esc(c.theme)}</small>${rarTag(c.rarity)}</span>` : `<span class="muted">Carte inconnue (${esc(el.dataset.card)})</span>`;
    }
  });
}
/** champ de recherche de carte → callback(id) */
function cardPicker(root: HTMLElement, onPick: (id: string) => void) {
  root.innerHTML = `<input type="search" placeholder="Chercher une carte (nom, série…)" autocomplete="off"><div class="hits"></div>`;
  const inp = $<HTMLInputElement>('input', root);
  const hits = $('.hits', root);
  let seq = 0;
  inp.addEventListener('input', async () => {
    const my = ++seq;
    const ids = await searchCards(inp.value);
    if (my !== seq) return;
    hits.innerHTML = ids.map((id) => `<button type="button" class="hit" data-id="${esc(id)}"><span class="cardline" data-card="${esc(id)}"></span></button>`).join('') || (inp.value.trim().length >= 2 ? '<p class="muted small">Aucune carte.</p>' : '');
    hydrateCards(hits);
  });
  hits.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.hit');
    if (!b) return;
    hits.innerHTML = '';
    inp.value = '';
    onPick(b.dataset.id!);
  });
}

// ───────────────────────────── squelette ─────────────────────────────
const TABS = [
  ['accueil', 'Accueil'],
  ['retours', 'Retours'],
  ['cartes', 'Cartes à corriger'],
  ['joueurs', 'Joueurs'],
  ['alertes', 'Alertes'],
  ['outils', 'Outils'],
  ['journal', 'Journal'],
  ['guide', 'Guide'],
] as const;
type Tab = (typeof TABS)[number][0];
let overview: Overview | null = null;
let alertsTodo = 0;

const app = $('#app');
function shell(me: { name: string; avatarUrl?: string }) {
  const prod = CANAL === 'prod';
  app.innerHTML = `
    <header class="top">
      <div class="brand"><b>Bébou</b><span>admin</span></div>
      <span class="canal ${prod ? 'prod' : 'v2'}" title="${prod ? 'Vraie base des joueurs' : 'Staging V2 : données de test'}">${prod ? 'PROD · vrais joueurs' : 'V2 · test'}</span>
      <div class="me">${me.avatarUrl ? `<img src="${esc(me.avatarUrl)}" alt="">` : ''}<span>${esc(me.name)}</span></div>
      <button class="icon refresh" type="button" title="Actualiser" aria-label="Actualiser">↻</button>
      <a class="icon" href="../jeu/" title="Retour au jeu" aria-label="Retour au jeu">⤺</a>
    </header>
    <nav class="tabs" role="tablist">${TABS.map(([k, l]) => `<a href="#${k}" data-tab="${k}">${l}<i class="n" hidden></i></a>`).join('')}</nav>
    <main id="view"></main>
    <div id="sheet" class="sheet" hidden></div>
    <div id="toast" class="toast" role="status" aria-live="polite"></div>`;
  $('.refresh').addEventListener('click', () => void route(true));
}
function badges() {
  const set = (k: Tab, n: number) => {
    const i = $(`.tabs [data-tab=${k}] .n`);
    i.hidden = !n;
    i.textContent = String(n);
  };
  if (!overview) return;
  set('retours', overview.suggestions.nouvelle);
  set('cartes', overview.fixesTodo);
  set('alertes', alertsTodo);
}
async function loadOverview() {
  overview = await ask(api.adminDash.overview);
  try {
    alertsTodo = (await ask(api.abuse.alerts)).filter((a) => !a.verdict).length;
  } catch {
    alertsTodo = 0;
  }
  badges();
  return overview;
}

let current: Tab = 'accueil';
let sub = '';
async function route(force = false) {
  const [k, s] = location.hash.replace(/^#/, '').split('/');
  const tab = (TABS.some(([t]) => t === k) ? k : 'accueil') as Tab;
  const changed = tab !== current || (s ?? '') !== sub;
  current = tab;
  sub = s ?? '';
  document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('on', (a as HTMLElement).dataset.tab === tab));
  $('.tabs a.on')?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  const view = $('#view');
  if (changed || force) view.innerHTML = '<p class="loading">Chargement…</p>';
  try {
    await VIEWS[tab](view, sub);
  } catch (e) {
    view.innerHTML = `<div class="panel err"><b>Impossible de charger.</b><p>${esc(errMsg(e))}</p><button class="btn" type="button" onclick="location.reload()">Recharger</button></div>`;
  }
  if (force && tab !== 'accueil') void loadOverview().catch(() => undefined);
}

// ───────────────────────────── Accueil ─────────────────────────────
async function viewAccueil(v: HTMLElement) {
  const o = await loadOverview();
  const todo: Array<[string, number, string, string]> = [
    ['Bugs à lire', o.suggestions.newByKind.bug, '#retours/bug', 'k-bug'],
    ['Cartes signalées', o.suggestions.newByKind.design, '#retours/design', 'k-design'],
    ['Ajouts demandés', o.suggestions.newByKind.ajout, '#retours/ajout', 'k-ajout'],
    ['Idées', o.suggestions.newByKind.autre, '#retours/autre', 'k-autre'],
    ['Cartes à corriger', o.fixesTodo, '#cartes', 'k-fix'],
    ['Alertes à trancher', alertsTodo, '#alertes', 'k-bug'],
  ];
  const stat = (l: string, n: number | string, hint = '') => `<div class="stat"><b>${typeof n === 'number' ? num(n) : esc(n)}</b><span>${esc(l)}</span>${hint ? `<small>${esc(hint)}</small>` : ''}</div>`;
  const locked = o.launchAt && o.launchAt > Date.now();
  const seenGuide = (() => {
    try {
      return localStorage.getItem('bebou.admin.guide') === '1';
    } catch {
      return true;
    }
  })();
  v.innerHTML = `
    ${seenGuide ? '' : `<div class="panel hello"><b>Première fois ici ?</b><p>Le guide explique tout en 2 minutes : quoi regarder chaque jour, quoi faire quand un joueur a un souci, et que faire si le jeu est cassé.</p><div class="actions"><a class="btn accent" href="#guide">Lire le guide</a><button class="btn ghost" type="button" data-hide>Plus tard</button></div></div>`}
    <a class="urgent" href="#guide/urgence"><b>Le jeu est cassé ?</b><span>Marche à suivre en cas d’urgence →</span></a>
    <section>
      <h2>À traiter</h2>
      <div class="todo">${todo.map(([l, n, href, k]) => `<a class="todo-i ${k}${n ? '' : ' zero'}" href="${href}"><b>${n}</b><span>${l}</span></a>`).join('')}</div>
    </section>
    <section>
      <h2>Le club</h2>
      <div class="stats">
        ${stat('joueurs', o.players)}
        ${stat('en ligne', o.online, '< 5 min')}
        ${stat('actifs 24 h', o.active24h)}
        ${stat('actifs 7 j', o.active7d)}
        ${stat('nouveaux 7 j', o.new7d)}
        ${stat('bannis', o.banned)}
        ${stat('boosters ouverts', o.packsOpened)}
        ${stat('boosters en réserve', o.packsWaiting)}
        ${stat('pièces en circulation', o.coins)}
        ${stat('notifs activées', o.pushPlayers ?? '—', o.pushPlayers === null ? 'pas sur cette version' : 'joueurs')}
        ${stat('réponses au sondage', o.surveyAnswers)}
        ${stat('club', locked ? 'verrouillé' : 'ouvert', locked ? `jusqu’au ${fullDate(o.launchAt!)}` : '')}
      </div>
    </section>
    <section>
      <h2>Activité récente</h2>
      <ul class="feed">${o.activity.map((a) => `<li><span class="who">${esc(a.who)}</span> ${esc(a.message)} ${rarTag(a.rarity)} <span class="muted">${when(a.at)}</span></li>`).join('') || '<li class="muted">Rien pour l’instant.</li>'}</ul>
    </section>
    <p class="muted small version"></p>`;
  v.querySelector('[data-hide]')?.addEventListener('click', () => {
    try {
      localStorage.setItem('bebou.admin.guide', '1');
    } catch {
      /* stockage refusé : le bandeau reviendra */
    }
    v.querySelector('.hello')?.remove();
  });
  void onlineVersion().then((t) => ($('.version', v).textContent = t));
}

/** version du site actuellement en ligne (même site que cette page) */
async function onlineVersion() {
  try {
    const r = await fetch(siteUrl('version.json'), { cache: 'no-store' });
    const j = (await r.json()) as { id?: string; at?: string };
    return `Version en ligne : ${j.id ?? '?'}${j.at ? ` · publiée ${ago(Date.parse(j.at))}` : ''}`;
  } catch {
    return 'Version en ligne : inconnue (pas de version.json)';
  }
}

// ───────────────────────────── Retours (suggestions + sondage) ─────────────────────────────
let retStatus: string = 'nouvelle';
async function viewRetours(v: HTMLElement, kind: string) {
  const k = kind || 'tous';
  const kinds: Array<[string, string]> = [['tous', 'Tout'], ['bug', 'Bugs'], ['design', 'Cartes'], ['ajout', 'Ajouts'], ['autre', 'Idées'], ['sondage', 'Sondage']];
  const head = `<div class="chips">${kinds.map(([id, l]) => `<a class="chip${id === k ? ' on' : ''}" href="#retours/${id === 'tous' ? '' : id}">${l}</a>`).join('')}</div>`;
  if (k === 'sondage') return viewSondage(v, head);
  const data = await ask(api.suggestions.adminList, retStatus === 'toutes' ? {} : { status: retStatus });
  const items = data.items.filter((s) => k === 'tous' || s.kind === k);
  const statuses: Array<[string, string]> = [['nouvelle', 'Nouvelles'], ['vue', 'Vues'], ['acceptee', 'Acceptées'], ['traitee', 'Traitées'], ['refusee', 'Refusées'], ['toutes', 'Toutes']];
  v.innerHTML = `${head}
    <div class="chips small">${statuses.map(([id, l]) => `<button type="button" class="chip${id === retStatus ? ' on' : ''}" data-st="${id}">${l}${id !== 'toutes' ? ` <i>${data.counts[id as keyof typeof data.counts]}</i>` : ''}</button>`).join('')}</div>
    <div class="list">${items.map(suggHtml).join('') || '<p class="empty">Rien ici. 🎉</p>'}</div>`;
  hydrateCards(v);
  v.querySelectorAll<HTMLButtonElement>('[data-st]').forEach((b) =>
    b.addEventListener('click', () => {
      retStatus = b.dataset.st!;
      void viewRetours(v, kind);
    }),
  );
  v.querySelectorAll<HTMLElement>('.sugg').forEach((el) => wireSugg(el, items.find((s) => s.id === el.dataset.id)!, () => void viewRetours(v, kind)));
}
function suggHtml(s: Sugg) {
  const [kl, kc] = KIND[s.kind];
  const dev = device(s.ua);
  return `<article class="item sugg" data-id="${esc(s.id)}">
    <header><span class="kind ${kc}">${kl}</span><b>${esc(s.author ?? '?')}</b><span class="muted">${when(s.createdAt)}</span><span class="st st-${s.status}">${STATUS[s.status]}</span></header>
    ${s.cardId ? `<div class="cardline" data-card="${esc(s.cardId)}"></div>` : ''}
    ${s.category ? `<p class="muted small">Catégorie : ${esc(s.category)}</p>` : ''}
    <p class="text">${esc(s.text) || '<span class="muted">(pas de texte)</span>'}</p>
    <div class="media">
      ${s.screenshotUrl ? `<a href="${esc(s.screenshotUrl)}" target="_blank" rel="noopener"><img src="${esc(s.screenshotUrl)}" alt="Capture" loading="lazy"></a>` : ''}
      ${s.imageUrl ? `<a class="link" href="${esc(s.imageUrl)}" target="_blank" rel="noopener noreferrer">Image proposée ↗</a>` : ''}
    </div>
    ${s.page || dev ? `<p class="meta">${s.page ? `Page : <code>${esc(s.page)}</code>` : ''}${s.page && dev ? ' · ' : ''}${esc(dev)}</p>` : ''}
    <textarea class="note" rows="1" placeholder="Réponse / note (le joueur la voit)">${esc(s.adminNote ?? '')}</textarea>
    <div class="actions">
      ${(['vue', 'acceptee', 'traitee', 'refusee'] as const).map((st) => `<button type="button" class="btn sm${s.status === st ? ' on' : ''}" data-set="${st}">${STATUS[st]}</button>`).join('')}
      <span class="grow"></span>
      ${s.kind === 'design' && s.cardId ? '<button type="button" class="btn sm accent" data-fix>→ Cartes à corriger</button>' : ''}
      <button type="button" class="btn sm ghost" data-copy title="Copier le retour (pour le coller à Claude)">Copier</button>
    </div>
  </article>`;
}
function wireSugg(el: HTMLElement, s: Sugg, reload: () => void) {
  const note = $<HTMLTextAreaElement>('.note', el);
  el.querySelectorAll<HTMLButtonElement>('[data-set]').forEach((b) =>
    b.addEventListener('click', () =>
      void busy(b, () => call(api.suggestions.setStatus, { id: s.id as Id<'suggestions'>, status: b.dataset.set, adminNote: note.value }), () => {
        reload();
        void loadOverview().catch(() => undefined);
        return `Marquée « ${STATUS[b.dataset.set!]} ».`;
      }),
    ),
  );
  el.querySelector<HTMLButtonElement>('[data-fix]')?.addEventListener('click', (e) =>
    void busy(e.currentTarget as HTMLButtonElement, () => call(api.adminDash.addFix, { cardId: s.cardId, note: s.text.slice(0, 500), ...(s.imageUrl ? { imageUrl: s.imageUrl } : {}), suggestionId: s.id }), (r) => {
      reload();
      void loadOverview().catch(() => undefined);
      return r;
    }),
  );
  $('[data-copy]', el).addEventListener('click', () =>
    void copy(
      [
        `[${KIND[s.kind][0]}] de ${s.author ?? '?'} — ${fullDate(s.createdAt)}`,
        s.cardId ? `Carte : ${s.cardId}` : '',
        s.category ? `Catégorie : ${s.category}` : '',
        s.page ? `Page : ${s.page}` : '',
        s.ua ? `Appareil : ${device(s.ua)} (${s.ua})` : '',
        '',
        s.text,
        s.imageUrl ? `Image proposée : ${s.imageUrl}` : '',
        s.screenshotUrl ? `Capture : ${s.screenshotUrl}` : '',
      ]
        .filter((l, i) => l || i === 5)
        .join('\n'),
    ),
  );
}
async function viewSondage(v: HTMLElement, head: string) {
  const r = await ask(api.survey.results, { surveyId: SURVEY_ID });
  const bars = (opts: Array<{ id: string; label: string }>, counts: Record<string, number>) => {
    const max = Math.max(1, ...Object.values(counts));
    return opts
      .map((o) => ({ ...o, n: counts[o.id] ?? 0 }))
      .sort((a, b) => b.n - a.n)
      .map((o) => `<div class="bar"><span>${esc(o.label)}</span><i style="--w:${(o.n / max) * 100}%"></i><b>${o.n}</b></div>`)
      .join('');
  };
  const rated = r.ratings.reduce((a, b) => a + b, 0);
  const avg = rated ? r.ratings.reduce((a, n, i) => a + n * (i + 1), 0) / rated : 0;
  v.innerHTML = `${head}
    <div class="panel"><h3>Sondage « ${esc(r.surveyId)} » — ${r.total} réponse${r.total > 1 ? 's' : ''}</h3>
      <div class="cols">
        <div><h4>Univers à ajouter</h4>${bars(SURVEY_UNIVERSES, r.universes)}</div>
        <div><h4>Nouveautés voulues</h4>${bars(SURVEY_FEATURES, r.features)}</div>
      </div>
      <h4>Note du jeu ${rated ? `— moyenne ${avg.toFixed(1).replace('.', ',')} / 5` : ''}</h4>
      ${bars([5, 4, 3, 2, 1].map((n) => ({ id: String(n), label: '★'.repeat(n) })), Object.fromEntries(r.ratings.map((n, i) => [String(i + 1), n])))}
    </div>
    <h3>Réponses écrites (${r.texts.length})</h3>
    <div class="list">${r.texts.map((t) => `<article class="item"><header><b>${esc(t.author)}</b>${t.rating ? `<span class="muted">${'★'.repeat(t.rating)}</span>` : ''}<span class="muted">${when(t.createdAt)}</span></header>${t.names ? `<p><span class="muted">Séries demandées :</span> ${esc(t.names)}</p>` : ''}${t.comment ? `<p class="text">${esc(t.comment)}</p>` : ''}</article>`).join('') || '<p class="empty">Pas encore de réponse écrite.</p>'}</div>`;
}

// ───────────────────────────── Cartes à corriger ─────────────────────────────
async function viewCartes(v: HTMLElement) {
  const list = await ask(api.adminDash.fixes);
  const todo = list.filter((f) => f.status === 'afaire');
  const done = list.filter((f) => f.status === 'fait');
  v.innerHTML = `
    <div class="bar-actions">
      <button type="button" class="btn accent" data-add>＋ Ajouter une carte</button>
      <span class="grow"></span>
      <button type="button" class="btn ghost" data-csv title="Fichier pour Excel">Exporter pour Excel</button>
      <button type="button" class="btn ghost" data-txt>Copier la liste</button>
    </div>
    <form class="panel add" hidden>
      <div class="picker"></div>
      <div class="picked cardline" hidden></div>
      <textarea name="note" rows="2" placeholder="Ce qui ne va pas (photo, nom, étoiles…)"></textarea>
      <input name="img" type="url" placeholder="Lien d’une image de remplacement (facultatif)">
      <div class="actions"><button class="btn accent" type="submit" disabled>Ajouter à la liste</button><button class="btn ghost" type="button" data-cancel>Annuler</button></div>
    </form>
    <h3>À faire <span class="muted">${todo.length}</span></h3>
    <div class="list">${todo.map(fixHtml).join('') || '<p class="empty">Aucune carte à corriger.</p>'}</div>
    ${done.length ? `<details><summary>Corrigées <span class="muted">${done.length}</span></summary><div class="list">${done.map(fixHtml).join('')}</div></details>` : ''}`;
  hydrateCards(v);
  const form = $<HTMLFormElement>('form.add', v);
  let picked = '';
  $('[data-add]', v).addEventListener('click', () => {
    form.hidden = false;
    $<HTMLInputElement>('.picker input', form)?.focus();
  });
  $('[data-cancel]', form).addEventListener('click', () => (form.hidden = true));
  cardPicker($('.picker', form), (id) => {
    picked = id;
    const p = $('.picked', form);
    p.hidden = false;
    p.dataset.card = id;
    hydrateCards(form);
    $<HTMLButtonElement>('button[type=submit]', form).disabled = false;
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    void busy($<HTMLButtonElement>('button[type=submit]', form), () => call(api.adminDash.addFix, { cardId: picked, note: String(fd.get('note') ?? ''), ...(String(fd.get('img') ?? '').trim() ? { imageUrl: String(fd.get('img')).trim() } : {}) }), (r) => {
      void viewCartes(v);
      void loadOverview().catch(() => undefined);
      return r;
    });
  });
  $('[data-csv]', v).addEventListener('click', () => void exportFixes(list, 'csv'));
  $('[data-txt]', v).addEventListener('click', () => void exportFixes(todo, 'txt'));
  v.querySelectorAll<HTMLElement>('.fix').forEach((el) => {
    const f = list.find((x) => x.id === el.dataset.id)!;
    const id = f.id as Id<'cardFixes'>;
    el.querySelector<HTMLButtonElement>('[data-done]')?.addEventListener('click', (e) =>
      void busy(e.currentTarget as HTMLButtonElement, () => call(api.adminDash.setFix, { id, status: f.status === 'fait' ? 'afaire' : 'fait' }), () => {
        void viewCartes(v);
        void loadOverview().catch(() => undefined);
        return f.status === 'fait' ? 'Remise à faire.' : 'Marquée corrigée.';
      }),
    );
    el.querySelector<HTMLButtonElement>('[data-del]')?.addEventListener('click', (e) => {
      if (!confirm(`Retirer « ${f.name} » de la liste ?`)) return;
      void busy(e.currentTarget as HTMLButtonElement, () => call(api.adminDash.setFix, { id, remove: true }), () => (void viewCartes(v), 'Retirée.'));
    });
    const note = el.querySelector<HTMLTextAreaElement>('.note');
    note?.addEventListener('change', () => void busy(null, () => call(api.adminDash.setFix, { id, note: note.value }), () => 'Note enregistrée.'));
  });
}
function fixHtml(f: Fix) {
  return `<article class="item fix${f.status === 'fait' ? ' done' : ''}" data-id="${esc(f.id)}">
    <div class="cardline" data-card="${esc(f.cardId)}"></div>
    <textarea class="note" rows="1" placeholder="Note">${esc(f.note)}</textarea>
    <p class="meta">${f.imageUrl ? `<a class="link" href="${esc(f.imageUrl)}" target="_blank" rel="noopener noreferrer">Image proposée ↗</a> · ` : ''}${f.fromPlayer ? '<span class="kind k-design">signalée par un joueur</span> · ' : ''}par ${esc(f.by)} · ${when(f.updatedAt)} · <code>${esc(f.cardId)}</code></p>
    <div class="actions"><button type="button" class="btn sm${f.status === 'fait' ? '' : ' accent'}" data-done>${f.status === 'fait' ? 'Remettre à faire' : '✓ Corrigée'}</button><span class="grow"></span><button type="button" class="btn sm ghost" data-del>Retirer</button></div>
  </article>`;
}
async function exportFixes(list: Fix[], fmt: 'csv' | 'txt') {
  await catalog();
  const rows = await Promise.all(list.map(async (f) => ({ f, c: await cardInfo(f.cardId) })));
  if (fmt === 'txt') {
    if (!rows.length) return toast('Rien à copier.', 'err');
    return copy(rows.map(({ f, c }) => `- ${c?.name ?? f.cardId} (${c?.sub ?? ''}, ${RAR[c?.rarity ?? '']?.[0] ?? ''}) — ${f.note || 'à revoir'}${f.imageUrl ? ` — image : ${f.imageUrl}` : ''} [${f.cardId}]`).join('\n'));
  }
  const cell = (s: unknown) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const head = ['Carte', 'Série', 'Thème', 'Rareté', 'Note', 'Image proposée', 'Statut', 'Par', 'Mis à jour', 'Id'];
  const lines = rows.map(({ f, c }) => [c?.name ?? f.cardId, c?.sub, c?.theme, RAR[c?.rarity ?? '']?.[0], f.note, f.imageUrl, f.status === 'fait' ? 'corrigée' : 'à faire', f.by, fullDate(f.updatedAt), f.cardId].map(cell).join(';'));
  download(`cartes-a-corriger-${new Date().toISOString().slice(0, 10)}.csv`, '﻿' + [head.map(cell).join(';'), ...lines].join('\r\n'));
}

// ───────────────────────────── Joueurs ─────────────────────────────
let plSort = 'vu';
let plQuery = '';
async function viewJoueurs(v: HTMLElement) {
  const all = await ask(api.adminDash.players);
  v.innerHTML = `
    <div class="bar-actions">
      <input type="search" class="grow" placeholder="Chercher un joueur" value="${esc(plQuery)}">
      <select aria-label="Trier">${[['vu', 'Dernière visite'], ['ouverts', 'Boosters ouverts'], ['pieces', 'Pièces'], ['reserve', 'Réserve'], ['nom', 'Nom'], ['recent', 'Inscription']].map(([k, l]) => `<option value="${k}"${k === plSort ? ' selected' : ''}>${l}</option>`).join('')}</select>
    </div>
    <div class="players"></div>`;
  const box = $('.players', v);
  const draw = () => {
    const q = fold(plQuery);
    const rows = all.filter((p) => !q || fold(`${p.name} ${p.username}`).includes(q));
    const by: Record<string, (a: Player, b: Player) => number> = {
      vu: (a, b) => b.lastSeenAt - a.lastSeenAt,
      ouverts: (a, b) => b.opened - a.opened,
      pieces: (a, b) => b.coins - a.coins,
      reserve: (a, b) => b.packs - a.packs,
      nom: (a, b) => a.name.localeCompare(b.name, 'fr'),
      recent: (a, b) => b.createdAt - a.createdAt,
    };
    rows.sort(by[plSort]);
    box.innerHTML =
      `<p class="muted small">${rows.length} joueur${rows.length > 1 ? 's' : ''}</p>` +
      rows
        .map((p) => {
          const on = Date.now() - p.lastSeenAt < 5 * 60_000;
          return `<button type="button" class="player${p.bannedAt ? ' banned' : ''}" data-id="${esc(p.id)}">
          <span class="av">${p.avatarUrl ? `<img src="${esc(p.avatarUrl)}" alt="" loading="lazy">` : esc(p.name.slice(0, 1).toUpperCase())}<i class="dot${on ? ' on' : ''}"></i></span>
          <span class="who"><b>${esc(p.name)}</b><small>@${esc(p.username.replace(/^pw:/, ''))}${p.staff ? ' · <em>équipe</em>' : ''}${p.pw ? ' · pseudo' : ''}${p.bannedAt ? ' · <em class="red">banni</em>' : ''}</small><small class="muted">${on ? 'en ligne' : `vu ${ago(p.lastSeenAt)}`}${p.status ? ` · ${esc(p.status)}` : ''}</small></span>
          <span class="nums"><span><b>${num(p.packs)}</b>réserve</span><span><b>${num(p.opened)}</b>ouverts</span><span><b>${num(p.coins)}</b>pièces</span></span>
        </button>`;
        })
        .join('');
  };
  draw();
  $<HTMLInputElement>('input[type=search]', v).addEventListener('input', (e) => ((plQuery = (e.target as HTMLInputElement).value), draw()));
  $<HTMLSelectElement>('select', v).addEventListener('change', (e) => ((plSort = (e.target as HTMLSelectElement).value), draw()));
  box.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('.player');
    const p = b && all.find((x) => x.id === b.dataset.id);
    if (p) void openPlayer(p, () => void viewJoueurs(v));
  });
}
function closeSheet() {
  const s = $('#sheet');
  s.hidden = true;
  s.innerHTML = '';
  document.body.classList.remove('locked');
}
addEventListener('keydown', (e) => e.key === 'Escape' && closeSheet());
async function openPlayer(p: Player, reload: () => void) {
  const s = $('#sheet');
  s.hidden = false;
  document.body.classList.add('locked');
  s.innerHTML = `<div class="sheet-bg"></div><div class="sheet-in"><p class="loading">Chargement…</p></div>`;
  $('.sheet-bg', s).addEventListener('click', closeSheet);
  const inner = $('.sheet-in', s);
  let d: FunctionReturnType<typeof api.adminDash.playerDetail>;
  try {
    d = await ask(api.adminDash.playerDetail, { id: p.id });
  } catch (e) {
    inner.innerHTML = `<p class="err">${esc(errMsg(e))}</p>`;
    return;
  }
  const id = p.id as Id<'users'>;
  inner.innerHTML = `
    <header class="sheet-head">
      <span class="av big">${p.avatarUrl ? `<img src="${esc(p.avatarUrl)}" alt="">` : esc(p.name.slice(0, 1).toUpperCase())}</span>
      <div><h2>${esc(p.name)}</h2><p class="muted small">@${esc(p.username)} · inscrit ${ago(p.createdAt)} · vu ${ago(p.lastSeenAt)}${p.referredBy ? ` · parrain : ${esc(p.referredBy)}` : ''}</p>
      ${p.bannedAt ? `<p class="red small">Banni ${ago(p.bannedAt)} — ${esc(p.banReason ?? '')}</p>` : ''}</div>
      <button class="icon close" type="button" aria-label="Fermer">✕</button>
    </header>
    <div class="stats mini">
      <div class="stat"><b>${num(p.packs)}</b><span>réserve</span></div>
      <div class="stat"><b>${num(p.opened)}</b><span>ouverts</span></div>
      <div class="stat"><b>${num(p.coins)}</b><span>pièces</span></div>
      <div class="stat"><b>${num(d.distinct)}</b><span>cartes diff.</span></div>
      <div class="stat"><b>${num(d.copies)}</b><span>exemplaires</span></div>
      <div class="stat"><b>${p.streak}</b><span>série (j)</span></div>
    </div>
    <div class="rars">${RAR_ORDER.filter((r) => d.byRarity[r]).map((r) => `${rarTag(r)}<b>${d.byRarity[r]}</b>`).join(' ')}</div>
    <p class="muted small">${d.sessions} session(s) ouverte(s) · ${p.devices} appareil(s) · ${d.suggestions} suggestion(s) · visite guidée ${d.guideSeen ? 'vue' : 'pas encore vue'}${d.boostLeft ? ` · recharge ×2 encore ${Math.ceil(d.boostLeft / 3600_000)} h` : ''}</p>

    <h3>Actions</h3>
    <div class="acts">
      <div class="act"><label>Boosters</label><div class="row"><input type="number" min="1" max="200" value="5" data-packs-n><button class="btn accent" data-packs>Donner</button></div>
        <div class="row quick">${[5, 10, 15, 50].map((n) => `<button class="btn sm ghost" data-q="${n}">+${n}</button>`).join('')}</div></div>
      <div class="act"><label>Pièces <small class="muted">(négatif = retirer)</small></label><div class="row"><input type="number" value="500" data-coins-n><button class="btn accent" data-coins>Valider</button></div>
        <input type="text" placeholder="Motif (visible dans son portefeuille)" data-coins-l></div>
      <div class="act wide"><label>Donner une carte</label><div class="picker"></div>
        <div class="row" data-card-row hidden><span class="cardline grow" data-card-picked></span><select data-card-r>${RAR_ORDER.map((r) => `<option value="${r}">${RAR[r][0]}</option>`).join('')}</select><input type="number" min="1" max="20" value="1" data-card-n class="xs"><button class="btn accent" data-card-go>Donner</button></div></div>
      <div class="act"><label>Parrainage perdu</label><div class="row"><input type="text" placeholder="Pseudo du parrain" data-ref><button class="btn" data-ref-go>Rattacher</button></div></div>
      ${p.pw ? `<div class="act"><label>Mot de passe oublié</label><div class="row"><input type="text" placeholder="Nouveau mot de passe" data-pw autocomplete="off"><button class="btn" data-pw-go>Changer</button></div><small class="muted">Ses sessions sont fermées ; donne-lui le mot de passe en privé.</small></div>` : ''}
      <div class="act"><label>Visite guidée</label><button class="btn" data-guide>Relancer à sa prochaine visite</button></div>
      <div class="act"><label>Jeu bloqué chez lui</label><button class="btn" data-logout>Le déconnecter partout</button><small class="muted">Rien n’est perdu : il se reconnecte.</small></div>
      <div class="act"><label>Échanges en attente : ${d.pendingTrades}</label><button class="btn" data-trades${d.pendingTrades ? '' : ' disabled'}>Annuler ses échanges en attente</button></div>
      <div class="act wide"><label>Notes de l’équipe <small class="muted">(jamais visibles du joueur)</small></label>
        <ul class="feed notes">${d.notes.map((n) => `<li>${esc(n.text)} <span class="muted">— ${esc(n.by)}, ${when(n.at)}</span> <button class="btn sm ghost" data-unnote="${esc(n.id)}" aria-label="Supprimer la note">✕</button></li>`).join('') || '<li class="muted">Aucune note.</li>'}</ul>
        <div class="row"><input type="text" placeholder="Ex. a payé l’abonnement le 10/11" data-note><button class="btn" data-note-go>Ajouter</button></div></div>
      <div class="act wide"><label>Sa collection — retirer une carte <small class="muted">(doublon après un bug, carte donnée par erreur)</small></label>
        <input type="search" placeholder="Chercher dans ses cartes" data-coll-q>
        <div class="coll"></div></div>
      ${p.staff ? '' : p.bannedAt ? `<div class="act"><label>Compte</label><button class="btn" data-unban>Rétablir le compte</button></div>` : `<div class="act danger"><label>Bannir</label><div class="row"><input type="text" placeholder="Raison (multi-comptes…)" data-ban-r><button class="btn red" data-ban>Bannir</button></div><small class="muted">Sessions fermées, échanges annulés, amitiés retirées. Réversible.</small></div>`}
    </div>

    <h3>Derniers boosters</h3>
    <ul class="feed">${d.packs.map((k) => `<li>${rarTag(k.best)} ${esc(k.cards.join(', '))} <span class="muted">${k.status === 'sealed' ? 'scellé · ' : ''}${when(k.at)}</span></li>`).join('') || '<li class="muted">Aucun.</li>'}</ul>
    <h3>Pièces</h3>
    <ul class="feed">${d.coinTx.map((c) => `<li><b class="${c.amount < 0 ? 'red' : 'green'}">${c.amount > 0 ? '+' : ''}${num(c.amount)}</b> ${esc(c.label)} <span class="muted">${when(c.at)}</span></li>`).join('') || '<li class="muted">Rien.</li>'}</ul>
    ${d.referrals.length ? `<h3>Filleuls</h3><ul class="feed">${d.referrals.map((r) => `<li><b>${esc(r.name)}</b> — ${r.paid ? 'parrainage payé' : `${r.opened}/10 boosters ouverts`}</li>`).join('')}</ul>` : ''}`;
  $('.close', inner).addEventListener('click', closeSheet);
  const done = (r: unknown) => {
    reload();
    void openPlayerFresh(p.id, reload);
    return typeof r === 'string' ? r : undefined;
  };
  const btn = (sel: string) => $<HTMLButtonElement>(sel, inner);
  const val = (sel: string) => $<HTMLInputElement>(sel, inner).value;
  btn('[data-packs]').addEventListener('click', (e) => void busy(e.currentTarget as HTMLButtonElement, () => call(api.adminDash.givePacks, { id, n: Number(val('[data-packs-n]')) }), done));
  inner.querySelectorAll<HTMLButtonElement>('[data-q]').forEach((b) => b.addEventListener('click', () => void busy(b, () => call(api.adminDash.givePacks, { id, n: Number(b.dataset.q) }), done)));
  btn('[data-coins]').addEventListener('click', (e) => void busy(e.currentTarget as HTMLButtonElement, () => call(api.adminDash.giveCoins, { id, amount: Number(val('[data-coins-n]')), label: val('[data-coins-l]') }), done));
  let cardId = '';
  cardPicker($('.picker', inner), (cid) => {
    cardId = cid;
    $('[data-card-row]', inner).hidden = false;
    const pk = $('[data-card-picked]', inner);
    pk.dataset.card = cid;
    hydrateCards(inner);
    void cardInfo(cid).then((c) => c && ($<HTMLSelectElement>('[data-card-r]', inner).value = c.rarity));
  });
  btn('[data-card-go]').addEventListener('click', (e) => void busy(e.currentTarget as HTMLButtonElement, () => call(api.adminDash.giveCard, { id, cardId, rarity: $<HTMLSelectElement>('[data-card-r]', inner).value, count: Number(val('[data-card-n]')) }), done));
  btn('[data-ref-go]').addEventListener('click', (e) => void busy(e.currentTarget as HTMLButtonElement, () => call(api.adminDash.linkReferral, { referrer: val('[data-ref]'), child: p.username }), done));
  inner.querySelector<HTMLButtonElement>('[data-pw-go]')?.addEventListener('click', (e) => void busy(e.currentTarget as HTMLButtonElement, () => run(api.adminDash.setPassword, { id, password: val('[data-pw]') }), done));
  btn('[data-guide]').addEventListener('click', (e) => void busy(e.currentTarget as HTMLButtonElement, () => call(api.adminDash.resetGuide, { id }), done));
  btn('[data-logout]').addEventListener('click', (e) => {
    if (confirm(`Déconnecter ${p.name} de tous ses appareils ?`)) void busy(e.currentTarget as HTMLButtonElement, () => call(api.adminDash.logout, { id }), done);
  });
  btn('[data-trades]').addEventListener('click', (e) => {
    if (confirm(`Annuler les ${d.pendingTrades} échange(s) en attente de ${p.name} ?`)) void busy(e.currentTarget as HTMLButtonElement, () => call(api.adminDash.cancelTrades, { id }), done);
  });
  btn('[data-note-go]').addEventListener('click', (e) => void busy(e.currentTarget as HTMLButtonElement, () => call(api.adminDash.addNote, { id, text: val('[data-note]') }), done));
  inner.querySelectorAll<HTMLButtonElement>('[data-unnote]').forEach((b) =>
    b.addEventListener('click', () => {
      if (confirm('Supprimer cette note ?')) void busy(b, () => call(api.adminDash.removeNote, { noteId: b.dataset.unnote }), () => (done(null), 'Note supprimée.'));
    }),
  );
  // collection : chargée à la première recherche (catalogue pour les noms)
  let coll: Array<{ cardId: string; rarity: string; count: number; mint: number; name: string; key: string }> | null = null;
  const collBox = $('.coll', inner);
  const collQ = $<HTMLInputElement>('[data-coll-q]', inner);
  const drawColl = async () => {
    if (!coll) {
      collBox.innerHTML = '<p class="muted small">Chargement de sa collection…</p>';
      const [rows, t] = await Promise.all([ask(api.adminDash.playerCards, { id }), catalog()]);
      coll = rows.map((r) => {
        const e = t.catalogEntry(r.cardId);
        const name = e?.name ?? r.cardId;
        return { ...r, name, key: fold(`${name} ${e ? (t.subthemeById(e.subthemeId)?.label ?? '') : ''} ${r.cardId}`) };
      });
    }
    const words = fold(collQ.value.trim()).split(/\s+/).filter(Boolean);
    const hits = coll
      .filter((c) => words.every((w) => c.key.includes(w)))
      .sort((a, b) => RAR_ORDER.indexOf(b.rarity) - RAR_ORDER.indexOf(a.rarity) || b.count - a.count)
      .slice(0, 12);
    collBox.innerHTML = hits.length
      ? hits.map((c, i) => `<div class="collrow"><span class="grow"><b>${esc(c.name)}</b> ${rarTag(c.rarity)} <span class="muted">× ${c.count} · n° ${c.mint}</span></span><button class="btn sm ghost" data-take="${i}">Retirer…</button></div>`).join('')
      : '<p class="muted small">Aucune carte.</p>';
    collBox.querySelectorAll<HTMLButtonElement>('[data-take]').forEach((b) =>
      b.addEventListener('click', () => {
        const c = hits[Number(b.dataset.take)];
        const n = Number(prompt(`Combien d’exemplaires de « ${c.name} » retirer ? (il en a ${c.count})`, '1'));
        if (!n) return;
        const reason = prompt('Raison (gardée dans le journal) :', 'doublon après un bug');
        if (!reason) return;
        void busy(b, () => call(api.adminDash.takeCard, { id, cardId: c.cardId, rarity: c.rarity, count: n, reason }), (r) => {
          coll = null;
          void drawColl();
          return done(r);
        });
      }),
    );
  };
  let collT = 0;
  collQ.addEventListener('input', () => {
    clearTimeout(collT);
    collT = window.setTimeout(() => void drawColl(), 200);
  });
  collQ.addEventListener('focus', () => void (coll ? undefined : drawColl()), { once: true });
  inner.querySelector<HTMLButtonElement>('[data-unban]')?.addEventListener('click', (e) => void busy(e.currentTarget as HTMLButtonElement, () => call(api.adminDash.unban, { id }), done));
  inner.querySelector<HTMLButtonElement>('[data-ban]')?.addEventListener('click', (e) => {
    const reason = val('[data-ban-r]').trim();
    if (!reason) return toast('Écris une raison.', 'err');
    if (!confirm(`Bannir ${p.name} ? (${reason})`)) return;
    void busy(e.currentTarget as HTMLButtonElement, () => call(api.adminDash.ban, { id, reason }), done);
  });
}
async function openPlayerFresh(id: string, reload: () => void) {
  const p = (await ask(api.adminDash.players)).find((x) => x.id === id);
  if (p && !$('#sheet').hidden) void openPlayer(p, reload);
}

// ───────────────────────────── Alertes anti-abus ─────────────────────────────
const ALERT_KIND: Record<string, string> = { flow: 'Flux de valeur', trades: 'Échanges', newAccount: 'Nouveau compte', device: 'Même appareil', referral: 'Parrainage' };
async function viewAlertes(v: HTMLElement) {
  const list = await ask(api.abuse.alerts);
  alertsTodo = list.filter((a) => !a.verdict).length;
  badges();
  const html = (a: (typeof list)[number]) => `<article class="item alert${a.verdict ? ` v-${a.verdict}` : ''}" data-key="${esc(a.key)}">
    <header><span class="kind k-bug">${esc(ALERT_KIND[a.kind] ?? a.kind)}</span><b>${esc(a.title)}</b>${a.verdict ? `<span class="st">${a.verdict === 'ok' ? 'Légitime' : 'À surveiller'}</span>` : ''}</header>
    <p class="text">${esc(a.detail)}</p>
    <input type="text" class="note" placeholder="Note (facultatif)" value="${esc(a.note ?? '')}">
    <div class="actions"><button class="btn sm${a.verdict === 'ok' ? ' on' : ''}" data-v="ok">Légitime</button><button class="btn sm${a.verdict === 'watch' ? ' on' : ''}" data-v="watch">À surveiller</button></div>
  </article>`;
  const todo = list.filter((a) => !a.verdict);
  const seen = list.filter((a) => a.verdict);
  v.innerHTML = `<p class="muted small">Rien n’est bloqué automatiquement : ces signaux sont à trancher à la main (entre potes, un don est normal).</p>
    <div class="list">${todo.map(html).join('') || '<p class="empty">Aucune alerte à trancher.</p>'}</div>
    ${seen.length ? `<details><summary>Déjà tranchées <span class="muted">${seen.length}</span></summary><div class="list">${seen.map(html).join('')}</div></details>` : ''}`;
  v.querySelectorAll<HTMLElement>('.alert').forEach((el) =>
    el.querySelectorAll<HTMLButtonElement>('[data-v]').forEach((b) =>
      b.addEventListener('click', () => void busy(b, () => call(api.abuse.review, { key: el.dataset.key, verdict: b.dataset.v, note: $<HTMLInputElement>('.note', el).value.trim() || undefined }), () => (void viewAlertes(v), 'Enregistré.'))),
    ),
  );
}

// ───────────────────────────── Outils ─────────────────────────────
const LANCEURS: Array<[string, string, string]> = [
  ['mettre-en-ligne-v2.cmd', 'Envoie la V2 sur le lien admin (code Convex sur le staging, migrations, build, images R2). Ne touche jamais la prod.', 'Après chaque lot V2 à tester'],
  ['publier-patch.cmd', 'Le seul chemin vers la prod : contrôles, simulation, sauvegarde de la base, puis tu tapes PUBLIER (fusion v2 → master).', 'Quand tu décides de sortir un patch'],
  ['push.cmd', 'Envoie sur GitHub les branches et tags déjà commités. Ne met rien en ligne.', 'Si un push a échoué côté Claude'],
  ['rafraichir-staging-v2.cmd', 'Remplace les données du staging V2 par une copie fraîche de la base des joueurs (lue seulement).', 'Quand les données de test sont trop vieilles'],
  ['sauvegarder-v1.cmd', 'Export complet de la base des joueurs + archive du code v1.0. Ne modifie rien en ligne.', 'Avant une opération risquée'],
  ['parrainage-manuel.cmd', 'Rattache un filleul à son parrain (même chose que l’action « Parrainage perdu » ici).', 'Plus besoin : utilise l’onglet Joueurs'],
  ['verrouiller.cmd', 'Pose un compte à rebours (club fermé sauf l’équipe). Ne vide rien.', 'Plus besoin : utilise Outils → Verrou'],
  ['donner-secretes.cmd', 'Donne à Tom et Hugo un exemplaire des 23 cartes secrètes.', 'Pour tester les secrètes en ligne'],
  ['annonce-discord.cmd', 'Annonce @everyone sur Discord par le bot (simulation d’abord, puis GO).', 'Grosse annonce'],
  ['activer-notifications.cmd', 'Clés des notifications (une fois par déploiement Convex ; « prod » en argument pour la prod).', 'Une seule fois'],
];
const COMMANDES: Array<[string, string]> = [
  ['Cartes de test pour Tom', 'npx convex run admin:grantTestCards "{\\"name\\":\\"tom\\",\\"packs\\":40}"'],
  ['Tom et Hugo admins + modérateurs', 'npx convex run admin:setModerators'],
  ['Liste des bannis', 'npx convex run admin:bans'],
  ['Forcer le tirage de la roulette', 'npx convex run games:forceDraw'],
  ['Remettre un pot de base à la roulette', 'npx convex run games:seedRouletteCmd'],
  ['Bilan de la dernière remise à zéro', 'npx convex run launch:resetReport'],
];
async function viewOutils(v: HTMLElement) {
  const o = overview ?? (await loadOverview());
  const locked = o.launchAt && o.launchAt > Date.now();
  const base = CANAL === 'prod' ? 'https://cardgamepriv.pages.dev' : 'https://v2.cardgamepriv.pages.dev';
  v.innerHTML = `
    <div class="grid2">
      <form class="panel" data-ann>
        <h3>Notification à tout le monde</h3>
        <p class="muted small">${o.pushPlayers === null ? 'Les notifications ne sont pas encore sur cette version du jeu : préviens sur Discord.' : `${o.pushPlayers} joueur(s) ont activé les notifications${CANAL === 'v2' ? ' (staging : seulement l’équipe en pratique)' : ''}.`}</p>
        <input name="t" maxlength="60" placeholder="Titre (ex. Nouveau patch !)" required>
        <textarea name="b" maxlength="180" rows="2" placeholder="Message" required></textarea>
        <button class="btn accent" type="submit"${o.pushPlayers === null ? ' disabled' : ''}>Envoyer</button>
      </form>
      <form class="panel" data-gift>
        <h3>Cadeau à tout le monde</h3>
        <p class="muted small">Compensation après un bug, fête… Chaque joueur non banni reçoit le cadeau, avec le motif dans son portefeuille.</p>
        <div class="row"><label class="grow">Boosters<input name="packs" type="number" min="0" max="50" value="5"></label><label class="grow">Pièces<input name="coins" type="number" min="0" max="20000" value="0"></label></div>
        <input name="label" maxlength="80" placeholder="Motif (ex. Désolé pour la panne de ce soir)" required>
        <label class="check"><input name="active" type="checkbox"> Seulement les joueurs venus ces 7 derniers jours</label>
        <label class="check"><input name="notify" type="checkbox"${o.pushPlayers === null ? ' disabled' : ' checked'}> Les prévenir par notification</label>
        <button class="btn accent" type="submit">Offrir</button>
      </form>
      <form class="panel" data-lock>
        <h3>Verrou du club</h3>
        <p class="small">${locked ? `<b class="red">Verrouillé</b> jusqu’au ${esc(fullDate(o.launchAt!))} — seuls Tom et Hugo entrent, aucune inscription.` : '<b class="green">Ouvert</b> à tout le monde.'}</p>
        <input name="at" type="datetime-local">
        <div class="actions"><button class="btn" type="submit">Verrouiller jusqu’à cette heure</button>${locked ? '<button class="btn accent" type="button" data-open>Ouvrir maintenant</button>' : ''}</div>
      </form>
      <form class="panel" data-ref>
        <h3>Parrainage perdu</h3>
        <input name="p" placeholder="Pseudo du parrain" required><input name="f" placeholder="Pseudo du filleul" required>
        <button class="btn" type="submit">Rattacher</button>
      </form>
      <div class="panel" data-owners>
        <h3>Qui possède cette carte ?</h3>
        <div class="picker"></div>
        <div class="owners"></div>
      </div>
      <form class="panel" data-roul>
        <h3>Roulette</h3>
        <p class="muted small">Si la roulette reste bloquée : forcer le tirage en cours, ou remettre un pot de base.</p>
        <div class="actions"><button class="btn" type="button" data-draw>Forcer le tirage</button></div>
        <div class="row"><input name="coins" type="number" min="0" max="50000" value="3000"><button class="btn" type="submit">Remettre un pot</button></div>
      </form>
      <div class="panel">
        <h3>Entretien</h3>
        <div class="actions col">
          <button class="btn" type="button" data-ranks>Recalculer le classement maintenant</button>
          <button class="btn" type="button" data-discord>Donner le rôle Discord « Card » à tous</button>
          <button class="btn" type="button" data-export>Exporter la liste des joueurs (Excel)</button>
        </div>
      </div>
    </div>
    <h3>Lanceurs du PC <span class="muted small">(double-clic dans le dossier lanceurs\\, dans cet ordre selon le besoin)</span></h3>
    <div class="list">${LANCEURS.map(([f, d, w]) => `<div class="item lanceur"><header><code>${esc(f)}</code><span class="grow"></span><button class="btn sm ghost" data-copy="${esc(f)}">Copier</button></header><p>${esc(d)}</p><p class="muted small">Quand : ${esc(w)}</p></div>`).join('')}</div>
    <details><summary>Commandes Convex <span class="muted small">(terminal ouvert dans le dossier du jeu ; visent la prod ; pour le staging, ajoute --deployment et le nom du staging lu dans .env.v2.local)</span></summary>
    <div class="list">${COMMANDES.map(([l, c]) => `<div class="item cmd"><span>${esc(l)}</span><code>${esc(c)}</code><button class="btn sm ghost" data-copy="${esc(c)}">Copier</button></div>`).join('')}</div></details>
    <h3>Liens</h3>
    <div class="chips">
      <a class="chip" href="../jeu/">Le jeu</a>
      <a class="chip" href="https://v2.cardgamepriv.pages.dev/admin/">Admin V2</a>
      <a class="chip" href="https://cardgamepriv.pages.dev/admin/">Admin prod</a>
      <a class="chip" href="https://dashboard.convex.dev" target="_blank" rel="noopener">Convex</a>
      <a class="chip" href="https://dash.cloudflare.com" target="_blank" rel="noopener">Cloudflare</a>
      <a class="chip" href="${base}/version.json" target="_blank" rel="noopener">Version en ligne</a>
    </div>`;
  v.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach((b) => b.addEventListener('click', () => void copy(b.dataset.copy!)));
  const gift = $<HTMLFormElement>('[data-gift]', v);
  gift.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(gift);
    const packs = Number(fd.get('packs') || 0);
    const coins = Number(fd.get('coins') || 0);
    const who = fd.get('active') ? 'aux joueurs venus ces 7 jours' : 'à TOUS les joueurs';
    if (!confirm(`Offrir ${packs} booster(s) et ${coins} pièce(s) ${who} ?`)) return;
    void busy($<HTMLButtonElement>('button[type=submit]', gift), () => call(api.adminDash.giftAll, { packs, coins, label: String(fd.get('label')), ...(fd.get('active') ? { activeDays: 7 } : {}), notify: !!fd.get('notify') }), (r) => (gift.reset(), r));
  });
  const owners = $('[data-owners]', v);
  cardPicker($('.picker', owners), (cid) => {
    const box = $('.owners', owners);
    box.innerHTML = `<div class="cardline" data-card="${esc(cid)}"></div><p class="muted small">Recherche…</p>`;
    hydrateCards(box);
    void ask(api.adminDash.cardOwners, { cardId: cid }).then(
      (rows) =>
        (box.querySelector('p')!.outerHTML = rows.length
          ? `<ul class="feed">${rows.map((r) => `<li><b>${esc(r.name)}</b> ${rarTag(r.rarity)} × ${r.count} <span class="muted">n° ${r.mint}</span></li>`).join('')}</ul>`
          : '<p class="muted small">Personne ne l’a encore.</p>'),
      (e) => toast(errMsg(e), 'err'),
    );
  });
  const roul = $<HTMLFormElement>('[data-roul]', v);
  $('[data-draw]', roul).addEventListener('click', (e) => {
    if (confirm('Forcer le tirage de la roulette maintenant ?')) void busy(e.currentTarget as HTMLButtonElement, () => call(api.adminDash.rouletteDraw));
  });
  roul.addEventListener('submit', (e) => {
    e.preventDefault();
    const coins = Number(new FormData(roul).get('coins') || 0);
    if (confirm(`Ajouter un pot de ${coins} pièces (+ une carte du site) à la roulette ?`)) void busy($<HTMLButtonElement>('button[type=submit]', roul), () => call(api.adminDash.rouletteSeed, { coins }));
  });
  $('[data-export]', v).addEventListener('click', (e) =>
    void busy(e.currentTarget as HTMLButtonElement, async () => {
      const rows = await ask(api.adminDash.players);
      const cell = (x: unknown) => `"${String(x ?? '').replace(/"/g, '""')}"`;
      const head = ['Nom', 'Pseudo', 'Inscrit', 'Dernière visite', 'Réserve', 'Boosters ouverts', 'Pièces', 'Série', 'Parrain', 'Équipe', 'Banni'];
      const lines = rows.map((p) => [p.name, p.username, fullDate(p.createdAt), fullDate(p.lastSeenAt), p.packs, p.opened, p.coins, p.streak, p.referredBy, p.staff ? 'oui' : '', p.bannedAt ? p.banReason ?? 'oui' : ''].map(cell).join(';'));
      download(`joueurs-${new Date().toISOString().slice(0, 10)}.csv`, '\ufeff' + [head.map(cell).join(';'), ...lines].join('\r\n'));
      return `${rows.length} joueurs exportés.`;
    }),
  );
  const ann = $<HTMLFormElement>('[data-ann]', v);
  ann.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(ann);
    if (!confirm(`Envoyer « ${fd.get('t')} » à tous les joueurs ?`)) return;
    void busy($<HTMLButtonElement>('button', ann), () => call(api.adminDash.announce, { title: String(fd.get('t')), body: String(fd.get('b')) }), (r) => (ann.reset(), r));
  });
  const lock = $<HTMLFormElement>('[data-lock]', v);
  lock.addEventListener('submit', (e) => {
    e.preventDefault();
    const raw = String(new FormData(lock).get('at') ?? '');
    const at = raw ? new Date(raw).getTime() : NaN;
    if (!Number.isFinite(at)) return toast('Choisis une date et une heure.', 'err');
    if (!confirm(`Fermer le club jusqu’au ${fullDate(at)} ? Les joueurs verront le compte à rebours.`)) return;
    void busy($<HTMLButtonElement>('button[type=submit]', lock), () => call(api.adminDash.setLaunch, { at }), (r) => (void loadOverview().then(() => viewOutils(v)), r));
  });
  lock.querySelector<HTMLButtonElement>('[data-open]')?.addEventListener('click', (e) => void busy(e.currentTarget as HTMLButtonElement, () => call(api.adminDash.setLaunch, { at: null }), (r) => (void loadOverview().then(() => viewOutils(v)), r)));
  const ref = $<HTMLFormElement>('[data-ref]', v);
  ref.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(ref);
    void busy($<HTMLButtonElement>('button', ref), () => call(api.adminDash.linkReferral, { referrer: String(fd.get('p')), child: String(fd.get('f')) }));
  });
  $('[data-ranks]', v).addEventListener('click', (e) => void busy(e.currentTarget as HTMLButtonElement, () => run(api.adminDash.refreshRanks)));
  $('[data-discord]', v).addEventListener('click', (e) => void busy(e.currentTarget as HTMLButtonElement, () => run(api.adminDash.discordRoleAll)));
}

// ───────────────────────────── Journal ─────────────────────────────
async function viewJournal(v: HTMLElement) {
  const rows = await ask(api.adminDash.journal);
  v.innerHTML = `<p class="muted small">Tout ce que Tom et Hugo font depuis ce dashboard (les 150 dernières actions).</p>
    <ul class="feed log">${rows.map((r) => `<li><b>${esc(r.by)}</b> <span class="kind k-autre">${esc(r.action)}</span>${r.target ? ` → <b>${esc(r.target)}</b>` : ''} ${esc(r.detail)} <span class="muted">${when(r.at)}</span></li>`).join('') || '<li class="muted">Aucune action pour l’instant.</li>'}</ul>`;
}

// ───────────────────────────── Guide (tuto pour Tom et Hugo) ─────────────────────────────
const GUIDE: Array<{ id: string; title: string; body: string }> = [
  {
    id: 'acces',
    title: '1. Ouvrir le dashboard',
    body: `<ol>
      <li>Connecte-toi au jeu avec <b>ton</b> compte (Tom ou Hugo) : <a href="https://cardgamepriv.pages.dev/jeu/">cardgamepriv.pages.dev/jeu</a>.</li>
      <li>Ouvre <a href="https://cardgamepriv.pages.dev/admin/"><b>cardgamepriv.pages.dev/admin</b></a> sur le même téléphone ou le même navigateur. Ajoute-le à l’écran d’accueil ou en favori.</li>
      <li>En haut, le badge rouge <b>PROD · vrais joueurs</b> veut dire que tout ce que tu fais touche les vrais comptes. Le badge jaune <b>V2 · test</b>, c’est le lien de test : rien n’y compte.</li>
    </ol>
    <p>Il marche tout seul, sans Claude et sans le PC : il fait partie du site en ligne.</p>`,
  },
  {
    id: 'jour',
    title: '2. Chaque jour (2 minutes)',
    body: `<ol>
      <li><b>Accueil</b> → « À traiter » : les cases colorées montrent ce qui attend. Touche une case pour y aller.</li>
      <li><b>Retours</b> : lis chaque nouveau message. Écris une réponse dans le champ (le joueur la voit dans « Mes suggestions »), puis touche un statut : <i>Vue</i>, <i>Acceptée</i>, <i>Traitée</i> ou <i>Refusée</i>.</li>
      <li>Une carte signalée (mauvaise photo, nom…) → bouton <b>→ Cartes à corriger</b>. La liste est partagée entre vous deux. « Exporter pour Excel » donne le fichier à corriger.</li>
      <li>Un bug à me faire réparer → bouton <b>Copier</b>, puis colle le texte à Claude : tout y est (page, téléphone, message, capture).</li>
      <li><b>Alertes</b> (s’il y en a) : <i>Légitime</i> si c’est normal entre potes, <i>À surveiller</i> sinon.</li>
    </ol>`,
  },
  {
    id: 'joueur',
    title: '3. Un joueur a un souci',
    body: `<p>Onglet <b>Joueurs</b> → cherche son nom → touche-le : sa fiche s’ouvre avec toutes les actions.</p>
    <table class="howto">
      <tr><td>« Je n’ai pas reçu mes boosters / mes pièces »</td><td>Fiche → <b>Boosters</b> ou <b>Pièces</b> → Donner.</td></tr>
      <tr><td>« Mon lien de parrainage n’a pas marché »</td><td>Fiche du <b>filleul</b> → Parrainage perdu → pseudo du parrain → Rattacher.</td></tr>
      <tr><td>« J’ai oublié mon mot de passe »</td><td>Compte pseudo : fiche → Mot de passe → choisis-en un et donne-le-lui en privé. Compte Discord : rien à faire, il se reconnecte avec Discord.</td></tr>
      <tr><td>« Le jeu est bizarre / bloqué chez moi »</td><td>Dis-lui : menu du profil → <b>Réparer et mettre à jour</b>. Si ça ne suffit pas : fiche → <b>Le déconnecter partout</b> (rien n’est perdu).</td></tr>
      <tr><td>« Mon échange est bloqué »</td><td>Fiche → <b>Annuler ses échanges en attente</b>. Les cartes redeviennent libres.</td></tr>
      <tr><td>Une carte en double à cause d’un bug</td><td>Fiche → Sa collection → cherche la carte → <b>Retirer…</b> (avec une raison).</td></tr>
      <tr><td>Il lui manque une carte promise</td><td>Fiche → <b>Donner une carte</b> → cherche-la → rareté → Donner.</td></tr>
      <tr><td>Double compte, triche, compte squatté</td><td>Regarde d’abord <b>Alertes</b>. Puis fiche → <b>Bannir</b> avec une raison. C’est réversible : <b>Rétablir le compte</b>.</td></tr>
      <tr><td>Retenir quelque chose sur lui (ex. il a payé)</td><td>Fiche → <b>Notes de l’équipe</b>. Le joueur ne les voit jamais.</td></tr>
      <tr><td>Savoir qui a une carte</td><td>Outils → <b>Qui possède cette carte ?</b></td></tr>
    </table>`,
  },
  {
    id: 'urgence',
    title: '4. URGENCE : le jeu est cassé pour tout le monde',
    body: `<ol>
      <li><b>Fermer le club</b> : Outils → Verrou du club → mets une heure (dans 1 ou 2 h) → Verrouiller. Les joueurs voient un compte à rebours. Vous deux, vous entrez toujours.</li>
      <li><b>Prévenir</b> : un message sur le Discord des Bébous (et Outils → Notification à tout le monde, quand elle est disponible).</li>
      <li><b>Réparer</b> :
        <ul>
          <li>Avec Claude : colle-lui le problème (onglet Retours → Copier).</li>
          <li><b>Sans Claude</b>, revenir à la version d’avant (PC de Tom) : dans le dossier <code>cardgamepriv\\.wt-master</code>, clic droit → <i>Ouvrir dans le terminal</i>, tape <code>git tag</code> pour voir les versions, puis <code>git reset --hard v1.0.13</code> (la dernière qui marchait — garde v1.0.13 ou plus récent pour garder ce dashboard). Ensuite double-clic sur <code>lanceurs\\mettre-en-ligne-prod.cmd</code> dans ce même dossier.</li>
        </ul></li>
      <li><b>Rouvrir</b> : Outils → Verrou du club → <b>Ouvrir maintenant</b>.</li>
      <li><b>Dédommager</b> si besoin : Outils → <b>Cadeau à tout le monde</b> (ex. 5 boosters, « Désolé pour la panne »).</li>
    </ol>
    <p class="muted">Une sauvegarde complète de la base des joueurs est faite avant chaque patch (<code>sauvegardes\\avant-patch-…zip</code>) : pour la remettre, demande à Claude (voir docs/V1.md).</p>`,
  },
  {
    id: 'sans',
    title: '5. Ce qu’on peut faire sans Claude, et ce qui demande du code',
    body: `<table class="howto">
      <tr><td><b>Ici, sans Claude</b></td><td>Joueurs (boosters, pièces, cartes, bans, mots de passe, parrainages, déconnexion, échanges), retours, cartes à corriger, sondage, alertes, cadeau à tous, verrou du club, roulette, classement, rôle Discord.</td></tr>
      <tr><td><b>Lanceurs du PC</b></td><td>Mettre en ligne, sauvegarder, revenir en arrière (voir Outils → Lanceurs du PC).</td></tr>
      <tr><td><b>Avec du code</b></td><td>Changer une image ou une carte du catalogue, corriger un bug, ajouter une fonction. Garde la liste dans « Cartes à corriger » et les bugs dans « Retours » : tout sera prêt pour la prochaine session.</td></tr>
    </table>`,
  },
  {
    id: 'bon',
    title: '6. Bon à savoir',
    body: `<ul>
      <li>Tout ce que vous faites ici est noté dans <b>Journal</b> (qui, quoi, quand).</li>
      <li>Les actions qui touchent tout le monde (cadeau, verrou, notification) demandent toujours une confirmation.</li>
      <li>Le bouton ↻ en haut actualise. L’accueil se met à jour tout seul chaque minute.</li>
      <li>Si la page dit « Session expirée » : reconnecte-toi dans le jeu, puis reviens.</li>
    </ul>`,
  },
];
async function viewGuide(v: HTMLElement, sub: string) {
  try {
    localStorage.setItem('bebou.admin.guide', '1');
  } catch {
    /* rien */
  }
  v.innerHTML = `<div class="guide"><h2>Mode d’emploi — Tom et Hugo</h2>
    ${GUIDE.map((g) => `<details id="g-${g.id}"${g.id === sub || (!sub && g.id === 'acces') ? ' open' : ''}${g.id === 'urgence' ? ' class="urg"' : ''}><summary>${esc(g.title)}</summary><div class="g-body">${g.body}</div></details>`).join('')}</div>`;
  if (sub) document.getElementById(`g-${sub}`)?.scrollIntoView({ block: 'start' });
}

const VIEWS: Record<Tab, (v: HTMLElement, sub: string) => Promise<void>> = {
  accueil: viewAccueil,
  retours: viewRetours,
  cartes: viewCartes,
  joueurs: viewJoueurs,
  alertes: viewAlertes,
  outils: viewOutils,
  journal: viewJournal,
  guide: viewGuide,
};

// ───────────────────────────── démarrage ─────────────────────────────
function gate(title: string, text: string) {
  app.innerHTML = `<div class="gate"><h1>${esc(title)}</h1><p>${text}</p><a class="btn accent" href="../jeu/">Aller au jeu</a></div>`;
}
async function boot() {
  if (!client) return gate('Pas de serveur', 'Ce build n’a pas d’adresse Convex (VITE_CONVEX_URL).');
  if (!token) return gate('Connecte-toi d’abord', 'Ouvre le jeu sur ce même site, connecte-toi avec ton compte (Tom ou Hugo), puis reviens sur cette page.');
  let me: FunctionReturnType<typeof api.adminDash.whoami>;
  try {
    me = await client.query(api.adminDash.whoami, { sessionToken: token });
  } catch (e) {
    return gate('Serveur injoignable', esc(errMsg(e)) + (CANAL === 'prod' ? '<br><small>Si le dashboard vient d’arriver, il sera en prod au prochain patch.</small>' : ''));
  }
  if (!me.ok) return me.reason === 'login' ? gate('Session expirée', 'Reconnecte-toi dans le jeu, puis reviens ici.') : gate('Accès réservé', `Ce dashboard est réservé à Tom et Hugo${me.name ? ` (tu es connecté en tant que ${esc(me.name)})` : ''}.`);
  shell(me);
  addEventListener('hashchange', () => {
    closeSheet();
    void route();
  });
  await route();
  if (current !== 'accueil') void loadOverview().catch(() => undefined); // pastilles des onglets
  // l'accueil se tient à jour tout seul (toutes les minutes, onglet visible) ; ailleurs : bouton ↻
  setInterval(() => {
    if (document.visibilityState === 'visible' && current === 'accueil' && $('#sheet').hidden) void route();
  }, 60_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void loadOverview().catch(() => undefined);
  });
}
void boot();
