import type { PresseRunView, PresseState } from '../ecoJeux';
import { fmtCoins } from '../../core/economy';
import { packChoiceLabel, packChoices, type PackChoice } from '../../core/games';
import { PRESSE_BETS, PRESSE_DAILY, PRESSE_STRIKES, presseRisk, presseStar } from '../../core/presse';
import { rarity, starCount, type RarityId } from '../../core/rarity';
import { DUR, reducedMotion } from '../../core/motion';
import { rollNumber } from '../../core/morph';
import { busyButton, cardTile, errMsg, esc, h, toast } from '../ui';
import { guarded } from './safety';
import { COIN_ICON, coinsHtml } from './wallet';
import type { JeuxPageCtx } from './defis';
import '../defis.css';

/**
 * (V2, 11/11) LA PRESSE — #/jeux/presse. Règles : src/core/presse.ts · serveur : convex/presse.ts.
 * Une bande de 6 emplacements ; chaque frappe dévoile une carte de l'album choisi et charge la pièce de ses étoiles.
 * Deux raretés identiques d'affilée : la pièce se fend. Encaisser à tout moment.
 */

const starsTxt = (r: RarityId | string) => (r === 'secret' ? '✷' : '★'.repeat(starCount(r as RarityId)));

export function pressePage({ body, backend, unsubs, sfx }: JeuxPageCtx) {
  body.innerHTML = `<div class="gm-panel ps-panel"><div class="gm-ph"><b>La Presse</b><span class="muted ps-today"></span></div>
      <div class="ps-strip" aria-live="polite"></div>
      <div class="ps-gauge"><div><span class="df-l">Valeur de la pièce</span><b class="ps-val">${COIN_ICON}<i>0</i></b></div><div><span class="df-l">Fêlure à la prochaine frappe</span><b class="ps-risk">—</b></div></div>
      <div class="ps-ctl"></div></div>
    <div class="gm-panel"><div class="gm-ph"><b>Dernières pièces</b></div><div class="gm-list ps-past"></div></div>
    <div class="gm-rules muted">Mise ${PRESSE_BETS.join(', ')} pièces. La presse grave en secret ${PRESSE_STRIKES} cartes de l'album choisi (raretés d'un booster) ; la première frappe est offerte. Chaque carte frappée charge la pièce de ses étoiles (<b>1★ = ${presseStar(100)} pièces pour une mise de 100</b>). <b>Deux raretés identiques d'affilée : la pièce se fend</b> et la mise est perdue — après une 1★, le risque est de 58 %, après une 3★ de 10 %. Encaisse quand tu veux ; à la ${PRESSE_STRIKES}e frappe, la pièce sort seule. ${PRESSE_DAILY} parties par jour. Aucune carte n'est gagnée : la presse montre l'album (les cartes que tu n'as pas encore sont marquées), les pièces servent aux boosters.</div>`;
  const strip = body.querySelector<HTMLElement>('.ps-strip')!;
  const ctl = body.querySelector<HTMLElement>('.ps-ctl')!;
  const valEl = body.querySelector<HTMLElement>('.ps-val i')!;
  const riskEl = body.querySelector<HTMLElement>('.ps-risk')!;
  const slots: HTMLElement[] = [];
  for (let i = 0; i < PRESSE_STRIKES; i++) {
    const s = h('div', 'ps-slot');
    s.innerHTML = `<span class="ps-n">${String(i + 1).padStart(2, '0')}</span>`;
    slots.push(s);
    strip.append(s);
  }
  const albums = packChoices();
  let album: PackChoice = albums[0];
  let bet: number = PRESSE_BETS[1];
  let st: PresseState | null = null;
  /** partie affichée : celle que renvoie la dernière mutation (plus fraîche que l'abonnement pendant l'envoi) */
  let run: PresseRunView | null = null;
  let shownValue = 0;
  let drawnCards = 0;
  let drawnRun = '';
  const owned = () => new Set(backend.state.collection.map((c) => c.cardId));

  const drawStrip = (r: PresseRunView | null, animate: boolean) => {
    const fresh = !r || r.id !== drawnRun;
    if (fresh) {
      drawnCards = 0;
      drawnRun = r?.id ?? '';
      slots.forEach((s, i) => {
        s.className = 'ps-slot';
        s.innerHTML = `<span class="ps-n">${String(i + 1).padStart(2, '0')}</span>`;
      });
    }
    const cards = r?.cards ?? [];
    const own = owned();
    cards.forEach((c, i) => {
      if (i < drawnCards) return;
      const s = slots[i];
      const crack = r!.status === 'cracked' && i === cards.length - 1;
      s.className = `ps-slot on${crack ? ' crack' : ''}${animate && !reducedMotion() ? ' hit' : ''}`;
      s.style.setProperty('--rc', rarity(c.rarity).hex);
      const t = cardTile(c.cardId, c.rarity, { mini: true, ...(own.has(c.cardId) ? {} : { label: 'manquante' }) });
      s.replaceChildren(t);
    });
    drawnCards = cards.length;
    strip.classList.toggle('cracked', r?.status === 'cracked');
    strip.classList.toggle('cashed', r?.status === 'cashed');
    const v = r ? (r.status === 'cracked' ? 0 : r.value) : 0;
    if (v !== shownValue) rollNumber(valEl, shownValue, v, (n) => fmtCoins(Math.round(n)), DUR.emphatique());
    else valEl.textContent = fmtCoins(v);
    shownValue = v;
    const last = cards[cards.length - 1];
    if (r?.status === 'live' && last) {
      const p = presseRisk(last.rarity);
      riskEl.innerHTML = `<span style="--rc:${rarity(last.rarity).hex}" class="ps-rk">${Math.round(p * 100)} %</span><small>si la prochaine est encore ${starsTxt(last.rarity)}</small>`;
    } else riskEl.textContent = '—';
  };

  let ctlKey = '';
  const drawCtl = () => {
    const live = run?.status === 'live';
    const bal = backend.eco.snapshot?.coins ?? 0;
    const left = PRESSE_DAILY - (st?.today ?? 0);
    body.querySelector<HTMLElement>('.ps-today')!.textContent = `${Math.max(0, left)} partie${left > 1 ? 's' : ''} restante${left > 1 ? 's' : ''} aujourd’hui`;
    if (live) {
      // (audit 12/11, T-01) l'abonnement rappelle drawCtl juste après la mutation avec le même état : sans ce garde les
      // boutons étaient remplacés une 2e fois, et un tap en cours tombait sur un nœud retiré (frappe perdue)
      const key = `live|${run!.id}|${run!.shown}|${run!.value}`;
      if (key === ctlKey && ctl.querySelector('.ps-hit')) return;
      ctlKey = key;
      ctl.innerHTML = `<div class="ps-btns"><button class="btn-primary ps-hit">Frapper · ${run!.shown + 1}/${PRESSE_STRIKES}</button><button class="btn-ghost ps-cash">Encaisser ${COIN_ICON}${fmtCoins(run!.value)}</button></div>`;
      ctl.querySelector<HTMLElement>('.ps-hit')!.addEventListener('click', (e) => send(e.currentTarget as HTMLElement, () => backend.eco.presseStrike(run!.id)));
      ctl.querySelector<HTMLElement>('.ps-cash')!.addEventListener('click', (e) => send(e.currentTarget as HTMLElement, () => backend.eco.presseCash(run!.id)));
      return;
    }
    ctlKey = '';
    const end = run && run.status !== 'live' ? `<div class="ps-end ${run.status}">${run.status === 'cracked' ? `La pièce se fend : <b class="minus">−${fmtCoins(run.bet)}</b>` : `Pièce encaissée : <b class="${(run.payout ?? 0) >= run.bet ? 'plus' : ''}">+${fmtCoins(run.payout ?? 0)}</b> <span class="muted">(mise ${fmtCoins(run.bet)})</span>`}</div>` : '';
    ctl.innerHTML = `${end}<div class="df-step"><span class="df-l">Album</span><div class="df-chips ps-albums">${albums.map((a, i) => `<button class="gm-pack-b${a.kind === album.kind && a.themeId === album.themeId ? ' on' : ''}" data-al="${i}"><span class="gm-pack ${a.kind === 'bebou' ? 'bebou' : `t-${a.themeId}`}">${esc(packChoiceLabel(a).replace(' Pack', ''))}</span></button>`).join('')}</div></div>
      <div class="df-step"><span class="df-l">Mise</span><div class="df-chips">${PRESSE_BETS.map((b) => `<button class="gm-pack-b gm-rc${b === bet ? ' on' : ''}" data-b="${b}">${b}</button>`).join('')}<span class="muted ps-per">1★ = ${presseStar(bet)} pièces</span></div></div>
      ${bet > bal ? `<div class="gm-warn">Il te manque ${fmtCoins(bet - bal)} pièces.</div>` : ''}
      <button class="btn-primary ps-go"${bet > bal || left <= 0 ? ' disabled' : ''}>${left <= 0 ? 'La presse refroidit jusqu’à demain' : `Graver la bande · ${coinsHtml(bet)}`}</button>`;
    ctl.querySelectorAll<HTMLElement>('[data-al]').forEach((b) => b.addEventListener('click', () => ((album = albums[Number(b.dataset.al)]), drawCtl())));
    ctl.querySelectorAll<HTMLElement>('[data-b]').forEach((b) => b.addEventListener('click', () => ((bet = Number(b.dataset.b)), drawCtl())));
    ctl.querySelector<HTMLElement>('.ps-go')!.addEventListener('click', (e) => send(e.currentTarget as HTMLElement, () => backend.eco.presseStart(bet, album)));
  };

  const send = (btn: HTMLElement, fn: () => Promise<PresseRunView>) =>
    void guarded('presse', btn, async () => {
      try {
        const before = run;
        const r = await busyButton(btn, fn());
        run = r;
        drawStrip(r, true);
        drawCtl();
        if (r.status === 'cracked') sfx('tick');
        else if (r.status === 'cashed' && before?.status === 'live') sfx((r.payout ?? 0) >= 3 * r.bet ? 'big' : 'chime');
        else sfx('tick');
      } catch (err) {
        toast(errMsg(err), 'err');
      }
    });

  unsubs.push(
    backend.eco.watchPresse((s) => {
      if (!s) return void (ctl.innerHTML = '<div class="muted">Connecte-toi pour jouer.</div>');
      st = s;
      // la mutation a déjà tout montré : l'abonnement ne fait que rattraper (autre appareil, rechargement)
      if (!run || s.run?.id !== run.id || (s.run && s.run.shown > run.shown) || (s.run && s.run.status !== run.status)) {
        run = s.run;
        drawStrip(run, false);
      }
      drawCtl();
      body.querySelector<HTMLElement>('.ps-past')!.innerHTML = s.past.length
        ? s.past.map((p) => `<div class="gm-item"><span class="gm-it"><span class="gm-tag">${p.shown}/${PRESSE_STRIKES}</span>mise ${fmtCoins(p.bet)} · ${p.status === 'cracked' ? '<b class="minus">fendue</b>' : `<b class="${p.payout >= p.bet ? 'plus' : ''}">${fmtCoins(p.payout)}</b>`}</span><span class="gm-it-r muted">${new Date(p.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span></div>`).join('')
        : '<div class="muted">Pas encore de pièce.</div>';
    }),
    backend.eco.onChange(() => body.isConnected && run?.status !== 'live' && !ctl.contains(document.activeElement) && drawCtl()),
  );
}
