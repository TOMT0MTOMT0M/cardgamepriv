import { cardKey, type Friend, type GameBackend, type PlayerCard, type TradeItem, type TradeView } from '../backend';
import type { Shell } from '../shell';
import { catalogEntry } from '../../core/sets/themes';
import { rarity, type RarityId } from '../../core/rarity';
import { busyButton, cardTile, errMsg, esc, fold, h, thumbUrl, toast } from '../ui';
import { preloadThumbs } from '../preload';

/**
 * Échanges de cartes entre nous (n'importe quelle carte, doublon ou non).
 *  - En cours : propositions reçues (accepter / refuser) et envoyées (annuler).
 *  - Nouvel échange : on choisit un ami ; le jeu croise les deux collections et propose d'emblée
 *    « ses doublons qui te manquent » et « tes doublons qui lui manquent ». Un clic ajoute la carte au plateau.
 *    « Toutes les cartes » montre les deux collections entières : on peut tout échanger, même son dernier exemplaire
 *    (le serveur vérifie tout au moment d'accepter).
 *  - Ergonomie (retour de Tom, téléphone) : deux onglets « Je demande / Je donne » au lieu de deux grilles empilées
 *    (ses cartes cachaient les tiennes), grilles construites au fil du défilement, et sur téléphone la proposition est
 *    une barre collée en bas (résumé + bouton « Proposer ») qui se déplie en volet pour relire, retirer, écrire un mot.
 */
export interface TradesView {
  el: HTMLElement;
  enter(): void;
  leave(): void;
}

const RANK: Record<RarityId, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5, secret: 6 };
const value = (l: TradeItem[]) => l.reduce((a, it) => a + it.count * Math.pow(2.2, RANK[it.rarity]), 0);

export function createTradesView(backend: GameBackend, shell: Shell): TradesView {
  const el = h('section', 'view trades');
  let friend: Friend | null = null;
  let theirs: PlayerCard[] = [];
  let showAll = false;
  let give: TradeItem[] = [];
  let get: TradeItem[] = [];
  let loading = 0;
  /** dernière carte ajoutée au plateau (sa ligne arrive en glissant) */
  let lastAdded = '';
  /** onglet affiché : les cartes qu'on demande (les siennes) ou celles qu'on donne (les miennes) */
  let side: 'get' | 'give' = 'get';
  let giveHinted = false;
  const phone = () => matchMedia('(max-width: 860px)').matches;

  el.innerHTML = `
    <div class="tr-col left">
      <h3>En cours</h3><div class="pending"></div>
      <h3>Échanger avec…</h3><div class="friends"></div>
    </div>
    <div class="tr-col compose">
      <div class="placeholder">Choisis un ami : on croise vos collections pour trouver les cartes à échanger.</div>
      <div class="work" hidden>
        <div class="work-head"><button class="tr-back" aria-label="Revenir à la liste des amis">‹</button><h3 class="fname"></h3>
          <div class="seg tr-mode"><button data-m="sugg" class="on">Suggestions</button><button data-m="all">Toutes les cartes</button></div>
          <input class="search tr-search" type="search" placeholder="Chercher une carte…" autocomplete="off" spellcheck="false" aria-label="Chercher une carte" hidden></div>
        <div class="tr-side" role="tablist">
          <button role="tab" data-s="get" class="on" aria-selected="true"><b>Je demande</b><span>ses cartes · <i class="n-get">0</i></span><em class="p-get"></em></button>
          <button role="tab" data-s="give" aria-selected="false"><b>Je donne</b><span>mes cartes · <i class="n-give">0</i></span><em class="p-give"></em></button>
        </div>
        <div class="picks" data-side="get">
          <div class="pk pk-get"><h4 class="t-get"></h4><div class="grid mini g-get"></div></div>
          <div class="pk pk-give"><h4 class="t-give"></h4><div class="grid mini g-give"></div></div>
        </div>
      </div>
    </div>
    <div class="tr-col tray" hidden>
      <div class="tray-body">
        <h3>Proposition</h3>
        <div class="tray-sec"><h4>Tu reçois</h4><div class="tray-list l-get"></div></div>
        <div class="tray-sec"><h4>Tu donnes</h4><div class="tray-list l-give"></div></div>
        <div class="fair"></div>
        <input class="note" maxlength="140" placeholder="Un petit mot ? (optionnel)">
      </div>
      <div class="tray-bar">
        <button class="tray-toggle" aria-expanded="false" aria-label="Voir le détail de la proposition"><span class="tb-sum"></span><span class="tb-chev" aria-hidden="true">▴</span></button>
        <button class="btn-primary send" disabled>Proposer l’échange</button>
      </div>
    </div>`;
  const pendingEl = el.querySelector<HTMLElement>('.pending')!;
  const friendsEl = el.querySelector<HTMLElement>('.friends')!;
  const placeholder = el.querySelector<HTMLElement>('.placeholder')!;
  const work = el.querySelector<HTMLElement>('.work')!;
  const tray = el.querySelector<HTMLElement>('.tray')!;
  const gGet = el.querySelector<HTMLElement>('.g-get')!;
  const gGive = el.querySelector<HTMLElement>('.g-give')!;
  const lGet = el.querySelector<HTMLElement>('.l-get')!;
  const lGive = el.querySelector<HTMLElement>('.l-give')!;
  const fair = el.querySelector<HTMLElement>('.fair')!;
  const sendBtn = el.querySelector<HTMLButtonElement>('.send')!;
  const note = el.querySelector<HTMLInputElement>('.note')!;
  const modeBtns = el.querySelectorAll<HTMLButtonElement>('.tr-mode button');
  const search = el.querySelector<HTMLInputElement>('.tr-search')!;
  const picks = el.querySelector<HTMLElement>('.picks')!;
  const sideBtns = el.querySelectorAll<HTMLButtonElement>('.tr-side button');
  const traySum = el.querySelector<HTMLElement>('.tb-sum')!;
  const trayToggle = el.querySelector<HTMLButtonElement>('.tray-toggle')!;

  // ── onglets « Je demande / Je donne »
  function setSide(sd: 'get' | 'give', scroll = true) {
    side = sd;
    picks.dataset.side = sd;
    sideBtns.forEach((b) => {
      const on = b.dataset.s === sd;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    });
    if (scroll && phone()) {
      const top = el.querySelector<HTMLElement>('.tr-side')!.offsetTop - 8;
      if (el.scrollTop > top) el.scrollTo({ top });
    }
    requestAnimationFrame(() => growMore());
  }
  sideBtns.forEach((b) => b.addEventListener('click', () => setSide(b.dataset.s as 'get' | 'give')));

  // ── volet de la proposition (téléphone)
  const setTrayOpen = (open: boolean) => {
    tray.classList.toggle('open', open);
    trayToggle.setAttribute('aria-expanded', String(open));
  };
  trayToggle.addEventListener('click', () => setTrayOpen(!tray.classList.contains('open')));
  el.querySelector('.tr-back')!.addEventListener('click', () => {
    friend = null;
    loading++;
    el.classList.remove('composing');
    work.hidden = true;
    tray.hidden = true;
    placeholder.hidden = false;
    setTrayOpen(false);
    renderFriends();
    el.scrollTo({ top: 0 });
  });

  // ── grilles construites au fil du défilement (« Toutes les cartes » = parfois des milliers)
  const FIRST = 60, CHUNK = 60;
  const lists: Record<'get' | 'give', PlayerCard[]> = { get: [], give: [] };
  const shown: Record<'get' | 'give', number> = { get: 0, give: 0 };
  const gridOf = (sd: 'get' | 'give') => (sd === 'get' ? gGet : gGive);
  function tileFor(c: PlayerCard, sd: 'get' | 'give') {
    const tile = cardTile(c.cardId, c.rarity, { mini: true, count: c.count });
    tile.title = sd === 'get' ? `Demander ${name(c.cardId)}` : `Proposer ${name(c.cardId)}${c.count === 1 ? ' (ton seul exemplaire)' : ''}`;
    tile.addEventListener('click', () => add(sd, c, c.count));
    return tile;
  }
  function appendTiles(sd: 'get' | 'give', n: number) {
    const list = lists[sd], from = shown[sd], to = Math.min(list.length, from + n);
    if (to <= from) return;
    const frag = document.createDocumentFragment();
    for (let i = from; i < to; i++) frag.append(tileFor(list[i], sd));
    gridOf(sd).append(frag);
    shown[sd] = to;
    preloadThumbs(list.slice(from, to).map((c) => catalogEntry(c.cardId)), true);
    markPicks();
  }
  function growMore() {
    if (work.hidden || shown[side] >= lists[side].length) return;
    const g = gridOf(side);
    if (g.getBoundingClientRect().bottom - el.getBoundingClientRect().bottom > el.clientHeight * 1.5) return;
    appendTiles(side, CHUNK);
    requestAnimationFrame(() => growMore());
  }
  el.addEventListener('scroll', () => growMore(), { passive: true });

  const mine = () => {
    const m = new Map<string, PlayerCard>();
    for (const c of backend.state.collection) m.set(cardKey(c), c);
    return m;
  };
  const name = (id: string) => catalogEntry(id)?.name ?? id;

  // ── échanges en cours
  function itemsHtml(items: TradeItem[]) {
    return items.length
      ? items
          .map((it) => {
            const e = catalogEntry(it.cardId);
            const img = e && it.rarity !== 'secret' ? `<img alt="" loading="lazy" src="${thumbUrl(e)}">` : '';
            return `<span class="it" style="--rc:${rarity(it.rarity).hex}">${img}${it.count > 1 ? `${it.count}× ` : ''}${esc(name(it.cardId))} <i>${rarity(it.rarity).rank + 1}★</i></span>`;
          })
          .join('')
      : '<span class="it none">rien</span>';
  }
  function renderPending() {
    const { incoming, outgoing } = backend.state.trades;
    pendingEl.innerHTML = '';
    if (!incoming.length && !outgoing.length) pendingEl.innerHTML = '<div class="muted">Aucun échange en attente.</div>';
    const row = (t: TradeView, dir: 'in' | 'out') => {
      const r = h('div', `trade ${dir}`);
      r.innerHTML = dir === 'in'
        ? `<div class="who"><b>${esc(t.fromName)}</b> te propose</div><div class="its">${itemsHtml(t.offered)}</div><div class="who">contre</div><div class="its">${itemsHtml(t.requested)}</div>${t.note ? `<div class="tnote">«\u00a0${esc(t.note)}\u00a0»</div>` : ''}<div class="act"><button class="btn-primary ok">Accepter</button><button class="btn-ghost no">Refuser</button></div>`
        : `<div class="who">À <b>${esc(t.toName)}</b> · tu donnes</div><div class="its">${itemsHtml(t.offered)}</div><div class="who">contre</div><div class="its">${itemsHtml(t.requested)}</div><div class="act"><span class="muted">en attente…</span><button class="btn-ghost cancel">Annuler</button></div>`;
      const act = async (fn: () => Promise<void>, ok: string) => {
        r.querySelectorAll('button').forEach((b) => ((b as HTMLButtonElement).disabled = true));
        try {
          await fn();
          toast(ok, 'ok');
        } catch (e) {
          toast(errMsg(e), 'err');
          r.querySelectorAll('button').forEach((b) => ((b as HTMLButtonElement).disabled = false));
        }
      };
      r.querySelector('.ok')?.addEventListener('click', () => act(async () => (await backend.respondTrade(t.id, true), shell.sfx.chime(3, 0.08)), 'Échange conclu ! Les cartes sont dans ta collection.'));
      r.querySelector('.no')?.addEventListener('click', () => act(() => backend.respondTrade(t.id, false), 'Échange refusé.'));
      r.querySelector('.cancel')?.addEventListener('click', () => act(() => backend.cancelTrade(t.id), 'Proposition annulée.'));
      pendingEl.append(r);
    };
    incoming.forEach((t) => row(t, 'in'));
    outgoing.forEach((t) => row(t, 'out'));
  }

  function renderFriends() {
    const fs = backend.state.friends;
    friendsEl.innerHTML = fs.length ? '' : `<div class="muted">${backend.state.mode === 'online' ? 'Personne d’autre n’est encore inscrit.' : '—'}</div>`;
    for (const f of fs) {
      const b = h('button', `friend${friend?.id === f.id ? ' on' : ''}`, `<span class="dot${f.online ? ' on' : ''}"></span><span class="fn">${esc(f.name)}</span>${f.status ? `<span class="fs">${esc(f.status)}</span>` : ''}`);
      b.addEventListener('click', () => void pick(f));
      friendsEl.append(b);
    }
  }

  // ── composer
  async function pick(f: Friend) {
    const changed = friend?.id !== f.id;
    friend = f;
    give = [];
    get = [];
    note.value = '';
    renderFriends();
    placeholder.hidden = true;
    work.hidden = false;
    tray.hidden = false;
    el.classList.add('composing');
    setTrayOpen(false);
    if (changed) setSide('get', false);
    if (phone()) el.scrollTo({ top: 0 });
    el.querySelector<HTMLElement>('.fname')!.textContent = f.name;
    // en attendant sa collection : des cartes fantômes qui scintillent (la mise en page ne saute pas à l'arrivée)
    gGet.innerHTML = gGive.innerHTML = '<div class="tile mini skel"></div>'.repeat(5);
    const my = ++loading;
    try {
      // les cartes inconnues du catalogue (anciennes cartes du labo encore en base) ne s'échangent pas
      theirs = (await backend.friendCollection(f.id)).filter((c) => catalogEntry(c.cardId));
    } catch (e) {
      toast(errMsg(e), 'err');
      theirs = [];
    }
    if (my !== loading) return;
    renderPicks();
    renderTray();
  }

  function renderPicks() {
    const m = mine();
    const t = new Map(theirs.map((c) => [cardKey(c), c]));
    const sort = (a: PlayerCard, b: PlayerCard) => RANK[b.rarity] - RANK[a.rarity] || (catalogEntry(a.cardId)?.num ?? 0) - (catalogEntry(b.cardId)?.num ?? 0);
    const q = fold(search.value.trim());
    const match = (c: PlayerCard) => !q || fold(name(c.cardId)).includes(q) || String(catalogEntry(c.cardId)?.num ?? '') === q;
    // suggestions : ses cartes qui me manquent / mes cartes qui lui manquent (doublons en premier côté « je donne »)
    // toutes les cartes : les deux collections entières, sans filtre
    const canGet = theirs.filter((c) => (showAll || !m.has(cardKey(c))) && match(c)).sort(sort);
    const canGive = [...m.values()]
      .filter((c) => catalogEntry(c.cardId) && (showAll || !t.has(cardKey(c))) && match(c))
      .sort((a, b) => (showAll ? 0 : Number(b.count >= 2) - Number(a.count >= 2)) || sort(a, b));
    const fname = friend?.name ?? 'ton ami';
    el.querySelector<HTMLElement>('.t-get')!.textContent = showAll ? `Toutes les cartes de ${fname} — touche pour choisir, encore pour retirer` : `Ses cartes qui te manquent — touche pour choisir, encore pour retirer`;
    el.querySelector<HTMLElement>('.t-give')!.textContent = showAll ? `Toutes tes cartes — touche pour choisir, encore pour retirer` : `Tes cartes qui lui manquent — touche pour choisir, encore pour retirer`;
    el.querySelector<HTMLElement>('.n-get')!.textContent = String(canGet.length);
    el.querySelector<HTMLElement>('.n-give')!.textContent = String(canGive.length);
    const fill = (sd: 'get' | 'give', list: PlayerCard[]) => {
      const grid = gridOf(sd);
      lists[sd] = list;
      shown[sd] = 0;
      grid.innerHTML = '';
      if (!list.length) {
        grid.innerHTML = `<div class="muted">${q ? 'Aucune carte ne correspond.' : sd === 'get' ? 'Rien de nouveau chez lui pour toi.' : 'Rien qui lui manque.'}${!showAll && !q ? ' <button class="linkish see-all">Voir toutes les cartes</button>' : ''}</div>`;
        grid.querySelector('.see-all')?.addEventListener('click', () => el.querySelector<HTMLButtonElement>('.tr-mode [data-m="all"]')!.click());
        return;
      }
      appendTiles(sd, FIRST);
    };
    fill('get', canGet);
    fill('give', canGive);
    requestAnimationFrame(() => growMore());
  }

  /** exemplaires disponibles par carte choisie (pour le « + » de la proposition) */
  const maxOf = new Map<string, number>();
  function add(side: 'get' | 'give', c: PlayerCard, max: number) {
    const list = side === 'get' ? get : give;
    const k = cardKey(c);
    const it = list.find((x) => cardKey(x) === k);
    maxOf.set(`${side}:${k}`, max);
    if (it) {
      // deuxième toucher sur une carte déjà choisie : on la retire (plusieurs exemplaires → « + » dans la proposition)
      list.splice(list.indexOf(it), 1);
      shell.sfx.tick(0.9, 0.04);
      renderTray();
      return;
    } else {
      if (list.length >= 12) return toast('12 cartes différentes au maximum par côté.', 'info');
      list.push({ cardId: c.cardId, rarity: c.rarity, count: 1 });
    }
    lastAdded = `${side}:${k}`;
    shell.sfx.tick(1.4, 0.05);
    renderTray();
    lastAdded = '';
    // la barre de proposition réagit (téléphone : c'est elle qu'on regarde)
    tray.classList.remove('bump');
    void tray.offsetWidth;
    tray.classList.add('bump');
    // première carte demandée : on montre où choisir les siennes
    if (side === 'get' && !give.length && !giveHinted) {
      giveHinted = true;
      const b = el.querySelector<HTMLElement>('.tr-side [data-s="give"]')!;
      b.classList.remove('hint');
      void b.offsetWidth;
      b.classList.add('hint');
    }
  }

  function renderTray() {
    const fill = (box: HTMLElement, list: TradeItem[], side: 'get' | 'give') => {
      box.innerHTML = list.length ? '' : '<div class="muted">touche une carte pour l’ajouter</div>';
      for (const it of list) {
        const e = catalogEntry(it.cardId);
        const r = h('div', 'ti', `<span class="sw" style="background:${rarity(it.rarity).hex}"></span>${e ? `<img class="tth" alt="" src="${thumbUrl(e)}">` : ''}<span class="tn">${esc(name(it.cardId))}</span><span class="tc">×${it.count}</span>${(maxOf.get(`${side}:${cardKey(it)}`) ?? 1) > it.count ? '<button class="plus" aria-label="Un exemplaire de plus">+</button>' : ''}<button class="minus" aria-label="Retirer une carte">✕</button>`);
        if (lastAdded === `${side}:${cardKey(it)}`) r.classList.add('new');
        r.querySelector('.minus')!.addEventListener('click', () => {
          it.count--;
          if (it.count <= 0) list.splice(list.indexOf(it), 1);
          renderTray();
        });
        r.querySelector('.plus')?.addEventListener('click', () => {
          it.count++;
          renderTray();
        });
        box.append(r);
      }
    };
    fill(lGet, get, 'get');
    fill(lGive, give, 'give');
    markPicks();
    const vg = value(give), vr = value(get);
    fair.className = 'fair';
    if (!give.length && !get.length) fair.textContent = '';
    else if (vr === 0) (fair.textContent = 'Cadeau : tu ne demandes rien.'), fair.classList.add('ok');
    else if (vg >= vr * 0.8 && vg <= vr * 1.25) (fair.textContent = 'Échange équilibré.'), fair.classList.add('ok');
    else if (vg < vr) (fair.textContent = 'Tu demandes plus que tu ne donnes.'), fair.classList.add('warn');
    else (fair.textContent = 'Tu donnes plus que tu ne reçois.'), fair.classList.add('info');
    sendBtn.disabled = !friend || (!give.length && !get.length);
    // résumé de la barre (téléphone) + compteurs sur les onglets
    const n = (l: TradeItem[]) => l.reduce((a, it) => a + it.count, 0);
    const ng = n(get), nd = n(give);
    traySum.innerHTML = !ng && !nd ? '<span class="muted">Touche des cartes pour composer l’échange</span>' : `<b>${ng}</b> reçue${ng > 1 ? 's' : ''} · <b>${nd}</b> donnée${nd > 1 ? 's' : ''}${fair.textContent ? ` <span class="${fair.className}">· ${esc(fair.textContent.replace(/\.$/, ''))}</span>` : ''}`;
    el.querySelector<HTMLElement>('.p-get')!.textContent = ng ? `${ng} choisie${ng > 1 ? 's' : ''}` : '';
    el.querySelector<HTMLElement>('.p-give')!.textContent = nd ? `${nd} choisie${nd > 1 ? 's' : ''}` : '';
  }

  /** Dans les grilles, les cartes déjà dans la proposition : contour et pastille « ×2 » (mise à jour sur place). */
  function markPicks() {
    for (const [grid, list] of [[gGet, get], [gGive, give]] as const) {
      for (const t of grid.querySelectorAll<HTMLElement>('.tile')) {
        const it = list.find((x) => x.cardId === t.dataset.card && x.rarity === t.dataset.rarity);
        t.classList.toggle('picked', !!it);
        let b = t.querySelector<HTMLElement>('.badge');
        if (it && !b) t.append((b = h('span', 'badge')));
        if (b) {
          if (it) b.textContent = `×${it.count}`;
          else b.remove();
        }
      }
    }
  }

  modeBtns.forEach((b) =>
    b.addEventListener('click', () => {
      showAll = b.dataset.m === 'all';
      modeBtns.forEach((x) => x.classList.toggle('on', x === b));
      search.hidden = !showAll;
      if (!showAll) search.value = '';
      renderPicks();
    }),
  );
  let searchT = 0;
  search.addEventListener('input', () => {
    clearTimeout(searchT);
    searchT = window.setTimeout(renderPicks, 160);
  });

  sendBtn.addEventListener('click', async () => {
    if (!friend) return;
    sendBtn.disabled = true;
    try {
      await busyButton(sendBtn, backend.proposeTrade(friend.id, give, get, note.value.trim() || undefined));
      toast(`Proposition envoyée à ${friend.name} !`, 'ok');
      give = [];
      get = [];
      note.value = '';
      setTrayOpen(false);
      renderTray();
    } catch (e) {
      toast(errMsg(e), 'err');
      renderTray();
    }
  });

  let pendSig = '';
  let friendSig = '';
  backend.onChange((st) => {
    if (!el.isConnected) return;
    const ps = [...st.trades.incoming, ...st.trades.outgoing].map((t) => t.id).join(',');
    if (ps !== pendSig) ((pendSig = ps), renderPending());
    const fsig = st.friends.map((f) => `${f.id}:${f.online ? 1 : 0}:${f.status ?? ''}`).join('|');
    if (fsig !== friendSig) ((friendSig = fsig), renderFriends());
  });

  return {
    el,
    enter() {
      shell.show(null);
      shell.setDimmed(true);
      pendSig = friendSig = ''; // on redessine tout en arrivant
      renderPending();
      renderFriends();
      // « Proposer un échange » depuis le profil d'un ami : on arrive directement sur lui
      const want = sessionStorage.getItem('bebou.tradeWith');
      sessionStorage.removeItem('bebou.tradeWith');
      const wanted = want ? backend.state.friends.find((f) => f.id === want) : undefined;
      if (wanted) void pick(wanted);
      else if (friend) void pick(backend.state.friends.find((f) => f.id === friend!.id) ?? friend);
    },
    leave() {
      setTrayOpen(false);
    },
  };
}
