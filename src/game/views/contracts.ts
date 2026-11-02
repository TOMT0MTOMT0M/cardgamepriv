import { collectionSig, type GameBackend, type PlayerCard } from '../backend';
import type { Shell } from '../shell';
import type { ViewerScene } from '../scenes/viewer';
import { CONTRACT_COST, autoFill, contractOdds, contractTarget, type ContractItem } from '../../core/contracts';
import { STAR_RARITIES, type StarRarityId } from '../../core/dropRates';
import { rarity, type RarityId } from '../../core/rarity';
import { catalogEntry } from '../../core/sets/themes';
import { haptics } from '../../core/haptics';
import { paintedCard, realCardUrl } from '../cardImages';
import { createRecycleScene, type RecycleScene } from '../scenes/recycle';
import { busyButton, cardTile, errMsg, esc, fmtN, h, plural, popLayer, pushLayer, starsHtml, thumbUrl, toast } from '../ui';

/**
 * CONTRATS (façon CS:GO) : on choisit une étoile, on remplit le contrat avec ses doublons (10 / 20 / 50 cartes),
 * on voit d'où viendra la carte (au prorata des sous-thèmes brûlés), on signe : les cartes brûlent, puis la nouvelle
 * carte se révèle en grand dans la visionneuse 3D. Règles : src/core/contracts.ts.
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
  /** scène 3D du recyclage (pioche puis dispersion), montée en fond à la première visite de la page */
  let recycleP: Promise<RecycleScene> | null = null;
  const getRecycle = () => (recycleP ??= shell.mount('recycle', createRecycleScene()));
  /** Images 2D des cartes brûlées (déjà peintes pour la plupart : elles étaient dans la grille). */
  async function cardImages(ids: string[], r: string): Promise<Map<string, HTMLImageElement | null>> {
    const out = new Map<string, HTMLImageElement | null>();
    await Promise.all(
      [...new Set(ids)].map(async (id) => {
        const url = await realCardUrl(id, r);
        if (!url) return out.set(id, null);
        const im = new Image();
        im.src = url;
        try {
          await im.decode();
          out.set(id, im);
        } catch {
          out.set(id, null);
        }
      }),
    );
    return out;
  }
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
        <div class="ct-actions">
          <button class="ghost auto">Remplir automatiquement</button>
          <button class="ghost clear">Vider</button>
          <button class="btn-primary sign">Signer le contrat</button>
        </div>
      </div>
      <div class="ct-pick-t">Tes doublons <span></span></div>
      <div class="grid mini ct-dups"></div>
      <div class="empty" hidden></div>
    </div>
    <div class="viewer-ui" hidden><button class="close" aria-label="Fermer">✕</button><div class="v-info"></div><div class="v-hint">glisse pour la faire tourner</div></div>`;
  const tiersEl = el.querySelector<HTMLElement>('.ct-tiers')!;
  const titleEl = el.querySelector<HTMLElement>('.ct-title')!;
  const fillEl = el.querySelector<HTMLElement>('.ct-fill')!;
  const slotsEl = el.querySelector<HTMLElement>('.ct-slots')!;
  const oddsEl = el.querySelector<HTMLElement>('.ct-odds')!;
  const dupsEl = el.querySelector<HTMLElement>('.ct-dups')!;
  const pickT = el.querySelector<HTMLElement>('.ct-pick-t span')!;
  const empty = el.querySelector<HTMLElement>('.empty')!;
  const signBtn = el.querySelector<HTMLButtonElement>('.sign')!;
  const autoBtn = el.querySelector<HTMLButtonElement>('.auto')!;
  const clearBtn = el.querySelector<HTMLButtonElement>('.clear')!;
  const viewerUi = el.querySelector<HTMLElement>('.viewer-ui')!;
  const vInfo = el.querySelector<HTMLElement>('.v-info')!;

  /** doublons disponibles (exemplaires au-delà du premier) d'une étoile */
  function dups(r: string): Array<PlayerCard & { spare: number }> {
    return backend.state.collection
      .filter((c) => c.rarity === r && c.count > 1 && catalogEntry(c.cardId))
      .map((c) => ({ ...c, spare: c.count - 1 }))
      .sort((a, b) => b.spare - a.spare || catalogEntry(a.cardId)!.num - catalogEntry(b.cardId)!.num);
  }
  const items = (): ContractItem[] => {
    const m = new Map<string, number>();
    for (const id of seq) m.set(id, (m.get(id) ?? 0) + 1);
    return [...m].map(([cardId, count]) => ({ cardId, count }));
  };
  const total = () => seq.length;
  const cost = () => CONTRACT_COST[tier]!;

  function renderTiers() {
    tiersEl.innerHTML = '';
    for (const r of TIERS) {
      const have = dups(r).reduce((a, c) => a + c.spare, 0);
      const need = CONTRACT_COST[r]!;
      const to = contractTarget(r)!;
      const b = h('button', `ct-tier${r === tier ? ' on' : ''}${have >= need ? ' ready' : ''}`,
        `<span class="ct-tr"><b style="color:${rarity(r).hex}">${stars(r)}</b> → <b style="color:${rarity(to).hex}">${stars(to)}</b></span>
         <span class="ct-tc">${need} cartes</span><span class="ct-th">${plural(have, 'doublon')}</span>`);
      b.style.setProperty('--rc', rarity(to).hex);
      b.addEventListener('click', () => {
        if (busy || tier === r) return;
        tier = r;
        seq = [];
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
    if (slotsEl.children.length !== cost()) {
      slotsEl.replaceChildren(
        ...Array.from({ length: cost() }, (_, i) => {
          const s = h('button', 'ct-slot');
          s.addEventListener('click', () => {
            if (busy || !seq[i]) return;
            const id = seq[i];
            seq.splice(i, 1);
            popAt = -1;
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
    oddsEl.innerHTML = n
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
    signBtn.textContent = n === cost() ? 'Signer le contrat' : `Encore ${cost() - n} carte${cost() - n > 1 ? 's' : ''}`;
  }

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
      t.addEventListener('click', () => {
        if (busy) return;
        if (c.spare - countOf(c.cardId) <= 0) return toast('Tu gardes toujours un exemplaire de chaque carte.', 'info');
        if (total() >= cost()) return toast('Le contrat est plein : signe-le, ou retire une carte.', 'info');
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
    empty.textContent = `Pas encore de doublons ${stars(tier)} : ouvre des boosters, ils arrivent vite.`;
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
    seq = autoFill(tier, dups(tier).map((c) => ({ cardId: c.cardId, spare: c.spare }))).flatMap((it) => Array.from({ length: it.count }, () => it.cardId));
    popAt = -1;
    if (seq.length) shell.sfx.whoosh(0.3, 0.06);
    if (seq.length === cost()) shell.sfx.chime(2, 0.06);
    if (total() < cost()) toast(`Pas assez de doublons ${stars(tier)} (${total()} sur ${cost()}).`, 'info');
    renderSheet();
    syncDups();
  });
  el.querySelector('.clear')!.addEventListener('click', () => {
    if (busy || !seq.length) return;
    seq = [];
    popAt = -1;
    shell.sfx.tick(0.7, 0.05);
    renderSheet();
    syncDups();
  });

  signBtn.addEventListener('click', async () => {
    if (busy || total() !== cost()) return;
    shell.requestGyro(); // iPhone : en première ligne du clic
    busy = true;
    renderSheet();
    const viewerP = getViewer();
    const recP = getRecycle();
    const from = tier;
    const burned = [...seq];
    // les images des cartes brûlées se préparent pendant que le serveur répond
    const imgsP = cardImages(burned, from);
    try {
      const res = await busyButton(signBtn, backend.signContract(from, items()));
      // les cases du contrat s'envolent en 3D : leur position à l'écran est le point de départ de chaque carte
      const rects = [...slotsEl.querySelectorAll<HTMLElement>('.ct-slot')].map((s) => s.getBoundingClientRect());
      haptics.pulse([30, 40, 30]);
      shell.sfx.whoosh(0.4, 0.1);
      try {
        const [rec, images] = await Promise.all([recP, imgsP]);
        // la page s'efface, la 3D revient au premier plan : les cartes se rassemblent en pioche, puis se défont
        el.classList.add('recycling');
        document.body.classList.add('card-open');
        shell.setDimmed(false);
        shell.show('recycle');
        await rec.play({ cards: burned, images, from, to: res.rarity, rects });
      } catch (e) {
        // la cérémonie ne doit jamais bloquer le contrat (déjà signé côté serveur) : on passe à la carte
        console.error('[contrats] recyclage', e);
      }
      seq = [];
      popAt = -1;
      el.classList.remove('recycling');
      if (!el.isConnected) {
        // on a quitté la page pendant la cérémonie : la carte est dans la collection, on le dit simplement
        toast(`Contrat signé : ${res.cardName} rejoint ta collection`, 'ok');
        return;
      }
      const viewer = await viewerP;
      const rr = rarity(res.rarity);
      pushLayer(closeViewer); // « retour » du téléphone = fermer la carte
      open = true;
      el.classList.add('viewing');
      viewerUi.hidden = false;
      vInfo.className = `v-info r-${res.rarity}`;
      vInfo.style.setProperty('--ra', rr.accentHex);
      vInfo.innerHTML = `<div class="ci-new">${res.isNew ? 'NOUVELLE CARTE' : 'CONTRAT SIGNÉ'}</div><div class="ci-name">${esc(res.cardName)}</div>
        <div class="ci-meta">${starsHtml(res.rarity)} <span class="ci-r" style="color:${rr.accentHex}">${rr.label}</span></div>
        <div class="ci-sub">n°${fmtN(res.mintNumber)}\u00a0imprimé · contre ${CONTRACT_COST[from]} doublons ${stars(from)}</div>`;
      haptics.pulse(rr.tier >= 4 ? [50, 30, 90] : 40);
      shell.setDimmed(false);
      shell.show('viewer');
      void viewer.show(res.cardId, res.rarity);
    } catch (err) {
      toast(errMsg(err), 'err');
    } finally {
      busy = false;
      if (!open) {
        // (échec réseau, ou toute autre interruption) : la page revient telle quelle
        el.classList.remove('recycling');
        document.body.classList.remove('card-open');
        if (shell.active() === 'recycle') (shell.show(null), shell.setDimmed(true));
        render();
      }
    }
  });

  function closeViewer() {
    if (!open) return;
    popLayer();
    open = false;
    document.body.classList.remove('card-open');
    el.classList.remove('viewing');
    viewerUi.hidden = true;
    shell.show(null);
    shell.setDimmed(true);
    render();
  }
  viewerUi.querySelector('.close')!.addEventListener('click', closeViewer);
  window.addEventListener('keydown', (e) => e.key === 'Escape' && open && closeViewer());

  let sig = '';
  backend.onChange((st) => {
    const now = collectionSig(st);
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
      // la scène du recyclage se prépare en fond (shaders), bien avant la première signature
      setTimeout(() => void getRecycle(), 600);
      shell.show(null);
      shell.setDimmed(true);
      // première étoile où un contrat est possible, sinon la plus basse
      if (!seq.length) tier = TIERS.find((r) => dups(r).reduce((a, c) => a + c.spare, 0) >= CONTRACT_COST[r]!) ?? tier;
      render();
    },
    leave() {
      if (open) closeViewer();
    },
  };
}
