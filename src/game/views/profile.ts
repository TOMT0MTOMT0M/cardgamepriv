import type { ActivityItem, GameBackend, LeaderRow, PlayerCard, Profile } from '../backend';
import type { Shell } from '../shell';
import type { ViewerScene } from '../scenes/viewer';
import { catalogEntry, PUBLIC_CARD_COUNT, THEMES } from '../../core/sets/themes';
import { rarity, type RarityId } from '../../core/rarity';
import { BADGES, BANNERS, FRAMES, TITLES, badgeOf, bannerOf, frameOf, statsFrom, titleOf, unlockedIds, type Cosmetic, type CosmeticChoice, type PlayerStats } from '../../core/cosmetics';
import { STREAK_CYCLE } from '../../core/streak';
import { busyButton, cardTile, errMsg, esc, fmtN, fmtPct, fold, h, plural, popLayer, pushLayer, starsHtml, thumbUrl, toast } from '../ui';

/**
 * PROFIL (refonte complète, retours du 3 nov.) — le mien (avatar de l'en-tête) ou celui d'un ami.
 *  - Grande bannière personnalisable, avatar rond + cadre, pseudo + titre + badges + devise.
 *  - Onglets : TABLEAU (stats enrichies : complétion, 6★, plus gros drop, série de connexion, complétion par thème,
 *    raretés) · COLLECTION (vitrine choisie à la main + classeur épinglé) · ACTIVITÉ (gros drops, échanges, contrats) ·
 *    CLASSEMENT (entre nous : complétion, 6★ & secrets, boosters, échanges, série — podium + liste).
 *  - Cosmétiques (bannières, cadres, titres, badges) : tout se débloque en jouant (src/core/cosmetics.ts), rien ne s'achète.
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
const ago = (t: number) => {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'à l’instant';
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  const d = Math.round(s / 86400);
  return d === 1 ? 'hier' : `il y a ${d} j`;
};
type Tab = 'tableau' | 'collection' | 'activite' | 'classement';
type Board = 'pct' | 'mythic' | 'packs' | 'trades' | 'streak';
const BOARDS: Array<{ id: Board; label: string; unit: (r: LeaderRow) => string; value: (r: LeaderRow) => number; crown?: boolean }> = [
  { id: 'pct', label: 'Complétion', crown: true, value: (r) => r.pct, unit: (r) => `${fmtPct(r.pct)} · ${fmtN(r.uniques)} cartes` },
  { id: 'mythic', label: '6★ & secrets', value: (r) => r.mythics + r.secrets * 10, unit: (r) => `${r.mythics} × 6★${r.secrets ? ` · ✷ ${r.secrets}` : ''}` },
  { id: 'packs', label: 'Boosters', value: (r) => r.packsOpened, unit: (r) => plural(r.packsOpened, 'booster') },
  { id: 'trades', label: 'Échanges', value: (r) => r.tradesDone, unit: (r) => plural(r.tradesDone, 'échange', 'échanges') },
  { id: 'streak', label: 'Série', value: (r) => r.streak, unit: (r) => plural(r.streak, 'jour') },
];

export function createProfileView(backend: GameBackend, shell: Shell, getViewer: () => Promise<ViewerScene>, logout: () => void): ProfileView {
  const el = h('section', 'view profile');
  el.innerHTML = `
    <div class="pf-wrap">
      <div class="pf-banner"><button class="btn-ghost pf-banner-btn" hidden>Personnaliser</button></div>
      <div class="pf-head"></div>
      <div class="pf-cosm" hidden></div>
      <div class="pf-tabs" role="tablist">
        <button role="tab" data-t="tableau" class="on">Tableau</button><button role="tab" data-t="collection">Collection</button><button role="tab" data-t="activite">Activité</button><button role="tab" data-t="classement">Classement</button>
      </div>
      <div class="pf-pane p-tableau">
        <div class="pf-stats"></div>
        <div class="pf-sec"><div class="pf-sec-t"><h2>Raretés</h2></div><div class="pf-rar"></div></div>
      </div>
      <div class="pf-pane p-collection" hidden>
        <div class="pf-sec">
          <div class="pf-sec-t"><h2>Vitrine</h2><span class="pf-auto"></span><span class="pf-tools"></span></div>
          <div class="pf-case"></div>
          <div class="pf-picker" hidden>
            <div class="pf-pick-t"><span>Choisis une carte pour la case <b class="pf-slot-n">1</b></span><input class="search pf-search" type="search" placeholder="Chercher…" autocomplete="off" spellcheck="false"></div>
            <div class="grid mini pf-pick-grid"></div>
          </div>
        </div>
        <div class="pf-sec pf-binder-sec" hidden><div class="pf-sec-t"><h2 class="pf-binder-t">Classeur</h2><span class="pf-auto">· épinglé</span><span class="pf-tools"><a class="btn-ghost pf-binder-go" href="#/collection/classeurs" hidden>Mes classeurs</a></span></div><div class="grid mini pf-binder"></div></div>
      </div>
      <div class="pf-pane p-activite" hidden><div class="pf-activity"></div></div>
      <div class="pf-pane p-classement" hidden>
        <div class="seg pf-boards">${BOARDS.map((b) => `<button data-b="${b.id}"${b.id === 'pct' ? ' class="on"' : ''}>${b.crown ? '👑 ' : ''}${b.label}</button>`).join('')}</div>
        <div class="pf-podium"></div>
        <div class="pf-board"></div>
      </div>
      <div class="pf-sec pf-friends-sec"><div class="pf-sec-t"><h2>Les autres</h2></div><div class="pf-friends"></div></div>
    </div>
    <div class="viewer-ui" hidden><button class="close" aria-label="Fermer">✕</button><div class="v-info"></div><div class="v-hint">glisse pour la faire tourner</div></div>`;
  const q = <T extends HTMLElement>(s: string) => el.querySelector<T>(s)!;
  const banner = q('.pf-banner');
  const head = q('.pf-head');
  const cosm = q('.pf-cosm');
  const stats = q('.pf-stats');
  const caseEl = q('.pf-case');
  const autoEl = q('.p-collection .pf-auto');
  const tools = q('.p-collection .pf-tools');
  const picker = q('.pf-picker');
  const pickGrid = q('.pf-pick-grid');
  const pickSearch = q<HTMLInputElement>('.pf-search');
  const rarEl = q('.pf-rar');
  const friendsEl = q('.pf-friends');
  const activityEl = q('.pf-activity');
  const podiumEl = q('.pf-podium');
  const boardEl = q('.pf-board');
  const viewerUi = q('.viewer-ui');
  const vInfo = q('.v-info');

  let who = '';
  let prof: Profile | null = null;
  let cards: PlayerCard[] = [];
  let editing = false;
  let draft: Array<{ cardId: string; rarity: RarityId } | null> = [];
  let slot = 0;
  let token = 0;
  let open = false;
  let tab: Tab = 'tableau';
  let board: Board = 'pct';
  let leader: LeaderRow[] | null = null;
  let activity: ActivityItem[] | null = null;
  let cosmOpen = false;
  let cosmDraft: CosmeticChoice = {};

  const isMe = () => !who || who === backend.state.user?.id;
  const ownedOf = () => (isMe() ? backend.state.collection : cards).filter((c) => catalogEntry(c.cardId));
  /** stats affichées : celles du serveur, sinon (mon profil, avant la réponse) calculées localement */
  const statsOf = (): PlayerStats =>
    prof?.stats ?? statsFrom(ownedOf(), { packsOpened: prof?.packsOpened ?? backend.state.user?.totalPacksOpened ?? 0, tradesDone: 0, contractsSigned: 0, streak: backend.state.user?.streak?.count ?? 0 });

  // ── onglets
  el.querySelectorAll<HTMLButtonElement>('.pf-tabs button').forEach((b) =>
    b.addEventListener('click', () => {
      tab = b.dataset.t as Tab;
      syncTabs();
      if (tab === 'activite' && !activity) void loadActivity();
      if (tab === 'classement' && !leader) void loadLeaderboard();
    }),
  );
  function syncTabs() {
    el.querySelectorAll<HTMLButtonElement>('.pf-tabs button').forEach((b) => {
      const on = b.dataset.t === tab;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    });
    for (const t of ['tableau', 'collection', 'activite', 'classement'] as Tab[]) q(`.p-${t}`).hidden = t !== tab;
  }
  el.querySelectorAll<HTMLButtonElement>('.pf-boards button').forEach((b) =>
    b.addEventListener('click', () => {
      board = b.dataset.b as Board;
      el.querySelectorAll<HTMLButtonElement>('.pf-boards button').forEach((x) => x.classList.toggle('on', x === b));
      renderBoard();
    }),
  );

  /** vitrine affichée : celle choisie (cartes encore possédées), sinon les 6 meilleures */
  function showcase(): { list: Array<{ cardId: string; rarity: RarityId }>; auto: boolean } {
    const mine = ownedOf();
    const has = new Set(mine.map((c) => `${c.cardId}:${c.rarity}`));
    const chosen = (prof?.showcase ?? []).filter((c) => has.has(`${c.cardId}:${c.rarity}`));
    if (chosen.length) return { list: chosen, auto: false };
    return { list: [...mine].sort(best).slice(0, SLOTS).map((c) => ({ cardId: c.cardId, rarity: c.rarity })), auto: true };
  }

  // ── bannière + identité
  function renderHead() {
    const me = isMe();
    const name = prof?.name ?? (me ? backend.state.user?.name : '') ?? '';
    const cos = prof?.cosmetics ?? {};
    const bn = bannerOf(cos.banner);
    const fr = frameOf(cos.frame);
    const title = titleOf(cos.title);
    banner.style.background = bn.css ?? '';
    banner.dataset.banner = bn.id;
    const bb = q<HTMLButtonElement>('.pf-banner-btn');
    bb.hidden = !me;
    bb.textContent = cosmOpen ? 'Fermer' : 'Personnaliser';
    const ava = prof?.avatarUrl ? `<img src="${esc(prof.avatarUrl)}" alt="">` : `<span>${esc(name.slice(0, 1) || '?')}</span>`;
    const badges = (cos.badges ?? []).map((id) => badgeOf(id)).filter((b): b is Cosmetic => !!b);
    head.innerHTML = `<div class="pf-ava-wrap frame-${fr.id}" style="--frame:${fr.css ?? 'transparent'}"><div class="pf-ava">${ava}</div>${fr.id !== 'none' ? `<span class="pf-frame-l">${esc(fr.label)}</span>` : ''}</div>
      <div class="pf-id">
        <div class="pf-eyebrow">${me ? 'Mon profil' : 'Profil'}</div>
        <h1>${esc(name)}</h1>
        ${title ? `<div class="pf-title">${esc(title.label)}</div>` : ''}
        ${badges.length ? `<div class="pf-badges">${badges.map((b) => `<span class="pf-badge" title="${esc(b.label)} · ${esc(b.how)}">${b.glyph ?? '●'} <i>${esc(b.label)}</i></span>`).join('')}</div>` : ''}
        <div class="pf-bio">${prof?.bio ? `« ${esc(prof.bio)} »` : me ? '<i>Pas encore de devise.</i>' : ''}</div>
        ${prof?.joinedAt ? `<div class="pf-since">Joue depuis le ${fmtDate(prof.joinedAt)}</div>` : ''}
      </div>
      <div class="pf-actions">${me ? `<button class="btn-ghost pf-bio-edit">Devise</button><button class="btn-ghost pf-out">${backend.state.mode === 'demo' ? 'Remettre la démo à zéro' : 'Se déconnecter'}</button>` : `<a class="btn-primary pf-trade" href="#/echanges">Proposer un échange</a>`}</div>`;
    head.querySelector('.pf-bio-edit')?.addEventListener('click', editBio);
    const out = head.querySelector<HTMLButtonElement>('.pf-out');
    let armed = false;
    out?.addEventListener('click', () => {
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
  q('.pf-banner-btn').addEventListener('click', () => {
    cosmOpen = !cosmOpen;
    if (cosmOpen) cosmDraft = { ...(prof?.cosmetics ?? {}), badges: [...(prof?.cosmetics?.badges ?? [])] };
    cosm.hidden = !cosmOpen;
    renderHead();
    if (cosmOpen) renderCosm();
  });

  /** Panneau de personnalisation : bannières, cadres, titres, badges (verrouillé = grisé avec la condition). */
  function renderCosm() {
    const st = statsOf();
    const ok = { banner: new Set(unlockedIds(BANNERS, st)), frame: new Set(unlockedIds(FRAMES, st)), title: new Set(unlockedIds(TITLES, st)), badge: new Set(unlockedIds(BADGES, st)) };
    const group = (label: string, hint: string, items: Cosmetic[], okSet: Set<string>, cls: string, sel: (c: Cosmetic) => boolean) =>
      `<div class="cs-group"><div class="cs-t">${label} <small>${hint} · ${okSet.size}/${items.length} débloqué${okSet.size > 1 ? 's' : ''}</small></div><div class="cs-list">${items
        .map((c) => `<button class="cs ${cls}${sel(c) ? ' on' : ''}${okSet.has(c.id) ? '' : ' locked'}" data-id="${esc(c.id)}" title="${esc(okSet.has(c.id) ? c.label : `${c.label} · ${c.how}`)}" ${okSet.has(c.id) ? '' : 'aria-disabled="true"'}>${
          cls === 'cs-banner' ? `<span class="cs-sw" style="background:${c.css}"></span><b>${esc(c.label)}</b>` : cls === 'cs-frame' ? `<span class="cs-ring" style="--frame:${c.css}"></span><b>${esc(c.label)}</b>` : cls === 'cs-badge' ? `<span class="cs-g">${c.glyph ?? '●'}</span><b>${esc(c.label)}</b>` : `<b>${esc(c.label)}</b>`
        }${okSet.has(c.id) ? '' : `<small>🔒 ${esc(c.how)}</small>`}</button>`)
        .join('')}</div></div>`;
    cosm.innerHTML =
      `<div class="cs-head"><b>Personnaliser mon profil</b><span class="muted">Tout se débloque en jouant — rien ne s’achète.</span></div>` +
      group('Bannière', 'le fond du haut', BANNERS, ok.banner, 'cs-banner', (c) => (cosmDraft.banner ?? BANNERS[0].id) === c.id) +
      group('Cadre d’avatar', 'autour de ta photo', FRAMES, ok.frame, 'cs-frame', (c) => (cosmDraft.frame ?? 'none') === c.id) +
      group('Titre', 'sous ton pseudo', TITLES, ok.title, 'cs-title', (c) => cosmDraft.title === c.id) +
      group('Badges', 'jusqu’à 5, dans l’ordre où tu les choisis', BADGES, ok.badge, 'cs-badge', (c) => (cosmDraft.badges ?? []).includes(c.id)) +
      `<div class="cs-order"></div><div class="cs-actions"><button class="btn-ghost cs-cancel">Annuler</button><button class="btn-primary cs-save">Enregistrer</button></div>`;
    const renderOrder = () => {
      const o = cosm.querySelector<HTMLElement>('.cs-order')!;
      const list = cosmDraft.badges ?? [];
      o.innerHTML = list.length ? `<span class="cs-t">Ordre des badges</span>${list.map((id, i) => `<span class="cs-ord">${badgeOf(id)?.glyph ?? '●'} ${esc(badgeOf(id)?.label ?? id)}<button data-mv="-1" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Avant">◀</button><button data-mv="1" data-i="${i}" ${i === list.length - 1 ? 'disabled' : ''} aria-label="Après">▶</button></span>`).join('')}` : '';
      o.querySelectorAll<HTMLButtonElement>('button[data-mv]').forEach((b) =>
        b.addEventListener('click', () => {
          const i = Number(b.dataset.i), d = Number(b.dataset.mv);
          const l = cosmDraft.badges!;
          [l[i], l[i + d]] = [l[i + d], l[i]];
          renderOrder();
        }),
      );
    };
    renderOrder();
    cosm.querySelectorAll<HTMLButtonElement>('.cs').forEach((b) =>
      b.addEventListener('click', () => {
        const id = b.dataset.id!;
        if (b.classList.contains('locked')) return toast(`Verrouillé : ${b.title.split(' · ')[1] ?? ''}`, 'info');
        if (b.classList.contains('cs-banner')) cosmDraft.banner = id;
        else if (b.classList.contains('cs-frame')) cosmDraft.frame = id;
        else if (b.classList.contains('cs-title')) cosmDraft.title = cosmDraft.title === id ? undefined : id;
        else {
          const l = (cosmDraft.badges ??= []);
          if (l.includes(id)) l.splice(l.indexOf(id), 1);
          else if (l.length >= 5) return toast('5 badges au maximum.', 'info');
          else l.push(id);
        }
        shell.sfx.tick(1.2, 0.04);
        // aperçu immédiat
        prof = prof ? { ...prof, cosmetics: { ...cosmDraft, badges: [...(cosmDraft.badges ?? [])] } } : prof;
        renderHead();
        renderCosm();
      }),
    );
    cosm.querySelector('.cs-cancel')!.addEventListener('click', () => {
      cosmOpen = false;
      cosm.hidden = true;
      void load(who); // on recharge le vrai état
    });
    const save = cosm.querySelector<HTMLButtonElement>('.cs-save')!;
    save.addEventListener('click', async () => {
      try {
        const kept = await busyButton(save, backend.setCosmetics(cosmDraft));
        prof = prof ? { ...prof, cosmetics: kept } : prof;
        cosmOpen = false;
        cosm.hidden = true;
        shell.sfx.chime(2, 0.06);
        toast('Profil enregistré', 'ok');
        renderHead();
      } catch (e) {
        toast(errMsg(e), 'err');
      }
    });
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

  // ── TABLEAU : stats enrichies
  function renderStats() {
    const mine = ownedOf();
    const st = statsOf();
    const total = mine.reduce((a, c) => a + c.count, 0);
    const dups = mine.reduce((a, c) => a + Math.max(0, c.count - 1), 0);
    const top = prof?.bestDrop ? { cardId: prof.bestDrop.cardId, rarity: prof.bestDrop.rarity, bestMintNumber: prof.bestDrop.mintNumber } : [...mine].sort(best)[0];
    const pct = (st.uniques / Math.max(1, st.total || PUBLIC_CARD_COUNT)) * 100;
    const sd = prof?.streakDay ?? ((st.streak - 1) % STREAK_CYCLE) + 1;
    const cell = (v: string, l: string, cls = '') => `<div class="pf-stat ${cls}"><b>${v}</b><span>${l}</span></div>`;
    stats.innerHTML =
      cell(fmtPct(pct), `${fmtN(st.uniques)} / ${fmtN(st.total || PUBLIC_CARD_COUNT)} cartes uniques`, 'big') +
      cell(fmtN(st.packsOpened), 'boosters ouverts') +
      cell(`✺ ${fmtN(st.mythics)}`, `carte${st.mythics > 1 ? 's' : ''} 6★`, 'mythic') +
      (st.secrets ? cell(`✷ ${st.secrets}`, plural(st.secrets, 'secrète').replace(/^\S+\s/, ''), 'secret') : '') +
      cell(st.streak ? `🔥 ${fmtN(st.streak)}` : '—', st.streak ? `jour${st.streak > 1 ? 's' : ''} d’affilée · ${Math.max(1, sd)}/${STREAK_CYCLE}` : 'série de connexion', 'streak') +
      cell(fmtN(st.tradesDone), plural(st.tradesDone, 'échange conclu', 'échanges conclus').replace(/^\S+\s/, '')) +
      cell(fmtN(st.contractsSigned), plural(st.contractsSigned, 'contrat signé', 'contrats signés').replace(/^\S+\s/, '')) +
      cell(fmtN(total), 'cartes en tout') +
      cell(fmtN(dups), plural(dups, 'doublon').replace(/^\S+\s/, '')) +
      cell(fmtN(st.fullSubthemes), `album${st.fullSubthemes > 1 ? 's' : ''} à 100 %`);
    // plus gros drop : la carte elle-même
    if (top) {
      const e = catalogEntry(top.cardId);
      const dropEl = h('div', `pf-stat pf-drop r-${top.rarity}`);
      dropEl.style.setProperty('--rc', rarity(top.rarity).hex);
      dropEl.innerHTML = `<div class="pf-drop-c"></div><div><b>${starsHtml(top.rarity)}</b><span>plus gros drop · <i>${esc(e?.name ?? top.cardId)}</i>${top.bestMintNumber ? ` · n°${fmtN(top.bestMintNumber)}` : ''}</span></div>`;
      const t = cardTile(top.cardId, top.rarity, { mini: true });
      t.addEventListener('click', () => void openCard(top.cardId, top.rarity));
      dropEl.querySelector('.pf-drop-c')!.append(t);
      stats.append(dropEl);
    }
    // complétion par thème
    const ids = new Set(mine.filter((c) => c.rarity !== 'secret').map((c) => c.cardId));
    const themes = (prof?.themes ?? THEMES.map((t) => ({ id: t.id, have: t.cards.reduce((a, c) => a + (ids.has(c.id) ? 1 : 0), 0), total: t.cards.length })))
      .filter((t) => t.total)
      .map((t) => {
        const th = THEMES.find((x) => x.id === t.id);
        return `<div class="pf-th" style="--rc:${th?.style.accent ?? 'var(--rose)'}"><span>${esc(th?.label ?? t.id)}</span><i><i style="width:${((t.have / t.total) * 100).toFixed(1)}%"></i></i><em>${fmtN(t.have)}/${fmtN(t.total)}</em></div>`;
      })
      .join('');
    stats.insertAdjacentHTML('beforeend', `<div class="pf-themes">${themes}</div>`);
  }

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

  // ── COLLECTION : vitrine + classeur épinglé
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
            renderPicker();
            return;
          }
          if (editing) selectSlot(i);
          else void openCard(c.cardId, c.rarity);
        });
      } else {
        wrap.innerHTML = `<div class="pf-empty">${editing ? '+' : ''}</div>`;
        if (editing) wrap.addEventListener('click', () => selectSlot(i));
      }
      caseEl.append(wrap);
    }
    if (!list.length && !editing) caseEl.insertAdjacentHTML('beforeend', `<div class="pf-none">${me ? 'Ouvre des boosters : tes plus belles cartes s’afficheront ici.' : 'Pas encore de carte.'}</div>`);
    tools.querySelector('.pf-edit')?.addEventListener('click', () => {
      editing = true;
      draft = Array.from({ length: SLOTS }, (_, i) => sc.list[i] ?? null);
      slot = draft.findIndex((x) => !x) >= 0 ? draft.findIndex((x) => !x) : 0;
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
    q('.pf-slot-n').textContent = String(i + 1);
    picker.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function renderPicker() {
    q('.pf-slot-n').textContent = String(slot + 1);
    const qq = fold(pickSearch.value.trim());
    const used = new Set(draft.filter(Boolean).map((c) => `${c!.cardId}:${c!.rarity}`));
    const list = [...ownedOf()].sort(best).filter((c) => !qq || fold(catalogEntry(c.cardId)?.name ?? '').includes(qq)).slice(0, 240);
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
  function renderBinder() {
    const sec = q('.pf-binder-sec');
    const b = isMe() ? backend.state.binders.find((x) => x.pinned) ?? null : prof?.pinnedBinder ?? null;
    sec.hidden = !b;
    q('.pf-binder-go').hidden = !isMe();
    if (!b) return;
    q('.pf-binder-t').textContent = b.name;
    const g = q('.pf-binder');
    g.replaceChildren();
    const have = new Map(ownedOf().map((c) => [`${c.cardId}:${c.rarity}`, c]));
    for (const c of b.cards.slice(0, 24)) {
      const row = have.get(`${c.cardId}:${c.rarity}`);
      const t = cardTile(c.cardId, c.rarity, { owned: !!row, count: row?.count });
      if (row) t.addEventListener('click', () => void openCard(c.cardId, c.rarity));
      g.append(t);
    }
    if (b.cards.length > 24) g.append(h('div', 'muted', `+ ${b.cards.length - 24} autres`));
  }

  // ── ACTIVITÉ
  async function loadActivity() {
    activityEl.innerHTML = '<div class="muted">Chargement…</div>';
    try {
      activity = await backend.activity(isMe() ? (backend.state.user?.id ?? 'me') : who);
    } catch (e) {
      activity = [];
      toast(errMsg(e), 'err');
    }
    renderActivity();
  }
  function renderActivity() {
    if (tab !== 'activite') return;
    const list = activity ?? [];
    activityEl.replaceChildren();
    if (!list.length) return void (activityEl.innerHTML = `<div class="muted">${isMe() ? 'Rien pour l’instant : tes gros tirages (5★ et +), échanges conclus et contrats signés apparaîtront ici.' : 'Rien à montrer pour l’instant.'}</div>`);
    const ICON: Record<string, string> = { pull: '✦', mythic_pull: '✺', secret_pull: '✷', trade: '⇄', contract: '🔥', joined: '👋', achievement: '🏅' };
    for (const a of list) {
      const e = a.cardId ? catalogEntry(a.cardId) : undefined;
      const rr = a.rarity ? rarity(a.rarity) : null;
      const row = h('div', `pf-act k-${a.kind}${rr ? ` r-${a.rarity}` : ''}`);
      if (rr) row.style.setProperty('--rc', rr.hex);
      row.innerHTML = `<span class="pa-ico">${ICON[a.kind] ?? '•'}</span>${e && a.rarity !== 'secret' ? `<img class="pa-img" alt="" loading="lazy" src="${thumbUrl(e)}">` : ''}<span class="pa-txt">${esc(a.message)}</span><span class="pa-when">${ago(a.createdAt)}</span>`;
      if (e && a.rarity) row.addEventListener('click', () => void openCard(e.id, a.rarity!));
      activityEl.append(row);
    }
  }

  // ── CLASSEMENT
  async function loadLeaderboard() {
    podiumEl.innerHTML = '<div class="muted">Chargement…</div>';
    try {
      leader = await backend.leaderboard();
    } catch (e) {
      leader = [];
      toast(errMsg(e), 'err');
    }
    renderBoard();
  }
  function renderBoard() {
    if (tab !== 'classement') return;
    const b = BOARDS.find((x) => x.id === board)!;
    const rows = [...(leader ?? [])].sort((x, y) => b.value(y) - b.value(x) || x.name.localeCompare(y.name, 'fr'));
    const me = backend.state.user?.id;
    podiumEl.replaceChildren();
    boardEl.replaceChildren();
    if (!rows.length) return;
    const ava = (r: LeaderRow) => `<span class="pd-ava frame-${frameOf(r.cosmetics.frame).id}" style="--frame:${frameOf(r.cosmetics.frame).css ?? 'transparent'}">${r.avatarUrl ? `<img src="${esc(r.avatarUrl)}" alt="">` : `<span>${esc(r.name.slice(0, 1))}</span>`}</span>`;
    const top3 = rows.slice(0, 3);
    const order = [1, 0, 2].filter((i) => top3[i]);
    podiumEl.innerHTML = `<div class="pd-row">${order
      .map((i) => {
        const r = top3[i];
        return `<a class="pd p${i + 1}${r.id === me ? ' me' : ''}" href="#/profil/${encodeURIComponent(r.id)}"><span class="pd-rank">${i === 0 && b.crown ? '👑' : ['🥇', '🥈', '🥉'][i]}</span>${ava(r)}<b>${esc(r.name)}${r.id === me ? ' <i>(toi)</i>' : ''}</b><span class="pd-v">${b.unit(r)}</span></a>`;
      })
      .join('')}</div>`;
    for (const [i, r] of rows.entries()) {
      const row = h('a', `pf-lb${r.id === me ? ' me' : ''}`);
      row.href = `#/profil/${encodeURIComponent(r.id)}`;
      row.innerHTML = `<span class="lb-rank">${i + 1}</span>${ava(r)}<span class="lb-name">${esc(r.name)}${titleOf(r.cosmetics.title) ? `<small>${esc(titleOf(r.cosmetics.title)!.label)}</small>` : ''}</span><span class="lb-v">${b.unit(r)}</span>`;
      boardEl.append(row);
    }
    if (b.id === 'pct') boardEl.insertAdjacentHTML('beforeend', '<div class="muted lb-note">👑 Le classement roi : la complétion globale de la collection.</div>');
  }

  function renderFriends() {
    const me = backend.state.user;
    const list = [...(me && who && who !== me.id ? [{ id: me.id, name: `${me.name} (moi)`, online: true, packsOpened: me.totalPacksOpened, avatarUrl: me.avatarUrl }] : []), ...backend.state.friends.filter((f) => f.id !== who)];
    q('.pf-friends-sec').hidden = !list.length;
    friendsEl.innerHTML = list
      .map((f) => `<a class="pf-friend" href="#/profil/${encodeURIComponent(f.id)}"><span class="pf-fa">${f.avatarUrl ? `<img src="${esc(f.avatarUrl)}" alt="">` : esc(f.name.slice(0, 1))}</span><span class="pf-fn">${esc(f.name)}</span><span class="pf-fp">${plural(f.packsOpened, 'booster')}</span>${f.online ? '<i class="on"></i>' : ''}</a>`)
      .join('');
  }

  function renderAll() {
    renderHead();
    renderStats();
    renderRarities();
    renderCase();
    renderBinder();
    renderFriends();
    syncTabs();
    renderActivity();
    renderBoard();
  }

  async function load(id: string) {
    const my = ++token;
    who = id;
    editing = false;
    cosmOpen = false;
    cosm.hidden = true;
    picker.hidden = true;
    activity = null;
    leader = null;
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
    if (tab === 'activite') void loadActivity();
    if (tab === 'classement') void loadLeaderboard();
  }

  // ── une carte en grand
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

  let sig = '';
  backend.onChange((st) => {
    if (!el.isConnected || !isMe() || editing || open || cosmOpen) return;
    const s = `${st.collection.length}:${st.user?.totalPacksOpened}:${st.friends.length}:${st.binders.length}`;
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
      const parts = (sub ?? '').split('/');
      const id = parts[0] ? decodeURIComponent(parts[0]) : '';
      // #/profil/classement : directement le classement
      if (id === 'classement') {
        tab = 'classement';
        void load('');
        return;
      }
      void load(id);
    },
    leave() {
      if (open) closeViewer();
      editing = false;
      cosmOpen = false;
      cosm.hidden = true;
    },
  };
}
