import './evenements.css';
import type { FunctionReturnType } from 'convex/server';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

/**
 * DASHBOARD — onglet « Événements » (V2, 11/11) : le booster du moment (convex/events.ts, src/core/events.ts).
 * Créer, modifier, sortir maintenant, terminer, supprimer avant la sortie ; contenu = sous-thèmes (ou groupes) et / ou
 * cartes une à une ; aperçu du sachet, du bandeau de la boutique et du tirage (cartes par étoile, chance d'une 6★).
 * Les règles (un seul à la fois, 60 jours max, pas de secrète) sont vérifiées par le serveur ; l'aperçu les applique
 * déjà pour prévenir avant d'enregistrer. Le catalogue et les règles sont chargés à la demande (pas dans l'accueil).
 */

type Ev = FunctionReturnType<typeof api.events.adminList>[number];
type Cat = typeof import('../core/sets/themes');

export interface AdminCtx {
  ask<T>(f: unknown, args?: object): Promise<T>;
  call<T>(f: unknown, args?: object): Promise<T>;
  busy<T>(btn: HTMLButtonElement | null, fn: () => Promise<T>, ok?: (r: T) => string | void): Promise<T | undefined>;
  esc(s: unknown): string;
  fullDate(at: number): string;
  catalog(): Promise<Cat>;
  cardPicker(root: HTMLElement, onPick: (id: string) => void): void;
  hydrateCards(root: ParentNode): void;
  openSheet(html: string): HTMLElement;
  closeSheet(): void;
}

const STATUS: Record<Ev['status'], [string, string]> = { avenir: ['À venir', 'ev-st-soon'], encours: ['En cours', 'ev-st-live'], fini: ['Fini', 'ev-st-done'] };
const STARS: Array<[string, string]> = [['common', '1★'], ['uncommon', '2★'], ['rare', '3★'], ['epic', '4★'], ['legendary', '5★'], ['mythic', '6★']];
const H = 3_600_000;

/** <input type="datetime-local"> ⇄ instant (heure de l'appareil : Tom et Hugo sont en France) */
const toLocal = (t: number) => {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fromLocal = (s: string) => (s ? new Date(s).getTime() : NaN);

export async function viewEvenements(v: HTMLElement, x: AdminCtx) {
  const { esc } = x;
  const [list, ev, cat] = await Promise.all([x.ask<Ev[]>(api.events.adminList), import('../core/events'), x.catalog()]);
  const live = list.find((e) => e.status === 'encours');
  const row = (e: Ev) => `
    <li class="ev-row" data-id="${esc(e.id)}" style="--ev:${esc(e.accent)}">
      <i class="ev-sw" aria-hidden="true"></i>
      <div class="grow">
        <b>${esc(e.name)}</b> <span class="ev-st ${STATUS[e.status][1]}">${STATUS[e.status][0]}</span>
        <div class="small muted">${esc(x.fullDate(e.startAt))} → ${esc(x.fullDate(e.endAt))} · ${e.count} cartes · ${esc(e.label)}</div>
        ${e.blurb ? `<div class="small">${esc(e.blurb)}</div>` : ''}
      </div>
      <div class="actions">
        <button class="btn sm" type="button" data-edit>Modifier</button>
        ${e.status === 'avenir' ? '<button class="btn sm accent" type="button" data-start>Sortir maintenant</button><button class="btn sm ghost" type="button" data-del>Supprimer</button>' : ''}
        ${e.status === 'encours' ? '<button class="btn sm red" type="button" data-end>Terminer</button>' : ''}
      </div>
    </li>`;
  v.innerHTML = `
    <div class="panel ev-head">
      <div class="grow">
        <h3>Booster du moment</h3>
        <p class="small muted">Chaque arrivée de cartes peut sortir comme un booster à durée limitée, en tête de la boutique. Mêmes taux que les autres boosters (pity et god pack compris), coût : 1 booster de la réserve. Ses cartes restent aussi dans les boosters habituels. Un seul à la fois. Notification à tous au début.</p>
        <p class="small">${live ? `En ce moment : <b>${esc(live.name)}</b>, jusqu’au ${esc(x.fullDate(live.endAt))}.` : 'Aucun événement en cours : la boutique ne montre rien de plus.'}</p>
      </div>
      <button class="btn accent" type="button" data-new>Nouvel événement</button>
    </div>
    ${list.length ? `<ul class="list ev-list">${list.map(row).join('')}</ul>` : '<p class="empty">Pas encore d’événement.</p>'}`;
  const reload = () => viewEvenements(v, x);
  v.querySelector<HTMLButtonElement>('[data-new]')!.addEventListener('click', () => openForm(null));
  for (const li of v.querySelectorAll<HTMLElement>('.ev-row')) {
    const e = list.find((r) => r.id === li.dataset.id)!;
    const id = e.id as Id<'packEvents'>;
    li.querySelector('[data-edit]')?.addEventListener('click', () => openForm(e));
    li.querySelector<HTMLButtonElement>('[data-start]')?.addEventListener('click', async (b) => {
      if (!confirm(`Sortir « ${e.name} » maintenant ? Tous les joueurs reçoivent la notification.`)) return;
      if (await x.busy(b.currentTarget as HTMLButtonElement, () => x.call<string>(api.events.adminStartNow, { id }))) void reload();
    });
    li.querySelector<HTMLButtonElement>('[data-end]')?.addEventListener('click', async (b) => {
      if (!confirm(`Terminer « ${e.name} » maintenant ? Il disparaît de la boutique (les boosters déjà tirés restent ouvrables).`)) return;
      if (await x.busy(b.currentTarget as HTMLButtonElement, () => x.call<string>(api.events.adminEndNow, { id }))) void reload();
    });
    li.querySelector<HTMLButtonElement>('[data-del]')?.addEventListener('click', async (b) => {
      if (!confirm(`Supprimer « ${e.name} » ? Il n’est pas encore sorti.`)) return;
      if (await x.busy(b.currentTarget as HTMLButtonElement, () => x.call<string>(api.events.adminRemove, { id }))) void reload();
    });
  }

  // ── formulaire (feuille) : création ou modification, avec aperçu en direct
  function openForm(e: Ev | null) {
    const now = Date.now();
    const start0 = e?.startAt ?? Math.ceil(now / H) * H;
    const end0 = e?.endAt ?? start0 + 72 * H;
    const st = { subthemes: [...(e?.subthemes ?? [])], cards: [...(e?.cards ?? [])], accent: e?.accent ?? ev.EVENT_ACCENTS[0][0] };
    // sous-thèmes et groupes choisissables (tous les thèmes publics)
    const scopes = cat.THEMES.filter((t) => !t.secret).flatMap((t) => cat.subthemeViews(t).filter((sv) => sv.cards.length).map((sv) => ({ id: sv.id, label: sv.label, theme: t.label, n: sv.cards.length, key: `${sv.label} ${t.label}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() })));
    const sheet = x.openSheet(`
      <div class="sheet-head"><div><h2>${e ? `Modifier « ${esc(e.name)} »` : 'Nouvel événement'}</h2><p class="small muted">${e?.status === 'encours' ? 'En cours : les changements arrivent tout de suite chez les joueurs.' : 'Il sortira tout seul à la date de début (notification à tous).'}</p></div></div>
      <form class="ev-form" novalidate>
        <div class="ev-cols">
          <div class="ev-fields">
            <label>Nom (moulé sur le sachet)<input name="name" maxlength="${ev.EVENT_LIMITS.name}" required value="${esc(e?.name ?? '')}" placeholder="ex. Coupe du monde"></label>
            <label>Phrase (facultative)<input name="blurb" maxlength="${ev.EVENT_LIMITS.blurb}" value="${esc(e?.blurb ?? '')}" placeholder="ex. Les 48 sélections, pour 3 jours"></label>
            <div class="row"><label class="grow">Début<input name="start" type="datetime-local" value="${toLocal(start0)}"></label><label class="grow">Fin<input name="end" type="datetime-local" value="${toLocal(end0)}"></label></div>
            <div class="chips small ev-dur">${[24, 48, 72, 168].map((h) => `<button class="chip" type="button" data-h="${h}">${h < 168 ? `${h / 24} j` : '1 semaine'}</button>`).join('')}</div>
            <div class="ev-colors"><span class="small muted">Couleur du sachet</span>${ev.EVENT_ACCENTS.map(([c, n]) => `<button type="button" class="ev-c" data-c="${c}" title="${esc(n)}" aria-label="${esc(n)}" style="--c:${c}"></button>`).join('')}<input type="color" name="accent" value="${esc(st.accent)}" title="Autre couleur"></div>
            <div class="ev-scope">
              <span class="small muted">Sous-thèmes</span>
              <div class="ev-chosen" data-subs></div>
              <input type="search" data-sq placeholder="Ajouter un sous-thème (Valorant, Foot, Naruto…)" autocomplete="off">
              <div class="hits" data-sh></div>
            </div>
            <div class="ev-scope">
              <span class="small muted">Cartes à part</span>
              <div class="ev-chosen ev-cards" data-cards></div>
              <div class="picker" data-pick></div>
            </div>
          </div>
          <div class="ev-preview" aria-live="polite"></div>
        </div>
        <p class="small red" data-err hidden></p>
        <div class="actions"><button class="btn accent" type="submit">${e ? 'Enregistrer' : 'Créer l’événement'}</button><button class="btn ghost" type="button" data-cancel>Annuler</button></div>
      </form>`);
    const f = sheet.querySelector<HTMLFormElement>('form')!;
    const val = (n: string) => (f.elements.namedItem(n) as HTMLInputElement).value;
    const errEl = sheet.querySelector<HTMLElement>('[data-err]')!;
    const prev = sheet.querySelector<HTMLElement>('.ev-preview')!;
    const subsEl = sheet.querySelector<HTMLElement>('[data-subs]')!;
    const cardsEl = sheet.querySelector<HTMLElement>('[data-cards]')!;
    const sq = sheet.querySelector<HTMLInputElement>('[data-sq]')!;
    const sh = sheet.querySelector<HTMLElement>('[data-sh]')!;
    const draft = () => ({ name: val('name').trim(), blurb: val('blurb').trim() || undefined, startAt: fromLocal(val('start')), endAt: fromLocal(val('end')), accent: st.accent, subthemes: st.subthemes, cards: st.cards });

    function paintChosen() {
      subsEl.innerHTML = st.subthemes.map((s) => `<button type="button" class="chip on" data-rm="${esc(s)}">${esc(cat.scopeLabel(s) || s)} ✕</button>`).join('') || '<span class="small muted">Aucun</span>';
      cardsEl.innerHTML = st.cards.map((id) => `<span class="ev-card"><span class="cardline" data-card="${esc(id)}"></span><button type="button" class="btn sm ghost" data-rmc="${esc(id)}" aria-label="Retirer">✕</button></span>`).join('') || '<span class="small muted">Aucune</span>';
      x.hydrateCards(cardsEl);
      paintPreview();
    }
    function paintPreview() {
      const d = draft();
      const err = ev.checkEvent({ ...d, name: d.name || '' });
      const pool = ev.eventCards(d);
      const by = new Map<string, number>();
      for (const c of pool) by.set(c.rarity, (by.get(c.rarity) ?? 0) + 1);
      return import('../core/packRoll').then(({ cardPackChance }) => {
        const req = { kind: 'theme' as const, event: { id: 'apercu', subthemes: d.subthemes, cards: d.cards } };
        const p6 = pool.length ? cardPackChance(req, 'mythic') : 0;
        const left = Number.isFinite(d.endAt) && Number.isFinite(d.startAt) ? ev.fmtLeft(d.endAt - Math.max(Date.now(), d.startAt)) : '—';
        const nm = d.name || 'Nom';
        prev.style.setProperty('--ev', d.accent);
        prev.innerHTML = `
          <div class="ev-pv-k small muted">Aperçu</div>
          <div class="ev-sachet"><span class="ev-sachet-n">${esc(nm)}</span></div>
          <div class="ev-pv-band"><i class="ev-sw"></i><span class="grow"><small>BOOSTER DU MOMENT</small><b>${esc(nm)}</b></span><span class="ev-pv-left"><small>ENCORE</small><b>${esc(left)}</b></span></div>
          <div class="ev-pv-stats"><b>${pool.length}</b> cartes${pool.length ? ` · ${STARS.map(([r, l]) => `${l} ${by.get(r) ?? 0}`).join(' · ')}` : ''}</div>
          ${p6 > 0 ? `<div class="small muted">Une 6★ précise : 1 chance sur ${Math.round(1 / p6).toLocaleString('fr-FR')} par booster</div>` : ''}
          ${(by.get('mythic') ?? 0) === 0 && pool.length ? '<div class="small">Pas de 6★ dans ce contenu : la pity et le god pack prendront la plus forte étoile disponible.</div>' : ''}
          <div class="ev-pv-cards">${pool.slice(0, 6).map((c) => `<span class="cardline" data-card="${esc(c.id)}"></span>`).join('')}</div>`;
        x.hydrateCards(prev);
        errEl.hidden = !err || (!d.name && !d.subthemes.length && !d.cards.length);
        errEl.textContent = err ?? '';
      });
    }
    subsEl.addEventListener('click', (ev2) => {
      const b = (ev2.target as HTMLElement).closest<HTMLElement>('[data-rm]');
      if (!b) return;
      st.subthemes = st.subthemes.filter((s) => s !== b.dataset.rm);
      paintChosen();
    });
    cardsEl.addEventListener('click', (ev2) => {
      const b = (ev2.target as HTMLElement).closest<HTMLElement>('[data-rmc]');
      if (!b) return;
      st.cards = st.cards.filter((s) => s !== b.dataset.rmc);
      paintChosen();
    });
    sq.addEventListener('input', () => {
      const w = sq.value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
      const hits = w.length < 2 ? [] : scopes.filter((s) => s.key.includes(w) && !st.subthemes.includes(s.id)).slice(0, 10);
      sh.innerHTML = hits.map((s) => `<button type="button" class="hit" data-s="${esc(s.id)}"><b>${esc(s.label)}</b> <small class="muted">${esc(s.theme)} · ${s.n} cartes</small></button>`).join('') || (w.length >= 2 ? '<p class="muted small">Aucun sous-thème.</p>' : '');
    });
    sh.addEventListener('click', (ev2) => {
      const b = (ev2.target as HTMLElement).closest<HTMLElement>('[data-s]');
      if (!b) return;
      st.subthemes.push(b.dataset.s!);
      sq.value = '';
      sh.innerHTML = '';
      paintChosen();
    });
    x.cardPicker(sheet.querySelector<HTMLElement>('[data-pick]')!, (id) => {
      if (!st.cards.includes(id)) st.cards.push(id);
      paintChosen();
    });
    sheet.querySelectorAll<HTMLButtonElement>('.ev-c').forEach((b) =>
      b.addEventListener('click', () => {
        st.accent = b.dataset.c!;
        (f.elements.namedItem('accent') as HTMLInputElement).value = st.accent;
        paintColors();
      }),
    );
    const paintColors = () => {
      sheet.querySelectorAll<HTMLElement>('.ev-c').forEach((b) => b.classList.toggle('on', b.dataset.c === st.accent));
      void paintPreview();
    };
    (f.elements.namedItem('accent') as HTMLInputElement).addEventListener('input', () => {
      st.accent = val('accent').toLowerCase();
      paintColors();
    });
    sheet.querySelectorAll<HTMLButtonElement>('[data-h]').forEach((b) =>
      b.addEventListener('click', () => {
        const s0 = fromLocal(val('start'));
        if (!Number.isFinite(s0)) return;
        (f.elements.namedItem('end') as HTMLInputElement).value = toLocal(s0 + Number(b.dataset.h) * H);
        void paintPreview();
      }),
    );
    f.addEventListener('input', (ev2) => {
      if ((ev2.target as HTMLElement).matches('[data-sq], [type=search]')) return;
      void paintPreview();
    });
    sheet.querySelector('[data-cancel]')!.addEventListener('click', () => x.closeSheet());
    f.addEventListener('submit', async (ev2) => {
      ev2.preventDefault();
      const d = draft();
      const err = ev.checkEvent(d);
      if (err) {
        errEl.hidden = false;
        errEl.textContent = err;
        return;
      }
      const r = await x.busy(f.querySelector<HTMLButtonElement>('[type=submit]'), () => x.call<{ id: string; msg: string }>(api.events.adminSave, { ...(e ? { id: e.id } : {}), ...d }), (r2) => r2.msg);
      if (r) {
        x.closeSheet();
        void reload();
      }
    });
    paintColors();
    paintChosen();
  }
}
