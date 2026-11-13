import { errText } from '../../core/errors';
import '../../core/i18n/fr/game.views.games'; // (textes de ce module, version anglaise)
import { locale, t as tr, lang } from '../../core/i18n';
import type { GameBackend } from '../backend';
import { liveRegen } from '../backend';
import type { Shell } from '../shell';
import type { AbuseAlertView, DuelSideView, DuelView, RoyaleView, RouletteView } from '../eco';
import { CARD_STARS, CARD_VALUE, fmtCoins, stakeValue, type StakeItem } from '../../core/economy';
import {
  DUEL_MAX_PACKS,
  GAMES_OPEN,
  MAX_NUMBERS,
  ROULETTE_HOURS,
  ROULETTE_PRICES,
  matchPrice,
  priceLabel,
  type RoulettePrice,
  ROULETTE_NUMBERS,
  ROYALE_MAX,
  ROYALE_MAX_PACKS,
  ROYALE_MIN,
  royalePackCount,
  duelProblem,
  packChoiceLabel,
  packChoices,
  potOdds,
  type GameCard,
  type PackChoice,
  type Stake,
} from '../../core/games';
import { rarity, starCount, type RarityId } from '../../core/rarity';
import { busyButton, cardTile, errMsg, esc, fmtDelay, h, plural, toast } from '../ui';
import { pickCards } from './picker';
import { confirmTap, guarded, isPending } from './safety';
import { COIN_ICON, coinsHtml } from './wallet';
import { catalogEntry } from '../../core/sets/themes';
import '../games.css';
import '../casino.css';
import { flip, leave, rollNumber } from '../../core/morph';
import { reducedMotion } from '../../core/motion';
import { mountGridArt } from './gridArt';
import { yieldToMain } from '../../core/yieldMain';

/**
 * ESPACE JEUX (#/jeux) : les vrais jeux seulement — 1v1 Pack Battle, Pack Battle Royale, Roulette à cartes —, avec
 * l'historique de MES PARTIES et le panneau admin (alertes anti-abus). Règles : src/core/games.ts.
 * Pages : #/jeux · #/jeux/duel[/id] · #/jeux/royale[/id] · #/jeux/roulette · #/jeux/historique · #/jeux/admin.
 * Retours live 02 (nettoyage) : ce qui n'est pas un jeu est sorti — la forge est dans la collection (#/collection/forge),
 * les succès ET les primes de complétion dans la page Succès (#/succes, #/succes/primes), les missions de la semaine
 * dans le panneau des missions, l'historique des pièces dans le portefeuille. Les anciennes adresses (#/jeux/forge,
 * #/jeux/primes, #/jeux/succes) sont redirigées par main.ts (et ici, en secours).
 *
 * Garde-fous (audit 03/11) : chaque bouton qui envoie une mutation passe par `guarded` (pas de double envoi), et ce qui
 * engage des cartes ou des pièces demande un second toucher (`confirmTap`) avec l'enjeu affiché.
 */

type Sub = '' | 'duel' | 'royale' | 'roulette' | 'historique' | 'admin';

const starsTxt = (r: RarityId) => (r === 'secret' ? '✷' : '★'.repeat(starCount(r)));
const ava = (name: string, url?: string) => (url ? `<img class="gm-ava" src="${esc(url)}" alt="">` : `<span class="gm-ava">${esc(name.slice(0, 1))}</span>`);
/** heure de tirage : « 20 h » / « 8 pm » */
const hourLabel = (x: number) => (lang() === 'fr' ? `${x} h` : `${x % 12 || 12} ${x < 12 ? 'am' : 'pm'}`);
const packChip = (p: PackChoice, i?: number) => `<span class="gm-pack ${p.kind === 'bebou' ? 'bebou' : `t-${p.themeId}`}"${i !== undefined ? ` data-i="${i}"` : ''}>${esc(packChoiceLabel(p).replace(' Pack', ''))}</span>`; // i18n-ok
const stakeLine = (s: Stake) => (s.coins || s.cards.length ? `${s.coins ? coinsHtml(s.coins) : ''}${s.cards.length ? ` <span class="gm-cards-n">${plural(s.cards.reduce((a, c) => a + c.count, 0), 'carte')}</span>` : ''} <span class="muted">= ${fmtCoins(stakeValue(s))}</span>` : '<span class="muted">' + tr('gm.noSidePot') + '</span>');
/** « 2 cartes 4★ + 1 carte 5★ » : ce qu'on engage, par étoile */
const cardsSummary = (l: Array<{ rarity: RarityId; count: number }>) => {
  const m = new Map<RarityId, number>();
  for (const c of l) m.set(c.rarity, (m.get(c.rarity) ?? 0) + c.count);
  return [...m].sort((a, b) => CARD_VALUE[a[0]] - CARD_VALUE[b[0]]).map(([r, n]) => `${n}×${starsTxt(r)}`).join(' + ');
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/**
 * L'enjeu en fiche lisible d'un coup d'œil (V2, 08/11) : quatre cases Enjeu / Victoire / Défaite / Égalité au lieu
 * d'une phrase à rallonge. Sert au Pack Battle et à la Battle Royale.
 */
const riskGrid = (rows: Array<[label: string, text: string, cls?: string]>) =>
  `<dl class="gm-riskg">${rows.map(([l, t, c]) => `<div${c ? ` class="${c}"` : ''}><dt>${l}</dt><dd>${t}</dd></div>`).join('')}</dl>`;
/** Ce qu'on risque dans un Pack Battle, à côté du bouton (et plus seulement dans les règles en bas de page). */
const riskLine = (st: { packs: PackChoice[]; stake: Stake }) => {
  const n = st.packs.length;
  const v = stakeValue(st.stake);
  return riskGrid([
    [tr('gm.stake'), `${plural(n, 'booster')}${v ? tr('gm.plusPot', { v: fmtCoins(v), cards: st.stake.cards.length ? tr('gm.including', { cards: cardsSummary(st.stake.cards) }) : '' }) : ''}`],
    [tr('gm.win'), tr('gm.winD', { n: n * 10, pots: v ? tr('gm.bothPots') : '' }), 'plus'],
    [tr('gm.loss'), tr('gm.lossD', { n: n * 5, pot: v ? tr('gm.yourPot') : '' }), 'minus'],
    [tr('gm.draw'), tr('gm.drawD')],
  ]);
};
/** Compte à rebours technique « 07:04:12 » (le tirage de la roulette). */
const clock = (ms: number) => {
  const t = Math.max(0, Math.floor(ms / 1000));
  const p2 = (x: number) => String(x).padStart(2, '0');
  return `${p2(Math.floor(t / 3600))}:${p2(Math.floor((t % 3600) / 60))}:${p2(t % 60)}`;
};

export function createGamesView(backend: GameBackend, shell: Shell) {
  const el = h('section', 'view games');
  const head = h('div', 'gm-top');
  const body = h('div', 'gm-body');
  el.append(head, body);
  let sub: Sub = '';
  let arg = '';
  let unsubs: Array<() => void> = [];
  /** change à chaque nettoyage : un montage différé d'une page quittée entre-temps s'abandonne */
  let hubGen = 0;
  const cleanup = () => {
    hubGen++;
    unsubs.forEach((u) => u());
    unsubs = [];
  };
  const myId = () => (backend.state.mode === 'demo' ? 'me' : backend.state.user?.id ?? '');
  const snap = () => backend.eco.snapshot;
  /**
   * Retours live n°1 : l'onglet GAMES reste une page d'attente (« bientôt ») pour tout le monde ; seuls les admins
   * (et la démo hors-ligne) voient déjà l'espace Jeux complet, pour le tester avant l'ouverture.
   * Ouvrir les jeux à tous : passer GAMES_OPEN à true.
   */
  const open = () => GAMES_OPEN || !!snap()?.isAdmin;
  let wasOpen = false;
  const packsLeft = () => (backend.state.user ? liveRegen(backend.state.user).balance : 0);
  const sfx = (k: 'tick' | 'chime' | 'big') => {
    try {
      if (k === 'tick') shell.sfx.tick(1.3, 0.04);
      else if (k === 'chime') shell.sfx.chime(3, 0.07);
      else shell.sfx.chime(6, 0.12);
    } catch {
      /* son indisponible */
    }
  };

  // ───────────────────────────── en-tête : solde + onglets
  /** solde affiché au dernier rendu : le nouveau solde ROULE depuis celui-ci */
  let shownCoins: number | null = null;
  function renderHead() {
    const s = snap();
    // les trois jeux (+ l'accueil et l'historique de mes parties) ; forge, succès, primes, missions : ailleurs (retours live 02)
    // (13/11, décision de Tom et Hugo) Défis et La Presse retirés du jeu : les trois jeux seulement
    const tabs: Array<[Sub, string]> = [['', tr('notif.k.games')], ['duel', 'Pack Battle'], ['royale', 'Battle Royale'], ['roulette', 'Roulette'], ['historique', tr('gm.myGames')]]; // i18n-ok
    if (s?.isAdmin) tabs.push(['admin', 'Admin']); // i18n-ok
    const at = tabs.findIndex(([k]) => k === sub);
    const crumb = at > 0 ? `<i>/</i>${String(at).padStart(2, '0')} ${esc(tabs[at][1])}` : '<i>/</i>3 tables';
    head.innerHTML = `<div class="gm-title"><div><span class="gm-kick">${tr('gm.kick', { crumb })}</span><b>${tr('gm.space')}</b></div>${s ? `<div class="gm-bal"><span class="gm-bal-l">${tr('gm.balance')}</span>${coinsHtml(shownCoins ?? s.coins, 'big')}</div>` : ''}</div>
      <nav class="seg gm-tabs" data-seg-key="gm-tabs">${tabs.map(([k, l]) => `<button data-k="${k}" class="${k === sub ? 'on' : ''}">${l}</button>`).join('')}</nav>`;
    head.querySelectorAll<HTMLElement>('[data-k]').forEach((b) => b.addEventListener('click', () => (location.hash = `#/jeux${b.dataset.k ? `/${b.dataset.k}` : ''}`)));
    // téléphone : les onglets défilent ; l'onglet actif est ramené au milieu (il était parfois coupé au bord)
    const nav = head.querySelector<HTMLElement>('.gm-tabs');
    const on = nav?.querySelector<HTMLElement>('button.on');
    if (nav && on && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = on.offsetLeft - (nav.clientWidth - on.offsetWidth) / 2;
    if (!s) return;
    const bal = head.querySelector<HTMLElement>('.gm-bal');
    const num = bal?.querySelector<HTMLElement>('.coins-v b');
    if (bal && num && shownCoins !== null && shownCoins !== s.coins) {
      rollNumber(num, shownCoins, s.coins, (n) => fmtCoins(Math.round(n)), 900);
      bal.classList.add(s.coins > shownCoins ? 'up' : 'down');
    }
    shownCoins = s.coins;
  }
  backend.eco.onChange(() => {
    if (!el.isConnected) return;
    if (open() !== wasOpen) return draw();
    renderHead();
  });

  // ═════════════════════════════ accueil
  function hub() {
    body.innerHTML = `<div class="gm-hub">
      <a class="gm-game duel" href="#/jeux/duel"><span class="gm-art-host"></span><span class="gm-idx">01 — 1v1</span><b>Pack Battle</b><span class="gm-desc">${tr('gm.duelD')}</span><dl class="gm-spec"><div><dt>${tr('gm.players')}</dt><dd>2</dd></div><div><dt>${tr('gm.bet')}</dt><dd>1–${DUEL_MAX_PACKS} boosters</dd></div><div><dt>${tr('gm.gain')}</dt><dd>${tr('gm.all')}</dd></div></dl><em class="gm-live"><i class="gm-dot"></i><span data-live="duel">…</span></em><i class="gm-arrow" aria-hidden="true"><i>→</i></i></a>
      <a class="gm-game royale" href="#/jeux/royale"><span class="gm-art-host"></span><span class="gm-idx">${tr('gm.royaleIdx')}</span><b>Battle Royale</b><span class="gm-desc">${tr('gm.royaleD')}</span><dl class="gm-spec"><div><dt>${tr('gm.players')}</dt><dd>${ROYALE_MIN}–${ROYALE_MAX}</dd></div><div><dt>${tr('gm.bet')}</dt><dd>1–${ROYALE_MAX_PACKS} boosters</dd></div><div><dt>${tr('gm.gain')}</dt><dd>${tr('gm.all')}</dd></div></dl><em class="gm-live"><i class="gm-dot"></i><span data-live="royale">…</span></em><i class="gm-arrow" aria-hidden="true"><i>→</i></i></a>
      <a class="gm-game roulette" href="#/jeux/roulette"><span class="gm-art-host"></span><span class="gm-idx">${tr('gm.rouletteIdx')}</span><b>Roulette</b><span class="gm-desc">${tr('gm.rouletteD')}</span><dl class="gm-spec"><div><dt>${tr('gm.numbers')}</dt><dd>${ROULETTE_NUMBERS}</dd></div><div><dt>${tr('gm.draws')}</dt><dd>${ROULETTE_HOURS.map(hourLabel).join(' · ')}</dd></div><div><dt>${tr('gm.gain')}</dt><dd>${tr('gm.all')}</dd></div></dl><em class="gm-live"><i class="gm-dot"></i><span data-live="roulette">…</span></em><i class="gm-arrow" aria-hidden="true"><i>→</i></i></a> <!-- i18n-ok -->
      <div class="gm-rules muted">${tr('gm.virtual')}</div>
    </div>`;
    // dessins « courant » alignés sur la trame (views/gridArt.ts). Chaque montage échantillonne ses pistes (~0,5 s sur
    // téléphone) : un par tâche, l'accueil et ses textes étant déjà peints ; même ordre, mêmes délais de tracé.
    const kinds = ['duel', 'royale', 'roulette'] as const;
    const gen = hubGen;
    void (async () => {
      for (let i = 0; i < kinds.length; i++) {
        await yieldToMain();
        if (gen !== hubGen) return;
        const g = body.querySelectorAll<HTMLElement>('.gm-game')[i];
        if (!g?.isConnected) return;
        g.dataset.artDelay = String(i * 160);
        unsubs.push(mountGridArt(g.querySelector<HTMLElement>('.gm-art-host')!, g, el, kinds[i]));
      }
    })();
    // filet qui suit la souris (ordinateur seulement)
    // (audit 12/11, S14 / A4-13) position de la tuile mesurée à l'entrée de la souris (et au défilement), plus à
    // chaque mouvement : lire après avoir écrit forçait une mise en page par mouvement
    body.querySelectorAll<HTMLElement>('.gm-game').forEach((g) => {
      let r: DOMRect | null = null;
      const drop = () => (r = null); // la page a défilé ou changé de taille : à remesurer au prochain mouvement
      g.addEventListener('pointerenter', () => {
        r = g.getBoundingClientRect();
        window.addEventListener('scroll', drop, { capture: true, passive: true });
        window.addEventListener('resize', drop, { passive: true });
      });
      g.addEventListener('pointerleave', () => {
        r = null;
        window.removeEventListener('scroll', drop, { capture: true });
        window.removeEventListener('resize', drop);
      });
      g.addEventListener('pointermove', (e) => {
        if (e.pointerType !== 'mouse') return;
        r ??= g.getBoundingClientRect();
        g.style.setProperty('--mx', `${e.clientX - r.left}px`);
        g.style.setProperty('--my', `${e.clientY - r.top}px`);
      });
    });
    const live = (k: string, t: string) => {
      const e = body.querySelector<HTMLElement>(`[data-live="${k}"]`);
      if (e) e.innerHTML = t;
    };
    unsubs.push(
      backend.eco.watchLobby((l) => {
        if (!l) return;
        const mine = l.duels.filter((d) => d.sides.some((s) => s.userId === l.me)).length;
        live('duel', `${l.duels.length ? plural(l.duels.length, 'duel ouvert', 'duels ouverts') : tr('gm.noDuel')}${mine ? tr('gm.yours', { n: mine }) : ''}`);
        live('royale', l.royales.length ? tr('gm.royalesWaiting', { games: plural(l.royales.length, 'partie'), list: l.royales.map((r) => `${r.players.length}/${ROYALE_MAX}`).join(', ') }) : tr('gm.noRoyale'));
      }),
      backend.eco.watchRoulette((r) => {
        if (!r) return;
        live('roulette', r.round ? tr('gm.rouletteLive', { icon: COIN_ICON, pot: fmtCoins(r.round.pot.value), n: r.round.bets.reduce((a, b) => a + b.numbers.length, 0), max: ROULETTE_NUMBERS, time: fmtDelay(r.nextDrawAt - Date.now()) }) : tr('gm.drawsAt'));
      }),
    );
  }

  // ═════════════════════════════ éditeur de mise (boosters + pot annexe)
  function stakeEditor(host: HTMLElement, init: { packs: PackChoice[]; stake: Stake }, o: { fixedCount?: number; title: string; target?: number; onChange?: () => void }) {
    const st = { packs: init.packs.map((p) => ({ ...p })), stake: { coins: init.stake.coins, cards: init.stake.cards.map((c) => ({ ...c })) } };
    const choices = packChoices();
    const balance = () => snap()?.coins ?? 0;
    let ready = false;
    const valueLine = () => {
      const v = stakeValue(st.stake);
      return `${tr('gm.potValue')} <b>${fmtCoins(v)}</b>${o.target !== undefined ? ` <span class="${Math.abs(v - o.target) <= 0.05 * Math.max(v, o.target) ? 'ok' : 'warn'}">(${tr('gm.facing')} ${fmtCoins(o.target)}, ±5 %)</span>` : ''} <span class="muted">· solde : ${fmtCoins(balance())}</span>`;
    };
    const render = () => {
      host.innerHTML = `<div class="gm-ed"><div class="gm-ed-h">${esc(o.title)}</div>
        <div class="gm-ed-row"><span>${tr('gm.boosters')}</span><span class="gm-packs">${st.packs.map((p, i) => packChip(p, i)).join('')}</span>${o.fixedCount ? '' : `<span class="gm-step"><button class="btn-ghost sm" data-a="-" aria-label="Un booster de moins"${st.packs.length <= 1 ? ' disabled' : ''}>−</button><output aria-live="polite">${st.packs.length}<small>/${DUEL_MAX_PACKS}</small></output><button class="btn-ghost sm" data-a="+" aria-label="${tr('gm.addPack')}"${st.packs.length >= DUEL_MAX_PACKS ? ' disabled' : ''}>+</button></span>`}</div>
        <div class="muted">${tr('gm.tapPack', { n: packsLeft() })}</div>
        <div class="gm-ed-row"><span>Pot annexe</span><label class="gm-coin-in">${COIN_ICON}<input type="number" min="0" max="${balance()}" step="10" value="${st.stake.coins}" inputmode="numeric" aria-label="${tr('gm.potCoins')}"></label><button class="btn-ghost sm gm-pick">${tr('gm.cardsBtn', { x: st.stake.cards.length ? ` (${st.stake.cards.reduce((a, c) => a + c.count, 0)})` : '' })}</button></div>
        <div class="gm-ed-v">${valueLine()}</div>
        ${st.stake.cards.length ? `<div class="gm-mini-cards">${st.stake.cards.map((c) => `<span class="gm-mc r-${c.rarity}" style="--rc:${rarity(c.rarity).hex}">${starsTxt(c.rarity)} ${esc(cardName(c.cardId))}${c.count > 1 ? ` ×${c.count}` : ''}</span>`).join('')}</div>` : ''}
      </div>`;
      if (ready) o.onChange?.(); // (pas au tout premier rendu : l'appelant n'a pas encore la mise)
      host.querySelectorAll<HTMLElement>('.gm-pack[data-i]').forEach((b) =>
        b.addEventListener('click', () => {
          const i = Number(b.dataset.i);
          const k = choices.findIndex((c) => c.kind === st.packs[i].kind && c.themeId === st.packs[i].themeId);
          st.packs[i] = { ...choices[(k + 1) % choices.length] };
          render();
        }),
      );
      host.querySelector('[data-a="+"]')?.addEventListener('click', () => {
        if (st.packs.length < DUEL_MAX_PACKS) st.packs.push({ ...st.packs[st.packs.length - 1] });
        render();
      });
      host.querySelector('[data-a="-"]')?.addEventListener('click', () => {
        if (st.packs.length > 1) st.packs.pop();
        render();
      });
      const coinIn = host.querySelector<HTMLInputElement>('.gm-coin-in input')!;
      // borné par le solde (l'erreur n'arrivait qu'au serveur) ; la valeur suit la frappe, sans tout redessiner
      const readCoins = () => Math.min(balance(), Math.max(0, Math.floor(Number(coinIn.value) || 0)));
      coinIn.addEventListener('input', () => {
        st.stake.coins = readCoins();
        host.querySelector<HTMLElement>('.gm-ed-v')!.innerHTML = valueLine();
        o.onChange?.();
      });
      coinIn.addEventListener('change', () => {
        st.stake.coins = readCoins();
        // la frappe a déjà tout mis à jour : on ne redessine que si la valeur a dû être corrigée (sinon le bouton
        // touché juste après — « Je valide… » — serait remplacé sous le doigt)
        if (String(st.stake.coins) === coinIn.value) return;
        if (Number(coinIn.value) > balance()) toast(tr('gm.capped', { coins: fmtCoins(balance()) }), 'info');
        // (redessiner pendant l'événement « change » d'un champ qui perd le focus casse le DOM : on attend la fin)
        setTimeout(render, 0);
      });
      host.querySelector('.gm-pick')!.addEventListener('click', async () => {
        const r = await pickCards(backend, st.stake.cards, { title: tr('gm.potCards'), hint: tr('gm.values') });
        if (r) st.stake.cards = r;
        render();
      });
    };
    render();
    ready = true;
    return st;
  }

  // ═════════════════════════════ 1v1 Pack Battle
  /** « Remiser un booster » : la mise et l'adversaire du duel qui vient de finir, repris par le lobby */
  let rematch: { opp?: string; packs: PackChoice[] } | null = null;
  function duelLobby() {
    body.innerHTML = `<div class="gm-cols"><div class="gm-panel gm-create"></div><div class="gm-panel"><div class="gm-ph"><b>Duels ouverts</b></div><div class="gm-list"></div></div></div>
      <div class="gm-rules muted">${tr('gm.duelRules')}</div>`;
    const cr = body.querySelector<HTMLElement>('.gm-create')!;
    const edHost = h('div');
    const friends = backend.state.friends;
    cr.innerHTML = `<div class="gm-ph"><b>${tr('gm.createDuel')}</b></div>`;
    cr.append(edHost);
    const risk = h('div', 'gm-risk');
    // « Remiser un booster » (fin d'un duel) : même nombre de boosters, même adversaire
    const again = rematch;
    rematch = null;
    const st = stakeEditor(edHost, { packs: again?.packs.length ? again.packs : [{ kind: 'bebou' }], stake: { coins: 0, cards: [] } }, { title: again ? tr('gm.newBet') : tr('gm.yourBet'), onChange: () => (risk.innerHTML = riskLine(st)) });
    risk.innerHTML = riskLine(st);
    const foot = h('div', 'gm-ed-foot');
    foot.innerHTML = `<label>${tr('gm.opponent')} <select class="gm-opp"><option value="">${tr('gm.openToAll')}</option>${friends.map((f) => `<option value="${esc(f.id)}"${again?.opp === f.id ? ' selected' : ''}>${esc(f.name)}</option>`).join('')}</select></label><button class="btn-primary gm-go">${again ? tr('gm.relaunch') : tr('gm.create')}</button>`;
    cr.append(risk, foot);
    foot.querySelector<HTMLButtonElement>('.gm-go')!.addEventListener('click', (e) => {
      const btn = e.currentTarget as HTMLElement;
      // (rien n'est débité à la création : la mise ne part qu'à la double validation — pas de second toucher ici)
      void guarded('duel-create', btn, async () => {
        try {
          const id = await busyButton(btn, backend.eco.createDuel(st.packs, st.stake, foot.querySelector<HTMLSelectElement>('.gm-opp')!.value || undefined));
          sfx('chime');
          location.hash = `#/jeux/duel/${id}`;
        } catch (err) {
          toast(errMsg(err), 'err');
        }
      });
    });
    const list = body.querySelector<HTMLElement>('.gm-list')!;
    unsubs.push(
      backend.eco.watchLobby((l) => {
        if (!l) return void (list.innerHTML = '<div class="muted">' + tr('gm.login') + '</div>');
        list.innerHTML = l.duels.length ? '' : '<div class="muted">' + tr('gm.noDuels') + '</div>';
        for (const d of l.duels) {
          const a = d.sides[0];
          const r = h('a', 'gm-item');
          r.href = `#/jeux/duel/${d.id}`;
          r.innerHTML = `${ava(a.name, a.avatarUrl)}<span class="gm-it"><b>${esc(a.name)}</b> · ${plural(a.packs.length, 'booster')} ${a.packs.map((p) => packChip(p)).join('')}<br>${stakeLine(a.stake)}${d.invitedId ? ` · <em>${d.invitedId === l.me ? tr('gm.challenges') : tr('gm.invite')}</em>` : ''}</span><span class="gm-it-r">${d.sides.length > 1 ? `contre ${esc(d.sides[1].name)}` : d.creatorId === l.me ? tr('gm.waitingW') : 'Rejoindre →'}</span>`;
          list.append(r);
        }
      }),
    );
  }

  const shown = new Set<string>(); // parties déjà jouées à l'écran (on ne rejoue pas l'animation à chaque mise à jour)

  function duelRoom(id: string) {
    body.innerHTML = '<div class="gm-room"><div class="muted">' + tr('common.loading2') + '</div></div>';
    const room = body.querySelector<HTMLElement>('.gm-room')!;
    let editing: { packs: PackChoice[]; stake: Stake } | null = null;
    let sig = '';
    unsubs.push(
      backend.eco.watchDuel(id, (d) => {
        if (!d) return void (room.innerHTML = `<div class="muted">${tr('gm.duelGone')}</div>`);
        const s = JSON.stringify([d.status, d.sides.map((x) => [x.userId, x.ready, x.packs, x.stake])]);
        if (s === sig) return;
        sig = s;
        if (d.status === 'done') {
          if (!shown.has(d.id) && Date.now() - (d.resolvedAt ?? 0) < 120_000) {
            shown.add(d.id);
            void playDuel(room, d, true);
          } else playDuel(room, d, false);
          return;
        }
        if (d.status === 'cancelled') return void (room.innerHTML = '<div class="gm-panel"><b>' + tr('gm.duelCancelled') + '</b> <a href="#/jeux/duel">' + tr('gm.backDuels') + '</a></div>');
        openDuelRoom(room, d, editing, (e) => (editing = e));
      }),
    );
  }

  /** empreinte d'une mise, indépendante de la forme des objets */
  const sideKey = (packs: PackChoice[], stake: Stake) =>
    [
      packs.map((p) => (p.kind === 'theme' ? `t:${p.themeId}` : 'b')).join(','),
      Math.round(stake.coins),
      stake.cards.map((c) => `${c.cardId}:${c.rarity}:${c.count}`).sort().join(','),
    ].join('|');

  function openDuelRoom(room: HTMLElement, d: DuelView, editing: { packs: PackChoice[]; stake: Stake } | null, setEditing: (e: { packs: PackChoice[]; stake: Stake } | null) => void) {
    const uid = myId();
    const mine = d.sides.findIndex((s) => s.userId === uid);
    const canJoin = mine < 0 && d.sides.length < 2 && (!d.invitedId || d.invitedId === uid);
    room.innerHTML = `<div class="gm-ph"><a href="#/jeux/duel" class="gm-back">← Duels</a><b>Pack Battle · ${plural(d.sides[0].packs.length, 'booster')} chacun</b></div><div class="gm-vs"></div><div class="gm-ed-host"></div><div class="gm-actions"></div>`;
    const vs = room.querySelector<HTMLElement>('.gm-vs')!;
    const side = (s: DuelSideView | undefined, i: number) => {
      const c = h('div', `gm-side${s?.ready ? ' ready' : ''}${i === mine ? ' mine-side' : ''}`);
      c.innerHTML = s
        ? `<div class="gm-side-h">${ava(s.name, s.avatarUrl)}<b>${esc(s.name)}</b>${s.ready ? '<span class="gm-ok">' + tr('gm.ok') + '</span>' : '<span class="muted">' + tr('gm.notOk') + '</span>'}</div><div class="gm-packs">${s.packs.map((p) => packChip(p)).join('')}</div><div>${stakeLine(s.stake)}</div>${s.stake.cards.length ? `<div class="gm-mini-cards">${s.stake.cards.map((c) => `<span class="gm-mc" style="--rc:${rarity(c.rarity).hex}">${starsTxt(c.rarity)} ${esc(cardName(c.cardId))}${c.count > 1 ? ` ×${c.count}` : ''}</span>`).join('')}</div>` : ''}`
        : `<div class="gm-side-h"><span class="gm-ava">?</span><b>${d.invitedId ? tr('gm.inviteWait') : tr('gm.waitOpp')}</b></div><div class="muted">${tr('gm.listed')}</div>`;
      return c;
    };
    vs.append(side(d.sides[0], 0), h('div', 'gm-vs-x', 'VS'), side(d.sides[1], 1));
    const edHost = room.querySelector<HTMLElement>('.gm-ed-host')!;
    const acts = room.querySelector<HTMLElement>('.gm-actions')!;
    const other = mine >= 0 ? d.sides[1 - mine] : d.sides[0];
    if (mine >= 0 || canJoin) {
      const base = editing ?? (mine >= 0 ? { packs: d.sides[mine].packs, stake: d.sides[mine].stake } : { packs: d.sides[0].packs.map(() => ({ kind: 'bebou' as const })), stake: { coins: Math.min(snap()?.coins ?? 0, stakeValue(d.sides[0].stake)), cards: [] } });
      const risk = h('div', 'gm-risk');
      const st = stakeEditor(edHost, base, { title: mine >= 0 ? tr('gm.betReset') : tr('gm.betJoin'), fixedCount: mine === 0 ? undefined : d.sides[0].packs.length, target: other ? stakeValue(other.stake) : undefined, onChange: () => (setEditing(st), renderActs()) });
      edHost.addEventListener('click', () => setEditing(st), { capture: true });
      edHost.addEventListener('change', () => setEditing(st), { capture: true });
      acts.before(risk);
      /** mise affichée ≠ mise enregistrée sur le serveur (UX4-04) */
      // comparaison du CONTENU (sorte des boosters, pièces, cartes) : une simple différence de forme (ordre des clés,
      // champ en plus sur un booster) faisait croire à une modification, et « Enregistrer et valider » remettait alors à
      // zéro la validation d'en face — les deux joueurs s'annulaient à tour de rôle
      const dirty = () => mine >= 0 && sideKey(st.packs, st.stake) !== sideKey(d.sides[mine].packs, d.sides[mine].stake);
      // les actions (et l'avertissement ±5 %) suivent la mise affichée, pas celle du serveur
      function renderActs() {
        // (celui qui rejoint : sa mise affichée prend la place n° 2)
        const live = (i: number) => (i === mine || (canJoin && i === 1) ? { packs: st.packs, stake: st.stake } : d.sides[i] ? { packs: d.sides[i].packs, stake: d.sides[i].stake } : null);
        const problem = duelProblem(live(0)!, live(1));
        const ch = dirty();
        const meReady = mine >= 0 && d.sides[mine].ready && !ch;
        const otherReady = !!other?.ready;
        const canReady = mine >= 0 && d.sides.length === 2 && !meReady;
        risk.innerHTML = riskLine(st);
        acts.innerHTML = `${mine >= 0 ? `<button class="btn-ghost gm-save"${ch && !isPending('duel') ? '' : ' disabled'}>${tr('gm.saveBet')}</button>` : ''}${canJoin ? `<button class="btn-primary gm-join"${isPending('duel') ? ' disabled' : ''}>${tr('gm.join')}</button>` : ''}${canReady ? `<button class="btn-primary gm-ready"${problem || isPending('duel') ? ' disabled' : ''}>${ch ? tr('gm.saveConfirm') : otherReady ? tr('gm.confirmOpen') : tr('gm.confirmBet')}</button>` : ''}${mine >= 0 ? `<button class="btn-ghost danger gm-leave">${mine === 0 ? tr('gm.cancelDuel') : tr('gm.leave')}</button>` : ''}${ch ? '<div class="gm-warn">' + tr('gm.unsaved') + '</div>' : ''}${problem && (d.sides.length === 2 || canJoin) ? `<div class="gm-warn">${esc(errText(problem))}</div>` : ''}${meReady && !otherReady ? '<div class="muted">' + tr('gm.waitOther') + '</div>' : ''}`;
        const save = (btn: HTMLElement) =>
          guarded('duel', btn, async () => {
            try {
              await busyButton(btn, backend.eco.setDuelSide(d.id, st.packs, st.stake));
              setEditing(null);
              sfx('tick');
            } catch (err) {
              toast(errMsg(err), 'err');
            }
          });
        acts.querySelector<HTMLElement>('.gm-save')?.addEventListener('click', (e) => void save(e.currentTarget as HTMLElement));
        acts.querySelector<HTMLElement>('.gm-join')?.addEventListener('click', (e) => {
          const btn = e.currentTarget as HTMLElement;
          if (confirmTap(btn, tr('gm.confirmPlay', { packs: plural(st.packs.length, 'booster'), coins: stakeValue(st.stake) ? ` + ${fmtCoins(stakeValue(st.stake))}` : '' }))) void save(btn);
        });
        acts.querySelector<HTMLElement>('.gm-ready')?.addEventListener('click', (e) => {
          const btn = e.currentTarget as HTMLElement;
          // second toucher : c'est ici que la mise devient ferme (« plus de retour en arrière »)
          if (!confirmTap(btn, tr('gm.confirmLock', { packs: plural(st.packs.length, 'booster'), coins: stakeValue(st.stake) ? ` + ${fmtCoins(stakeValue(st.stake))}` : '' }))) return;
          void guarded('duel', btn, async () => {
            try {
              // la mise affichée d'abord (sinon on validerait l'ancienne, celle du serveur)
              if (dirty()) {
                await busyButton(btn, backend.eco.setDuelSide(d.id, st.packs, st.stake));
                setEditing(null);
              }
              const r = await busyButton(btn, backend.eco.readyDuel(d.id));
              if (!r.locked) toast(tr('gm.confirmed'), 'info');
            } catch (err) {
              toast(errMsg(err), 'err');
            }
          });
        });
        acts.querySelector<HTMLElement>('.gm-leave')?.addEventListener('click', (e) => {
          const btn = e.currentTarget as HTMLElement;
          void guarded('duel-leave', btn, async () => {
            try {
              await busyButton(btn, backend.eco.leaveDuel(d.id));
              location.hash = '#/jeux/duel';
            } catch (err) {
              toast(errMsg(err), 'err');
            }
          });
        });
      }
      renderActs();
    } else acts.innerHTML = `<div class="muted">${d.invitedId ? tr('gm.reserved') : tr('gm.full')}</div>`;
  }

  /** Ouverture côte à côte : cartes retournées une à une, compteurs d'étoiles en direct, suspense sur la dernière. */
  /**
   * Rythme des tirages (retours V1, 07/11 : « trop rapide » → tout ×2). Les deux cartes du tirage en cours s'affichent
   * aussi EN GRAND au centre (scène), les petites tuiles en dessous restent le décompte.
   */
  const DUEL_TEMPO = { carte: 480, finale: 760, derniere: 1400, suspense: 2400 };

  async function playDuel(room: HTMLElement, d: DuelView, animate: boolean) {
    const res = d.result!;
    const n = res.packs[0].length * 5;
    room.innerHTML = `<div class="gm-ph"><a href="#/jeux/duel" class="gm-back">← Duels</a><b>Pack Battle</b>${animate ? '<button class="btn-ghost sm gm-skip">' + tr('gm.skip') + '</button>' : ''}</div><div class="gm-battle"><div class="gm-tug" aria-hidden="true"><span><b>0</b><small>★</small></span><div class="gm-tug-bar"><i></i></div><span><b>0</b><small>★</small></span></div><div class="gm-stage"><div class="gm-big" data-k="0"></div><div class="gm-vs-x">VS</div><div class="gm-big" data-k="1"></div></div></div><div class="gm-verdict"></div>`;
    const bat = room.querySelector<HTMLElement>('.gm-battle')!;
    const bigs = [...bat.querySelectorAll<HTMLElement>('.gm-big')];
    // rapport de force (barre partagée selon les étoiles) + totaux qui roulent
    const tug = bat.querySelector<HTMLElement>('.gm-tug')!;
    const tugN = [...tug.querySelectorAll<HTMLElement>(':scope > span > b')];
    const tugBar = tug.querySelector<HTMLElement>('.gm-tug-bar > i')!;
    const updTug = (k: number, from: number, hex: string, big: boolean) => {
      const a = cols[0].total;
      const b = cols[1].total;
      tugBar.style.setProperty('--p', String(a + b ? a / (a + b) : 0.5));
      rollNumber(tugN[k], from, cols[k].total, (x) => String(Math.round(x)), 420);
      if (!big) return;
      tug.classList.remove('hit-l', 'hit-r');
      tug.style.setProperty('--hc', hex);
      void tug.offsetWidth;
      tug.classList.add(k ? 'hit-r' : 'hit-l');
    };
    const cols = d.sides.map((s, i) => {
      const c = h('div', 'gm-bcol');
      c.innerHTML = `<div class="gm-bh">${ava(s.name, s.avatarUrl)}<b>${esc(s.name)}</b><span class="gm-count">0★</span></div><div class="gm-slots"></div>`;
      const slots = c.querySelector<HTMLElement>('.gm-slots')!;
      res.packs[i].flat().forEach((card) => slots.append(slot(card)));
      return { el: c, count: c.querySelector<HTMLElement>('.gm-count')!, slots: [...slots.children] as HTMLElement[], total: 0 };
    });
    bat.append(cols[0].el, cols[1].el);
    let skip = !animate;
    room.querySelector('.gm-skip')?.addEventListener('click', () => (skip = true));
    const flip = (k: number, i: number) => {
      const card = res.packs[k].flat()[i];
      const sl = cols[k].slots[i];
      sl.classList.add('up');
      // la carte du tirage en grand, au centre (une nouvelle carte remplace la précédente en se retournant)
      const big = bigs[k];
      big.replaceChildren(cardTile(card.cardId, card.rarity));
      big.style.setProperty('--rc', rarity(card.rarity).hex);
      big.classList.toggle('hot', CARD_STARS[card.rarity] >= 5);
      big.classList.remove('in');
      void big.offsetWidth;
      big.classList.add('in');
      const before = cols[k].total;
      cols[k].total += CARD_STARS[card.rarity];
      rollNumber(cols[k].count, before, cols[k].total, (x) => `${Math.round(x)}★`, 420);
      updTug(k, before, rarity(card.rarity).hex, CARD_STARS[card.rarity] >= 5);
      cols[k].count.classList.remove('pop');
      void cols[k].count.offsetWidth;
      cols[k].count.classList.add('pop');
      if (CARD_STARS[card.rarity] >= 5) sl.classList.add('hot');
    };
    for (let i = 0; i < n; i++) {
      const last = i === n - 1;
      if (!skip && last) {
        bat.classList.add('suspense');
        await wait(DUEL_TEMPO.suspense);
      }
      for (const k of [0, 1]) {
        flip(k, i);
        if (!skip) {
          sfx(CARD_STARS[res.packs[k].flat()[i].rarity] >= 5 ? 'chime' : 'tick');
          await wait(last ? DUEL_TEMPO.derniere : i >= n - 5 ? DUEL_TEMPO.finale : DUEL_TEMPO.carte);
        }
      }
    }
    bat.classList.remove('suspense');
    room.querySelector('.gm-skip')?.remove();
    const v = room.querySelector<HTMLElement>('.gm-verdict')!;
    if (res.winner === undefined) {
      v.innerHTML = `<b><span>${tr('gm.perfectDraw')}</span></b> ${tr('gm.drawBack', { n: res.stars[0] })}`;
      bat.classList.add('push');
    } else {
      const w = d.sides[res.winner];
      const iWon = w.userId === myId();
      cols[res.winner].el.classList.add('win');
      cols[1 - res.winner].el.classList.add('lose');
      const pots = stakeValue(d.sides[0].stake) + stakeValue(d.sides[1].stake);
      v.innerHTML = `<b><span>${iWon ? tr('gm.youWinAll') : tr('gm.winsAll', { name: esc(w.name) })}</span></b> ${tr('gm.score', { a: res.stars[res.winner], b: res.stars[1 - res.winner], n: n * 2, pots: pots ? tr('gm.andPots', { v: fmtCoins(pots) }) : '', name: iWon ? 'toi' : esc(w.name) })}`;
      // bilan personnel (UX4-22) : ce que JE gagne ou perds, pas seulement le verdict
      const k = d.sides.findIndex((x) => x.userId === myId());
      if (k >= 0) {
        const myPot = stakeValue(d.sides[k].stake);
        v.insertAdjacentHTML('beforeend', iWon
          ? `<div class="gm-me plus">${tr('gm.youGain', { cards: plural(n * 2, 'carte'), pot: pots - myPot ? tr('gm.plusPotOnly', { v: fmtCoins(pots - myPot) }) : '' })} <a href="#/collection">${tr('gm.seeNew')}</a></div>`
          : `<div class="gm-me minus">${tr('gm.youLose', { cards: plural(n, 'carte'), pot: myPot ? tr('gm.andPot', { v: fmtCoins(myPot) }) : '' })}</div>`);
      }
      if (animate) sfx(iWon ? 'big' : 'tick');
    }
    // (retours 05/11) plus de « Rejouer » (revoir le même booster en boucle n'apporte rien) : on REMISE — un nouveau
    // duel contre le même adversaire, mise pré-remplie avec le même nombre de boosters (sortes modifiables)
    const k = d.sides.findIndex((x) => x.userId === myId());
    if (k >= 0) {
      const opp = d.sides[1 - k]?.userId;
      againButton(room.querySelector<HTMLElement>('.gm-verdict')!, 'Remiser un booster', () => {
        rematch = { opp, packs: d.sides[k].packs.map((p) => ({ ...p })) };
        location.hash = '#/jeux/duel';
      });
    }
  }

  /** « Remiser » / « Nouvelle partie » sous le verdict (remplace l'ancien « Rejouer ») */
  function againButton(host: HTMLElement, label: string, go: () => void) {
    const box = h('div', 'gm-again');
    const b = h('button', 'btn-primary gm-again-b', label);
    b.addEventListener('click', () => {
      sfx('tick');
      go();
    });
    box.append(b);
    host.append(box);
  }

  function slot(card: GameCard) {
    const s = h('div', 'gm-slot');
    s.style.setProperty('--rc', rarity(card.rarity).hex);
    const back = h('div', 'gm-back-face');
    const face = h('div', 'gm-face');
    face.append(cardTile(card.cardId, card.rarity, { mini: true }));
    s.append(back, face);
    return s;
  }

  // ═════════════════════════════ Battle Royale
  function royaleLobby() {
    body.innerHTML = `<div class="gm-cols"><div class="gm-panel"><div class="gm-ph"><b>${tr('gm.startRoyale')}</b></div><div class="gm-r-new"></div></div><div class="gm-panel"><div class="gm-ph"><b>${tr('gm.gamesWaiting')}</b></div><div class="gm-list"></div></div></div>
      <div class="gm-rules muted">${tr('gm.royaleRules', { min: ROYALE_MIN, max: ROYALE_MAX, packs: ROYALE_MAX_PACKS })}</div>`;
    let pick: PackChoice = { kind: 'bebou' };
    let count = 1;
    const nw = body.querySelector<HTMLElement>('.gm-r-new')!;
    const drawNew = () => {
      // (08/11) mise multi-boosters : nombre fixé à la création, identique pour tous les joueurs
      const counts = Array.from({ length: ROYALE_MAX_PACKS }, (_, i) => i + 1);
      nw.innerHTML = `<div class="gm-rcount"><span class="muted">${tr('gm.perPlayer')}</span>${counts.map((n) => `<button class="gm-pack-b gm-rc${n === count ? ' on' : ''}" data-n="${n}" aria-pressed="${n === count}">${n}</button>`).join('')}</div><div class="gm-packs">${packChoices().map((p, i) => `<button class="gm-pack-b${p.kind === pick.kind && p.themeId === pick.themeId ? ' on' : ''}" data-i="${i}">${packChip(p)}</button>`).join('')}</div><button class="btn-primary gm-r-go">${tr('gm.createEach', { packs: plural(count, 'booster') })}</button><div class="muted">${tr('gm.reserveDebit', { n: packsLeft(), d: count })}</div>`;
      nw.querySelectorAll<HTMLElement>('[data-i]').forEach((b) => b.addEventListener('click', () => ((pick = packChoices()[Number(b.dataset.i)]), drawNew())));
      nw.querySelectorAll<HTMLElement>('[data-n]').forEach((b) => b.addEventListener('click', () => ((count = Number(b.dataset.n)), drawNew())));
      nw.querySelector<HTMLElement>('.gm-r-go')!.addEventListener('click', (e) => {
        const btn = e.currentTarget as HTMLElement;
        void guarded('royale-create', btn, async () => {
          try {
            const id = await busyButton(btn, backend.eco.createRoyale(pick, count));
            location.hash = `#/jeux/royale/${id}`;
          } catch (err) {
            toast(errMsg(err), 'err');
          }
        });
      });
    };
    drawNew();
    const list = body.querySelector<HTMLElement>('.gm-list')!;
    unsubs.push(
      backend.eco.watchLobby((l) => {
        if (!l) return void (list.innerHTML = '<div class="muted">' + tr('gm.login') + '</div>');
        list.innerHTML = l.royales.length ? '' : '<div class="muted">' + tr('gm.noGame') + '</div>';
        for (const r of l.royales) {
          const a = h('a', 'gm-item');
          a.href = `#/jeux/royale/${r.id}`;
          a.innerHTML = `<span class="gm-avas">${r.players.map((p) => ava(p.name, p.avatarUrl)).join('')}</span><span class="gm-it"><b>${esc(r.players[0].name)}</b> ${tr('gm.royaleRow', { n: r.players.length, max: ROYALE_MAX, packs: plural(royalePackCount(r), 'booster') })}</span><span class="gm-it-r">${r.players.some((p) => p.userId === l.me) ? tr('gm.youreIn') : 'Rejoindre →'}</span>`;
          list.append(a);
        }
      }),
    );
  }

  function royaleRoom(id: string) {
    body.innerHTML = '<div class="gm-room"><div class="muted">' + tr('common.loading2') + '</div></div>';
    const room = body.querySelector<HTMLElement>('.gm-room')!;
    let pick: PackChoice = { kind: 'bebou' };
    let sig = '';
    unsubs.push(
      backend.eco.watchRoyale(id, (r) => {
        if (!r) return void (room.innerHTML = `<div class="muted">${tr('gm.gameGone')}</div>`);
        const s = JSON.stringify([r.status, r.players.map((p) => [p.userId, p.pack])]);
        if (s === sig) return;
        sig = s;
        if (r.status === 'done') {
          const fresh = !shown.has(r.id) && Date.now() - (r.resolvedAt ?? 0) < 120_000;
          shown.add(r.id);
          return void playRoyale(room, r, fresh);
        }
        if (r.status === 'cancelled') return void (room.innerHTML = '<div class="gm-panel"><b>' + tr('gm.gameCancelled') + '</b> <a href="#/jeux/royale">' + tr('gm.back') + '</a></div>');
        const uid = myId();
        const inIt = r.players.some((p) => p.userId === uid);
        const n = royalePackCount(r);
        room.innerHTML = `<div class="gm-ph"><a href="#/jeux/royale" class="gm-back">← Battle Royale</a><b>${tr('gm.royaleHead', { n: r.players.length, max: ROYALE_MAX, packs: plural(n, 'booster') })}</b></div>
          <div class="gm-royal-players">${r.players.map((p) => `<div class="gm-rp">${ava(p.name, p.avatarUrl)}<b>${esc(p.name)}</b>${packChip(p.pack)}</div>`).join('')}${Array.from({ length: Math.max(0, ROYALE_MIN - r.players.length) }, () => '<div class="gm-rp empty"><span class="gm-ava">?</span><b>' + tr('gm.waitingW') + '</b></div>').join('')}</div>
          <div class="gm-actions"></div>`;
        const acts = room.querySelector<HTMLElement>('.gm-actions')!;
        const packBar = () => `<span class="gm-packs">${packChoices().map((p, i) => `<button class="gm-pack-b${p.kind === pick.kind && p.themeId === pick.themeId ? ' on' : ''}" data-i="${i}">${packChip(p)}</button>`).join('')}</span>`;
        const busyR = isPending('royale');
        acts.innerHTML = `${inIt || r.players.length < ROYALE_MAX ? `<div class="gm-risk">${riskGrid([[tr('gm.stake'), `${plural(n, 'booster')} chacun`], [tr('gm.win'), tr('gm.royWinD', { n: n * 5 }), 'plus'], [tr('gm.loss'), tr('gm.royLossD', { n: n * 5, what: n > 1 ? tr('gm.yourPacks') : tr('gm.yourPack') }), 'minus'], [tr('gm.tie'), tr('gm.tieD')]])}</div>` : ''}${!inIt && r.players.length < ROYALE_MAX ? `${packBar()}<button class="btn-primary gm-rj"${busyR ? ' disabled' : ''}>${tr('gm.joinBtn')}</button>` : ''}${r.creatorId === uid ? `<button class="btn-primary gm-rs"${r.players.length < ROYALE_MIN || busyR ? ' disabled' : ''}>${tr('gm.launch', { n: r.players.length })}</button>` : ''}${inIt ? `<button class="btn-ghost danger gm-rl">${r.creatorId === uid ? tr('gm.cancelGame') : tr('gm.leave')}</button>` : ''}${r.players.length < ROYALE_MIN ? `<div class="muted">${tr('gm.needMore', { n: ROYALE_MIN - r.players.length })}</div>` : ''}`;
        acts.querySelectorAll<HTMLElement>('[data-i]').forEach((b) =>
          b.addEventListener('click', () => {
            pick = packChoices()[Number(b.dataset.i)];
            acts.querySelectorAll('.gm-pack-b').forEach((x) => x.classList.toggle('on', x === b));
          }),
        );
        const run = (sel: string, fn: () => Promise<unknown>, o: { after?: () => void; confirm?: string } = {}) =>
          acts.querySelector<HTMLElement>(sel)?.addEventListener('click', (e) => {
            const btn = e.currentTarget as HTMLElement;
            if (o.confirm && !confirmTap(btn, o.confirm)) return;
            void guarded('royale', btn, async () => {
              try {
                await busyButton(btn, fn());
                o.after?.();
              } catch (err) {
                toast(errMsg(err), 'err');
              }
            });
          });
        run('.gm-rj', () => backend.eco.joinRoyale(r.id, pick), { confirm: tr('gm.confirmStake', { packs: plural(n, 'booster') }) });
        run('.gm-rs', () => backend.eco.startRoyale(r.id), { confirm: tr('gm.confirmOpenN', { n: r.players.length }) });
        run('.gm-rl', () => backend.eco.leaveRoyale(r.id), { after: () => (location.hash = '#/jeux/royale') });
      }),
    );
  }

  async function playRoyale(room: HTMLElement, r: RoyaleView, animate: boolean) {
    const res = r.result!;
    const n = royalePackCount(r);
    const per = res.packs[0]?.length ?? n * 5;
    room.innerHTML = `<div class="gm-ph"><a href="#/jeux/royale" class="gm-back">← Battle Royale</a><b>${tr('gm.royaleTitle', { n: r.players.length, each: n > 1 ? tr('gm.each', { packs: plural(n, 'booster') }) : '' })}</b>${animate ? '<button class="btn-ghost sm gm-skip">' + tr('gm.skip') + '</button>' : ''}</div><div class="gm-royal"></div><div class="gm-verdict"></div>`;
    const g = room.querySelector<HTMLElement>('.gm-royal')!;
    const rows = r.players.map((p, i) => {
      const row = h('div', 'gm-rrow');
      row.innerHTML = `<div class="gm-bh"><span class="gm-rank">#${i + 1}</span>${ava(p.name, p.avatarUrl)}<b>${esc(p.name)}</b><span class="gm-count">0★</span></div><div class="gm-slots"></div>`;
      const sl = row.querySelector<HTMLElement>('.gm-slots')!;
      res.packs[i].forEach((c) => sl.append(slot(c)));
      g.append(row);
      return { row, count: row.querySelector<HTMLElement>('.gm-count')!, rank: row.querySelector<HTMLElement>('.gm-rank')!, slots: [...sl.children] as HTMLElement[], total: 0 };
    });
    let skip = !animate;
    room.querySelector('.gm-skip')?.addEventListener('click', () => (skip = true));
    for (let i = 0; i < per; i++) {
      const last = i === per - 1;
      if (!skip && last) {
        g.classList.add('suspense');
        await wait(1400);
      }
      rows.forEach((x, k) => {
        const c = res.packs[k][i];
        if (!c) return;
        x.slots[i].classList.add('up');
        if (CARD_STARS[c.rarity] >= 5) x.slots[i].classList.add('hot');
        const before = x.total;
        x.total += CARD_STARS[c.rarity];
        if (skip) x.count.textContent = `${x.total}★`;
        else rollNumber(x.count, before, x.total, (n) => `${Math.round(n)}★`, 420);
      });
      // classement en direct : les rangées GLISSENT à leur nouvelle place (FLIP)
      const order = rows.map((x, k) => [x.total, k]).sort((a, b) => b[0] - a[0]);
      const apply = () =>
        order.forEach(([, k], rank) => {
          rows[k].row.style.order = String(rank);
          rows[k].rank.textContent = `#${rank + 1}`;
          rows[k].row.classList.toggle('lead', rank === 0 && rows[k].total > 0);
        });
      if (skip) apply();
      else flip(rows.map((x) => x.row), apply);
      if (!skip) {
        sfx('tick');
        // plusieurs boosters : rythme un peu plus soutenu (jusqu'à 25 cartes par joueur)
        await wait(last ? 900 : per > 5 ? 420 : 650);
      }
    }
    g.classList.remove('suspense');
    room.querySelector('.gm-skip')?.remove();
    res.winners.forEach((w) => rows[w].row.classList.add('win'));
    const names = res.winners.map((w) => r.players[w].name);
    const iWon = res.winners.some((w) => r.players[w].userId === myId());
    room.querySelector<HTMLElement>('.gm-verdict')!.innerHTML =
      names.length === 1 ? `<b><span>${iWon ? tr('gm.youWinPot') : tr('gm.winsAll', { name: esc(names[0]) })}</span></b> ${tr('gm.royScore', { s: Math.max(...res.stars), n: res.packs.flat().length })}` : `<b><span>${tr('gm.tieAt', { s: Math.max(...res.stars) })}</span></b> ${tr('gm.shareRandom', { names: names.map(esc).join(' et ') })}`;
    if (animate) sfx(iWon ? 'big' : 'tick');
    if (r.players.some((p) => p.userId === myId())) againButton(room.querySelector<HTMLElement>('.gm-verdict')!, tr('gm.newGame'), () => (location.hash = '#/jeux/royale'));
  }

  // ═════════════════════════════ Roulette
  function roulettePage() {
    body.innerHTML = `<div class="gm-cols wide"><div class="gm-panel"><div class="gm-ph"><b>${tr('gm.table', { n: ROULETTE_NUMBERS })}</b><span class="gm-cd"></span></div><div class="gm-wheel r36"></div><div class="gm-cov" aria-hidden="true"><i></i></div><div class="gm-legend muted"></div></div><div class="gm-panel gm-bet"></div></div><div class="gm-panel"><div class="gm-ph"><b>${tr('gm.pot')}</b><span class="gm-potv"></span></div><div class="gm-pot"></div></div><div class="gm-panel"><div class="gm-ph"><b>${tr('gm.lastDraws')}</b></div><div class="gm-past"></div></div>
      <div class="gm-rules muted">${tr('gm.rouletteRules', { hours: ROULETTE_HOURS.map(hourLabel).join(tr('gm.and')) })}</div>`;
    const wheel = body.querySelector<HTMLElement>('.gm-wheel')!;
    const sel = new Set<number>();
    let stakeCards: StakeItem[] = [];
    let pay = 0; // façon de payer choisie (index dans la grille du nombre de numéros)
    let cur: RouletteView | null = null;
    /** dernier tirage connu (null = pas encore reçu) : un NOUVEAU tirage fait tourner la bille, même le tout premier */
    let lastPast: string | null = null;
    const cells: HTMLElement[] = [];
    for (let n = 1; n <= ROULETTE_NUMBERS; n++) {
      const c = h('button', 'gm-num', String(n));
      c.dataset.n = String(n);
      c.addEventListener('click', () => {
        if (c.classList.contains('taken') || c.classList.contains('mine')) return;
        if (cur?.round?.bets.some((b) => b.userId === cur?.me)) return void toast(tr('gm.alreadyBet'), 'info');
        if (sel.has(n)) sel.delete(n);
        else if (sel.size >= MAX_NUMBERS) return void toast(tr('gm.maxNumbers', { n: MAX_NUMBERS }), 'info');
        else sel.add(n);
        c.classList.toggle('sel', sel.has(n));
        pay = 0;
        stakeCards = [];
        drawBet();
      });
      cells.push(c);
      wheel.append(c);
    }
    const colors = ['#e8927c', '#7fb58a', '#6bb3e0', '#c79be8', '#e0c46b', '#e07a9b', '#8fd0c4', '#d39a6b'];
    const stakeOf = (p: RoulettePrice | undefined) => (p?.kind === 'coins' ? { coins: p.coins, cards: [] } : { coins: 0, cards: stakeCards });
    const drawBet = () => {
      const bet = body.querySelector<HTMLElement>('.gm-bet');
      if (!bet) return; // (page quittée pendant l'envoi)
      const r = cur?.round;
      const mine = r?.bets.find((b) => b.userId === cur?.me);
      const slot = r ? r.day : '';
      if (mine) {
        bet.innerHTML = `<div class="gm-ph"><b>${tr('gm.yourBet')}</b><span class="muted">${esc(slot)}</span></div>
          <div>${tr('gm.yourNumbers')} <b>${mine.numbers.join(', ')}</b></div>
          <div class="gm-ed-v">${tr('gm.inPot', { coins: mine.coins ? coinsHtml(mine.coins) : '', cards: mine.cards.length ? ` ${cardsSummary(mine.cards)}` : '' })}</div>
          <div class="muted">${tr('gm.oneBet', { hours: ROULETTE_HOURS.map(hourLabel).join(' / ') })}</div>
          ${backend.eco.demoDraw ? '<button class="btn-ghost sm gm-draw">' + tr('gm.drawNow') + '</button>' : ''}`;
        bindDraw(bet);
        syncDock();
        return;
      }
      const n = sel.size as 0 | 1 | 2 | 3;
      const opts = n ? ROULETTE_PRICES[n] : [];
      if (pay >= opts.length) pay = 0;
      const p = opts[pay];
      const stake = stakeOf(p);
      const bal = snap()?.coins ?? 0;
      const picked = stakeCards.reduce((a, c) => a + c.count, 0);
      const ok = !!n && !!matchPrice(n, stake) && (p?.kind !== 'coins' || p.coins <= bal);
      bet.innerHTML = `<div class="gm-ph"><b>${tr('gm.betBtn')}</b>${slot ? `<span class="muted">${tr('gm.drawOf', { slot: esc(slot) })}</span>` : ''}</div>
        <div class="gm-stepl${n ? ' done' : ' cur'}"><i>01</i><span>${n ? `${plural(n, 'numéro')} : <b>${[...sel].sort((a, b) => a - b).join(', ')}</b>` : tr('gm.tapNumbers', { n: MAX_NUMBERS })}</span></div> <!-- i18n-ok -->
        <div class="gm-stepl${n ? (ok ? ' done' : ' cur') : ''}"><i>02</i><span>${tr('gm.payment', { x: p ? ` · <b>${p.kind === 'coins' ? tr('gm.coinsN', { n: fmtCoins(p.coins) }) : esc(priceLabel(p))}</b>` : '' })}</span></div>
        ${n ? `<div class="seg gm-pay" role="radiogroup" aria-label="${tr('gm.payWith')}">${opts.map((o, i) => `<button role="radio" data-i="${i}" aria-checked="${i === pay}" class="${i === pay ? 'on' : ''}">${o.kind === 'coins' ? `${COIN_ICON}${fmtCoins(o.coins)}` : esc(priceLabel(o))}</button>`).join('')}</div>` : ''}
        ${p?.kind === 'cards' ? `<div class="gm-ed-row"><span>${esc(priceLabel(p))}</span><button class="btn-ghost sm gm-pick">${picked ? `${picked}/${p.count} choisie${picked > 1 ? 's' : ''} · changer` : tr('gm.pickCards')}</button></div>${picked && picked !== p.count ? `<div class="gm-warn">${tr('gm.exactCards', { n: p.count, stars: starsTxt(p.rarity), picked: starsTxt(p.rarity) })}</div>` : ''}` : ''}
        ${p?.kind === 'coins' ? `<div class="gm-ed-v">${tr('gm.balAfter', { a: coinsHtml(bal), b: coinsHtml(Math.max(0, bal - p.coins)) })}</div>${p.coins > bal ? `<div class="gm-warn">${tr('gm.missing', { n: fmtCoins(p.coins - bal) })}</div>` : ''}` : ''}
        <div class="gm-stepl${ok ? ' cur' : ''}"><i>03</i><span>${tr('gm.betFinal')}</span></div>
        <button class="btn-primary gm-place"${!ok || isPending('bet') ? ' disabled' : ''}>${tr('gm.betN', { x: n ? ` ${plural(n, 'numéro')}` : '' })}</button> <!-- i18n-ok -->
        <div class="muted">${tr('gm.stays')}</div>
        ${backend.eco.demoDraw ? '<button class="btn-ghost sm gm-draw">' + tr('gm.drawNow') + '</button>' : ''}`;
      bet.querySelectorAll<HTMLElement>('.gm-pay [data-i]').forEach((b) =>
        b.addEventListener('click', () => {
          pay = Number(b.dataset.i);
          stakeCards = [];
          drawBet();
        }),
      );
      bet.querySelector('.gm-pick')?.addEventListener('click', async () => {
        if (p?.kind !== 'cards') return;
        const res = await pickCards(backend, stakeCards, { title: `Roulette : ${priceLabel(p)}`, hint: tr('gm.pickExact', { n: p.count, stars: starsTxt(p.rarity) }), onlyRarity: p.rarity });
        if (res) stakeCards = res;
        drawBet();
      });
      bet.querySelector<HTMLElement>('.gm-place')?.addEventListener('click', (e) => {
        const btn = e.currentTarget as HTMLElement;
        // second toucher, avec ce qui part : pas d'annulation possible avant le tirage
        if (!confirmTap(btn, `Confirmer ? ${p?.kind === 'coins' ? tr('gm.minusCoins', { n: fmtCoins(p.coins) }) : cardsSummary(stakeCards)}`)) return;
        const nums = [...sel];
        void guarded('bet', btn, async () => {
          try {
            await busyButton(btn, backend.eco.placeBet(nums, stake));
            sfx('chime');
            toast(tr('gm.betDone', { nums: plural(nums.length, 'numéro'), slot }), 'ok'); // i18n-ok
            sel.clear();
            stakeCards = [];
          } catch (err) {
            toast(errMsg(err), 'err');
          }
        }).then(drawBet); // (redessiné par l'abonnement pendant l'envoi : le bouton reste désactivé, cf. isPending)
      });
      bindDraw(bet);
      syncDock();
    };
    // téléphone : la table occupe tout l'écran, le panneau de mise est en dessous → une barre « Miser » collante
    const dock = h('button', 'gm-dock');
    dock.type = 'button';
    el.append(dock);
    unsubs.push(() => dock.remove());
    let betVisible = true;
    const syncDock = () => {
      const n = sel.size;
      const has = !!cur?.round?.bets.some((b) => b.userId === cur?.me);
      dock.innerHTML = `<span><b>${n}</b> ${n > 1 ? 'numéros' : 'numéro'} · ${[...sel].sort((a, b) => a - b).join(', ')}</span><em>Miser →</em>`; // i18n-ok
      dock.classList.toggle('on', n > 0 && !has && !betVisible);
    };
    dock.addEventListener('click', () => body.querySelector('.gm-bet')?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' }));
    if (typeof IntersectionObserver !== 'undefined') {
      const io = new IntersectionObserver(([e]) => {
        betVisible = e.isIntersecting;
        syncDock();
      }, { threshold: 0.25 });
      io.observe(body.querySelector('.gm-bet')!);
      unsubs.push(() => io.disconnect());
    }
    function bindDraw(bet: HTMLElement) {
      bet.querySelector<HTMLElement>('.gm-draw')?.addEventListener('click', (e) => {
        const btn = e.currentTarget as HTMLElement;
        void guarded('draw', btn, async () => {
          try {
            await busyButton(btn, backend.eco.demoDraw!());
          } catch (err) {
            toast(errMsg(err), 'err');
          }
        });
      });
    }
    const tick = () => {
      const cd = body.querySelector<HTMLElement>('.gm-cd');
      if (!cd || !cur) return;
      // (audit 12/11, S14 / T-08) seul le chiffre change chaque seconde : on écrit son texte, sans recréer les nœuds
      const b = cd.querySelector('b');
      const txt = clock(cur.nextDrawAt - Date.now());
      if (b && cd.firstElementChild?.textContent === tr('gm.drawIn')) b.textContent = txt;
      else cd.innerHTML = `<span>${tr('gm.drawIn')}</span><b>${txt}</b>`;
    };
    const timer = window.setInterval(tick, 1000);
    unsubs.push(() => clearInterval(timer));
    unsubs.push(
      backend.eco.watchRoulette((r) => {
        if (!r) return;
        const prevPast = lastPast;
        cur = r;
        const round = r.round;
        const owner = new Map<number, { name: string; i: number; me: boolean }>();
        round?.bets.forEach((b, i) => b.numbers.forEach((n) => owner.set(n, { name: b.name, i, me: b.userId === r.me })));
        for (const c of cells) {
          const n = Number(c.dataset.n);
          const o = owner.get(n);
          c.className = `gm-num${o ? (o.me ? ' mine' : ' taken') : ''}${sel.has(n) && !o ? ' sel' : ''}`;
          if (o && sel.has(n)) sel.delete(n);
          c.style.setProperty('--pc', o ? colors[o.i % colors.length] : '');
          c.title = o ? `${n} · ${o.name}` : `${n} · libre`;
        }
        const covered = owner.size;
        body.querySelector<HTMLElement>('.gm-cov > i')?.style.setProperty('--c', String(covered / ROULETTE_NUMBERS));
        body.querySelector<HTMLElement>('.gm-legend')!.innerHTML = round ? tr('gm.legend', { list: round.bets.map((b, i) => `<span class="gm-lg" style="--pc:${colors[i % colors.length]}">${esc(b.name)} · ${b.numbers.length}</span>`).join(''), covered, max: ROULETTE_NUMBERS, pct: Math.round(potOdds(covered) * 100) }) : '';
        body.querySelector<HTMLElement>('.gm-potv')!.innerHTML = round ? `${coinsHtml(round.pot.coins)} + ${plural(round.pot.cards.reduce((a, c) => a + c.count, 0), 'carte')} = <b>${fmtCoins(round.pot.value)}</b> de valeur` : '';
        const pot = body.querySelector<HTMLElement>('.gm-pot')!;
        pot.replaceChildren();
        if (round) {
          for (const c of round.houseCards) {
            const t = cardTile(c.cardId, c.rarity, { mini: true, label: 'offerte' });
            pot.append(t);
          }
          for (const c of [...round.carriedCards, ...round.bets.flatMap((b) => b.cards)]) pot.append(cardTile(c.cardId, c.rarity, { mini: true, count: c.count }));
        }
        body.querySelector<HTMLElement>('.gm-past')!.innerHTML = r.past.length
          ? r.past.map((p) => `<div class="gm-pastrow"><b class="gm-ball">${p.result?.number ?? '?'}</b><span>${esc(p.day)} · ${p.result?.winnerName ? `<b>${esc(p.result.winnerName)}</b> remporte ${fmtCoins(p.result.potValue)} de valeur` : tr('gm.nobodyCarry', { pot: fmtCoins(p.result?.potValue ?? 0) })}</span></div>`).join('')
          : '<div class="muted">' + tr('gm.noDrawYet') + '</div>';
        drawBet();
        tick();
        lastPast = r.past[0]?.id ?? '';
        if (prevPast !== null && lastPast !== prevPast && r.past[0]?.result) void spin(r.past[0].result.number, r.past[0].result.winnerName);
      }),
    );
    /**
     * La bille parcourt la table, ralentit (courbe continue, plus de paliers) et s'arrête EXACTEMENT sur le numéro
     * sorti après deux tours ; chaque case qu'elle quitte s'éteint lentement (traîne). Puis le résultat s'affiche en
     * grand par-dessus la table.
     */
    let spinning = false;
    async function spin(number: number, winner?: string) {
      if (spinning) return;
      spinning = true;
      const N = ROULETTE_NUMBERS;
      const start = Math.floor(Math.random() * N);
      const steps = 2 * N + ((((number - 1 - start) % N) + N) % N);
      const T = reducedMotion() ? 0 : 5600;
      wheel.classList.add('spinning');
      cells.forEach((c) => c.classList.remove('ball', 'landed'));
      await new Promise<void>((done) => {
        const t0 = performance.now();
        let at = -1;
        let lastTick = 0;
        const step = (t: number) => {
          if (!wheel.isConnected) return done();
          const k = T ? Math.min(1, (t - t0) / T) : 1;
          const pos = Math.round(steps * (1 - Math.pow(1 - k, 3.4)));
          if (pos !== at) {
            if (at >= 0) cells[(start + at) % N].classList.remove('ball');
            at = pos;
            cells[(start + at) % N].classList.add('ball');
            if (t - lastTick > 55) {
              sfx('tick');
              lastTick = t;
            }
          }
          if (k < 1) requestAnimationFrame(step);
          else done();
        };
        requestAnimationFrame(step);
      });
      wheel.classList.remove('spinning');
      spinning = false;
      if (!wheel.isConnected) return;
      const cell = cells[number - 1];
      cell.classList.add('ball', 'landed');
      sfx(winner ? 'big' : 'chime');
      const panel = wheel.closest<HTMLElement>('.gm-panel');
      const r = panel?.getBoundingClientRect();
      if (panel && r && r.bottom > 0 && r.top < innerHeight) {
        const ov = h('div', 'gm-result');
        ov.setAttribute('role', 'status');
        ov.innerHTML = `<div class="gm-result-n">${number}</div><div class="gm-result-t">${winner ? tr('gm.winsPot', { name: esc(winner) }) : tr('gm.nobodyHad')}</div><div class="gm-result-s">${winner ? tr('gm.potToWinner') : tr('gm.potCarried')}</div>`;
        let gone = false;
        const close = () => {
          if (gone) return;
          gone = true;
          void leave(ov, 450).then(() => ov.remove());
        };
        ov.addEventListener('click', close);
        panel.append(ov);
        setTimeout(close, 5200);
      } else toast(winner ? tr('gm.numWins', { n: number, name: winner }) : tr('gm.numNobody', { n: number }), winner ? 'ok' : 'info');
      setTimeout(() => cell.classList.remove('landed', 'ball'), 6500);
    }
  }

  // ═════════════════════════════ Historique
  async function historyPage() {
    // (l'historique des pièces n'est pas un jeu : il est dans le portefeuille, retours live 02)
    body.innerHTML = '<div class="gm-panel"><div class="gm-ph"><b>' + tr('gm.myGames') + '</b><span class="muted">' + tr('gm.histD') + '</span></div><div class="gm-list gm-hg">…</div></div>';
    try {
      const g = await backend.eco.gameHistory();
      const uid = myId();
      const rows = [
        ...g.duels.map((d) => ({ at: d.resolvedAt ?? d.createdAt, href: `#/jeux/duel/${d.id}`, html: (() => {
          const k = d.sides.findIndex((s) => s.userId === uid);
          const res = d.result!;
          const out = res.winner === undefined ? tr('gm.tieW') : res.winner === k ? '<b class="plus">victoire</b>' : '<b class="minus">' + tr('gm.lossW') + '</b>';
          return `<span class="gm-tag">Pack Battle</span> contre ${esc(d.sides[1 - Math.max(0, k)]?.name ?? '?')} · ${res.stars[Math.max(0, k)]}★ / ${res.stars[1 - Math.max(0, k)]}★ · ${out}`;
        })() })),
        ...g.royales.map((r) => ({ at: r.resolvedAt ?? r.createdAt, href: `#/jeux/royale/${r.id}`, html: (() => {
          const k = r.players.findIndex((p) => p.userId === uid);
          const won = r.result!.winners.includes(k);
          return `<span class="gm-tag">Royale</span> à ${r.players.length} · ${r.result!.stars[k] ?? 0}★ · ${won ? '<b class="plus">victoire</b>' : `gagnant : ${esc(r.result!.winners.map((w) => r.players[w].name).join(', '))}`}`; // i18n-ok
        })() })),
      ].sort((a, b) => b.at - a.at);
      body.querySelector<HTMLElement>('.gm-hg')!.innerHTML = rows.length ? rows.map((r) => `<a class="gm-item" href="${r.href}"><span class="gm-it">${r.html}</span><span class="gm-it-r muted">${new Date(r.at).toLocaleDateString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></a>`).join('') : '<div class="muted">' + tr('gm.noneDone') + '</div>';
    } catch (e) {
      body.querySelector<HTMLElement>('.gm-hg')!.textContent = errMsg(e);
    }
  }

  // ═════════════════════════════ Admin : alertes anti-abus
  async function admin() {
    body.innerHTML = `<div class="gm-panel"><div class="gm-ph"><b>Alertes anti-abus</b><span class="muted">aucun blocage automatique — à trancher à la main</span></div><div class="gm-alerts">…</div></div> <!-- i18n-ok -->
      <div class="gm-rules muted">Seuils : flux net de valeur A → B (duels, royales, roulette, échanges) &gt; 5 000 sur 30 jours glissants · échanges à plus de 3:1 en valeur, 3 fois ou plus en 30 jours · nouveau compte qui perd ≥ 1 000 contre un ancien · plusieurs comptes sur le même appareil.</div>`; // i18n-ok
    const box = body.querySelector<HTMLElement>('.gm-alerts')!;
    const load = async () => {
      let list: AbuseAlertView[];
      try {
        list = await backend.eco.alerts();
      } catch (e) {
        box.textContent = errMsg(e);
        return;
      }
      box.innerHTML = list.length ? '' : '<div class="muted">Rien à signaler.</div>'; // i18n-ok
      for (const a of list) {
        const r = h('div', `gm-alert k-${a.kind}${a.verdict ? ` v-${a.verdict}` : ''}`);
        r.innerHTML = `<b>${esc(a.title)}</b><span>${esc(a.detail)}</span>${a.verdict ? `<em>${a.verdict === 'ok' ? 'jugé légitime' : 'à surveiller'}${a.note ? ` — ${esc(a.note)}` : ''}</em>` : ''}<span class="gm-al-acts"><button class="btn-ghost sm" data-v="ok">Légitime</button><button class="btn-ghost sm" data-v="watch">À surveiller</button></span>`; // i18n-ok
        r.querySelectorAll<HTMLElement>('[data-v]').forEach((b) =>
          b.addEventListener('click', async () => {
            const note = prompt('Note (facultatif) :') ?? undefined;
            try {
              await backend.eco.review(a.key, b.dataset.v as 'ok' | 'watch', note || undefined);
              void load();
            } catch (e) {
              toast(errMsg(e), 'err');
            }
          }),
        );
        box.append(r);
      }
    };
    void load();
  }

  // ═════════════════════════════ routeur
  function soon() {
    head.innerHTML = '';
    body.innerHTML = `<div class="gm-soon"><span class="kicker">GAMES</span><b>${tr('gm.soon')}</b><p class="muted">${tr('gm.soonD')}</p></div>`;
  }

  function draw() {
    cleanup();
    wasOpen = open();
    if (!wasOpen) return soon();
    renderHead();
    if (!backend.state.user && backend.state.mode === 'online') {
      body.innerHTML = '<div class="gm-panel"><b>' + tr('gm.login') + '</b></div>';
      return;
    }
    if (sub === 'duel') arg ? duelRoom(arg) : duelLobby();
    else if (sub === 'royale') arg ? royaleRoom(arg) : royaleLobby();
    else if (sub === 'roulette') roulettePage();
    else if (sub === 'historique') void historyPage();
    else if (sub === 'admin') void admin();
    else hub();
  }

  return {
    el,
    enter() {
      const parts = location.hash.replace(/^#\/?/, '').split('/');
      // anciennes adresses (secours : main.ts les redirige déjà) — la forge est dans la collection, succès et primes
      // de complétion dans la page Succès (retours live 02)
      const moved: Record<string, string> = { succes: '#/succes', forge: '#/collection/forge', primes: '#/succes/primes' };
      if (moved[parts[1] ?? '']) return void location.replace(moved[parts[1]]);
      // page 100 % DOM : la vitrine 3D ne tourne pas dessous (PERF1-06, comme collection / contrats / classement)
      shell.show(null);
      shell.setDimmed(true);
      // (13/11) anciennes adresses de Défis et de La Presse (retirés) : l'accueil des Jeux
      if (parts[1] === 'defis' || parts[1] === 'presse') return void location.replace('#/jeux');
      sub = (['duel', 'royale', 'roulette', 'historique', 'admin'].includes(parts[1] ?? '') ? parts[1] : '') as Sub;
      arg = parts[2] ?? '';
      draw();
    },
    leave() {
      cleanup();
    },
  };
}

const cardName = (id: string) => catalogEntry(id)?.name ?? id;
