import type { GameBackend, PlayerCard, Profile } from '../backend';
import type { Shell } from '../shell';
import type { ViewerScene } from '../scenes/viewer';
import { catalogEntry, PUBLIC_CARD_COUNT, THEMES } from '../../core/sets/themes';
import { rarity, type RarityId } from '../../core/rarity';
import { busyButton, cardTile, errMsg, esc, fmtN, fmtPct, fold, h, plural, popLayer, pushLayer, starsHtml, toast } from '../ui';

/**
 * PROFIL (clic sur l'avatar, ou sur un ami) : vitrine de 6 cartes, devise, statistiques, raretés.
 *  - mon profil : je choisis les cartes de ma vitrine (sinon ce sont mes meilleures, automatiquement) et ma devise ;
 *  - profil d'un ami : sa vitrine, ses chiffres, et un raccourci pour lui proposer un échange.
 * Toucher une carte de la vitrine l'ouvre en grand (3D).
 */
export interface ProfileView {
  el: HTMLElement;
  enter(sub?: string): void;
  leave(): void;
}

const SLOTS = 6;
const RANK: Record<RarityId, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5, secret: 6 };
const STARS: RarityId[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
const best = (a: PlayerCard, b: PlayerCard) => RANK[b.rarity] - RANK[a.rarity] || a.bestMintNumber - b.bestMintNumber || (catalogEntry(a.cardId)?.num ?? 0) - (catalogEntry(b.cardId)?.num ?? 0);
const fmtDate = (t: number) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

export function createProfileView(backend: GameBackend, shell: Shell, getViewer: () => Promise<ViewerScene>, logout: () => void): ProfileView {
  const el = h('section', 'view profile');
  el.innerHTML = `
    <div class="pf-wrap">
      <div class="pf-head"></div>
      <div class="pf-stats"></div>
      <div class="pf-sec">
        <div class="pf-sec-t"><h2>Vitrine</h2><span class="pf-auto"></span><span class="pf-tools"></span></div>
        <div class="pf-case"></div>
        <div class="pf-picker" hidden>
          <div class="pf-pick-t"><span>Choisis une carte pour la case <b class="pf-slot-n">1</b></span><input class="search pf-search" type="search" placeholder="Chercher…" autocomplete="off" spellcheck="false"></div>
          <div class="grid mini pf-pick-grid"></div>
        </div>
      </div>
      <div class="pf-sec"><div class="pf-sec-t"><h2>Raretés</h2></div><div class="pf-rar"></div></div>
      <div class="pf-sec pf-friends-sec"><div class="pf-sec-t"><h2>Les autres</h2></div><div class="pf-friends"></div></div>
    </div>
    <div class="viewer-ui" hidden><button class="close" aria-label="Fermer">✕</button><div class="v-info"></div><div class="v-hint">glisse pour la faire tourner</div></div>`;
  const head = el.querySelector<HTMLElement>('.pf-head')!;
  const stats = el.querySelector<HTMLElement>('.pf-stats')!;
  const caseEl = el.querySelector<HTMLElement>('.pf-case')!;
  const autoEl = el.querySelector<HTMLElement>('.pf-auto')!;
  const tools = el.querySelector<HTMLElement>('.pf-tools')!;
  const picker = el.querySelector<HTMLElement>('.pf-picker')!;
  const pickGrid = el.querySelector<HTMLElement>('.pf-pick-grid')!;
  const pickSearch = el.querySelector<HTMLInputElement>('.pf-search')!;
  const rarEl = el.querySelector<HTMLElement>('.pf-rar')!;
  const friendsEl = el.querySelector<HTMLElement>('.pf-friends')!;
  const viewerUi = el.querySelector<HTMLElement>('.viewer-ui')!;
  const vInfo = el.querySelector<HTMLElement>('.v-info')!;

  let who = ''; // id du joueur affiché ('' = moi)
  let prof: Profile | null = null;
  let cards: PlayerCard[] = [];
  let editing = false;
  let draft: Array<{ cardId: string; rarity: RarityId } | null> = [];
  let slot = 0;
  let token = 0;
  let open = false;

  const isMe = () => !who || who === backend.state.user?.id;
  const ownedOf = () => (isMe() ? backend.state.collection : cards).filter((c) => catalogEntry(c.cardId));

  /** vitrine affichée : celle choisie (cartes encore possédées), sinon les 6 meilleures */
  function showcase(): { list: Array<{ cardId: string; rarity: RarityId }>; auto: boolean } {
    const mine = ownedOf();
    const has = new Set(mine.map((c) => `${c.cardId}:${c.rarity}`));
    const chosen = (prof?.showcase ?? []).filter((c) => has.has(`${c.cardId}:${c.rarity}`));
    if (chosen.length) return { list: chosen, auto: false };
    return { list: [...mine].sort(best).slice(0, SLOTS).map((c) => ({ cardId: c.cardId, rarity: c.rarity })), auto: true };
  }

  function renderHead() {
    const me = isMe();
    const name = prof?.name ?? (me ? backend.state.user?.name : '') ?? '';
    const ava = prof?.avatarUrl ? `<img src="${esc(prof.avatarUrl)}" alt="">` : `<span>${esc(name.slice(0, 1) || '?')}</span>`;
    head.innerHTML = `<div class="pf-ava">${ava}</div>
      <div class="pf-id">
        <div class="pf-eyebrow">${me ? 'Mon profil' : 'Profil'}</div>
        <h1>${esc(name)}</h1>
        <div class="pf-bio">${prof?.bio ? `« ${esc(prof.bio)} »` : me ? '<i>Pas encore de devise.</i>' : ''}</div>
        ${prof?.joinedAt ? `<div class="pf-since">Joue depuis le ${fmtDate(prof.joinedAt)}</div>` : ''}
      </div>
      <div class="pf-actions">${me ? `<button class="btn-ghost pf-bio-edit">Modifier ma devise</button><button class="btn-ghost pf-out">${backend.state.mode === 'demo' ? 'Remettre la démo à zéro' : 'Se déconnecter'}</button>` : `<a class="btn-primary pf-trade" href="#/echanges">Proposer un échange</a>`}</div>`;
    head.querySelector('.pf-bio-edit')?.addEventListener('click', editBio);
    const out = head.querySelector<HTMLButtonElement>('.pf-out');
    let armed = false;
    out?.addEventListener('click', () => {
      // on confirme d'un second clic (la démo efface la collection)
      if (!armed) {
        armed = true;
        out.textContent = backend.state.mode === 'demo' ? 'Sûr ? Tout est effacé' : 'Sûr ? Se déconnecter';
        out.classList.add('danger');
        return;
      }
      logout();
    });
    head.querySelector('.pf-trade')?.addEventListener('click', () => sessionStorage.setItem('bebou.tradeWith', who));
  }

  function editBio() {
    const box = head.querySelector<HTMLElement>('.pf-bio')!;
    box.innerHTML = `<input class="pf-bio-in" maxlength="80" placeholder="Ta devise (80 caractères)" value="${esc(prof?.bio ?? '')}">`;
    const inp = box.querySelector<HTMLInputElement>('input')!;
    inp.focus();
    let done = false;
    const save = async () => {
      if (done) return;
      done = true;
      try {
        await backend.setBio(inp.value);
        prof = prof ? { ...prof, bio: inp.value.replace(/\s+/g, ' ').trim().slice(0, 80) || undefined } : prof;
        toast('Devise enregistrée', 'ok');
      } catch (e) {
        toast(errMsg(e), 'err');
      }
      renderHead();
    };
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void save();
      if (e.key === 'Escape') ((done = true), renderHead());
    });
    inp.addEventListener('blur', () => void save());
  }

  function renderStats() {
    const mine = ownedOf();
    const ids = new Set(mine.filter((c) => c.rarity !== 'secret').map((c) => c.cardId));
    const total = mine.reduce((a, c) => a + c.count, 0);
    const dups = mine.reduce((a, c) => a + Math.max(0, c.count - 1), 0);
    const secrets = mine.filter((c) => c.rarity === 'secret').length;
    const top = [...mine].sort(best)[0];
    const pct = (ids.size / PUBLIC_CARD_COUNT) * 100;
    const cell = (v: string, l: string, cls = '') => `<div class="pf-stat ${cls}"><b>${v}</b><span>${l}</span></div>`;
    stats.innerHTML =
      cell(fmtPct(pct), `${fmtN(ids.size)} / ${fmtN(PUBLIC_CARD_COUNT)} cartes`, 'big') +
      cell(fmtN(prof?.packsOpened ?? backend.state.user?.totalPacksOpened ?? 0), 'boosters ouverts') +
      cell(fmtN(total), 'cartes en tout') +
      cell(fmtN(dups), plural(dups, 'doublon').replace(/^\S+\s/, '')) +
      (secrets ? cell(`✷ ${secrets}`, plural(secrets, 'secrète').replace(/^\S+\s/, ''), 'secret') : '') +
      (top ? cell(starsHtml(top.rarity), `meilleure : ${esc(catalogEntry(top.cardId)?.name ?? '')}`, 'top') : '');
    // complétion par thème
    const themes = THEMES.filter((t) => t.cards.length)
      .map((t) => {
        const n = t.cards.reduce((a, c) => a + (ids.has(c.id) ? 1 : 0), 0);
        return `<div class="pf-th"><span>${esc(t.label)}</span><i><i style="width:${((n / t.cards.length) * 100).toFixed(1)}%"></i></i><em>${fmtN(n)}/${fmtN(t.cards.length)}</em></div>`;
      })
      .join('');
    stats.insertAdjacentHTML('beforeend', `<div class="pf-themes">${themes}</div>`);
  }

  function renderCase() {
    const me = isMe();
    const sc = showcase();
    const list = editing ? draft : sc.list;
    autoEl.textContent = editing ? 'touche une case pour la changer' : sc.auto && list.length ? me ? '· tes meilleures cartes (automatique)' : '· ses meilleures cartes' : '';
    tools.innerHTML = me ? (editing ? `<button class="btn-ghost pf-cancel">Annuler</button><button class="btn-primary pf-save">Enregistrer</button>` : `<button class="btn-ghost pf-edit">Choisir mes cartes</button>`) : '';
    caseEl.innerHTML = '';
    caseEl.classList.toggle('editing', editing);
    for (let i = 0; i < SLOTS; i++) {
      const c = list[i];
      const wrap = h('div', `pf-slot${editing && i === slot ? ' sel' : ''}`);
      wrap.style.setProperty('--i', String(i));
      if (c) {
        const t = cardTile(c.cardId, c.rarity);
        wrap.append(t);
        if (editing) wrap.insertAdjacentHTML('beforeend', `<button class="pf-x" aria-label="Retirer">✕</button>`);
        wrap.addEventListener('click', (e) => {
          if ((e.target as HTMLElement).closest('.pf-x')) {
            draft[i] = null;
            renderCase();
            return;
          }
          if (editing) return selectSlot(i);
          void openCard(c.cardId, c.rarity);
        });
      } else {
        wrap.innerHTML = `<div class="pf-empty">${editing ? '+' : ''}</div>`;
        if (editing) wrap.addEventListener('click', () => selectSlot(i));
      }
      caseEl.append(wrap);
    }
    if (!list.length && !editing) caseEl.insertAdjacentHTML('beforeend', `<div class="pf-none">${me ? 'Ouvre des boosters : tes plus belles cartes s’afficheront ici.' : 'Pas encore de cartes.'}</div>`);
    tools.querySelector('.pf-edit')?.addEventListener('click', () => {
      editing = true;
      draft = Array.from({ length: SLOTS }, (_, i) => sc.list[i] ?? null);
      slot = Math.max(0, draft.findIndex((x) => !x));
      picker.hidden = false;
      renderCase();
      renderPicker();
    });
    tools.querySelector('.pf-cancel')?.addEventListener('click', stopEditing);
    const saveBtn = tools.querySelector<HTMLButtonElement>('.pf-save');
    saveBtn?.addEventListener('click', async () => {
      const cardsOut = draft.filter((x): x is { cardId: string; rarity: RarityId } => !!x);
      try {
        await busyButton(saveBtn, backend.setShowcase(cardsOut));
        prof = prof ? { ...prof, showcase: cardsOut } : prof;
        toast(cardsOut.length ? 'Vitrine enregistrée' : 'Vitrine automatique : tes meilleures cartes', 'ok');
        shell.sfx.chime(2, 0.06);
        stopEditing();
      } catch (e) {
        toast(errMsg(e), 'err');
      }
    });
  }
  function stopEditing() {
    editing = false;
    picker.hidden = true;
    pickSearch.value = '';
    renderCase();
  }
  function selectSlot(i: number) {
    slot = i;
    renderCase();
    el.querySelector<HTMLElement>('.pf-slot-n')!.textContent = String(i + 1);
    picker.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function renderPicker() {
    el.querySelector<HTMLElement>('.pf-slot-n')!.textContent = String(slot + 1);
    const q = fold(pickSearch.value.trim());
    const used = new Set(draft.filter(Boolean).map((c) => `${c!.cardId}:${c!.rarity}`));
    const list = [...ownedOf()].sort(best).filter((c) => !q || fold(catalogEntry(c.cardId)?.name ?? '').includes(q)).slice(0, 240);
    pickGrid.replaceChildren(
      ...list.map((c) => {
        const t = cardTile(c.cardId, c.rarity, { mini: true, count: c.count });
        if (used.has(`${c.cardId}:${c.rarity}`)) t.classList.add('picked');
        t.addEventListener('click', () => {
          if (used.has(`${c.cardId}:${c.rarity}`)) return toast('Déjà dans ta vitrine.', 'info');
          draft[slot] = { cardId: c.cardId, rarity: c.rarity };
          shell.sfx.tick(1.3, 0.05);
          const nextEmpty = draft.findIndex((x) => !x);
          slot = nextEmpty >= 0 ? nextEmpty : slot;
          renderCase();
          renderPicker();
        });
        return t;
      }),
    );
    if (!list.length) pickGrid.innerHTML = '<div class="muted">Aucune carte.</div>';
  }
  let searchT = 0;
  pickSearch.addEventListener('input', () => {
    clearTimeout(searchT);
    searchT = window.setTimeout(renderPicker, 150);
  });

  function renderRarities() {
    const mine = ownedOf();
    const rows = [...STARS, ...(mine.some((c) => c.rarity === 'secret') ? (['secret'] as RarityId[]) : [])];
    const max = Math.max(1, ...rows.map((r) => mine.filter((c) => c.rarity === r).length));
    rarEl.innerHTML = rows
      .map((r) => {
        const n = mine.filter((c) => c.rarity === r).length;
        return `<div class="pf-r" style="--rc:${rarity(r).hex}"><span class="pf-r-l">${starsHtml(r)}</span><i><i style="width:${((n / max) * 100).toFixed(1)}%"></i></i><em>${fmtN(n)}</em></div>`;
      })
      .join('');
  }

  function renderFriends() {
    const me = backend.state.user;
    const list = [...(me && who && who !== me.id ? [{ id: me.id, name: `${me.name} (moi)`, online: true, packsOpened: me.totalPacksOpened, avatarUrl: me.avatarUrl }] : []), ...backend.state.friends.filter((f) => f.id !== who)];
    el.querySelector<HTMLElement>('.pf-friends-sec')!.hidden = !list.length;
    friendsEl.innerHTML = list
      .map((f) => `<a class="pf-friend" href="#/profil/${encodeURIComponent(f.id)}"><span class="pf-fa">${f.avatarUrl ? `<img src="${esc(f.avatarUrl)}" alt="">` : esc(f.name.slice(0, 1))}</span><span class="pf-fn">${esc(f.name)}</span><span class="pf-fp">${plural(f.packsOpened, 'booster')}</span>${f.online ? '<i class="on"></i>' : ''}</a>`)
      .join('');
  }

  function renderAll() {
    renderHead();
    renderStats();
    renderCase();
    renderRarities();
    renderFriends();
  }

  async function load(id: string) {
    const my = ++token;
    who = id;
    editing = false;
    picker.hidden = true;
    const me = backend.state.user;
    prof = isMe() && me ? { id: me.id, name: me.name, avatarUrl: me.avatarUrl, showcase: [], packsOpened: me.totalPacksOpened } : null;
    cards = [];
    el.classList.add('loading');
    renderAll();
    try {
      const [p, c] = await Promise.all([backend.profile(isMe() ? me?.id ?? 'me' : id), isMe() ? Promise.resolve(backend.state.collection) : backend.friendCollection(id)]);
      if (my !== token) return;
      if (p) prof = p;
      cards = c;
    } catch (e) {
      if (my === token) toast(errMsg(e), 'err');
    }
    if (my !== token) return;
    el.classList.remove('loading');
    renderAll();
  }

  // ── une carte de la vitrine en grand
  async function openCard(cardId: string, r: RarityId) {
    const viewer = await getViewer();
    const e = catalogEntry(cardId);
    const rr = rarity(r);
    const row = ownedOf().find((c) => c.cardId === cardId && c.rarity === r);
    if (!open) pushLayer(closeViewer);
    open = true;
    document.body.classList.add('card-open');
    el.classList.add('viewing');
    viewerUi.hidden = false;
    vInfo.className = `v-info r-${r}`;
    vInfo.style.setProperty('--ra', rr.accentHex);
    vInfo.innerHTML = `<div class="ci-name">${esc(e?.name ?? cardId)}</div><div class="ci-meta">${starsHtml(r)} <span class="ci-r" style="color:${rr.accentHex}">${rr.label}</span></div>${row ? `<div class="ci-sub">${plural(row.count, 'exemplaire')} · meilleur n°${fmtN(row.bestMintNumber)}</div>` : ''}`;
    shell.setDimmed(false);
    shell.show('viewer');
    void viewer.show(cardId, r);
  }
  function closeViewer() {
    if (!open) return;
    popLayer();
    open = false;
    document.body.classList.remove('card-open');
    el.classList.remove('viewing');
    viewerUi.hidden = true;
    shell.show(null);
    shell.setDimmed(true);
  }
  viewerUi.querySelector('.close')!.addEventListener('click', closeViewer);
  window.addEventListener('keydown', (e) => e.key === 'Escape' && open && closeViewer());

  // ma collection change (booster ouvert…) : mon profil suit
  let sig = '';
  backend.onChange((st) => {
    if (!el.isConnected || !isMe() || editing || open) return;
    const s = `${st.collection.length}:${st.user?.totalPacksOpened}:${st.friends.length}`;
    if (s === sig) return;
    sig = s;
    if (prof && st.user) prof = { ...prof, packsOpened: st.user.totalPacksOpened };
    renderAll();
  });

  return {
    el,
    enter(sub) {
      shell.show(null);
      shell.setDimmed(true);
      el.scrollTo({ top: 0 });
      void load(sub ? decodeURIComponent(sub) : '');
    },
    leave() {
      if (open) closeViewer();
      editing = false;
    },
  };
}
