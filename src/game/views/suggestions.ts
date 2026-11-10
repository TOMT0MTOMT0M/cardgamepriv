import type { GameBackend, SuggestionKind, SuggestionStatus, SuggestionView } from '../backend';
import type { Shell } from '../shell';
import { THEMES, catalogEntry, subthemeById } from '../../core/sets/themes';
import { busyButton, errMsg, esc, fold, h, plural, thumbUrl, toast } from '../ui';
import { SURVEY_FEATURES, SURVEY_ID, SURVEY_UNIVERSES, type SurveyOption } from '../../core/survey';

/**
 * SUGGESTIONS (#/suggestions, onglet de la navigation — 04/11) : chaque joueur peut nous envoyer proprement
 *  - un BUG (description + capture d'écran facultative),
 *  - une MODIFICATION DE DESIGN d'une carte (la carte, ce qui ne va pas, le lien ou le fichier d'une image proposée),
 *  - une demande d'AJOUT de carte / de série (anime, joueur, jeu…),
 *  - une autre suggestion libre.
 * En dessous : ses envois et leur statut. Admin (users.isAdmin) : la file complète, filtrable, avec les statuts
 * nouvelle / vue / acceptée / refusée / traitée et une note.
 */
export interface SuggestionsView {
  el: HTMLElement;
  enter(): void;
  leave(): void;
}

const KINDS: Array<[SuggestionKind, string, string]> = [
  ['bug', 'Un bug', 'Quelque chose ne marche pas'],
  ['design', 'Le design d’une carte', 'Mauvaise photo, nom, étoiles…'],
  ['ajout', 'Ajouter des cartes', 'Un anime, un joueur, un jeu…'],
  ['autre', 'Autre idée', 'Tout le reste'],
];
const STATUS: Record<SuggestionStatus, string> = { nouvelle: 'Nouvelle', vue: 'Vue', acceptee: 'Acceptée', refusee: 'Refusée', traitee: 'Traitée' };
const CATS = ['Anime / manga', 'Film / série', 'Jeu vidéo', 'Sportif / équipe', 'Musique', 'Autre'];
const IMG_MAX = 6 * 1024 * 1024;

/** toutes les cartes cherchables (nom + sous-thème), construit à la première recherche */
let index: Array<{ id: string; key: string }> | null = null;
function searchCards(q: string): string[] {
  index ??= THEMES.flatMap((t) => t.cards.map((c) => ({ id: c.id, key: fold(`${c.name} ${subthemeById(c.subthemeId)?.label ?? ''}`) })));
  const f = fold(q.trim());
  if (f.length < 2) return [];
  const words = f.split(/\s+/);
  const out: string[] = [];
  for (const c of index) {
    if (words.every((w) => c.key.includes(w))) out.push(c.id);
    if (out.length >= 8) break;
  }
  return out;
}

export function createSuggestionsView(backend: GameBackend, shell: Shell): SuggestionsView {
  const el = h('section', 'view suggestions');
  el.innerHTML = `
    <div class="sg-wrap">
      <header class="sg-head"><span class="kicker">SUGGESTIONS</span><h1>Dis-nous tout</h1>
        <p class="muted">Un bug, une carte à refaire, une série à ajouter, une idée : écris-le ici plutôt qu’à l’oral, on lit tout et tu suis où ça en est juste en dessous.</p></header>
      <div class="sg-tabs seg" role="tablist"><button class="on" data-tab="send">Envoyer</button><button data-tab="mine">Mes suggestions</button><button data-tab="admin" hidden>File admin</button></div>
      <form class="sg-form" novalidate>
        <fieldset class="sg-kinds"><legend>C’est à propos de…</legend>
          ${KINDS.map(([k, l, d], i) => `<label class="sg-kind"><input type="radio" name="kind" value="${k}"${i === 0 ? ' checked' : ''}><b>${l}</b><small>${d}</small></label>`).join('')}
        </fieldset>
        <div class="sg-f sg-card" data-for="design">
          <label for="sg-card-q">Quelle carte ?</label>
          <input id="sg-card-q" type="search" autocomplete="off" placeholder="Nom de la carte (ex. Mewtwo, Zidane…)">
          <div class="sg-hits" role="listbox"></div>
          <div class="sg-picked" hidden></div>
        </div>
        <div class="sg-f" data-for="ajout">
          <label for="sg-cat">Catégorie</label>
          <select id="sg-cat">${CATS.map((c) => `<option>${c}</option>`).join('')}</select>
        </div>
        <div class="sg-f">
          <label for="sg-text" class="sg-text-l">Décris le bug : où, quand, ce qui se passe</label>
          <textarea id="sg-text" rows="5" maxlength="3000" placeholder=""></textarea>
        </div>
        <div class="sg-f" data-for="design ajout">
          <label for="sg-url">Lien d’une image proposée <small>(facultatif)</small></label>
          <input id="sg-url" type="url" inputmode="url" placeholder="https://…">
        </div>
        <div class="sg-f" data-for="bug design">
          <label class="sg-file-l">Capture d’écran ou image <small>(facultatif, 6 Mo max)</small></label>
          <div class="sg-file"><button type="button" class="btn-ghost sg-pick">Choisir une image</button><input type="file" accept="image/*" hidden><span class="sg-file-n muted"></span><button type="button" class="sg-file-x" hidden aria-label="Retirer l’image">✕</button></div>
          <img class="sg-preview" alt="" hidden>
        </div>
        <div class="sg-send"><button type="submit" class="btn-primary">Envoyer</button></div>
      </form>
      <div class="sg-mine" hidden></div>
      <div class="sg-admin" hidden>
        <details class="sg-survey"><summary>Sondage « prochaines mises à jour » <em class="sg-sv-n"></em></summary><div class="sg-sv-body"><p class="muted">Chargement…</p></div></details>
        <div class="sg-filters seg"></div>
        <div class="sg-list"></div>
      </div>
    </div>`;
  const $ = <T extends HTMLElement>(s: string) => el.querySelector<T>(s)!;
  const form = $<HTMLFormElement>('.sg-form');
  const text = $<HTMLTextAreaElement>('#sg-text');
  const url = $<HTMLInputElement>('#sg-url');
  const cat = $<HTMLSelectElement>('#sg-cat');
  const q = $<HTMLInputElement>('#sg-card-q');
  const hits = $('.sg-hits');
  const picked = $('.sg-picked');
  const fileIn = $<HTMLInputElement>('.sg-file input');
  const fileN = $('.sg-file-n');
  const fileX = $('.sg-file-x');
  const preview = $<HTMLImageElement>('.sg-preview');
  let cardId: string | undefined;
  let file: File | null = null;
  let tab: 'send' | 'mine' | 'admin' = 'send';
  let adminStatus: SuggestionStatus | undefined = 'nouvelle';

  const kind = () => (form.querySelector<HTMLInputElement>('input[name=kind]:checked')?.value ?? 'bug') as SuggestionKind;
  const PROMPTS: Record<SuggestionKind, [string, string]> = {
    bug: ['Décris le bug : où, quand, ce qui se passe', 'Ex. : dans la collection sur téléphone, quand j’ouvre une carte, l’écran devient noir…'],
    design: ['Qu’est-ce qui ne va pas sur cette carte ?', 'Ex. : la photo montre un autre joueur, le nom est mal écrit, elle mérite plus d’étoiles…'],
    ajout: ['Qu’est-ce qu’on devrait ajouter ?', 'Ex. : la série Arcane (Jinx, Vi, Silco…), le joueur Kylian Mbappé, le jeu Hades…'],
    autre: ['Ton idée', 'Tout ce qui pourrait rendre le jeu meilleur'],
  };
  function syncKind() {
    const k = kind();
    el.querySelectorAll<HTMLElement>('.sg-f[data-for]').forEach((f) => (f.hidden = !f.dataset.for!.split(' ').includes(k)));
    $('.sg-text-l').textContent = PROMPTS[k][0];
    text.placeholder = PROMPTS[k][1];
    el.querySelectorAll('.sg-kind').forEach((l) => l.classList.toggle('on', (l.querySelector('input') as HTMLInputElement).checked));
  }
  form.addEventListener('change', (e) => (e.target as HTMLElement).matches('input[name=kind]') && syncKind());

  // ── recherche de la carte (design)
  let qt = 0;
  q.addEventListener('input', () => {
    clearTimeout(qt);
    qt = window.setTimeout(() => {
      const ids = searchCards(q.value);
      hits.innerHTML = ids
        .map((id) => {
          const e = catalogEntry(id)!;
          return `<button type="button" class="sg-hit" data-id="${id}"><img alt="" loading="lazy" src="${thumbUrl(e)}"><span><b>${esc(e.name)}</b><small>${esc(subthemeById(e.subthemeId)?.label ?? '')}</small></span></button>`;
        })
        .join('');
    }, 120);
  });
  hits.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('.sg-hit');
    if (b) pick(b.dataset.id!);
  });
  function pick(id?: string) {
    cardId = id;
    const e = id ? catalogEntry(id) : undefined;
    picked.hidden = !e;
    q.hidden = !!e;
    hits.innerHTML = '';
    if (e) picked.innerHTML = `<img alt="" src="${thumbUrl(e)}"><span><b>${esc(e.name)}</b><small>${esc(subthemeById(e.subthemeId)?.label ?? '')}</small></span><button type="button" class="sg-unpick" aria-label="Changer de carte">Changer</button>`;
  }
  picked.addEventListener('click', (e) => (e.target as HTMLElement).closest('.sg-unpick') && (pick(), (q.value = ''), q.focus()));

  // ── image jointe
  $('.sg-pick').addEventListener('click', () => fileIn.click());
  fileIn.addEventListener('change', () => setFile(fileIn.files?.[0] ?? null));
  fileX.addEventListener('click', () => setFile(null));
  function setFile(f: File | null) {
    if (f && (!f.type.startsWith('image/') || f.size > IMG_MAX)) {
      toast('Image refusée : une capture (PNG, JPG, WebP, GIF) de 6 Mo au plus.', 'err');
      f = null;
    }
    file = f;
    fileIn.value = '';
    fileN.textContent = f ? f.name : '';
    fileX.hidden = !f;
    if (preview.src) URL.revokeObjectURL(preview.src);
    preview.hidden = !f;
    if (f) preview.src = URL.createObjectURL(f);
    else preview.removeAttribute('src');
  }
  // coller une capture (Ctrl+V / Cmd+V) dans le formulaire
  form.addEventListener('paste', (e) => {
    const it = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'));
    const f = it?.getAsFile();
    if (f && (kind() === 'bug' || kind() === 'design')) setFile(f);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector<HTMLButtonElement>('button[type=submit]')!;
    const k = kind();
    const t = text.value.trim();
    const link = url.value.trim();
    if (k === 'design' && !cardId) return toast('Choisis d’abord la carte concernée.', 'err');
    if (!t && !(k === 'design' && (link || file))) return toast('Écris quelques mots : qu’est-ce qui ne va pas, ou que proposes-tu ?', 'err');
    if (link && !/^https?:\/\/\S+$/i.test(link)) return toast('Le lien de l’image doit commencer par http:// ou https://.', 'err');
    try {
      await busyButton(
        btn,
        backend.submitSuggestion(
          { kind: k, text: t, cardId: k === 'design' ? cardId : undefined, imageUrl: k === 'design' || k === 'ajout' ? link || undefined : undefined, category: k === 'ajout' ? cat.value : undefined, page: location.hash },
          k === 'bug' || k === 'design' ? file : null,
        ),
      );
      toast('Merci ! Ta suggestion est arrivée.', 'ok');
      text.value = '';
      url.value = '';
      q.value = '';
      pick();
      setFile(null);
      setTab('mine');
    } catch (err) {
      toast(errMsg(err), 'err');
    }
  });

  // ── onglets
  el.querySelector('.sg-tabs')!.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button[data-tab]');
    if (b) setTab(b.dataset.tab as typeof tab);
  });
  function setTab(t: typeof tab) {
    tab = t;
    el.querySelectorAll<HTMLElement>('.sg-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
    form.hidden = t !== 'send';
    $('.sg-mine').hidden = t !== 'mine';
    $('.sg-admin').hidden = t !== 'admin';
    if (t === 'mine') void loadMine();
    if (t === 'admin') void loadAdmin();
  }

  const when = (ms: number) => new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  function itemHtml(s: SuggestionView, admin: boolean) {
    const e = s.cardId ? catalogEntry(s.cardId) : undefined;
    const kindL = KINDS.find((k) => k[0] === s.kind)?.[1] ?? s.kind;
    return `<article class="sg-item st-${s.status}" data-id="${s.id}">
      <header><span class="sg-k">${kindL}${s.category ? ` · ${esc(s.category)}` : ''}</span><span class="sg-st">${STATUS[s.status]}</span><time>${when(s.createdAt)}</time>${admin && s.author ? `<span class="sg-a">${esc(s.author)}</span>` : ''}</header>
      ${e ? `<div class="sg-cardref"><img alt="" src="${thumbUrl(e)}"><span><b>${esc(e.name)}</b><small>${esc(subthemeById(e.subthemeId)?.label ?? '')} · ${esc(s.cardId!)}</small></span></div>` : ''}
      ${s.text ? `<p>${esc(s.text).replace(/\n/g, '<br>')}</p>` : ''}
      ${s.imageUrl ? `<p class="sg-link">Image proposée : <a href="${esc(s.imageUrl)}" target="_blank" rel="noopener noreferrer nofollow">${esc(s.imageUrl.length > 70 ? s.imageUrl.slice(0, 70) + '…' : s.imageUrl)}</a></p>` : ''}
      ${s.screenshotUrl ? `<a class="sg-shot" href="${esc(s.screenshotUrl)}" target="_blank" rel="noopener"><img alt="Capture jointe" loading="lazy" src="${esc(s.screenshotUrl)}"></a>` : ''}
      ${s.adminNote ? `<p class="sg-note"><b>Réponse :</b> ${esc(s.adminNote)}</p>` : ''}
      ${admin ? `<div class="sg-adm">${(Object.keys(STATUS) as SuggestionStatus[]).map((k) => `<button type="button" data-st="${k}" class="${k === s.status ? 'on' : ''}">${STATUS[k]}</button>`).join('')}<input class="sg-note-in" placeholder="Réponse au joueur (facultatif)" maxlength="500" value="${esc(s.adminNote ?? '')}"></div>${s.page || s.ua ? `<small class="sg-meta">${esc(s.page ?? '')} · ${esc(s.ua ?? '')}</small>` : ''}` : ''}
    </article>`;
  }
  async function loadMine() {
    const box = $('.sg-mine');
    box.innerHTML = '<p class="muted">Chargement…</p>';
    try {
      const list = await backend.mySuggestions();
      box.innerHTML = list.length ? list.map((s) => itemHtml(s, false)).join('') : '<p class="muted sg-empty">Tu n’as encore rien envoyé.</p>';
    } catch (err) {
      box.innerHTML = `<p class="muted">${esc(errMsg(err))}</p>`;
    }
  }
  /** (v1.0.10) résultats du sondage, en tête de la file admin */
  async function loadSurvey() {
    const body = $('.sg-sv-body');
    try {
      const r = await backend.surveyResults(SURVEY_ID);
      $('.sg-sv-n').textContent = plural(r.total, 'réponse');
      const voters = r.ratings.reduce((a, b) => a + b, 0);
      const avg = voters ? r.ratings.reduce((a, n, i) => a + n * (i + 1), 0) / voters : 0;
      const bars = (title: string, opts: SurveyOption[], counts: Record<string, number>) => {
        const rows = opts.map((o) => ({ o, n: counts[o.id] ?? 0 })).sort((a, b) => b.n - a.n);
        const max = Math.max(1, ...rows.map((x) => x.n));
        return `<h3>${title}</h3><ol class="sg-sv-bars">${rows.map(({ o, n }) => `<li><span>${esc(o.label)}</span><i style="--w:${(n / max) * 100}%"></i><b>${n}</b></li>`).join('')}</ol>`;
      };
      body.innerHTML = r.total
        ? `<p class="sg-sv-avg">Note moyenne <b>${avg.toFixed(1).replace('.', ',')} / 5</b> <span class="muted">(${plural(voters, 'note')} · ${r.ratings.map((n, i) => `${i + 1}★ ${n}`).join(' · ')})</span></p>
          ${bars('Univers demandés', SURVEY_UNIVERSES, r.universes)}
          ${bars('Nouveautés demandées', SURVEY_FEATURES, r.features)}
          ${r.texts.length ? `<h3>Réponses écrites</h3>${r.texts.map((x) => `<article class="sg-item"><header><span class="sg-k">${esc(x.author)}</span>${x.rating ? `<span class="sg-st">${x.rating}★</span>` : ''}<time>${when(x.createdAt)}</time></header>${x.names ? `<p><b>Noms :</b> ${esc(x.names)}</p>` : ''}${x.comment ? `<p>${esc(x.comment).replace(/\n/g, '<br>')}</p>` : ''}</article>`).join('')}` : ''}`
        : '<p class="muted sg-empty">Pas encore de réponse.</p>';
    } catch (err) {
      body.innerHTML = `<p class="muted">${esc(errMsg(err))}</p>`;
    }
  }
  async function loadAdmin() {
    void loadSurvey();
    const list = $('.sg-list');
    list.innerHTML = '<p class="muted">Chargement…</p>';
    try {
      const r = await backend.adminSuggestions(adminStatus);
      $('.sg-filters').innerHTML = [`<button data-f="" class="${!adminStatus ? 'on' : ''}">Toutes</button>`, ...(Object.keys(STATUS) as SuggestionStatus[]).map((k) => `<button data-f="${k}" class="${adminStatus === k ? 'on' : ''}">${STATUS[k]} <em>${r.counts[k]}</em></button>`)].join('');
      list.innerHTML = r.items.length ? r.items.map((s) => itemHtml(s, true)).join('') : '<p class="muted sg-empty">Rien ici.</p>';
    } catch (err) {
      list.innerHTML = `<p class="muted">${esc(errMsg(err))}</p>`;
    }
  }
  $('.sg-filters').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button[data-f]');
    if (!b) return;
    adminStatus = (b.dataset.f || undefined) as SuggestionStatus | undefined;
    void loadAdmin();
  });
  $('.sg-list').addEventListener('click', async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-st]');
    if (!b) return;
    const item = b.closest<HTMLElement>('.sg-item')!;
    const note = item.querySelector<HTMLInputElement>('.sg-note-in')?.value ?? '';
    try {
      await busyButton(b, backend.setSuggestionStatus(item.dataset.id!, b.dataset.st as SuggestionStatus, note));
      void loadAdmin();
    } catch (err) {
      toast(errMsg(err), 'err');
    }
  });

  syncKind();
  return {
    el,
    enter() {
      shell.show(null);
      shell.setDimmed(true);
      $<HTMLElement>('.sg-tabs button[data-tab=admin]').hidden = !(backend.eco.snapshot?.isAdmin || backend.eco.snapshot?.isModerator);
      if (tab === 'mine') void loadMine();
      if (tab === 'admin') void loadAdmin();
    },
    leave() {},
  };
}
