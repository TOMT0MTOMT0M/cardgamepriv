import type { GameBackend } from '../backend';
import { liveRegen } from '../backend';
import type { Shell } from '../shell';
import type { AbuseAlertView, DuelSideView, DuelView, RoyaleView, RouletteView } from '../eco';
import { ACHIEVEMENTS, ACHIEVEMENT_TIERS, CARD_STARS, CARD_VALUE, achievementReward, burnable, cardsValue, fmtCoins, stakeValue, type StakeItem } from '../../core/economy';
import {
  DUEL_MAX_PACKS,
  MIN_NUMBERS,
  NUMBER_COST,
  ROULETTE_NUMBERS,
  ROYALE_MAX,
  ROYALE_MIN,
  coinsNeeded,
  duelProblem,
  packChoiceLabel,
  packChoices,
  potOdds,
  type GameCard,
  type PackChoice,
  type Stake,
} from '../../core/games';
import { weeklyLabel } from '../../core/weekly';
import { rarity, starCount, type RarityId } from '../../core/rarity';
import { busyButton, cardTile, errMsg, esc, fmtDelay, h, plural, toast } from '../ui';
import { cardKey, lockedCards } from '../backend';
import { pickCards } from './picker';
import { COIN_ICON, coinsHtml } from './wallet';
import { catalogEntry } from '../../core/sets/themes';
import '../games.css';

/**
 * ESPACE JEUX (#/jeux) : 1v1 Pack Battle, Pack Battle Royale, Roulette à cartes — plus la forge (doublons → pièces),
 * les succès, l'historique et le panneau admin (alertes anti-abus). Règles : src/core/games.ts.
 * Pages : #/jeux · #/jeux/duel[/id] · #/jeux/royale[/id] · #/jeux/roulette · #/jeux/forge · #/jeux/succes ·
 * #/jeux/historique · #/jeux/admin.
 */

type Sub = '' | 'duel' | 'royale' | 'roulette' | 'forge' | 'succes' | 'historique' | 'admin';

const starsTxt = (r: RarityId) => (r === 'secret' ? '✷' : '★'.repeat(starCount(r)));
const ava = (name: string, url?: string) => (url ? `<img class="gm-ava" src="${esc(url)}" alt="">` : `<span class="gm-ava">${esc(name.slice(0, 1))}</span>`);
const packChip = (p: PackChoice, i?: number) => `<span class="gm-pack ${p.kind === 'bebou' ? 'bebou' : `t-${p.themeId}`}"${i !== undefined ? ` data-i="${i}"` : ''}>${esc(packChoiceLabel(p).replace(' Pack', ''))}</span>`;
const stakeLine = (s: Stake) => (s.coins || s.cards.length ? `${s.coins ? coinsHtml(s.coins) : ''}${s.cards.length ? ` <span class="gm-cards-n">${plural(s.cards.reduce((a, c) => a + c.count, 0), 'carte')}</span>` : ''} <span class="muted">= ${fmtCoins(stakeValue(s))}</span>` : '<span class="muted">pas de side pot</span>');
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createGamesView(backend: GameBackend, shell: Shell) {
  const el = h('section', 'view games');
  const head = h('div', 'gm-top');
  const body = h('div', 'gm-body');
  el.append(head, body);
  let sub: Sub = '';
  let arg = '';
  let unsubs: Array<() => void> = [];
  const cleanup = () => {
    unsubs.forEach((u) => u());
    unsubs = [];
  };
  const myId = () => (backend.state.mode === 'demo' ? 'me' : backend.state.user?.id ?? '');
  const snap = () => backend.eco.snapshot;
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
  function renderHead() {
    const s = snap();
    const tabs: Array<[Sub, string]> = [['', 'Jeux'], ['duel', 'Pack Battle'], ['royale', 'Battle Royale'], ['roulette', 'Roulette'], ['forge', 'Forge'], ['succes', 'Succès'], ['historique', 'Historique']];
    if (s?.isAdmin) tabs.push(['admin', 'Admin']);
    head.innerHTML = `<div class="gm-title"><b>Espace Jeux</b>${s ? coinsHtml(s.coins, 'big') : ''}</div>
      <nav class="seg gm-tabs">${tabs.map(([k, l]) => `<button data-k="${k}" class="${k === sub ? 'on' : ''}">${l}</button>`).join('')}</nav>`;
    head.querySelectorAll<HTMLElement>('[data-k]').forEach((b) => b.addEventListener('click', () => (location.hash = `#/jeux${b.dataset.k ? `/${b.dataset.k}` : ''}`)));
  }
  backend.eco.onChange(() => {
    if (!el.isConnected) return;
    renderHead();
    if (sub === 'succes' || sub === 'forge') draw();
  });

  // ═════════════════════════════ accueil
  function hub() {
    body.innerHTML = `<div class="gm-hub">
      <a class="gm-game duel" href="#/jeux/duel"><i class="gm-glyph">⚔</i><b>1v1 Pack Battle</b><span>Misez le même nombre de boosters (+ un side pot). Ouverture côte à côte : le plus haut total d'étoiles rafle TOUTES les cartes.</span><em class="gm-live" data-live="duel">…</em></a>
      <a class="gm-game royale" href="#/jeux/royale"><i class="gm-glyph">♛</i><b>Pack Battle Royale</b><span>3 à 8 joueurs, 1 booster chacun. Le meilleur total d'étoiles remporte tout le pot.</span><em class="gm-live" data-live="royale">…</em></a>
      <a class="gm-game roulette" href="#/jeux/roulette"><i class="gm-glyph">◎</i><b>Roulette à cartes</b><span>100 numéros, 1 numéro = 100 pièces de valeur. Un tirage par jour à 21 h : le numéro qui sort rafle tout le pot.</span><em class="gm-live" data-live="roulette">…</em></a>
      <a class="gm-mini" href="#/jeux/forge"><b>La forge</b><span>Brûle tes doublons contre des pièces (1★ = 5 … 6★ = 1 000).</span></a>
      <a class="gm-mini" href="#/jeux/succes"><b>Succès</b><span>${snap() ? `${snap()!.econ.achievements.length}/${ACHIEVEMENTS.length} obtenus` : 'Paliers 50 / 150 / 500 / 2 000 pièces'}</span></a>
      <div class="gm-mini gm-week"></div>
      <div class="gm-rules muted">Règles d'or : les pièces ne servent jamais à acheter des cartes, pas de marché, monnaie 100 % virtuelle. Les jeux ne font que redistribuer ce que vous misez.</div>
    </div>`;
    const live = (k: string, t: string) => {
      const e = body.querySelector<HTMLElement>(`[data-live="${k}"]`);
      if (e) e.innerHTML = t;
    };
    unsubs.push(
      backend.eco.watchLobby((l) => {
        if (!l) return;
        const mine = l.duels.filter((d) => d.sides.some((s) => s.userId === l.me)).length;
        live('duel', `${plural(l.duels.length, 'duel ouvert', 'duels ouverts')}${mine ? ` · ${mine} à toi` : ''}`);
        live('royale', l.royales.length ? `${plural(l.royales.length, 'partie')} en attente (${l.royales.map((r) => `${r.players.length}/${ROYALE_MAX}`).join(', ')})` : 'aucune partie en attente');
      }),
      backend.eco.watchRoulette((r) => {
        if (!r) return;
        live('roulette', r.round ? `pot ${COIN_ICON}${fmtCoins(r.round.pot.value)} · ${r.round.bets.reduce((a, b) => a + b.numbers.length, 0)}/100 numéros · tirage dans ${fmtDelay(r.nextDrawAt - Date.now())}` : 'prochain tirage à 21 h');
      }),
    );
    const s = snap();
    const wk = body.querySelector<HTMLElement>('.gm-week')!;
    if (s) {
      wk.innerHTML = `<b>Missions de la semaine</b>${s.weekly.list.map((m) => `<span class="gm-wk${m.claimed ? ' claimed' : ''}">${esc(weeklyLabel(m))} · ${m.progress}/${m.target} · +${m.reward}</span>`).join('')}<span class="muted">dans le panneau des missions (cible en haut)</span>`;
    } else wk.hidden = true;
  }

  // ═════════════════════════════ éditeur de mise (boosters + side pot)
  function stakeEditor(host: HTMLElement, init: { packs: PackChoice[]; stake: Stake }, o: { fixedCount?: number; title: string; target?: number }) {
    const st = { packs: init.packs.map((p) => ({ ...p })), stake: { coins: init.stake.coins, cards: init.stake.cards.map((c) => ({ ...c })) } };
    const choices = packChoices();
    const render = () => {
      const v = stakeValue(st.stake);
      host.innerHTML = `<div class="gm-ed"><div class="gm-ed-h">${esc(o.title)}</div>
        <div class="gm-ed-row"><span>Boosters</span><span class="gm-packs">${st.packs.map((p, i) => packChip(p, i)).join('')}</span>${o.fixedCount ? '' : `<span class="gm-step"><button class="btn-ghost sm" data-a="-">−</button><button class="btn-ghost sm" data-a="+">+</button></span>`}</div>
        <div class="muted">Touche un booster pour changer sa sorte · réserve : ${packsLeft()} booster${packsLeft() > 1 ? 's' : ''}</div>
        <div class="gm-ed-row"><span>Side pot</span><label class="gm-coin-in">${COIN_ICON}<input type="number" min="0" step="10" value="${st.stake.coins}" inputmode="numeric"></label><button class="btn-ghost sm gm-pick">Cartes${st.stake.cards.length ? ` (${st.stake.cards.reduce((a, c) => a + c.count, 0)})` : ''}…</button></div>
        <div class="gm-ed-v">Valeur du side pot : <b>${fmtCoins(v)}</b>${o.target !== undefined ? ` <span class="${Math.abs(v - o.target) <= 0.05 * Math.max(v, o.target) ? 'ok' : 'warn'}">(en face : ${fmtCoins(o.target)}, ±5 %)</span>` : ''}</div>
        ${st.stake.cards.length ? `<div class="gm-mini-cards">${st.stake.cards.map((c) => `<span class="gm-mc r-${c.rarity}" style="--rc:${rarity(c.rarity).hex}">${starsTxt(c.rarity)} ${esc(cardName(c.cardId))}${c.count > 1 ? ` ×${c.count}` : ''}</span>`).join('')}</div>` : ''}
      </div>`;
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
      host.querySelector<HTMLInputElement>('.gm-coin-in input')!.addEventListener('change', (e) => {
        st.stake.coins = Math.max(0, Math.floor(Number((e.target as HTMLInputElement).value) || 0));
        // (redessiner pendant l'événement « change » d'un champ qui perd le focus casse le DOM : on attend la fin)
        setTimeout(render, 0);
      });
      host.querySelector('.gm-pick')!.addEventListener('click', async () => {
        const r = await pickCards(backend, st.stake.cards, { title: 'Cartes du side pot', hint: 'Valeur : 1★ 5 · 2★ 15 · 3★ 40 · 4★ 100 · 5★ 300 · 6★ 1 000 · secrète 5 000.' });
        if (r) st.stake.cards = r;
        render();
      });
    };
    render();
    return st;
  }

  // ═════════════════════════════ 1v1 Pack Battle
  function duelLobby() {
    body.innerHTML = `<div class="gm-cols"><div class="gm-panel gm-create"></div><div class="gm-panel"><div class="gm-ph"><b>Duels ouverts</b></div><div class="gm-list"></div></div></div>
      <div class="gm-rules muted">Le créateur choisit N boosters (+ un side pot facultatif) ; l'adversaire mise le même nombre de boosters (sortes libres) et un side pot de même valeur à ±5 %. Les deux valident → verrouillage ferme, ouverture côte à côte. Plus haut total d'étoiles → toutes les cartes tirées des deux côtés + les side pots. Égalité parfaite → chacun récupère tout.</div>`;
    const cr = body.querySelector<HTMLElement>('.gm-create')!;
    const edHost = h('div');
    const friends = backend.state.friends;
    cr.innerHTML = `<div class="gm-ph"><b>Créer un duel</b></div>`;
    cr.append(edHost);
    const st = stakeEditor(edHost, { packs: [{ kind: 'bebou' }], stake: { coins: 0, cards: [] } }, { title: 'Ta mise' });
    const foot = h('div', 'gm-ed-foot');
    foot.innerHTML = `<label>Adversaire <select class="gm-opp"><option value="">ouvert à tous</option>${friends.map((f) => `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join('')}</select></label><button class="btn-primary gm-go">Créer le duel</button>`;
    cr.append(foot);
    foot.querySelector<HTMLButtonElement>('.gm-go')!.addEventListener('click', async (e) => {
      try {
        const id = await busyButton(e.currentTarget as HTMLElement, backend.eco.createDuel(st.packs, st.stake, foot.querySelector<HTMLSelectElement>('.gm-opp')!.value || undefined));
        sfx('chime');
        location.hash = `#/jeux/duel/${id}`;
      } catch (err) {
        toast(errMsg(err), 'err');
      }
    });
    const list = body.querySelector<HTMLElement>('.gm-list')!;
    unsubs.push(
      backend.eco.watchLobby((l) => {
        if (!l) return void (list.innerHTML = '<div class="muted">Connecte-toi pour jouer.</div>');
        list.innerHTML = l.duels.length ? '' : '<div class="muted">Aucun duel ouvert. Lance le premier !</div>';
        for (const d of l.duels) {
          const a = d.sides[0];
          const r = h('a', 'gm-item');
          r.href = `#/jeux/duel/${d.id}`;
          r.innerHTML = `${ava(a.name, a.avatarUrl)}<span class="gm-it"><b>${esc(a.name)}</b> · ${plural(a.packs.length, 'booster')} ${a.packs.map((p) => packChip(p)).join('')}<br>${stakeLine(a.stake)}${d.invitedId ? ` · <em>${d.invitedId === l.me ? 'te défie !' : 'sur invitation'}</em>` : ''}</span><span class="gm-it-r">${d.sides.length > 1 ? `contre ${esc(d.sides[1].name)}` : d.creatorId === l.me ? 'en attente' : 'Rejoindre →'}</span>`;
          list.append(r);
        }
      }),
    );
  }

  const shown = new Set<string>(); // parties déjà jouées à l'écran (on ne rejoue pas l'animation à chaque mise à jour)

  function duelRoom(id: string) {
    body.innerHTML = '<div class="gm-room"><div class="muted">Chargement…</div></div>';
    const room = body.querySelector<HTMLElement>('.gm-room')!;
    let editing: { packs: PackChoice[]; stake: Stake } | null = null;
    let sig = '';
    unsubs.push(
      backend.eco.watchDuel(id, (d) => {
        if (!d) return void (room.innerHTML = '<div class="muted">Duel introuvable.</div>');
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
        if (d.status === 'cancelled') return void (room.innerHTML = '<div class="gm-panel"><b>Duel annulé.</b> <a href="#/jeux/duel">Retour aux duels</a></div>');
        openDuelRoom(room, d, editing, (e) => (editing = e));
      }),
    );
  }

  function openDuelRoom(room: HTMLElement, d: DuelView, editing: { packs: PackChoice[]; stake: Stake } | null, setEditing: (e: { packs: PackChoice[]; stake: Stake } | null) => void) {
    const uid = myId();
    const mine = d.sides.findIndex((s) => s.userId === uid);
    const canJoin = mine < 0 && d.sides.length < 2 && (!d.invitedId || d.invitedId === uid);
    const problem = duelProblem({ packs: d.sides[0].packs, stake: d.sides[0].stake }, d.sides[1] ? { packs: d.sides[1].packs, stake: d.sides[1].stake } : null);
    room.innerHTML = `<div class="gm-ph"><a href="#/jeux/duel" class="gm-back">← Duels</a><b>Pack Battle · ${plural(d.sides[0].packs.length, 'booster')} chacun</b></div><div class="gm-vs"></div><div class="gm-ed-host"></div><div class="gm-actions"></div>`;
    const vs = room.querySelector<HTMLElement>('.gm-vs')!;
    const side = (s: DuelSideView | undefined, i: number) => {
      const c = h('div', `gm-side${s?.ready ? ' ready' : ''}${i === mine ? ' mine-side' : ''}`);
      c.innerHTML = s
        ? `<div class="gm-side-h">${ava(s.name, s.avatarUrl)}<b>${esc(s.name)}</b>${s.ready ? '<span class="gm-ok">✓ validé</span>' : '<span class="muted">pas encore validé</span>'}</div><div class="gm-packs">${s.packs.map((p) => packChip(p)).join('')}</div><div>${stakeLine(s.stake)}</div>${s.stake.cards.length ? `<div class="gm-mini-cards">${s.stake.cards.map((c) => `<span class="gm-mc" style="--rc:${rarity(c.rarity).hex}">${starsTxt(c.rarity)} ${esc(cardName(c.cardId))}${c.count > 1 ? ` ×${c.count}` : ''}</span>`).join('')}</div>` : ''}`
        : `<div class="gm-side-h"><span class="gm-ava">?</span><b>${d.invitedId ? 'Invité en attente' : 'En attente d’un adversaire'}</b></div><div class="muted">Le duel apparaît dans la liste des potes.</div>`;
      return c;
    };
    vs.append(side(d.sides[0], 0), h('div', 'gm-vs-x', 'VS'), side(d.sides[1], 1));
    const edHost = room.querySelector<HTMLElement>('.gm-ed-host')!;
    const acts = room.querySelector<HTMLElement>('.gm-actions')!;
    const other = mine >= 0 ? d.sides[1 - mine] : d.sides[0];
    if (mine >= 0 || canJoin) {
      const base = editing ?? (mine >= 0 ? { packs: d.sides[mine].packs, stake: d.sides[mine].stake } : { packs: d.sides[0].packs.map(() => ({ kind: 'bebou' as const })), stake: { coins: Math.min(snap()?.coins ?? 0, stakeValue(d.sides[0].stake)), cards: [] } });
      const st = stakeEditor(edHost, base, { title: mine >= 0 ? 'Ta mise (la modifier remet les validations à zéro)' : 'Ta mise pour rejoindre', fixedCount: mine === 0 ? undefined : d.sides[0].packs.length, target: other ? stakeValue(other.stake) : undefined });
      edHost.addEventListener('click', () => setEditing(st), { capture: true });
      edHost.addEventListener('change', () => setEditing(st), { capture: true });
      acts.innerHTML = `${mine >= 0 ? '<button class="btn-ghost gm-save">Enregistrer ma mise</button>' : ''}${canJoin ? '<button class="btn-primary gm-join">Rejoindre le duel</button>' : ''}${mine >= 0 && d.sides.length === 2 && !d.sides[mine].ready ? `<button class="btn-primary gm-ready"${problem ? ' disabled' : ''}>Valider le pot</button>` : ''}${mine >= 0 ? `<button class="btn-ghost danger gm-leave">${mine === 0 ? 'Annuler le duel' : 'Quitter'}</button>` : ''}${problem && d.sides.length === 2 ? `<div class="gm-warn">${esc(problem)}</div>` : ''}${mine >= 0 && d.sides[mine].ready && !d.sides[1 - mine]?.ready ? '<div class="muted">En attente de la validation d’en face… une fois les deux validés, plus de retour en arrière.</div>' : ''}`;
      const save = async (btn: HTMLElement) => {
        try {
          await busyButton(btn, backend.eco.setDuelSide(d.id, st.packs, st.stake));
          setEditing(null);
          sfx('tick');
        } catch (err) {
          toast(errMsg(err), 'err');
        }
      };
      acts.querySelector<HTMLElement>('.gm-save')?.addEventListener('click', (e) => save(e.currentTarget as HTMLElement));
      acts.querySelector<HTMLElement>('.gm-join')?.addEventListener('click', (e) => save(e.currentTarget as HTMLElement));
      acts.querySelector<HTMLElement>('.gm-ready')?.addEventListener('click', async (e) => {
        try {
          const r = await busyButton(e.currentTarget as HTMLElement, backend.eco.readyDuel(d.id));
          if (!r.locked) toast('Validé ! En attente de l’adversaire.', 'info');
        } catch (err) {
          toast(errMsg(err), 'err');
        }
      });
      acts.querySelector<HTMLElement>('.gm-leave')?.addEventListener('click', async (e) => {
        try {
          await busyButton(e.currentTarget as HTMLElement, backend.eco.leaveDuel(d.id));
          location.hash = '#/jeux/duel';
        } catch (err) {
          toast(errMsg(err), 'err');
        }
      });
    } else acts.innerHTML = `<div class="muted">${d.invitedId ? 'Ce duel est réservé à un autre joueur.' : 'Ce duel a déjà ses deux joueurs : tu peux regarder le résultat ici.'}</div>`;
  }

  /** Ouverture côte à côte : cartes retournées une à une, compteurs d'étoiles en direct, suspense sur la dernière. */
  async function playDuel(room: HTMLElement, d: DuelView, animate: boolean) {
    const res = d.result!;
    const n = res.packs[0].length * 5;
    room.innerHTML = `<div class="gm-ph"><a href="#/jeux/duel" class="gm-back">← Duels</a><b>Pack Battle</b>${animate ? '<button class="btn-ghost sm gm-skip">Passer</button>' : '<button class="btn-ghost sm gm-replay">Rejouer</button>'}</div><div class="gm-battle"></div><div class="gm-verdict"></div>`;
    const bat = room.querySelector<HTMLElement>('.gm-battle')!;
    const cols = d.sides.map((s, i) => {
      const c = h('div', 'gm-bcol');
      c.innerHTML = `<div class="gm-bh">${ava(s.name, s.avatarUrl)}<b>${esc(s.name)}</b><span class="gm-count">0★</span></div><div class="gm-slots"></div>`;
      const slots = c.querySelector<HTMLElement>('.gm-slots')!;
      res.packs[i].flat().forEach((card) => slots.append(slot(card)));
      return { el: c, count: c.querySelector<HTMLElement>('.gm-count')!, slots: [...slots.children] as HTMLElement[], total: 0 };
    });
    bat.append(cols[0].el, h('div', 'gm-vs-x', 'VS'), cols[1].el);
    let skip = !animate;
    room.querySelector('.gm-skip')?.addEventListener('click', () => (skip = true));
    room.querySelector('.gm-replay')?.addEventListener('click', () => void playDuel(room, d, true));
    const flip = (k: number, i: number) => {
      const card = res.packs[k].flat()[i];
      const sl = cols[k].slots[i];
      sl.classList.add('up');
      cols[k].total += CARD_STARS[card.rarity];
      cols[k].count.textContent = `${cols[k].total}★`;
      cols[k].count.classList.remove('pop');
      void cols[k].count.offsetWidth;
      cols[k].count.classList.add('pop');
      if (CARD_STARS[card.rarity] >= 5) sl.classList.add('hot');
    };
    for (let i = 0; i < n; i++) {
      const last = i === n - 1;
      if (!skip && last) {
        bat.classList.add('suspense');
        await wait(1400);
      }
      for (const k of [0, 1]) {
        flip(k, i);
        if (!skip) {
          sfx(CARD_STARS[res.packs[k].flat()[i].rarity] >= 5 ? 'chime' : 'tick');
          await wait(last ? 700 : i >= n - 5 ? 380 : 240);
        }
      }
    }
    bat.classList.remove('suspense');
    swapReplay(room, () => void playDuel(room, d, true));
    const v = room.querySelector<HTMLElement>('.gm-verdict')!;
    if (res.winner === undefined) {
      v.innerHTML = `<b>Égalité parfaite : ${res.stars[0]}★ partout.</b> PUSH — chacun récupère ses cartes et sa mise.`;
      bat.classList.add('push');
    } else {
      const w = d.sides[res.winner];
      const iWon = w.userId === myId();
      cols[res.winner].el.classList.add('win');
      cols[1 - res.winner].el.classList.add('lose');
      v.innerHTML = `<b>${iWon ? 'Tu remportes tout !' : `${esc(w.name)} remporte tout.`}</b> ${res.stars[res.winner]}★ contre ${res.stars[1 - res.winner]}★ — ${n * 2} cartes${stakeValue(d.sides[0].stake) + stakeValue(d.sides[1].stake) ? ` et ${fmtCoins(stakeValue(d.sides[0].stake) + stakeValue(d.sides[1].stake))} de side pot` : ''} pour ${iWon ? 'toi' : esc(w.name)}.`;
      if (animate) sfx(iWon ? 'big' : 'tick');
    }
  }

  function swapReplay(room: HTMLElement, again: () => void) {
    const sk = room.querySelector<HTMLElement>('.gm-skip');
    if (!sk) return;
    const b = h('button', 'btn-ghost sm gm-replay', 'Rejouer');
    b.addEventListener('click', again);
    sk.replaceWith(b);
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
    body.innerHTML = `<div class="gm-cols"><div class="gm-panel"><div class="gm-ph"><b>Lancer une Battle Royale</b></div><div class="gm-r-new"></div></div><div class="gm-panel"><div class="gm-ph"><b>Parties en attente</b></div><div class="gm-list"></div></div></div>
      <div class="gm-rules muted">${ROYALE_MIN} à ${ROYALE_MAX} joueurs, 1 booster chacun (au choix). Le créateur lance dès ${ROYALE_MIN} joueurs (départ automatique à ${ROYALE_MAX}). Ouverture simultanée : le plus haut total d'étoiles remporte toutes les cartes ; ex æquo en tête → les cartes sont partagées au hasard entre eux.</div>`;
    let pick: PackChoice = { kind: 'bebou' };
    const nw = body.querySelector<HTMLElement>('.gm-r-new')!;
    const drawNew = () => {
      nw.innerHTML = `<div class="gm-packs">${packChoices().map((p, i) => `<button class="gm-pack-b${p.kind === pick.kind && p.themeId === pick.themeId ? ' on' : ''}" data-i="${i}">${packChip(p)}</button>`).join('')}</div><button class="btn-primary gm-r-go">Créer avec ce booster</button><div class="muted">Réserve : ${packsLeft()} booster${packsLeft() > 1 ? 's' : ''} (débité au lancement).</div>`;
      nw.querySelectorAll<HTMLElement>('[data-i]').forEach((b) => b.addEventListener('click', () => ((pick = packChoices()[Number(b.dataset.i)]), drawNew())));
      nw.querySelector<HTMLElement>('.gm-r-go')!.addEventListener('click', async (e) => {
        try {
          const id = await busyButton(e.currentTarget as HTMLElement, backend.eco.createRoyale(pick));
          location.hash = `#/jeux/royale/${id}`;
        } catch (err) {
          toast(errMsg(err), 'err');
        }
      });
    };
    drawNew();
    const list = body.querySelector<HTMLElement>('.gm-list')!;
    unsubs.push(
      backend.eco.watchLobby((l) => {
        if (!l) return void (list.innerHTML = '<div class="muted">Connecte-toi pour jouer.</div>');
        list.innerHTML = l.royales.length ? '' : '<div class="muted">Aucune partie en attente.</div>';
        for (const r of l.royales) {
          const a = h('a', 'gm-item');
          a.href = `#/jeux/royale/${r.id}`;
          a.innerHTML = `<span class="gm-avas">${r.players.map((p) => ava(p.name, p.avatarUrl)).join('')}</span><span class="gm-it"><b>${esc(r.players[0].name)}</b> · ${r.players.length}/${ROYALE_MAX} joueurs</span><span class="gm-it-r">${r.players.some((p) => p.userId === l.me) ? 'tu y es' : 'Rejoindre →'}</span>`;
          list.append(a);
        }
      }),
    );
  }

  function royaleRoom(id: string) {
    body.innerHTML = '<div class="gm-room"><div class="muted">Chargement…</div></div>';
    const room = body.querySelector<HTMLElement>('.gm-room')!;
    let pick: PackChoice = { kind: 'bebou' };
    let sig = '';
    unsubs.push(
      backend.eco.watchRoyale(id, (r) => {
        if (!r) return void (room.innerHTML = '<div class="muted">Partie introuvable.</div>');
        const s = JSON.stringify([r.status, r.players.map((p) => [p.userId, p.pack])]);
        if (s === sig) return;
        sig = s;
        if (r.status === 'done') {
          const fresh = !shown.has(r.id) && Date.now() - (r.resolvedAt ?? 0) < 120_000;
          shown.add(r.id);
          return void playRoyale(room, r, fresh);
        }
        if (r.status === 'cancelled') return void (room.innerHTML = '<div class="gm-panel"><b>Partie annulée.</b> <a href="#/jeux/royale">Retour</a></div>');
        const uid = myId();
        const inIt = r.players.some((p) => p.userId === uid);
        room.innerHTML = `<div class="gm-ph"><a href="#/jeux/royale" class="gm-back">← Battle Royale</a><b>${r.players.length}/${ROYALE_MAX} joueurs</b></div>
          <div class="gm-royal-players">${r.players.map((p) => `<div class="gm-rp">${ava(p.name, p.avatarUrl)}<b>${esc(p.name)}</b>${packChip(p.pack)}</div>`).join('')}${Array.from({ length: Math.max(0, ROYALE_MIN - r.players.length) }, () => '<div class="gm-rp empty"><span class="gm-ava">?</span><b>en attente</b></div>').join('')}</div>
          <div class="gm-actions"></div>`;
        const acts = room.querySelector<HTMLElement>('.gm-actions')!;
        const packBar = () => `<span class="gm-packs">${packChoices().map((p, i) => `<button class="gm-pack-b${p.kind === pick.kind && p.themeId === pick.themeId ? ' on' : ''}" data-i="${i}">${packChip(p)}</button>`).join('')}</span>`;
        acts.innerHTML = `${!inIt && r.players.length < ROYALE_MAX ? `${packBar()}<button class="btn-primary gm-rj">Rejoindre</button>` : ''}${r.creatorId === uid ? `<button class="btn-primary gm-rs"${r.players.length < ROYALE_MIN ? ' disabled' : ''}>Lancer (${r.players.length} joueurs)</button>` : ''}${inIt ? `<button class="btn-ghost danger gm-rl">${r.creatorId === uid ? 'Annuler la partie' : 'Quitter'}</button>` : ''}${r.players.length < ROYALE_MIN ? `<div class="muted">Encore ${ROYALE_MIN - r.players.length} joueur${ROYALE_MIN - r.players.length > 1 ? 's' : ''} pour pouvoir lancer.</div>` : ''}`;
        acts.querySelectorAll<HTMLElement>('[data-i]').forEach((b) =>
          b.addEventListener('click', () => {
            pick = packChoices()[Number(b.dataset.i)];
            acts.querySelectorAll('.gm-pack-b').forEach((x) => x.classList.toggle('on', x === b));
          }),
        );
        const run = (sel: string, fn: () => Promise<unknown>, after?: () => void) =>
          acts.querySelector<HTMLElement>(sel)?.addEventListener('click', async (e) => {
            try {
              await busyButton(e.currentTarget as HTMLElement, fn());
              after?.();
            } catch (err) {
              toast(errMsg(err), 'err');
            }
          });
        run('.gm-rj', () => backend.eco.joinRoyale(r.id, pick));
        run('.gm-rs', () => backend.eco.startRoyale(r.id));
        run('.gm-rl', () => backend.eco.leaveRoyale(r.id), () => (location.hash = '#/jeux/royale'));
      }),
    );
  }

  async function playRoyale(room: HTMLElement, r: RoyaleView, animate: boolean) {
    const res = r.result!;
    room.innerHTML = `<div class="gm-ph"><a href="#/jeux/royale" class="gm-back">← Battle Royale</a><b>Battle Royale · ${r.players.length} joueurs</b>${animate ? '<button class="btn-ghost sm gm-skip">Passer</button>' : '<button class="btn-ghost sm gm-replay">Rejouer</button>'}</div><div class="gm-royal"></div><div class="gm-verdict"></div>`;
    const g = room.querySelector<HTMLElement>('.gm-royal')!;
    const rows = r.players.map((p, i) => {
      const row = h('div', 'gm-rrow');
      row.innerHTML = `<div class="gm-bh">${ava(p.name, p.avatarUrl)}<b>${esc(p.name)}</b><span class="gm-count">0★</span></div><div class="gm-slots"></div>`;
      const sl = row.querySelector<HTMLElement>('.gm-slots')!;
      res.packs[i].forEach((c) => sl.append(slot(c)));
      g.append(row);
      return { row, count: row.querySelector<HTMLElement>('.gm-count')!, slots: [...sl.children] as HTMLElement[], total: 0 };
    });
    let skip = !animate;
    room.querySelector('.gm-skip')?.addEventListener('click', () => (skip = true));
    room.querySelector('.gm-replay')?.addEventListener('click', () => void playRoyale(room, r, true));
    for (let i = 0; i < 5; i++) {
      if (!skip && i === 4) {
        g.classList.add('suspense');
        await wait(1400);
      }
      rows.forEach((x, k) => {
        const c = res.packs[k][i];
        x.slots[i].classList.add('up');
        if (CARD_STARS[c.rarity] >= 5) x.slots[i].classList.add('hot');
        x.total += CARD_STARS[c.rarity];
        x.count.textContent = `${x.total}★`;
      });
      // classement en direct
      const order = rows.map((x, k) => [x.total, k]).sort((a, b) => b[0] - a[0]);
      order.forEach(([, k], rank) => (rows[k].row.style.order = String(rank)));
      if (!skip) {
        sfx('tick');
        await wait(i === 4 ? 900 : 650);
      }
    }
    g.classList.remove('suspense');
    swapReplay(room, () => void playRoyale(room, r, true));
    res.winners.forEach((w) => rows[w].row.classList.add('win'));
    const names = res.winners.map((w) => r.players[w].name);
    const iWon = res.winners.some((w) => r.players[w].userId === myId());
    room.querySelector<HTMLElement>('.gm-verdict')!.innerHTML =
      names.length === 1 ? `<b>${iWon ? 'Tu remportes tout le pot !' : `${esc(names[0])} remporte tout le pot.`}</b> ${Math.max(...res.stars)}★ — ${res.packs.flat().length} cartes.` : `<b>Ex æquo à ${Math.max(...res.stars)}★ :</b> ${names.map(esc).join(' et ')} se partagent les cartes au hasard.`;
    if (animate) sfx(iWon ? 'big' : 'tick');
  }

  // ═════════════════════════════ Roulette
  function roulettePage() {
    body.innerHTML = `<div class="gm-cols wide"><div class="gm-panel"><div class="gm-ph"><b>La roue</b><span class="gm-cd"></span></div><div class="gm-wheel"></div><div class="gm-legend muted"></div></div><div class="gm-panel gm-bet"></div></div><div class="gm-panel"><div class="gm-ph"><b>Le pot</b><span class="gm-potv"></span></div><div class="gm-pot"></div></div><div class="gm-panel"><div class="gm-ph"><b>Derniers tirages</b></div><div class="gm-past"></div></div>
      <div class="gm-rules muted">1 numéro = ${NUMBER_COST} pièces de valeur (pièces et/ou cartes), ${MIN_NUMBERS} numéros minimum (1 × 5★ = 300 = 3 numéros · 1 × 6★ = 10 numéros). Un tirage par jour à 21 h : le joueur dont le numéro sort remporte tout le pot. Sinon, tout reste pour le tirage suivant. Le site ajoute chaque jour une carte 5★ ou 6★.</div>`;
    const wheel = body.querySelector<HTMLElement>('.gm-wheel')!;
    const sel = new Set<number>();
    let stakeCards: StakeItem[] = [];
    let cur: RouletteView | null = null;
    let lastPast = '';
    const cells: HTMLElement[] = [];
    for (let n = 1; n <= ROULETTE_NUMBERS; n++) {
      const c = h('button', 'gm-num', String(n));
      c.dataset.n = String(n);
      c.addEventListener('click', () => {
        if (c.classList.contains('taken') || c.classList.contains('mine')) return;
        if (sel.has(n)) sel.delete(n);
        else sel.add(n);
        c.classList.toggle('sel', sel.has(n));
        drawBet();
      });
      cells.push(c);
      wheel.append(c);
    }
    const colors = ['#e8927c', '#7fb58a', '#6bb3e0', '#c79be8', '#e0c46b', '#e07a9b', '#8fd0c4', '#d39a6b'];
    const drawBet = () => {
      const bet = body.querySelector<HTMLElement>('.gm-bet')!;
      const r = cur?.round;
      const mine = r?.bets.find((b) => b.userId === cur?.me);
      const n = sel.size;
      const need = n * NUMBER_COST;
      const coins = coinsNeeded(n, stakeCards);
      const cv = cardsValue(stakeCards);
      bet.innerHTML = `<div class="gm-ph"><b>Miser</b>${mine ? `<span class="muted">tes numéros : ${mine.numbers.join(', ')}</span>` : ''}</div>
        <div>${n ? `${plural(n, 'numéro')} choisi${n > 1 ? 's' : ''} : <b>${[...sel].sort((a, b) => a - b).join(', ')}</b>` : '<span class="muted">Touche des numéros libres sur la roue.</span>'}</div>
        <div class="gm-ed-row"><span>Cartes</span><button class="btn-ghost sm gm-pick">${stakeCards.length ? `${plural(stakeCards.reduce((a, c) => a + c.count, 0), 'carte')} · ${fmtCoins(cv)}` : 'Ajouter des cartes…'}</button></div>
        <div class="gm-ed-v">Il faut ${fmtCoins(need)} de valeur → ${cv ? `${fmtCoins(cv)} en cartes + ` : ''}<b>${COIN_ICON}${fmtCoins(coins)}</b> pièces${cv > need && n ? ` <span class="warn">(tes cartes valent ${fmtCoins(cv - need)} de plus : prends ${Math.floor((cv - need) / NUMBER_COST)} numéro(s) de plus, sinon le surplus part au pot)</span>` : ''}</div>
        ${(mine?.numbers.length ?? 0) + n < MIN_NUMBERS && n ? `<div class="gm-warn">Minimum ${MIN_NUMBERS} numéros par tirage.</div>` : ''}
        <button class="btn-primary gm-place"${!n ? ' disabled' : ''}>Miser ${n ? plural(n, 'numéro') : ''}</button>
        ${backend.eco.demoDraw ? '<button class="btn-ghost sm gm-draw">Tirer maintenant (démo)</button>' : ''}`;
      bet.querySelector('.gm-pick')!.addEventListener('click', async () => {
        const res = await pickCards(backend, stakeCards, { title: 'Cartes misées à la roulette', hint: '1 numéro = 100 de valeur · 5★ = 300 · 6★ = 1 000 · secrète = 5 000.' });
        if (res) stakeCards = res;
        drawBet();
      });
      bet.querySelector<HTMLElement>('.gm-place')?.addEventListener('click', async (e) => {
        try {
          await busyButton(e.currentTarget as HTMLElement, backend.eco.placeBet([...sel], { coins, cards: stakeCards }));
          sfx('chime');
          toast(`Misé ! ${plural(sel.size, 'numéro')} pour le tirage de 21 h.`, 'ok');
          sel.clear();
          stakeCards = [];
          drawBet();
        } catch (err) {
          toast(errMsg(err), 'err');
        }
      });
      bet.querySelector<HTMLElement>('.gm-draw')?.addEventListener('click', async (e) => {
        try {
          await busyButton(e.currentTarget as HTMLElement, backend.eco.demoDraw!());
        } catch (err) {
          toast(errMsg(err), 'err');
        }
      });
    };
    const tick = () => {
      const cd = body.querySelector<HTMLElement>('.gm-cd');
      if (cd && cur) cd.textContent = `tirage dans ${fmtDelay(Math.max(0, cur.nextDrawAt - Date.now()))}`;
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
        body.querySelector<HTMLElement>('.gm-legend')!.innerHTML = round ? `${round.bets.map((b, i) => `<span class="gm-lg" style="--pc:${colors[i % colors.length]}">${esc(b.name)} · ${b.numbers.length}</span>`).join('')} · ${covered}/100 numéros couverts → ${Math.round(potOdds(covered) * 100)} % de chances que le pot tombe ce soir` : '';
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
          ? r.past.map((p) => `<div class="gm-pastrow"><b class="gm-ball">${p.result?.number ?? '?'}</b><span>${esc(p.day)} · ${p.result?.winnerName ? `<b>${esc(p.result.winnerName)}</b> remporte ${fmtCoins(p.result.potValue)} de valeur` : `personne — le pot (${fmtCoins(p.result?.potValue ?? 0)}) est reporté`}</span></div>`).join('')
          : '<div class="muted">Pas encore de tirage.</div>';
        drawBet();
        tick();
        lastPast = r.past[0]?.id ?? '';
        if (prevPast && lastPast !== prevPast && r.past[0]?.result) void spin(r.past[0].result.number, r.past[0].result.winnerName);
      }),
    );
    // la bille parcourt la roue, ralentit, et s'arrête sur le numéro sorti
    async function spin(number: number, winner?: string) {
      let i = Math.floor(Math.random() * 100);
      let d = 30;
      while (d < 260) {
        cells.forEach((c) => c.classList.remove('ball'));
        cells[i % 100].classList.add('ball');
        sfx('tick');
        await wait(d);
        i++;
        d *= 1.09;
      }
      cells.forEach((c) => c.classList.remove('ball'));
      cells[number - 1].classList.add('ball', 'landed');
      sfx(winner ? 'big' : 'chime');
      toast(winner ? `Le ${number} sort : ${winner} remporte tout le pot !` : `Le ${number} sort : personne ne l’avait, le pot est reporté.`, winner ? 'ok' : 'info');
      setTimeout(() => cells[number - 1].classList.remove('landed', 'ball'), 6000);
    }
  }

  // ═════════════════════════════ Forge (doublons → pièces)
  const forgeSel = new Map<string, StakeItem>();
  function forge() {
    const locked = lockedCards(backend.state);
    const dups = backend.state.collection
      .filter((c) => burnable(c.rarity))
      .map((c) => ({ ...c, spare: c.count - 1 - (locked.get(cardKey(c)) ?? 0) }))
      .filter((c) => c.spare > 0 && cardName(c.cardId) !== c.cardId)
      .sort((a, b) => CARD_VALUE[a.rarity] - CARD_VALUE[b.rarity] || b.spare - a.spare);
    for (const [k, v] of forgeSel) {
      const d = dups.find((x) => cardKey(x) === k);
      if (!d) forgeSel.delete(k);
      else v.count = Math.min(v.count, d.spare);
    }
    const total = cardsValue([...forgeSel.values()]);
    const n = [...forgeSel.values()].reduce((a, c) => a + c.count, 0);
    const rars = (['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'] as RarityId[]).filter((r) => dups.some((d) => d.rarity === r));
    body.innerHTML = `<div class="gm-panel gm-forge"><div class="gm-ph"><b>La forge</b><span class="muted">${plural(dups.reduce((a, d) => a + d.spare, 0), 'doublon libre', 'doublons libres')} · on garde toujours 1 exemplaire · les secrètes ne se brûlent jamais</span></div>
      <div class="gm-quick">${rars.map((r) => `<button class="chip" data-q="${r}" style="--rc:${rarity(r).hex}">Tous les ${starsTxt(r)} (${dups.filter((d) => d.rarity === r).reduce((a, d) => a + d.spare, 0)} · ${fmtCoins(dups.filter((d) => d.rarity === r).reduce((a, d) => a + d.spare * CARD_VALUE[r], 0))})</button>`).join('')}<button class="btn-ghost sm gm-none">Rien</button></div>
      <div class="gm-fgrid"></div>
      <div class="gm-ffoot"><span>${n ? `${plural(n, 'carte')} → ${coinsHtml(total)}` : '<span class="muted">Touche des doublons pour les mettre au feu (touche encore pour en ajouter un exemplaire).</span>'}</span><button class="btn-primary gm-burn"${n ? '' : ' disabled'}>Brûler${n ? ` · +${fmtCoins(total)}` : ''}</button></div></div>`;
    const grid = body.querySelector<HTMLElement>('.gm-fgrid')!;
    if (!dups.length) grid.innerHTML = '<div class="muted">Aucun doublon à brûler pour l’instant.</div>';
    for (const d of dups.slice(0, 400)) {
      const k = cardKey(d);
      const inSel = forgeSel.get(k)?.count ?? 0;
      const t = cardTile(d.cardId, d.rarity, { mini: true, count: d.spare + 1, label: inSel ? `🔥 ${inSel}` : `+${CARD_VALUE[d.rarity]}` });
      t.classList.toggle('burning', inSel > 0);
      t.addEventListener('click', () => {
        const cur = forgeSel.get(k)?.count ?? 0;
        if (cur >= d.spare) forgeSel.delete(k);
        else forgeSel.set(k, { cardId: d.cardId, rarity: d.rarity, count: cur + 1 });
        forge();
      });
      grid.append(t);
    }
    body.querySelectorAll<HTMLElement>('[data-q]').forEach((b) =>
      b.addEventListener('click', () => {
        for (const d of dups) if (d.rarity === b.dataset.q) forgeSel.set(cardKey(d), { cardId: d.cardId, rarity: d.rarity, count: d.spare });
        forge();
      }),
    );
    body.querySelector('.gm-none')?.addEventListener('click', () => (forgeSel.clear(), forge()));
    const burnBtn = body.querySelector<HTMLButtonElement>('.gm-burn')!;
    let armed = false;
    burnBtn.addEventListener('click', async () => {
      if (!armed && (total >= 1000 || n >= 30)) {
        armed = true;
        burnBtn.textContent = `Sûr ? ${plural(n, 'carte')} au feu`;
        return;
      }
      try {
        const r = await busyButton(burnBtn, backend.eco.burn([...forgeSel.values()]));
        forgeSel.clear();
        grid.classList.add('flash');
        sfx('chime');
        toast(`${plural(r.count, 'doublon')} brûlé${r.count > 1 ? 's' : ''} : +${fmtCoins(r.coins)} pièces !`, 'ok');
        setTimeout(forge, 400);
      } catch (err) {
        toast(errMsg(err), 'err');
      }
    });
  }

  // ═════════════════════════════ Succès + complétions
  function achievements() {
    const s = snap();
    if (!s) return void (body.innerHTML = '<div class="muted">Connecte-toi pour voir tes succès.</div>');
    const claimable = new Set(s.achievements.claimable);
    const pending = ACHIEVEMENTS.filter((a) => claimable.has(a.id));
    const total = pending.reduce((a, x) => a + achievementReward(x), 0);
    body.innerHTML = `<div class="gm-panel"><div class="gm-ph"><b>Succès · ${s.econ.achievements.length}/${ACHIEVEMENTS.length}</b>${pending.length ? `<button class="btn-primary gm-ach">Encaisser ${plural(pending.length, 'succès', 'succès')} · +${fmtCoins(total)}</button>` : ''}</div>
      <div class="gm-ach-grid">${ACHIEVEMENTS.map((a) => {
        const cur = Math.min(a.target, s.achievements.stats[a.stat] ?? 0);
        const got = s.econ.achievements.includes(a.id);
        return `<div class="gm-ach-c t${a.tier}${got ? ' got' : claimable.has(a.id) ? ' ready' : ''}"><b>${esc(a.label)}</b><span>${esc(a.how)}</span><i class="gm-bar"><i style="width:${((cur / a.target) * 100).toFixed(1)}%"></i></i><em>${got ? 'obtenu ✓' : `${fmtCoins(cur)} / ${fmtCoins(a.target)}`} · ${COIN_ICON}${ACHIEVEMENT_TIERS[a.tier - 1]}</em></div>`;
      }).join('')}</div></div>
      <div class="gm-panel"><div class="gm-ph"><b>Primes de complétion</b>${s.completions.length ? `<button class="btn-primary gm-comp">Encaisser · +${fmtCoins(s.completions.reduce((a, c) => a + c.reward, 0))}</button>` : ''}</div>
      <div class="muted">5 pièces × nombre de cartes de chaque ensemble bouclé : album (famille de 30 cartes = 150), groupe d'albums (Pokémon 1 025 = 5 125), thème entier. ${s.econ.completions.length ? `${plural(s.econ.completions.length, 'prime déjà encaissée', 'primes déjà encaissées')}.` : ''}</div>
      ${s.completions.length ? `<div class="gm-comp-list">${s.completions.map((c) => `<span class="gm-mc">${esc(c.label)} · ${c.size} cartes · +${fmtCoins(c.reward)}</span>`).join('')}</div>` : ''}</div>`;
    const bind = (sel: string, fn: () => Promise<{ coins: number }>, what: string) =>
      body.querySelector<HTMLElement>(sel)?.addEventListener('click', async (e) => {
        try {
          const r = await busyButton(e.currentTarget as HTMLElement, fn());
          sfx('big');
          toast(`${what} : +${fmtCoins(r.coins)} pièces !`, 'ok');
        } catch (err) {
          toast(errMsg(err), 'err');
        }
      });
    bind('.gm-ach', () => backend.eco.claimAchievements(), 'Succès');
    bind('.gm-comp', () => backend.eco.claimCompletions(), 'Complétion');
  }

  // ═════════════════════════════ Historique
  async function historyPage() {
    body.innerHTML = '<div class="gm-cols"><div class="gm-panel"><div class="gm-ph"><b>Mes parties</b></div><div class="gm-list gm-hg">…</div></div><div class="gm-panel"><div class="gm-ph"><b>Mes pièces</b></div><div class="gm-list gm-hc">…</div></div></div>';
    try {
      const [g, tx] = await Promise.all([backend.eco.gameHistory(), backend.eco.coinHistory()]);
      const uid = myId();
      const rows = [
        ...g.duels.map((d) => ({ at: d.resolvedAt ?? d.createdAt, href: `#/jeux/duel/${d.id}`, html: (() => {
          const k = d.sides.findIndex((s) => s.userId === uid);
          const res = d.result!;
          const out = res.winner === undefined ? 'égalité (push)' : res.winner === k ? '<b class="plus">victoire</b>' : '<b class="minus">défaite</b>';
          return `⚔ Pack Battle contre ${esc(d.sides[1 - Math.max(0, k)]?.name ?? '?')} · ${res.stars[Math.max(0, k)]}★ / ${res.stars[1 - Math.max(0, k)]}★ · ${out}`;
        })() })),
        ...g.royales.map((r) => ({ at: r.resolvedAt ?? r.createdAt, href: `#/jeux/royale/${r.id}`, html: (() => {
          const k = r.players.findIndex((p) => p.userId === uid);
          const won = r.result!.winners.includes(k);
          return `♛ Battle Royale à ${r.players.length} · ${r.result!.stars[k] ?? 0}★ · ${won ? '<b class="plus">victoire</b>' : `gagnant : ${esc(r.result!.winners.map((w) => r.players[w].name).join(', '))}`}`;
        })() })),
      ].sort((a, b) => b.at - a.at);
      body.querySelector<HTMLElement>('.gm-hg')!.innerHTML = rows.length ? rows.map((r) => `<a class="gm-item" href="${r.href}"><span class="gm-it">${r.html}</span><span class="gm-it-r muted">${new Date(r.at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></a>`).join('') : '<div class="muted">Aucune partie terminée.</div>';
      body.querySelector<HTMLElement>('.gm-hc')!.innerHTML = tx.length ? tx.map((t) => `<div class="w-tx"><span>${esc(t.label)}</span><b class="${t.amount > 0 ? 'plus' : 'minus'}">${t.amount > 0 ? '+' : '−'}${fmtCoins(Math.abs(t.amount))}</b></div>`).join('') : '<div class="muted">Aucun mouvement.</div>';
    } catch (e) {
      body.querySelector<HTMLElement>('.gm-hg')!.textContent = errMsg(e);
    }
  }

  // ═════════════════════════════ Admin : alertes anti-abus
  async function admin() {
    body.innerHTML = `<div class="gm-panel"><div class="gm-ph"><b>Alertes anti-abus</b><span class="muted">aucun blocage automatique — à trancher à la main</span></div><div class="gm-alerts">…</div></div>
      <div class="gm-rules muted">Seuils : flux net de valeur A → B (duels, royales, roulette, échanges) &gt; 5 000 sur 30 jours glissants · échanges à plus de 3:1 en valeur, 3 fois ou plus en 30 jours · nouveau compte qui perd ≥ 1 000 contre un ancien · plusieurs comptes sur le même appareil.</div>`;
    const box = body.querySelector<HTMLElement>('.gm-alerts')!;
    const load = async () => {
      let list: AbuseAlertView[];
      try {
        list = await backend.eco.alerts();
      } catch (e) {
        box.textContent = errMsg(e);
        return;
      }
      box.innerHTML = list.length ? '' : '<div class="muted">Rien à signaler.</div>';
      for (const a of list) {
        const r = h('div', `gm-alert k-${a.kind}${a.verdict ? ` v-${a.verdict}` : ''}`);
        r.innerHTML = `<b>${esc(a.title)}</b><span>${esc(a.detail)}</span>${a.verdict ? `<em>${a.verdict === 'ok' ? 'jugé légitime' : 'à surveiller'}${a.note ? ` — ${esc(a.note)}` : ''}</em>` : ''}<span class="gm-al-acts"><button class="btn-ghost sm" data-v="ok">Légitime</button><button class="btn-ghost sm" data-v="watch">À surveiller</button></span>`;
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
  function draw() {
    cleanup();
    renderHead();
    if (!backend.state.user && backend.state.mode === 'online') {
      body.innerHTML = '<div class="gm-panel"><b>Connecte-toi avec Discord pour jouer.</b></div>';
      return;
    }
    if (sub === 'duel') arg ? duelRoom(arg) : duelLobby();
    else if (sub === 'royale') arg ? royaleRoom(arg) : royaleLobby();
    else if (sub === 'roulette') roulettePage();
    else if (sub === 'forge') forge();
    else if (sub === 'succes') achievements();
    else if (sub === 'historique') void historyPage();
    else if (sub === 'admin') void admin();
    else hub();
  }

  let collSig = '';
  backend.onChange((s) => {
    if (!el.isConnected || sub !== 'forge') return;
    const sig = JSON.stringify(s.collection.map((c) => [c.cardId, c.rarity, c.count]).length) + s.collection.reduce((a, c) => a + c.count, 0);
    if (sig !== collSig) {
      collSig = sig;
      forge();
    }
  });

  return {
    el,
    enter() {
      const parts = location.hash.replace(/^#\/?/, '').split('/');
      sub = (['duel', 'royale', 'roulette', 'forge', 'succes', 'historique', 'admin'].includes(parts[1] ?? '') ? parts[1] : '') as Sub;
      arg = parts[2] ?? '';
      draw();
    },
    leave() {
      cleanup();
    },
  };
}

const cardName = (id: string) => catalogEntry(id)?.name ?? id;
