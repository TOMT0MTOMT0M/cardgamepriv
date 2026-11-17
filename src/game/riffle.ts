import './riffle.css';
import type { Sfx } from '../core/audio';
import { haptics } from '../core/haptics';
import { DUR, EASING } from '../core/motion';
import { rarity, type RarityId } from '../core/rarity';
import { catalogEntry } from '../core/sets/themes';
import { paintedCard, realCardUrl } from './cardImages';
import { thumbUrl } from './ui';

/**
 * (V3, lot S4 — moment signature « effeuiller au pouce », passe 2 Gemini : MOMENT 4, variante B) Dans la visionneuse
 * de la collection (cartes d'un album, d'un classeur), la TRANCHE de la pile est posée contre le bord droit de la
 * carte. On y glisse le pouce : la carte du dessus se courbe sous la tension, puis claque et passe ; la suivante est
 * dessous. Petit claquement à chaque carte, un peu plus aigu de carte en carte ; une 5★ / 6★ demande nettement plus de
 * course pour passer (le geste freine dessus, on s'y arrête presque tout seul). On relâche : la carte du dessus est
 * celle qu'on ouvre (la vraie carte 3D arrive de côté, comme avec ‹ ›). Un toucher simple sur la tranche fait ce qu'il
 * faisait avant (referme la visionneuse).
 *
 * Coût : tout en DOM composité, sur 1 à 3 cartes seulement — la carte du dessus (3 bandes en charnière : la courbure),
 * celle de dessous (image fixe + ombre), la carte qui s'envole (animation du navigateur). Le reste de la pile n'est
 * qu'UNE boîte dont les ombres dessinent la tranche (repeinte seulement quand son épaisseur change). Aucune boucle
 * quand personne ne touche : une écriture par image au plus pendant le geste. Tranches strictement neutres (gris /
 * acier, aucun reflet coloré).
 */
export interface RiffleItem {
  id: string;
  r: RarityId;
}
/** place de la carte à l'écran (px CSS, coin haut gauche) */
export interface RiffleRect {
  left: number;
  top: number;
  width: number;
  height: number;
}
export interface RiffleOpts {
  /** couche d'interface de la visionneuse (`.viewer-ui`) */
  host: HTMLElement;
  /** la pile parcourue (ordre de la grille / du classeur) et la carte montrée */
  items(): RiffleItem[];
  at(): number;
  /** place de la carte 3D au repos ; null : visionneuse pas prête */
  rect(): RiffleRect | null;
  sfx: Sfx;
  /** toucher simple sur la tranche : le comportement d'avant (un toucher à côté de la carte) */
  tap(): void;
  /** relâché sur une autre carte : l'ouvrir (résolu quand la carte 3D commence son arrivée) */
  pick(i: number, dir: 1 | -1): Promise<unknown> | void;
  /** carte du dessus pendant le geste (compteur « 7 / 20 ») */
  onIndex?(i: number): void;
}
export interface Riffle {
  /** à chaque carte ouverte / fermeture : tranche montrée (pile ≥ 2 cartes) et posée contre la carte */
  sync(open: boolean): void;
}

/** course du pouce (px) pour une carte ordinaire : la hauteur de la tranche fait passer ≈ PER_PASS cartes, bornée */
const STEP_MIN = 22;
const STEP_MAX = 44;
const PER_PASS = 7;
/** (#22) poids d'une carte : sa course est multipliée d'autant — la 5★ / 6★ freine nettement le geste */
const weightOf = (r: RarityId) => {
  const k = rarity(r).rank;
  return k >= 5 ? 2.4 : k === 4 ? 1.8 : 1;
};
/** au-delà de ce déplacement (px), le toucher devient un effeuillage */
const START_PX = 6;
/** courbure maximale du bord libre (degrés, juste avant le claquement) ; la bande du milieu en prend 45 % */
const BEND = 40;
/** traits de tranche au plus (la pile restante, dessinée par des ombres) */
const DEPTH = 10;

/** NDC (−1..1, y vers le haut) de `restRect` → px CSS dans le canvas */
export function ndcToRect(to: { x0: number; y0: number; x1: number; y1: number }, host: DOMRect): RiffleRect {
  return {
    left: host.left + ((to.x0 + 1) / 2) * host.width,
    top: host.top + ((1 - to.y1) / 2) * host.height,
    width: ((to.x1 - to.x0) / 2) * host.width,
    height: ((to.y1 - to.y0) / 2) * host.height,
  };
}

/** tranche dessinée par des ombres pleines, gris clair / gris carbone en alternance (aucune teinte) */
function edgeShadows(d: number): string {
  const s: string[] = [];
  for (let i = 1; i <= d; i++) s.push(`${(i * 1.6).toFixed(1)}px ${(i * 1.1).toFixed(1)}px 0 ${i % 2 ? '#5b5e63' : '#17181a'}`);
  return s.join(',') || 'none';
}

export function createRiffle(o: RiffleOpts): Riffle {
  const rail = document.createElement('div');
  rail.className = 'rf-rail';
  rail.hidden = true;
  rail.setAttribute('aria-hidden', 'true'); // (au clavier et au lecteur d'écran : ‹ › et les flèches)
  rail.innerHTML = '<i class="rf-edge"></i>';
  const railEdge = rail.firstElementChild as HTMLElement;
  // sous les boutons de la fiche (« Classeur ×1 » peut chevaucher le bas de la carte) : ils restent prioritaires
  o.host.prepend(rail);

  // couche du geste : créée au premier effeuillage
  let layer: HTMLElement | null = null;
  let pile!: HTMLElement;
  let base!: HTMLElement;
  let under!: HTMLElement;
  let shade!: HTMLElement;
  let top!: HTMLElement;
  let s1!: HTMLElement;
  let s2!: HTMLElement;
  let hl!: HTMLElement;
  /**
   * cartes qui s'envolent (3, réutilisées) et retour en arrière : animations créées UNE fois puis rejouées — mesuré
   * (÷4) : `getAnimations()` + `animate()` à chaque carte forçaient un recalcul de style (≈ 7 ms par claquement)
   */
  const flies: Array<{ el: HTMLElement; anim: Animation }> = [];
  let flyN = 0;
  let back: Animation | null = null;
  function build() {
    layer = document.createElement('div');
    layer.className = 'rf-layer';
    layer.hidden = true;
    layer.innerHTML = `<div class="rf-pile"><i class="rf-base"></i><i class="rf-card rf-under"><i class="rf-shade"></i></i><i class="rf-card rf-fly"></i><i class="rf-card rf-fly"></i><i class="rf-card rf-fly"></i>
      <i class="rf-top"><i class="rf-s rf-s0"><i class="rf-s rf-s1"><i class="rf-s rf-s2"><i class="rf-hl"></i></i></i></i></i></div>`;
    const q = (s: string) => layer!.querySelector<HTMLElement>(s)!;
    pile = q('.rf-pile');
    base = q('.rf-base');
    under = q('.rf-under');
    shade = q('.rf-shade');
    top = q('.rf-top');
    s1 = q('.rf-s1');
    s2 = q('.rf-s2');
    hl = q('.rf-hl');
    const opts = { duration: DUR.rapide(), easing: EASING.sortie };
    for (const el of layer.querySelectorAll<HTMLElement>('.rf-fly')) {
      const anim = el.animate(
        [
          { transform: `rotateY(${-BEND * 0.5}deg) translateZ(4px)`, opacity: 1 },
          { transform: 'translateX(-62%) rotateY(-58deg) translateZ(30px)', opacity: 0 },
        ],
        opts,
      );
      anim.cancel();
      flies.push({ el, anim });
    }
    back = top.animate([{ transform: 'translateX(-42%) rotateY(-40deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: DUR.rapide(), easing: EASING.entree });
    back.cancel();
    // sous la tranche et les boutons : la couche passe avant eux dans la visionneuse
    o.host.prepend(layer);
  }

  // ── images : la vraie carte 2D déjà peinte (grille), sinon la miniature en attendant qu'elle le soit
  const asked = new Set<string>();
  let items: RiffleItem[] = [];
  const urlOf = (i: number): string => {
    const it = items[i];
    if (!it) return '';
    const painted = paintedCard(it.id, it.r);
    if (painted) return painted;
    const key = `${it.id}|${it.r}`;
    if (!asked.has(key)) {
      asked.add(key);
      void realCardUrl(it.id, it.r).then((u) => {
        // arrivée pendant le geste : posée si la carte est encore à l'écran
        if (!u || !layer || layer.hidden) return;
        if (i === shownK) setImg(top, u);
        else if (i === shownK + 1) setImg(under, u);
      });
    }
    const e = catalogEntry(it.id);
    return e ? thumbUrl(e) : '';
  };
  const cssUrl = (u: string) => (u ? `url("${u.replace(/"/g, '%22')}")` : 'none');
  const setImg = (el: HTMLElement, u: string) => el.style.setProperty('--img', cssUrl(u));
  /** quelques cartes devant et derrière : demandées tout de suite (peintes quand le navigateur est libre) */
  const prefetch = (k: number) => {
    for (let i = Math.max(0, k - 1); i <= Math.min(items.length - 1, k + 5); i++) urlOf(i);
  };

  // ── état du geste
  let press: { id: number; y0: number; y: number } | null = null;
  let riffling = false;
  /** course cumulée du pouce (px) et début de chaque carte sur cette course (poids compris) */
  let travel = 0;
  let cum: Float64Array = new Float64Array(1);
  let lastY = 0;
  let shownK = -1;
  let depthShown = -1;
  /** cartes passées depuis le début du geste (la hauteur du claquement monte avec, redescend en arrière) */
  let run = 0;
  let raf = 0;
  let fadeTok = 0;
  const stat = { frames: 0, ms: 0, max: 0, snaps: 0, snapMs: 0, snapMax: 0 };
  // (mesure : temps de calcul par image du geste, lu par le banc en démo)
  if (import.meta.env.DEV || location.search.includes('demo')) (window as unknown as { __riffle: typeof stat }).__riffle = stat;

  function begin() {
    items = o.items();
    const r = o.rect();
    if (items.length < 2 || !r) return false;
    if (!layer) build();
    fadeTok++;
    riffling = true;
    const step = Math.max(STEP_MIN, Math.min(STEP_MAX, r.height / PER_PASS));
    cum = new Float64Array(items.length);
    for (let i = 1; i < items.length; i++) cum[i] = cum[i - 1] + step * weightOf(items[i - 1].r);
    const at = Math.max(0, Math.min(items.length - 1, o.at()));
    travel = cum[at];
    run = 0;
    // la pile se pose exactement à la place de la carte 3D (même taille), le fond noir de la visionneuse la cache
    pile.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;--w:${r.width}px;--h:${r.height}px`;
    shownK = -1;
    depthShown = -1;
    layer!.hidden = false;
    show(at, 0);
    o.host.classList.add('riffling');
    // (une image plus tard : le fondu part de 0)
    requestAnimationFrame(() => layer?.classList.add('on'));
    return true;
  }

  /** carte du dessus (k) et courbure (0..1) */
  function show(k: number, f: number) {
    if (k !== shownK) {
      const prev = shownK;
      shownK = k;
      setImg(top, urlOf(k));
      setImg(under, urlOf(k + 1));
      under.style.visibility = k + 1 < items.length ? '' : 'hidden';
      const d = Math.min(DEPTH, items.length - 2 - k);
      if (d !== depthShown) {
        depthShown = d;
        base.style.boxShadow = edgeShadows(Math.max(0, d));
      }
      if (prev >= 0) {
        const t0 = performance.now();
        snap(prev, k);
        const ms = performance.now() - t0;
        stat.snaps++;
        stat.snapMs += ms;
        stat.snapMax = Math.max(stat.snapMax, ms);
      }
      prefetch(k);
      o.onIndex?.(k);
    }
    const a = BEND * f;
    s1.style.transform = `rotateY(${(-a * 0.45).toFixed(2)}deg)`;
    s2.style.transform = `rotateY(${(-a).toFixed(2)}deg)`;
    shade.style.opacity = (f * 0.55).toFixed(3);
    hl.style.opacity = (f * 0.3).toFixed(3);
  }

  /** passage d'une carte à l'autre : claquement, la carte lâchée s'envole (en avant) ou revient sur la pile (en arrière) */
  function snap(from: number, to: number) {
    const fwd = to > from;
    run += to - from;
    const rare = rarity(items[to].r).rank >= 4;
    const pitch = 1 + Math.max(0, Math.min(14, run)) * 0.04;
    o.sfx.tick(fwd ? pitch : pitch * 0.94, rare ? 0.3 : 0.22, 0.35);
    // une rare arrive sous le doigt : plus lourde à l'oreille et dans la main
    if (rare) o.sfx.pat(0.18, 0.35);
    haptics.pulse(rare ? 24 : 12);
    if (fwd) {
      // la carte lâchée part sur la gauche (une des 3 cartes volantes, réutilisées)
      const fl = flies[flyN++ % flies.length];
      setImg(fl.el, urlOf(to - 1));
      fl.anim.cancel();
      fl.anim.play();
    } else if (back) {
      // en arrière : la carte reprise revient de la gauche sur le dessus (déjà courbée, elle se pose en reculant)
      back.cancel();
      back.play();
    }
  }

  /** course → carte du dessus et courbure ; une écriture par image */
  function frame() {
    raf = 0;
    if (!riffling) return;
    const t0 = performance.now();
    const n = items.length;
    travel = Math.max(0, Math.min(cum[n - 1], travel));
    // recherche locale depuis la carte montrée (le pouce ne saute que de quelques cartes par image)
    let k = Math.max(0, Math.min(n - 1, shownK));
    while (k < n - 1 && cum[k + 1] <= travel) k++;
    while (k > 0 && cum[k] > travel) k--;
    const f = k < n - 1 ? (travel - cum[k]) / (cum[k + 1] - cum[k]) : 0;
    show(k, f);
    const ms = performance.now() - t0;
    stat.frames++;
    stat.ms += ms;
    stat.max = Math.max(stat.max, ms);
  }

  function end(commit: boolean) {
    riffling = false;
    if (raf) cancelAnimationFrame(raf), (raf = 0);
    if (!layer) return;
    // la courbure se relâche (la carte se pose à plat)
    const relax = { duration: DUR.rapide(), easing: EASING.standard };
    for (const el of [s1, s2]) {
      const from = el.style.transform;
      el.style.transform = 'rotateY(0deg)';
      el.animate([{ transform: from }, { transform: 'rotateY(0deg)' }], relax);
    }
    shade.style.opacity = hl.style.opacity = '0';
    const k = shownK;
    const at = o.at();
    const tok = ++fadeTok;
    const fade = () => {
      if (tok !== fadeTok || !layer) return;
      layer.classList.remove('on');
      o.host.classList.remove('riffling');
      setTimeout(() => tok === fadeTok && layer && (layer.hidden = true), DUR.rapide());
    };
    if (commit && k >= 0 && k !== at) {
      // la pile reste le temps que la vraie carte se prépare, puis s'efface pendant qu'elle arrive de côté
      Promise.resolve(o.pick(k, k > at ? 1 : -1)).then(fade, fade);
    } else {
      o.onIndex?.(at);
      fade();
    }
  }

  rail.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary || press) return;
    press = { id: e.pointerId, y0: e.clientY, y: e.clientY };
    try {
      rail.setPointerCapture(e.pointerId);
    } catch {
      /* déjà relâché */
    }
  });
  rail.addEventListener('pointermove', (e) => {
    if (!press || e.pointerId !== press.id) return;
    if (!riffling) {
      if (Math.abs(e.clientY - press.y0) < START_PX || !begin()) return;
      lastY = e.clientY;
      return;
    }
    // pouce vers le haut = en avant (comme faire défiler)
    travel += lastY - e.clientY;
    lastY = e.clientY;
    if (!raf) raf = requestAnimationFrame(frame);
  });
  const up = (e: PointerEvent) => {
    if (!press || e.pointerId !== press.id) return;
    press = null;
    if (riffling) end(e.type === 'pointerup');
    else if (e.type === 'pointerup') o.tap();
  };
  rail.addEventListener('pointerup', up);
  rail.addEventListener('pointercancel', up);
  rail.addEventListener('contextmenu', (e) => e.preventDefault());

  let isOpen = false;
  let retry = 0;
  const place = (tries = 0) => {
    cancelAnimationFrame(retry);
    const list = o.items();
    const r0 = isOpen && list.length > 1 ? o.rect() : null;
    const r = r0 && r0.width > 20 && Number.isFinite(r0.top) ? r0 : null;
    if (!r) {
      rail.hidden = true;
      // visionneuse pas encore posée (première ouverture, canvas pas encore à sa taille) : on réessaie aux images suivantes
      if (isOpen && list.length > 1 && tries < 90) retry = requestAnimationFrame(() => place(tries + 1));
      return;
    }
    // la tranche dépasse du bord droit de la carte ; la zone de prise (plus large) la suit
    const d = Math.max(1, Math.min(DEPTH, list.length - 1 - o.at()));
    rail.style.cssText = `left:${r.left + r.width - 1}px;top:${r.top}px;height:${r.height}px`;
    railEdge.style.width = `${3 + d * 1.6}px`;
    rail.hidden = false;
  };
  window.addEventListener('resize', () => isOpen && place());

  return {
    sync(open) {
      isOpen = open;
      if (!open && riffling) end(false);
      if (!open && layer && !layer.hidden) {
        fadeTok++;
        layer.hidden = true;
        layer.classList.remove('on');
        o.host.classList.remove('riffling');
      }
      place();
    },
  };
}
