import { cardKey, collectionSig, lockedCards, type GameBackend, type PlayerCard } from '../backend';
import type { Shell } from '../shell';
import type { ViewerScene } from '../scenes/viewer';
import { CONTRACT_COST, autoFill, contractOdds, contractTarget, type ContractItem } from '../../core/contracts';
import { STAR_RARITIES, type StarRarityId } from '../../core/dropRates';
import { rarity, type RarityId } from '../../core/rarity';
import { catalogEntry } from '../../core/sets/themes';
import { haptics } from '../../core/haptics';
import { paintedCard } from '../cardImages';
import { busyButton, cardTile, errMsg, esc, fmtN, h, plural, popLayer, pushLayer, starsHtml, thumbUrl, toast } from '../ui';
import { PROTECT_LEGEND, protectIcons, protection as protectionOf } from './safety';

/**
 * CONTRATS (façon CS:GO) : on choisit une étoile, on remplit le contrat avec ses doublons (10 / 20 / 50 cartes),
 * on voit d'où viendra la carte (au prorata des sous-thèmes brûlés), on signe : les cartes BRÛLENT dans leurs cases
 * (retours du 3 nov. : combustion, braises, flammes), puis la carte obtenue émerge des flammes — mini-révélation dans
 * la visionneuse 3D, fond dynamique si elle est 5★ / 6★. Règles : src/core/contracts.ts.
 *
 * Protections : « Remplir automatiquement » laisse de côté les cartes en envies, dans un classeur, en pochette ou
 * engagées dans un échange en attente (celles-là ne sont pas brûlables du tout : verrou côté serveur aussi).
 */
export interface ContractsView {
  el: HTMLElement;
  enter(): void;
  leave(): void;
}

const TIERS = STAR_RARITIES.filter((r) => CONTRACT_COST[r]) as StarRarityId[];
const stars = (r: string) => `${rarity(r as RarityId).rank + 1}★`;

export function createContractsView(backend: GameBackend, shell: Shell, getViewer: () => Promise<ViewerScene>): ContractsView {
  const el = h('section', 'view contracts');
  let tier: StarRarityId = 'common';
  /** cartes mises dans le contrat, dans l'ordre où on les a ajoutées (une entrée par exemplaire) */
  let seq: string[] = [];
  /** case qui vient d'être remplie (petite animation d'arrivée) */
  let popAt = -1;
  const countOf = (id: string) => seq.reduce((a, x) => a + (x === id ? 1 : 0), 0);
  let busy = false;
  let open = false;
  el.innerHTML = `
    <div class="ct-wrap">
      <header class="ct-head">
        <div class="eyebrow">Contrats</div>
        <h1>Brûle tes doublons</h1>
        <p>Des doublons d’une même étoile contre <b>une carte de l’étoile au-dessus</b>. Tu ne brûles jamais ton dernier exemplaire,
        et si le sous-thème tiré a des cartes que tu n’as pas, tu reçois forcément une nouvelle.</p>
      </header>
      <div class="ct-tiers"></div>
      <div class="ct-sheet">
        <div class="ct-sheet-top"><div class="ct-title"></div><div class="ct-fill"></div></div>
        <div class="ct-slots"></div>
        <div class="ct-odds"></div>
        <div class="ct-recap" hidden></div>
        <div class="ct-actions">
          <button class="ghost auto">Remplir automatiquement</button>
          <button class="ghost clear">Vider</button>
          <button class="btn-primary sign">Signer le contrat</button>
        </div>
      </div>
      <div class="ct-pick-t">Tes doublons <span></span></div>
      <div class="ct-legend" hidden>${esc(PROTECT_LEGEND)}</div>
      <div class="grid mini ct-dups"></div>
      <div class="empty" hidden></div>
    </div>
    <div class="ct-flames" hidden><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
    <div class="sum-bg ct-bg" hidden><div class="sum-rays"></div><div class="sum-parts"></div></div>
    <div class="viewer-ui" hidden><button class="close" aria-label="Fermer">✕</button><div class="v-info"></div><div class="v-hint">glisse pour la faire tourner</div></div>`;
  const tiersEl = el.querySelector<HTMLElement>('.ct-tiers')!;
  const titleEl = el.querySelector<HTMLElement>('.ct-title')!;
  const fillEl = el.querySelector<HTMLElement>('.ct-fill')!;
  const slotsEl = el.querySelector<HTMLElement>('.ct-slots')!;
  const oddsEl = el.querySelector<HTMLElement>('.ct-odds')!;
  const dupsEl = el.querySelector<HTMLElement>('.ct-dups')!;
  const pickT = el.querySelector<HTMLElement>('.ct-pick-t span')!;
  const empty = el.querySelector<HTMLElement>('.empty')!;
  const recapEl = el.querySelector<HTMLElement>('.ct-recap')!;
  const legendEl = el.querySelector<HTMLElement>('.ct-legend')!;
  /** dernier retrait d'une case (toucher par erreur en faisant défiler) : « Annuler » pendant 4 s */
  let undo: { id: string; i: number; t: number } | null = null;
  /** signature armée (second toucher) : contrat de 4★+ ou de plus de 10 cartes (UX4-02) */
  let armed: { sig: string; at: number } | null = null;
  let armT = 0;
  const sheetSig = () => `${tier}|${seq.join(',')}`;
  const needsConfirm = () => cost() > 10 || rarity(tier).rank >= 3;
  /** combustion : un toucher la passe (après ~0,8 s) */
  let skipBurn = false;
  /** cartes protégées déjà signalées (toast une seule fois) */
  const protHinted = new Set<string>();
  const signBtn = el.querySelector<HTMLButtonElement>('.sign')!;
  const autoBtn = el.querySelector<HTMLButtonElement>('.auto')!;
  const clearBtn = el.querySelector<HTMLButtonElement>('.clear')!;
  const viewerUi = el.querySelector<HTMLElement>('.viewer-ui')!;
  const vInfo = el.querySelector<HTMLElement>('.v-info')!;
  const flamesEl = el.querySelector<HTMLElement>('.ct-flames')!;
  const bgEl = el.querySelector<HTMLElement>('.ct-bg')!;

  /** Pourquoi une carte est protégée du remplissage automatique (envie, classeur, pochette) — vide si rien (partagé avec la forge). */
  const protection = (cardId: string) => protectionOf(backend.state, cardId);
  /** doublons disponibles (exemplaires au-delà du premier, moins ceux engagés dans un échange en attente) d'une étoile */
  function dups(r: string): Array<PlayerCard & { spare: number; locked: number; protect: string[] }> {
    const locked = lockedCards(backend.state);
    return backend.state.collection
      .filter((c) => c.rarity === r && c.count > 1 && catalogEntry(c.cardId))
      .map((c) => {
        const lk = locked.get(cardKey(c)) ?? 0;
        return { ...c, spare: Math.max(0, c.count - 1 - lk), locked: lk, protect: protection(c.cardId) };
      })
      .filter((c) => c.spare > 0 || c.locked > 0)
      .sort((a, b) => b.spare - a.spare || catalogEntry(a.cardId)!.num - catalogEntry(b.cardId)!.num);
  }
  const items = (): ContractItem[] => {
    const m = new Map<string, number>();
    for (const id of seq) m.set(id, (m.get(id) ?? 0) + 1);
    return [...m].map(([cardId, count]) => ({ cardId, count }));
  };
  const total = () => seq.length;
  /** contrats possibles d'une étoile : avec les doublons libres (remplissage auto) et en plus avec les protégés */
  function possibleOf(r: StarRarityId) {
    const all = dups(r);
    const need = CONTRACT_COST[r]!;
    const have = all.reduce((a, c) => a + c.spare, 0);
    const free = all.filter((c) => !c.protect.length).reduce((a, c) => a + c.spare, 0);
    const possible = Math.floor(free / need);
    return { have, possible, extra: Math.floor(have / need) - possible };
  }
  const cost = () => CONTRACT_COST[tier]!;

  function renderTiers() {
    tiersEl.innerHTML = '';
    for (const r of TIERS) {
      const { have, possible, extra } = possibleOf(r);
      const need = CONTRACT_COST[r]!;
      const to = contractTarget(r)!;
      // « possible » = ce que le remplissage auto peut vraiment faire (cartes protégées à part, UX4-07) ; libellé court (UX4-18)
      const b = h('button', `ct-tier${r === tier ? ' on' : ''}${have >= need ? ' ready' : ''}`,
        `<span class="ct-tr"><b style="color:${rarity(r).hex}">${stars(r)}</b> → <b style="color:${rarity(to).hex}">${stars(to)}</b></span>
         <span class="ct-tc">${need} cartes</span><span class="ct-th">${plural(have, 'doublon')}</span><span class="ct-tp${possible ? ' ok' : ''}">${possible ? `×${possible} possible${possible > 1 ? 's' : ''}` : extra ? `×${extra} à la main` : 'pas encore'}</span>`);
      b.title = `${possible ? plural(possible, 'contrat possible', 'contrats possibles') : 'Aucun contrat en remplissage auto'}${extra ? ` · +${extra} en ajoutant à la main tes cartes protégées (envies, classeurs, pochettes)` : ''}`;
      b.style.setProperty('--rc', rarity(to).hex);
      b.addEventListener('click', () => {
        if (busy || tier === r) return;
        tier = r;
        seq = [];
        undo = null;
        shell.sfx.tick(1.2, 0.05);
        render();
      });
      tiersEl.append(b);
    }
    // téléphone (étoiles qui défilent) : l'étoile choisie est toujours visible, même la 4ᵉ ou la 5ᵉ
    const on = tiersEl.querySelector<HTMLElement>('.ct-tier.on');
    if (on && tiersEl.scrollWidth > tiersEl.clientWidth + 2) {
      const cr = tiersEl.getBoundingClientRect();
      const br = on.getBoundingClientRect();
      if (br.left < cr.left + 16) tiersEl.scrollLeft -= cr.left + 16 - br.left;
      else if (br.right > cr.right - 28) tiersEl.scrollLeft += br.right - (cr.right - 28);
    }
  }

  /** Chances par sous-thème ; au-delà de 4 (familles Jeux vidéo mélangées), le reste est regroupé en « autres ». */
  function oddsText(odds: ReturnType<typeof contractOdds>): string {
    const top = odds.slice(0, odds.length > 5 ? 4 : 5);
    const rest = odds.slice(top.length).reduce((a, o) => a + o.p, 0);
    const pct = (p: number) => `<b>${Math.max(1, Math.round(p * 100))}\u00a0%</b>`;
    return [...top.map((o) => `${pct(o.p)} ${esc(o.label)}`), ...(rest > 0 ? [`${pct(rest)} ${odds.length - top.length} autres`] : [])].join(' · ');
  }

  function renderSheet() {
    const to = contractTarget(tier)!;
    const n = total();
    titleEl.innerHTML = `Contrat ${stars(tier)} → <span style="color:${rarity(to).accentHex}">${rarity(to).label} ${stars(to)}</span>`;
    fillEl.innerHTML = `<b>${n}</b> / ${cost()}`;
    el.style.setProperty('--ct-c', rarity(to).hex);
    // une case par carte à brûler : la carte choisie (dans l'ordre d'ajout), ou vide. Les cases sont mises à jour sur
    // place (pas reconstruites) : aucune vignette ne clignote quand on ajoute ou retire une carte.
    slotsEl.className = `ct-slots n${cost()}`; // téléphone : moins de colonnes, cases ≥ 40 px (UX4-10)
    if (slotsEl.children.length !== cost()) {
      slotsEl.replaceChildren(
        ...Array.from({ length: cost() }, (_, i) => {
          const s = h('button', 'ct-slot');
          s.addEventListener('click', () => {
            if (busy || !seq[i]) return;
            const id = seq[i];
            seq.splice(i, 1);
            popAt = -1;
            undo = { id, i, t: Date.now() };
            window.setTimeout(() => undo && Date.now() - undo.t >= 4000 && ((undo = null), renderSheet()), 4100);
            shell.sfx.tick(0.8, 0.05);
            renderSheet();
            syncDup(id);
          });
          return s;
        }),
      );
    }
    [...slotsEl.children].forEach((node, i) => {
      const s = node as HTMLElement;
      const id = seq[i] ?? '';
      s.style.setProperty('--rc', rarity(tier).hex);
      if (s.dataset.id !== id) {
        s.dataset.id = id;
        s.classList.toggle('full', !!id);
        if (id) {
          const e = catalogEntry(id)!;
          const real = paintedCard(id, tier);
          s.title = `${e.name} — retirer`;
          s.setAttribute('aria-label', `Retirer ${e.name}`);
          s.innerHTML = real ? `<img class="sreal" alt="" src="${real}">` : `<img alt="" src="${thumbUrl(e)}">`;
        } else {
          s.removeAttribute('title');
          s.removeAttribute('aria-label');
          s.innerHTML = '';
        }
      }
      // la case qui vient d'être remplie arrive avec un rebond
      if (i === popAt) {
        s.classList.remove('pop');
        void s.offsetWidth;
        s.classList.add('pop');
      }
    });
    const odds = contractOdds(tier, items());
    const spareTotal = [...spareOf.values()].reduce((a, b) => a + b, 0);
    // pas assez de doublons pour ce contrat : on le dit tout de suite, plutôt que de laisser chercher
    const short = cost() - spareTotal;
    if (undo && (seq.length >= cost() || Date.now() - undo.t > 4000)) undo = null;
    oddsEl.innerHTML = undo
      ? `${esc(catalogEntry(undo.id)?.name ?? '')} retirée du contrat · <button class="linkish ct-undo">Annuler</button>`
      : n
      ? `Carte reçue : ${starsHtml(to)} · ${oddsText(odds)}`
      : short > 0
        ? spareTotal
          ? `Il faut ${cost()} doublons ${stars(tier)} : tu en as ${spareTotal}, encore ${short} à trouver dans les boosters.`
          : `Il faut ${cost()} doublons ${stars(tier)} pour ce contrat : tu n’en as pas encore.`
        : `Choisis ${cost()} doublons ${stars(tier)} ci-dessous, ou laisse-moi remplir.`;
    signBtn.disabled = busy || n !== cost();
    // « Remplir » n'a de sens que s'il reste de la place et des doublons ; « Vider » que s'il y a quelque chose
    autoBtn.disabled = busy || n >= cost() || spareTotal <= n;
    clearBtn.disabled = busy || n === 0;
    signBtn.classList.toggle('ready', !busy && n === cost());
    fillEl.classList.toggle('done', n === cost());
    // second toucher : armé tant que le contrat ne change pas (3 s)
    if (armed && (armed.sig !== sheetSig() || n !== cost() || busy)) (armed = null), clearTimeout(armT);
    signBtn.classList.toggle('armed', !!armed);
    signBtn.textContent = armed ? `Confirmer : brûler ${cost()} cartes ${stars(tier)} ?` : 'Signer le contrat';
    signBtn.title = n === cost() ? '' : `Encore ${cost() - n} carte${cost() - n > 1 ? 's' : ''} à choisir`;
    // récapitulatif de ce qui part au feu, lisible (les cases font ~30 px au téléphone)
    recapEl.hidden = n !== cost() || busy;
    if (!recapEl.hidden) {
      const list = items().sort((a, b) => b.count - a.count);
      const names = list.map((it) => `${it.count}× ${esc(catalogEntry(it.cardId)?.name ?? it.cardId)}`);
      recapEl.innerHTML = `<b>Tu brûles :</b> ${names.slice(0, 8).join(', ')}${names.length > 8 ? ` et ${names.length - 8} autres` : ''} · tu gardes 1 exemplaire de chacune.`;
    }
  }
  oddsEl.addEventListener('click', (e) => {
    if (!(e.target as HTMLElement).closest('.ct-undo') || !undo || busy) return;
    const u = undo;
    undo = null;
    if (seq.length < cost() && (spareOf.get(u.id) ?? 0) > countOf(u.id)) seq.splice(Math.min(u.i, seq.length), 0, u.id);
    renderSheet();
    syncDup(u.id);
  });

  function renderDups() {
    const list = dups(tier);
    const avail = list.reduce((a, c) => a + c.spare, 0);
    pickT.textContent = `${stars(tier)} · ${avail} disponible${avail > 1 ? 's' : ''}`;
    const frag = document.createDocumentFragment();
    spareOf.clear();
    for (const c of list) {
      spareOf.set(c.cardId, c.spare);
      const t = cardTile(c.cardId, tier, { mini: true });
      t.classList.add('ct-dup');
      t.insertAdjacentHTML('beforeend', `<span class="count"></span>`);
      // protégée (envie, classeur, pochette) : laissée de côté par le remplissage automatique, mais brûlable à la main
      if (c.protect.length) t.insertAdjacentHTML('beforeend', `<span class="ct-prot" title="Protégée du remplissage automatique : ${esc(c.protect.join(', '))}" aria-label="Protégée : ${esc(c.protect.join(', '))}">${protectIcons(c.protect)}</span>`);
      if (c.locked) t.insertAdjacentHTML('beforeend', `<span class="ct-lock" title="${c.locked} exemplaire${c.locked > 1 ? 's' : ''} engagé${c.locked > 1 ? 's' : ''} dans un échange en attente">🔒</span>`);
      t.addEventListener('click', () => {
        if (busy) return;
        if (c.spare - countOf(c.cardId) <= 0) return toast(c.locked ? 'Engagée dans un échange en attente : attends la réponse.' : 'Tu gardes toujours un exemplaire de chaque carte.', 'info');
        if (total() >= cost()) return toast('Le contrat est plein : signe-le, ou retire une carte.', 'info');
        // au doigt, pas de survol : on explique la protection la première fois qu'on brûle une telle carte
        if (c.protect.length && !protHinted.has(c.cardId)) {
          protHinted.add(c.cardId);
          toast(`Protégée (${c.protect.join(', ')}) : ajoutée quand même.`, 'info');
        }
        undo = null;
        seq.push(c.cardId);
        popAt = seq.length - 1;
        // la note monte à mesure que le contrat se remplit ; petit carillon quand il est complet
        shell.sfx.tick(1 + (seq.length / cost()) * 0.9, 0.07);
        if (seq.length === cost()) shell.sfx.chime(2, 0.06);
        renderSheet();
        syncDup(c.cardId);
      });
      frag.append(t);
    }
    dupsEl.replaceChildren(frag);
    for (const c of list) syncDup(c.cardId);
    empty.hidden = list.length > 0;
    legendEl.hidden = !list.some((c) => c.protect.length || c.locked);
    empty.innerHTML = `Pas encore de doublons ${stars(tier)} : <a href="#/">ouvre des boosters →</a>, ils arrivent vite.`;
  }

  /** doublons disponibles de chaque carte de la grille affichée */
  const spareOf = new Map<string, number>();
  /** Met à jour UNE tuile de la grille (pastille « ×2 », « 3 dispo », grisée si plus rien) sans rien reconstruire. */
  function syncDup(id: string) {
    const t = dupsEl.querySelector<HTMLElement>(`.ct-dup[data-card="${CSS.escape(id)}"]`);
    if (!t) return;
    const used = countOf(id);
    const left = (spareOf.get(id) ?? 0) - used;
    t.classList.toggle('used-up', left <= 0);
    t.classList.toggle('picked', used > 0);
    t.querySelector<HTMLElement>('.count')!.textContent = `${left} dispo`;
    let badge = t.querySelector<HTMLElement>('.badge');
    if (used && !badge) t.append((badge = h('span', 'badge')));
    if (badge) {
      if (used) badge.textContent = `×${used}`;
      else badge.remove();
    }
  }
  const syncDups = () => spareOf.forEach((_, id) => syncDup(id));

  function render() {
    renderTiers();
    renderDups(); // d'abord la grille : elle recense les doublons dont la fiche a besoin
    renderSheet();
  }

  el.querySelector('.auto')!.addEventListener('click', () => {
    if (busy) return;
    const all = dups(tier);
    const free = all.filter((c) => !c.protect.length);
    seq = autoFill(tier, free.map((c) => ({ cardId: c.cardId, spare: c.spare }))).flatMap((it) => Array.from({ length: it.count }, () => it.cardId));
    popAt = -1;
    undo = null;
    if (seq.length) shell.sfx.whoosh(0.3, 0.06);
    if (seq.length === cost()) shell.sfx.chime(2, 0.06);
    if (total() < cost()) {
      const skipped = all.length - free.length;
      toast(`Pas assez de doublons ${stars(tier)} libres (${total()} sur ${cost()})${skipped ? ` · ${skipped} carte${skipped > 1 ? 's' : ''} protégée${skipped > 1 ? 's' : ''} laissée${skipped > 1 ? 's' : ''} de côté (envies, classeurs, pochettes)` : ''}.`, 'info');
    }
    renderSheet();
    syncDups();
  });
  el.querySelector('.clear')!.addEventListener('click', () => {
    if (busy || !seq.length) return;
    seq = [];
    popAt = -1;
    undo = null;
    shell.sfx.tick(0.7, 0.05);
    renderSheet();
    syncDups();
  });

  signBtn.addEventListener('click', async () => {
    if (busy || total() !== cost()) return;
    shell.requestGyro(); // iPhone : en première ligne du clic
    if (needsConfirm()) {
      if (!armed) {
        armed = { sig: sheetSig(), at: Date.now() };
        clearTimeout(armT);
        armT = window.setTimeout(() => ((armed = null), renderSheet()), 3000);
        haptics.pulse(10);
        renderSheet();
        return;
      }
      if (Date.now() - armed.at < 400) return; // double-toucher : ce n'est pas une confirmation
    }
    armed = null;
    clearTimeout(armT);
    busy = true;
    renderSheet();
    const viewerP = getViewer();
    const from = tier;
    try {
      const res = await busyButton(signBtn, backend.signContract(from, items()));
      haptics.pulse([30, 40, 30]);
      try {
        await burnSlots(res.rarity);
      } catch (e) {
        // la cérémonie ne doit jamais bloquer le contrat (déjà signé côté serveur) : on passe à la carte
        console.error('[contrats] combustion', e);
      }
      seq = [];
      popAt = -1;
      if (!el.isConnected) {
        // on a quitté la page pendant la cérémonie : la carte est dans la collection, on le dit simplement
        toast(`Contrat signé : ${res.cardName} rejoint ta collection`, 'ok');
        return;
      }
      const viewer = await viewerP;
      const rr = rarity(res.rarity);
      pushLayer(closeViewer); // « retour » du téléphone = fermer la carte
      open = true;
      document.body.classList.add('card-open');
      el.classList.add('viewing');
      viewerUi.hidden = false;
      vInfo.className = `v-info r-${res.rarity}`;
      vInfo.style.setProperty('--ra', rr.accentHex);
      vInfo.innerHTML = `<div class="ci-new">${res.isNew ? 'NOUVELLE CARTE' : 'CONTRAT SIGNÉ'}</div><div class="ci-name">${esc(res.cardName)}</div>
        <div class="ci-meta">${starsHtml(res.rarity)} <span class="ci-r" style="color:${rr.accentHex}">${rr.label}</span></div>
        <div class="ci-sub">n°${fmtN(res.mintNumber)}\u00a0imprimé · contre ${CONTRACT_COST[from]} doublons ${stars(from)}</div>`;
      haptics.pulse(rr.tier >= 4 ? [50, 30, 90] : 40);
      // fond dynamique (5★ / 6★ obtenue) : lueur radiale de la rareté, rayons, particules de braise
      if (rr.rank >= 4) {
        bgEl.className = `sum-bg ct-bg r-${res.rarity}`;
        bgEl.style.setProperty('--rc', rr.hex);
        bgEl.style.setProperty('--ra', rr.accentHex);
        bgEl.style.setProperty('--pa', '#ff9a3c');
        bgEl.style.setProperty('--k', rr.rank >= 5 ? '1' : '0.75');
        const parts = bgEl.querySelector<HTMLElement>('.sum-parts')!;
        parts.replaceChildren();
        for (let i = 0; i < 22; i++) {
          const sp = h('i');
          sp.style.setProperty('--x', `${(Math.random() * 100).toFixed(1)}%`);
          sp.style.setProperty('--d', `${(4 + Math.random() * 6).toFixed(2)}s`);
          sp.style.setProperty('--dl', `${(-Math.random() * 8).toFixed(2)}s`);
          sp.style.setProperty('--s', `${(2 + Math.random() * 4).toFixed(1)}px`);
          parts.append(sp);
        }
        bgEl.hidden = false;
      }
      shell.setDimmed(false);
      shell.show('viewer');
      void viewer.show(res.cardId, res.rarity);
    } catch (err) {
      toast(errMsg(err), 'err');
    } finally {
      busy = false;
      flamesEl.hidden = true;
      el.classList.remove('burning');
      if (!open) {
        // (échec réseau, ou toute autre interruption) : la page revient telle quelle
        document.body.classList.remove('card-open');
        render();
      }
    }
  });

  /**
   * COMBUSTION : chaque case du contrat se consume (le feu part d'un point au hasard et ronge la carte, bord incandescent,
   * braises qui montent), en cascade ; puis les flammes se lèvent au centre — la carte obtenue en émergera (visionneuse).
   */
  async function burnSlots(to: RarityId): Promise<void> {
    const slots = [...slotsEl.querySelectorAll<HTMLElement>('.ct-slot.full')];
    el.classList.add('burning');
    el.style.setProperty('--fire', rarity(to).hex);
    shell.sfx.rumble(1.4, 0.18);
    const step = Math.min(0.09, 1.3 / Math.max(1, slots.length));
    // « touche pour passer » (UX4-09) : la cérémonie se raccourcit dès ~0,8 s
    skipBurn = false;
    const t0 = performance.now();
    const onSkip = () => {
      if (performance.now() - t0 > 800) skipBurn = true;
    };
    el.addEventListener('pointerdown', onSkip);
    const prevOdds = oddsEl.innerHTML;
    window.setTimeout(() => el.classList.contains('burning') && (oddsEl.innerHTML = '<span class="ct-skip">touche l’écran pour passer</span>'), 800);
    const waitOrSkip = (ms: number) =>
      new Promise<void>((res) => {
        const end = performance.now() + ms;
        const tick = () => (skipBurn || performance.now() >= end ? res() : void setTimeout(tick, 50));
        tick();
      });
    const timers: number[] = [];
    slots.forEach((slot, i) => {
      timers.push(window.setTimeout(() => {
        slot.style.setProperty('--bx', `${(20 + Math.random() * 60).toFixed(0)}%`);
        slot.style.setProperty('--by', `${(20 + Math.random() * 60).toFixed(0)}%`);
        slot.classList.add('burn');
        for (let k = 0; k < 5; k++) {
          const em = h('i', 'ember');
          em.style.setProperty('--ex', `${(10 + Math.random() * 80).toFixed(0)}%`);
          em.style.setProperty('--ed', `${(0.9 + Math.random() * 0.9).toFixed(2)}s`);
          em.style.setProperty('--el', `${(Math.random() * 0.6).toFixed(2)}s`);
          slot.append(em);
        }
        if (i % 2 === 0) shell.sfx.tick(0.6 + Math.random() * 0.3, 0.05);
        if (i % 4 === 0) haptics.pulse(8);
      }, i * step * 1000));
    });
    const burnEnd = slots.length * step * 1000 + 1100;
    await waitOrSkip(burnEnd);
    timers.forEach(clearTimeout); // passé : les cases pas encore allumées ne s'allumeront plus après coup
    // les flammes se lèvent : la nouvelle carte arrive
    flamesEl.hidden = false;
    flamesEl.style.setProperty('--fire', rarity(to).hex);
    shell.sfx.whoosh(0.7, 0.2, true);
    shell.sfx.crack(0.2);
    haptics.pulse([20, 30, 60]);
    await (skipBurn ? new Promise((r) => setTimeout(r, 350)) : waitOrSkip(900)); // (passé : un éclair de flammes quand même)
    el.removeEventListener('pointerdown', onSkip);
    oddsEl.innerHTML = prevOdds;
    // la fiche se vide pendant que les flammes couvrent tout
    for (const slot of slots) {
      slot.classList.remove('burn');
      slot.querySelectorAll('.ember').forEach((x) => x.remove());
    }
  }

  function closeViewer() {
    if (!open) return;
    popLayer(closeViewer);
    open = false;
    document.body.classList.remove('card-open');
    el.classList.remove('viewing');
    viewerUi.hidden = true;
    bgEl.hidden = true;
    shell.show(null);
    shell.setDimmed(true);
    render();
  }
  viewerUi.querySelector('.close')!.addEventListener('click', closeViewer);
  window.addEventListener('keydown', (e) => e.key === 'Escape' && open && closeViewer());

  let sig = '';
  backend.onChange((st) => {
    const now = `${collectionSig(st)}|${st.wishlist.length}|${st.binders.map((b) => b.cards.length + (b.coverCardId ?? '')).join(',')}|${st.trades.outgoing.map((t) => t.id).join(',')}`;
    if (now === sig) return;
    sig = now;
    if (!el.isConnected || open || busy) return;
    // une carte a pu partir (échange) : on retire du contrat ce qui n'est plus disponible
    const spare = new Map(dups(tier).map((c) => [c.cardId, c.spare]));
    const kept = new Map<string, number>();
    seq = seq.filter((id) => {
      const k = (kept.get(id) ?? 0) + 1;
      kept.set(id, k);
      return k <= (spare.get(id) ?? 0);
    });
    render();
  });

  return {
    el,
    enter() {
      shell.show(null);
      shell.setDimmed(true);
      // première étoile où un contrat est possible, sinon la plus basse
      if (!seq.length) tier = TIERS.find((r) => possibleOf(r).possible > 0) ?? TIERS.find((r) => possibleOf(r).extra > 0) ?? tier;
      render();
    },
    leave() {
      if (open) closeViewer();
    },
  };
}
