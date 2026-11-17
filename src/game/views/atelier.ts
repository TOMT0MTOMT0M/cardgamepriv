/**
 * ATELIER DU PROFIL (14/11, refonte de la personnalisation) — l'écran « Personnaliser ».
 *  - Un APERÇU VIVANT toujours visible du profil tel que les autres le verront (fond, bannière, photo + cadre, titre,
 *    badges, accord, vitrine, ligne de classement) : chaque choix s'y applique tout de suite, avant d'enregistrer.
 *    Téléphone : collé en haut, avec une bascule Profil / Vitrine / En liste. Ordinateur : colonne fixe à gauche.
 *  - Chaque élément montré POUR CE QU'IL EST, dans des tuiles toutes de la même taille : un cadre autour de MA photo, un
 *    titre dans sa vraie typo, une vitrine avec MES cartes, un badge à sa taille, un fond en vrai.
 *  - Trois états lisibles sans pastille : ÉQUIPÉ (bandeau du nom inversé + coche), NOUVEAU (le mot), VERROUILLÉ
 *    (élément intact, cadenas, « 14/25 », filet de progression). Toucher un verrouillé l'ESSAIE dans l'aperçu ; il
 *    n'est jamais enregistré.
 *  - « Annuler / Enregistrer » dans la barre du haut : plus rien ne flotte sur la grille.
 * Dessin des éléments : ../cosmeticArt.ts · données : src/core/cosmetics.ts · styles : ../atelier.css.
 * Performance : la grille n'est reconstruite qu'au changement de famille ou de choix ; dans la grille, seule la tuile
 * survolée ou choisie est animée (les autres sont en pause).
 */
import '../../core/i18n/fr/game.views.atelier'; // (textes de ce module, version anglaise)
import '../atelier.css';
import { t as tr } from '../../core/i18n';
import type { MsgKey } from '../../core/i18n';
import type { GameBackend } from '../backend';
import type { Shell } from '../shell';
import type { RarityId } from '../../core/rarity';
import { catalogEntry } from '../../core/sets/themes';
import { ACHIEVEMENTS, achievementStats, emptyEcon } from '../../core/economy';
import {
  ACCENTS, BACKGROUNDS, BADGES, BANNERS, DRAWN_FRAMES, FRAMES, TITLES, TITLE_STYLES, VITRINES, PROFILE_MEDIA_DEMO_MAX, PROFILE_MEDIA_MAX,
  accentColor, accordOf, backgroundOf, badgeOf, bannerColor, bannerOf, fmtMo, frameOf, titleOf, vitrineOf,
  type Cosmetic, type CosmeticChoice, type PlayerStats, type ProfileMediaKind,
} from '../../core/cosmetics';
import { accordFx, badgeIcon, framed, icon, titleHtml, type IconName } from '../cosmeticArt';
import { mountBgShader } from '../bgShader';
import { busyButton, errMsg, esc, fmtN, popLayer, pushLayer, thumbUrl, toast } from '../ui';

export type AtelierFam = 'background' | 'banner' | 'frame' | 'title' | 'accent' | 'vitrine' | 'badge';
/** champ modifié par une tuile (une famille peut en porter deux : titre + écriture, vitrine + sa couleur) */
type Kind = 'background' | 'banner' | 'frame' | 'tstyle' | 'title' | 'accent' | 'vitrine' | 'vcolor' | 'badge';

export interface AtelierCtx {
  backend: GameBackend;
  shell: Shell;
  name: string;
  /** la photo telle qu'elle s'affiche (img, GIF, initiale) */
  avaHtml: () => string;
  /** adresse de la photo si c'est une image (les tuiles en montrent une version FIXE : 40 GIF animés coûteraient cher) */
  avaUrl: () => string;
  bannerUrl: () => string;
  /** une photo IMPORTÉE est en place (sinon : l'avatar Discord ou l'initiale) */
  hasAvatar: () => boolean;
  /** ce qui est enregistré */
  cosmetics: CosmeticChoice;
  stats: PlayerStats;
  /** les premières cartes de la vitrine (aperçu et tuiles « Vitrine ») */
  showcase: Array<{ cardId: string; rarity: RarityId }>;
  /** débloqués depuis la dernière visite : « famille:id » */
  fresh: Set<string>;
  first?: AtelierFam;
  /** importe ou retire la photo / la bannière (enregistré tout de suite), puis rappelle `refresh()` */
  media: (kind: ProfileMediaKind, remove: boolean, btn: HTMLButtonElement) => void;
  /** fermé : le choix gardé par le serveur si on a enregistré, sinon null */
  closed: (kept: CosmeticChoice | null) => void;
}
export interface Atelier {
  close: () => void;
  /** la photo ou la bannière a changé : l'aperçu et les tuiles se redessinent */
  refresh: () => void;
}

const FAMS: Array<{ id: AtelierFam; icon: IconName; kinds: Kind[] }> = [
  { id: 'background', icon: 'background', kinds: ['background'] },
  { id: 'banner', icon: 'banner', kinds: ['banner'] },
  { id: 'frame', icon: 'frame', kinds: ['frame'] },
  { id: 'title', icon: 'title', kinds: ['tstyle', 'title'] },
  { id: 'accent', icon: 'accent', kinds: ['accent'] },
  { id: 'vitrine', icon: 'vitrine', kinds: ['vitrine', 'vcolor'] },
  { id: 'badge', icon: 'badge', kinds: ['badge'] },
];
/** clé « nouveau » (localStorage `bebou.cosm.seen`, profile.ts) d'une tuile */
const FRESH_KEY: Record<Kind, string> = { background: 'background', banner: 'banner', frame: 'frame', tstyle: 'tstyle', title: 'title', accent: 'accent', vitrine: 'vitrine', vcolor: 'accent', badge: 'badge' };
const HEX = /^#[0-9a-f]{6}$/i;
const LIST: Record<Exclude<Kind, 'vcolor'>, Cosmetic[]> = { background: BACKGROUNDS, banner: BANNERS, frame: FRAMES, tstyle: TITLE_STYLES, title: TITLES, accent: ACCENTS, vitrine: VITRINES, badge: BADGES };

export function openAtelier(ctx: AtelierCtx): Atelier {
  const { shell, stats } = ctx;
  const achS = achievementStats(stats, emptyEcon());
  const saved: CosmeticChoice = { ...ctx.cosmetics, badges: [...(ctx.cosmetics.badges ?? [])] };
  const draft: CosmeticChoice = { ...saved, badges: [...(saved.badges ?? [])] };
  let fam: AtelierFam = ctx.first ?? 'background';
  let filter: 'all' | 'ok' | 'lock' = 'all';
  let view: 'profil' | 'vitrine' | 'liste' = 'profil';
  let dealt = 0;

  const el = document.createElement('section');
  el.className = 'at';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', tr('at.title'));
  el.innerHTML = `
    <header class="at-bar"><h2>${tr('at.title')}</h2><span class="at-sub">${tr('at.sub')}</span><span class="at-state" aria-live="polite"></span><span class="at-acts"></span></header>
    <div class="at-body">
      <div class="at-left"><div class="at-pv" aria-label="${tr('at.preview')}"><i class="at-pv-bg"></i><i class="at-pv-veil"></i><div class="at-pv-in"></div></div><div class="at-views" role="tablist"></div></div>
      <div class="at-side">
        <nav class="at-fams" aria-label="${tr('at.title')}"></nav>
        <div class="at-line"><p class="at-hint"></p><div class="at-filters" role="group"></div></div>
        <div class="at-grid"></div>
      </div>
    </div>`;
  const q = <T extends HTMLElement>(s: string) => el.querySelector<T>(s)!;
  const pv = q('.at-pv'), pvIn = q('.at-pv-in'), pvBg = q('.at-pv-bg'), grid = q('.at-grid'), famsEl = q('.at-fams'), hintEl = q('.at-hint'), filtersEl = q('.at-filters'), actsEl = q('.at-acts'), stateEl = q('.at-state'), viewsEl = q('.at-views');

  // ── lecture du brouillon (valeurs par défaut comprises)
  const cur = (k: Kind, c: CosmeticChoice = draft): string =>
    k === 'background' ? c.background ?? 'none' : k === 'banner' ? c.banner ?? BANNERS[0].id : k === 'frame' ? c.frame ?? 'none' : k === 'tstyle' ? c.titleStyle ?? TITLE_STYLES[0].id
      : k === 'title' ? c.title ?? '' : k === 'accent' ? c.accent ?? ACCENTS[0].id : k === 'vitrine' ? c.vitrine ?? VITRINES[0].id : k === 'vcolor' ? c.vitrineColor ?? '' : '';
  const put = (k: Kind, id: string) => {
    if (k === 'background') draft.background = id === 'none' ? undefined : id;
    else if (k === 'banner') draft.banner = id;
    else if (k === 'frame') draft.frame = id;
    else if (k === 'tstyle') draft.titleStyle = id === TITLE_STYLES[0].id ? undefined : id;
    else if (k === 'title') draft.title = id || undefined;
    else if (k === 'accent') draft.accent = id === ACCENTS[0].id ? undefined : id;
    else if (k === 'vitrine') draft.vitrine = id === VITRINES[0].id ? undefined : id;
    else if (k === 'vcolor') draft.vitrineColor = id || undefined;
  };
  const item = (k: Kind, id: string): Cosmetic | undefined => (k === 'vcolor' ? ACCENTS.find((a) => a.id === id) : LIST[k].find((c) => c.id === id));
  const isLocked = (k: Kind, id: string) => {
    const c = item(k, id);
    return !!c && !c.unlock(stats);
  };
  /** avancement d'un élément verrouillé : « 14/25 » et sa part (0..1) */
  const progress = (c: Cosmetic) => {
    const a = c.need ? ACHIEVEMENTS.find((x) => x.id === c.need) : undefined;
    if (!a) return { text: '', part: 0 };
    const n = Math.min(achS[a.stat] ?? 0, a.target);
    return { text: `${fmtN(n)}/${fmtN(a.target)}`, part: a.target ? n / a.target : 0 };
  };
  const KINDS: Kind[] = ['background', 'banner', 'frame', 'tstyle', 'title', 'accent', 'vitrine', 'vcolor'];
  const changes = () => {
    let n = 0, tries = 0;
    for (const k of KINDS)
      if (cur(k) !== cur(k, saved)) {
        n++;
        if (isLocked(k, cur(k))) tries++;
      }
    if ((draft.badges ?? []).join() !== (saved.badges ?? []).join()) n++;
    return { n, tries };
  };
  /** ce qui part au serveur : le brouillon, sans les essais (un verrouillé revient à ce qui était enregistré) */
  const toSave = (): CosmeticChoice => {
    const out: CosmeticChoice = { ...draft, badges: [...(draft.badges ?? [])] };
    if (isLocked('background', cur('background'))) out.background = saved.background;
    if (isLocked('banner', cur('banner'))) out.banner = saved.banner;
    if (isLocked('frame', cur('frame'))) out.frame = saved.frame;
    if (isLocked('tstyle', cur('tstyle'))) out.titleStyle = saved.titleStyle;
    if (isLocked('title', cur('title'))) out.title = saved.title;
    if (isLocked('vitrine', cur('vitrine'))) out.vitrine = saved.vitrine;
    return out;
  };

  // ── couleurs posées sur l'atelier : celle du profil (`--pa`), reprise par le cadre, le fond, le titre et la vitrine
  const accentHex = () => accentColor(draft.accent) ?? '#ffffff';
  const applyColors = () => {
    el.style.setProperty('--pa', accentHex());
    el.style.setProperty('--bgc', accentHex());
    el.style.setProperty('--vc', accentColor(draft.vitrineColor) ?? accentHex());
  };

  // ── cartes de la vitrine (les trois premières)
  const cards = (n: number) => {
    const list = ctx.showcase.slice(0, n);
    let html = '';
    for (let i = 0; i < n; i++) {
      const e = list[i] ? catalogEntry(list[i].cardId) : undefined;
      html += e ? `<i class="at-card" style="background-image:url('${esc(thumbUrl(e))}')"></i>` : '<i class="at-card at-card-0"></i>';
    }
    return html;
  };
  /** photo FIXE pour les tuiles : une image importée (peut-être un GIF) est peinte une fois dans un <canvas> */
  const stillAva = () => (ctx.avaUrl() ? `<canvas class="at-still" width="96" height="96" data-src="${esc(ctx.avaUrl())}"></canvas>` : ctx.avaHtml());
  let stillImg: { url: string; img: HTMLImageElement } | null = null;
  const hydrate = (root: HTMLElement) => {
    const list = root.querySelectorAll<HTMLCanvasElement>('canvas.at-still[data-src]');
    if (!list.length) return;
    const url = list[0].dataset.src!;
    const paint = (img: HTMLImageElement) =>
      list.forEach((c) => {
        const s = Math.min(img.naturalWidth, img.naturalHeight) || 1;
        c.getContext('2d')?.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, c.width, c.height);
        delete c.dataset.src;
      });
    if (stillImg?.url === url && stillImg.img.complete) return paint(stillImg.img);
    const img = new Image();
    stillImg = { url, img };
    img.onload = () => paint(img);
    img.src = url;
  };

  // ── aperçu vivant
  let bgShown = '';
  let bgStop: () => void = () => {};
  function renderPreview() {
    applyColors();
    const fr = frameOf(draft.frame), bn = bannerOf(draft.banner), bg = backgroundOf(draft.background), vit = vitrineOf(draft.vitrine);
    const title = titleOf(draft.title);
    const badges = (draft.badges ?? []).map((id) => badgeOf(id)).filter((b): b is Cosmetic => !!b);
    const acc = accordOf(draft);
    const bUrl = ctx.bannerUrl();
    const bc = bannerColor(draft.banner);
    const tHtml = title ? titleHtml(title.label, draft.titleStyle) : '';
    const menu = (kind: ProfileMediaKind, has: boolean) =>
      `<span class="at-menu" data-menu="${kind}" hidden><button type="button" data-media="${kind}">${icon('swapImg', 15)}<span>${has ? tr('at.replace') : tr('at.import')}</span></button>${has ? `<button type="button" data-media="${kind}" data-rm="1">${icon('trash', 15)}<span>${tr('at.remove')}</span></button>` : ''}</span>`;
    const max = ctx.backend.state.mode === 'demo' ? PROFILE_MEDIA_DEMO_MAX : PROFILE_MEDIA_MAX;
    pv.dataset.view = view;
    // le fond : le CSS (fixe) et, pour Braise / Orage / Nébuleuse / Synthwave, son shader — reposé seulement s'il change
    const bgKey = `${bg.id}|${accentHex()}`;
    if (bgKey !== bgShown) {
      bgShown = bgKey;
      bgStop();
      pvBg.style.background = bg.css || 'none';
      pvBg.dataset.bg = bg.id;
      bgStop = mountBgShader(pvBg, bg.id, accentHex());
    }
    pvIn.innerHTML = `
      <div class="at-pv-profil">
        <div class="at-bn${bUrl && bc ? ' bn-color' : ''}" style="background:${bn.css ?? ''};--bnc:${bc ?? 'transparent'}">${bUrl ? `<img src="${esc(bUrl)}" alt="" decoding="async">` : ''}
          <button type="button" class="at-pen" data-pen="banner" aria-label="${tr('at.editBanner')}" aria-expanded="false">${icon('pen')}</button>${menu('banner', !!bUrl)}</div>
        <div class="at-id">
          <div class="at-ava">${framed(fr, ctx.avaHtml(), { under: acc ? accordFx(acc.matter) : '' })}
            <button type="button" class="at-pen" data-pen="avatar" aria-label="${tr('at.editPhoto')}" aria-expanded="false">${icon('pen')}</button>${menu('avatar', ctx.hasAvatar())}</div>
          <div class="at-who"><b class="at-name">${esc(ctx.name)}</b>${tHtml}${badges.length ? `<span class="pf-badges">${badges.map((b) => `<span class="pf-badge">${badgeIcon(b.id)} <i>${esc(b.label)}</i></span>`).join('')}</span>` : ''}</div>
        </div>
        <p class="at-accord${acc ? ' on' : ''}">${icon('link')}<span><b>${acc ? tr(acc.full ? 'at.accordFull' : 'at.accord', { name: tr(`at.m.${acc.matter}` as MsgKey) }) : tr('at.noAccord')}</b><small>${acc ? tr(`at.d.${acc.matter}` as MsgKey) + (acc.full ? ` ${tr('at.fullD')}` : '') : tr('at.noAccordD')}</small></span></p>
        <small class="at-rules">${tr('at.mediaRules', { max: max >= 1024 * 1024 ? fmtMo(max) : `${Math.round(max / 1024)} Ko` })}</small>
      </div>
      <div class="at-pv-vit"><div class="at-k">${tr('at.kVitrine')}</div><div class="at-case deal-${dealt % 2}${acc?.full ? ' full' : ''}" style="background:${vit.css ?? ''}">${cards(3)}</div></div>
      <div class="at-pv-list"><div class="at-k">${tr('at.kList')}</div><div class="at-row">${framed(fr, ctx.avaHtml(), { light: true })}<span class="at-row-id"><b>${esc(ctx.name)}</b>${title ? titleHtml(title.label, draft.titleStyle, 'ts-light') : ''}</span><small>${tr('at.light')}</small></div></div>`;
  }

  // ── barre du haut : état + Annuler / Enregistrer (seulement s'il y a un changement)
  function renderBar() {
    const { n, tries } = changes();
    stateEl.textContent = n ? tr('at.changes', { n }) + (tries ? ` · ${tr('at.tries', { n: tries })}` : '') : '';
    actsEl.innerHTML = n
      ? `<button type="button" class="btn-ghost at-cancel">${tr('at.cancel')}</button><button type="button" class="btn-primary at-save"${n > tries ? '' : ' disabled'}>${tr('at.save')}</button>`
      : `<button type="button" class="btn-ghost at-close">${icon('close')}<span>${tr('at.close')}</span></button>`;
  }

  // ── familles
  const famItems = (f: AtelierFam): Cosmetic[] => (f === 'title' ? [...TITLE_STYLES, ...TITLES] : f === 'vitrine' ? VITRINES : LIST[f as Exclude<Kind, 'vcolor' | 'tstyle'>]);
  function renderFams() {
    famsEl.innerHTML = FAMS.map((f) => {
      const all = famItems(f.id), ok = all.filter((c) => c.unlock(stats)).length;
      const isNew = f.kinds.some((k) => [...ctx.fresh].some((x) => x.startsWith(`${FRESH_KEY[k]}:`)));
      return `<button type="button" data-fam="${f.id}" aria-pressed="${f.id === fam}"${f.id === fam ? ' class="on"' : ''}>${icon(f.icon)}<span>${tr(`at.fam.${f.id}` as MsgKey)}</span><em>${ok}/${all.length}</em>${isNew ? `<i class="at-dot" title="${tr('at.new')}"></i>` : ''}</button>`;
    }).join('');
    filtersEl.innerHTML = (['all', 'ok', 'lock'] as const).map((f) => `<button type="button" data-filter="${f}" aria-pressed="${f === filter}"${f === filter ? ' class="on"' : ''}>${tr(`at.f.${f}` as MsgKey)}</button>`).join('');
    viewsEl.innerHTML = (['profil', 'vitrine', 'liste'] as const).map((v) => `<button type="button" role="tab" data-view="${v}" aria-selected="${v === view}"${v === view ? ' class="on"' : ''}>${tr(`at.v.${v}` as MsgKey)}</button>`).join('');
  }

  // ── tuiles
  /** l'élément, dessiné en vrai */
  function art(k: Kind, c: Cosmetic): string {
    if (k === 'frame') return framed(c, stillAva());
    if (k === 'background') return `<i class="at-sw" style="background:${c.css || '#050505'}"></i>`;
    if (k === 'banner') return `<i class="at-sw at-sw-bn${c.id === 'none' ? ' at-sw-0' : ''}" style="background:${c.css ?? ''}"></i>`;
    if (k === 'tstyle') return titleHtml(titleOf(draft.title)?.label ?? tr('at.sampleTitle'), c.id);
    if (k === 'title') return titleHtml(c.label, draft.titleStyle);
    if (k === 'accent' || k === 'vcolor') return `<i class="at-ac" style="--c:${c.css}"></i>`;
    if (k === 'vitrine') return `<i class="at-vit" style="background:${c.css ?? ''}">${cards(3)}</i>`;
    return `<span class="pf-badge">${badgeIcon(c.id)} <i>${esc(c.label)}</i></span>`;
  }
  /** cette tuile compléterait-elle un accord avec la tenue en cours ? */
  const links = (k: Kind, c: Cosmetic) => {
    const tags = c.tags ?? [];
    if (!tags.length) return false;
    if (k === 'frame') return (backgroundOf(draft.background).tags ?? []).some((m) => tags.includes(m));
    if (k === 'background') return (frameOf(draft.frame).tags ?? []).some((m) => tags.includes(m));
    const acc = accordOf(draft);
    return !!acc && (k === 'tstyle' || k === 'vitrine') && tags.includes(acc.matter);
  };
  function tile(k: Kind, c: Cosmetic, i: number): string {
    const locked = !c.unlock(stats);
    const sel = k === 'badge' ? (draft.badges ?? []).includes(c.id) : cur(k) === c.id;
    const eq = k === 'badge' ? (saved.badges ?? []).includes(c.id) : cur(k, saved) === c.id;
    const fresh = ctx.fresh.has(`${FRESH_KEY[k]}:${c.id}`);
    const pr = locked ? progress(c) : null;
    const tag = eq ? '' : sel ? tr(locked ? 'at.try' : 'at.picked') : fresh ? tr('at.new') : '';
    return `<button type="button" class="at-tile at-k-${k}${sel ? ' on' : ''}${eq ? ' eq' : ''}${locked ? ' locked' : ''}" data-kind="${k}" data-id="${esc(c.id)}" aria-pressed="${sel}" title="${esc(locked ? `${c.label} · ${c.how}` : c.label)}">
      <span class="at-no">${String(i + 1).padStart(2, '0')}</span>${links(k, c) ? `<span class="at-link" title="${tr('at.linkTip')}">${icon('link', 14)}</span>` : ''}
      <span class="at-art">${art(k, c)}</span>
      <span class="at-lab"><span class="at-nm">${esc(c.label)}</span>${pr ? `<span class="at-lk">${icon('lock', 13)}<span class="at-pg">${pr.text}</span></span>` : ''}${tag ? `<em${sel ? ' class="sel"' : ''}>${tag}</em>` : ''}${eq ? icon('check', 15) : ''}</span>
      ${pr ? `<i class="at-bar-p" style="width:${Math.round(pr.part * 100)}%"></i>` : ''}</button>`;
  }
  /** couleur libre (bannière, anneau, couleur du profil, couleur de la vitrine) : une tuile comme les autres */
  function freeTile(k: 'banner' | 'frame' | 'accent' | 'vcolor'): string {
    const v = cur(k);
    const on = HEX.test(v);
    return `<label class="at-tile at-free${on ? ' on' : ''}${on && HEX.test(cur(k, saved)) && cur(k, saved) === v ? ' eq' : ''}" data-kind="${k}">
      <span class="at-art"><i class="at-ac${on ? '' : ' at-ac-any'}" style="--c:${on ? v : '#ffffff'}"></i><input type="color" value="${on ? v : accentHex()}" aria-label="${tr('at.free')}"></span>
      <span class="at-lab"><span class="at-nm">${on ? v.toUpperCase() : tr('at.free')}</span></span></label>`;
  }
  const shown = (list: Cosmetic[]) => {
    const l = list.filter((c) => filter === 'all' || (filter === 'ok') === c.unlock(stats));
    // débloqués d'abord (ordre du catalogue), puis les verrouillés, le plus avancé en premier
    return [...l.filter((c) => c.unlock(stats)), ...l.filter((c) => !c.unlock(stats)).sort((a, b) => progress(b).part - progress(a).part)];
  };
  const sec = (label: string, html: string) => (html ? `<h3 class="at-sec">${label}</h3>${html}` : '');
  const tiles = (k: Kind, list: Cosmetic[]) => shown(list).map((c, i) => tile(k, c, i)).join('');
  let gridTpl: HTMLTemplateElement | null = null;
  let gridKey = '';
  /** pose sur `live` les différences entre les gabarits `a` (précédent) et `b` (nouveau) ; false = structure changée, on reconstruit */
  function patchGrid(live: HTMLElement, a: DocumentFragment, b: DocumentFragment): boolean {
    const ca = a.children, cb = b.children;
    if (ca.length !== cb.length || live.children.length !== cb.length) return false;
    for (let i = 0; i < cb.length; i++) if (ca[i].tagName !== cb[i].tagName || ca[i].className.split(' ')[0] !== cb[i].className.split(' ')[0]) return false;
    for (let i = 0; i < cb.length; i++) {
      if (ca[i].outerHTML === cb[i].outerHTML) continue;
      const lv = live.children[i] as HTMLElement, n = cb[i] as HTMLElement, o = ca[i] as HTMLElement;
      if (lv.classList.contains('at-tile') && o.children.length === n.children.length) {
        // la tuile reste en place : classes (.on, .eq), aria, puis seulement les sous-éléments qui diffèrent (étiquette, coche)
        lv.className = n.className;
        for (const at of ['aria-pressed', 'title']) n.hasAttribute(at) ? lv.setAttribute(at, n.getAttribute(at)!) : lv.removeAttribute(at);
        for (let j = 0; j < n.children.length; j++)
          if (o.children[j].outerHTML !== n.children[j].outerHTML) {
            const c = n.children[j].cloneNode(true) as HTMLElement;
            lv.children[j].replaceWith(c);
            hydrate(c);
          }
      } else {
        const c = n.cloneNode(true) as HTMLElement;
        lv.replaceWith(c);
        hydrate(c);
      }
    }
    return true;
  }
  function renderGrid() {
    const top = grid.scrollTop;
    const focus = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('.at-tile');
    const fk = focus?.dataset.kind, fi = focus?.dataset.id;
    let html = '';
    if (fam === 'background') html = tiles('background', BACKGROUNDS);
    else if (fam === 'banner') html = tiles('banner', BANNERS) + (filter === 'lock' ? '' : freeTile('banner'));
    else if (fam === 'frame') {
      const drawn = [FRAMES[0], ...DRAWN_FRAMES, ...FRAMES.filter((f) => f.anim || f.id.startsWith('s-'))];
      html = sec(tr('at.sec.drawn'), tiles('frame', drawn)) + sec(tr('at.sec.rings'), tiles('frame', FRAMES.filter((f) => f.id.startsWith('c-'))) + (filter === 'lock' ? '' : freeTile('frame')));
    } else if (fam === 'title') {
      const none = filter === 'lock' ? '' : `<button type="button" class="at-tile at-k-title${cur('title') ? '' : ' on'}${cur('title', saved) ? '' : ' eq'}" data-kind="title" data-id="" aria-pressed="${!cur('title')}"><span class="at-no">00</span><span class="at-art"><i class="at-dash"></i></span><span class="at-lab"><span class="at-nm">${tr('at.none')}</span>${cur('title', saved) ? '' : icon('check', 15)}</span></button>`;
      html = sec(tr('at.sec.style'), tiles('tstyle', TITLE_STYLES)) + sec(tr('at.sec.titles'), none + tiles('title', TITLES));
    } else if (fam === 'accent') html = tiles('accent', ACCENTS) + (filter === 'lock' ? '' : freeTile('accent'));
    else if (fam === 'vitrine') {
      const like = filter === 'lock' ? '' : `<button type="button" class="at-tile at-k-vcolor${cur('vcolor') ? '' : ' on'}${cur('vcolor', saved) ? '' : ' eq'}" data-kind="vcolor" data-id="" aria-pressed="${!cur('vcolor')}"><span class="at-no">00</span><span class="at-art"><i class="at-ac" style="--c:var(--pa)"></i></span><span class="at-lab"><span class="at-nm">${tr('at.likeProfile')}</span>${cur('vcolor', saved) ? '' : icon('check', 15)}</span></button>`;
      html = sec(tr('at.sec.decor'), tiles('vitrine', VITRINES)) + sec(tr('at.sec.vcolor'), like + tiles('vcolor', ACCENTS) + (filter === 'lock' ? '' : freeTile('vcolor')));
    } else {
      const order = draft.badges ?? [];
      html = tiles('badge', BADGES) + (order.length > 1 ? `<h3 class="at-sec">${tr('at.sec.order')}</h3><div class="at-order">${order.map((id, i) => `<span class="at-ord"><span class="pf-badge">${badgeIcon(id)} <i>${esc(badgeOf(id)?.label ?? id)}</i></span><button type="button" data-mv="-1" data-i="${i}"${i === 0 ? ' disabled' : ''} aria-label="${tr('at.before')}">${icon('left')}</button><button type="button" data-mv="1" data-i="${i}"${i === order.length - 1 ? ' disabled' : ''} aria-label="${tr('at.after')}">${icon('right')}</button></span>`).join('')}</div>` : '');
    }
    grid.dataset.fam = fam;
    html ||= `<p class="at-empty">${tr('at.empty')}</p>`;
    // même famille, même filtre : on ne touche qu'aux nœuds qui changent (les deux tuiles concernées), les autres gardent
    // leurs animations d'ambiance ; on compare le nouveau gabarit à l'ancien, pas au DOM vivant (canvas déjà peints)
    const key = `${fam}|${filter}`;
    const next = document.createElement('template');
    next.innerHTML = html;
    if (gridTpl && gridKey === key && patchGrid(grid, gridTpl.content, next.content)) {
      gridTpl = next;
    } else {
      grid.innerHTML = html;
      hydrate(grid);
      gridTpl = next;
      gridKey = key;
    }
    grid.scrollTop = top;
    if (fk) grid.querySelector<HTMLElement>(`.at-tile[data-kind="${fk}"][data-id="${CSS.escape(fi ?? '')}"]`)?.focus({ preventScroll: true });
  }
  function renderHint() {
    const f = FAMS.find((x) => x.id === fam)!;
    const trying = f.kinds.map((k) => ({ k, c: item(k, cur(k)) })).find((x) => x.c && !x.c.unlock(stats));
    hintEl.classList.toggle('try', !!trying);
    hintEl.textContent = trying?.c ? tr('at.tryHint', { name: trying.c.label, how: trying.c.how, pg: progress(trying.c).text }) : tr(`at.hint.${fam}` as MsgKey);
  }
  const sync = (o: { grid?: boolean } = {}) => {
    renderPreview();
    renderBar();
    renderHint();
    if (o.grid !== false) renderGrid();
  };

  // ── gestes
  famsEl.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-fam]');
    if (!b || b.dataset.fam === fam) return;
    fam = b.dataset.fam as AtelierFam;
    shell.sfx.tick(1.2, 0.04);
    grid.scrollTop = 0;
    renderFams();
    renderHint();
    renderGrid();
    // téléphone : la famille « Vitrine » montre la vitrine dans l'aperçu
    if (fam === 'vitrine' && view !== 'vitrine') ((view = 'vitrine'), renderFams(), renderPreview());
    else if (fam !== 'vitrine' && view === 'vitrine') ((view = 'profil'), renderFams(), renderPreview());
  });
  filtersEl.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-filter]');
    if (!b) return;
    filter = b.dataset.filter as typeof filter;
    renderFams();
    renderGrid();
  });
  viewsEl.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-view]');
    if (!b) return;
    view = b.dataset.view as typeof view;
    renderFams();
    renderPreview();
  });
  grid.addEventListener('click', (e) => {
    const mv = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-mv]');
    if (mv) {
      const i = Number(mv.dataset.i), d = Number(mv.dataset.mv), l = draft.badges!;
      [l[i], l[i + d]] = [l[i + d], l[i]];
      return sync();
    }
    const b = (e.target as HTMLElement).closest<HTMLElement>('button.at-tile');
    if (!b) return;
    const k = b.dataset.kind as Kind, id = b.dataset.id ?? '';
    if (k === 'badge') {
      if (b.classList.contains('locked')) return toast(tr('at.lockedBadge', { how: item(k, id)?.how ?? '' }), 'info');
      const l = (draft.badges ??= []);
      if (l.includes(id)) l.splice(l.indexOf(id), 1);
      else if (l.length >= 5) return toast(tr('at.max5'), 'info');
      else l.push(id);
    } else {
      // retoucher l'élément choisi d'une famille « à défaut » le retire (titre) ; sinon on choisit
      put(k, k === 'title' && cur(k) === id ? '' : id);
      if (k === 'vitrine') dealt++;
    }
    shell.sfx.tick(1.2, 0.04);
    sync();
  });
  // couleur libre : aperçu en direct pendant qu'on glisse (sans reconstruire la grille, sinon le sélecteur se ferme)
  grid.addEventListener('input', (e) => {
    const inp = e.target as HTMLInputElement;
    const lab = inp.closest<HTMLElement>('.at-free');
    if (!lab || inp.type !== 'color') return;
    put(lab.dataset.kind as Kind, inp.value.toLowerCase());
    lab.querySelector<HTMLElement>('.at-ac')?.style.setProperty('--c', inp.value);
    sync({ grid: false });
  });
  grid.addEventListener('change', (e) => {
    const inp = e.target as HTMLInputElement;
    if (inp.type !== 'color' || !inp.closest('.at-free')) return;
    shell.sfx.tick(1.2, 0.04);
    sync();
  });
  // crayons de la photo et de la bannière : un petit menu, posé sur ce qu'il modifie
  pv.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const pen = t.closest<HTMLElement>('[data-pen]');
    if (pen) {
      const m = pv.querySelector<HTMLElement>(`[data-menu="${pen.dataset.pen}"]`)!;
      const open = m.hidden;
      pv.querySelectorAll<HTMLElement>('.at-menu').forEach((x) => (x.hidden = true));
      pv.querySelectorAll<HTMLElement>('[data-pen]').forEach((x) => x.setAttribute('aria-expanded', 'false'));
      m.hidden = !open;
      pen.setAttribute('aria-expanded', String(open));
      return;
    }
    const act = t.closest<HTMLButtonElement>('[data-media]');
    if (act) ctx.media(act.dataset.media as ProfileMediaKind, !!act.dataset.rm, act);
  });
  let done = false;
  const close = (kept: CosmeticChoice | null = null) => {
    if (done) return;
    done = true;
    popLayer(layerClose);
    bgStop();
    document.documentElement.classList.remove('at-open');
    el.remove();
    ctx.closed(kept);
  };
  const layerClose = () => close();
  actsEl.addEventListener('click', async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!b) return;
    if (b.classList.contains('at-close')) return close();
    if (b.classList.contains('at-cancel')) {
      // retour à ce qui est enregistré, sans fermer : on peut continuer à choisir
      Object.assign(draft, { background: saved.background, banner: saved.banner, frame: saved.frame, titleStyle: saved.titleStyle, title: saved.title, accent: saved.accent, vitrine: saved.vitrine, vitrineColor: saved.vitrineColor, badges: [...(saved.badges ?? [])] });
      return sync();
    }
    if (b.classList.contains('at-save')) {
      try {
        const kept = await busyButton(b, ctx.backend.setCosmetics(toSave()));
        shell.sfx.chime(2, 0.06);
        toast(tr('at.savedToast'), 'ok');
        close(kept);
      } catch (err) {
        toast(errMsg(err), 'err');
      }
    }
  });

  renderFams();
  sync();
  document.body.append(el);
  document.documentElement.classList.add('at-open');
  pushLayer(layerClose);
  famsEl.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus({ preventScroll: true });

  return {
    close: () => close(),
    refresh: () => {
      stillImg = null;
      sync();
    },
  };
}
