import { errText } from '../../core/errors';
import '../../core/i18n/fr/game.views.profile'; // (textes de ce module, version anglaise)
import { locale, t as tr } from '../../core/i18n';
import type { ActivityItem, GameBackend, PlayerCard, Profile } from '../backend';
import { createLeaderboard } from './leaderboard';
import { friendBtn } from './friends';
import type { Shell } from '../shell';
import type { ViewerScene } from '../scenes/viewer';
import { catalogEntry, PUBLIC_CARD_COUNT, THEMES } from '../../core/sets/themes';
import { rarity, type RarityId } from '../../core/rarity';
import { ACCENTS, BACKGROUNDS, BADGES, BANNERS, FRAMES, TITLE_STYLES, VITRINES, accentColor, accordOf, backgroundOf, bannerColor, vitrineOf, PROFILE_MEDIA_DEMO_MAX, PROFILE_MEDIA_MAX, PROFILE_MEDIA_TYPES, TITLES, badgeOf, bannerOf, frameOf, profileMediaProblem, statsFrom, titleOf, unlockedIds, type Cosmetic, type PlayerStats, type ProfileMediaKind } from '../../core/cosmetics';
import { openAtelier, type Atelier, type AtelierFam } from './atelier';
import { accordFx, badgeIcon, framed, icon, titleHtml } from '../cosmeticArt';
import { mountBgShader } from '../bgShader';
import type { MsgKey } from '../../core/i18n';
import { guarded } from './safety';
import { createShowcaseEditor } from './showcaseEditor';
import { notifPanel } from '../notif';
import { offlinePanel } from '../offline';
import { ACHIEVEMENTS, achievementDone } from '../../core/economy';
import '../../core/i18n/fr/game.views.atelier'; // (« Accord … » sous les badges)
import { STREAK_CYCLE } from '../../core/streak';
import { busyButton, cardTile, errMsg, esc, fmtN, fmtPct, h, plural, popLayer, pushLayer, starsHtml, thumbUrl, toast, imageReportButton } from '../ui';
import { feedText } from '../msgView';

/**
 * PROFIL (refonte complète, retours du 3 nov.) — le mien (avatar de l'en-tête) ou celui d'un ami.
 *  - Bannière personnalisable (basse : retours live 02), avatar rond + cadre, pseudo + titre + badges + devise en
 *    en-tête COMPACT posé dessus ; photo et bannière en GIF importables (« Personnaliser »).
 *  - La vitrine (12 cartes) tient EN ENTIER au premier écran (téléphone : 4 × 3, ordinateur : 2 rangées de 6) ;
 *    les chiffres clés viennent après.
 *  - Onglets : TABLEAU (la VITRINE en premier — 12 cartes, 2 rangées de 6 —, puis les stats : succès X/Y, complétion,
 *    6★, série de connexion, complétion par thème, raretés) · COLLECTION (classeur épinglé) · ACTIVITÉ (gros drops,
 *    échanges, contrats) · CLASSEMENT (composant partagé avec la page #/classement).
 *  - Cosmétiques (bannières, cadres, titres, badges) : tout se débloque en jouant (src/core/cosmetics.ts), rien ne s'achète.
 */
export interface ProfileView {
  el: HTMLElement;
  enter(sub?: string): void;
  leave(): void;
}

/** vitrine : 2 rangées de 6 (retours live n°1) */
const SLOTS = 12;
const RANK: Record<RarityId, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5, secret: 6 };
const STARS: RarityId[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
const best = (a: PlayerCard, b: PlayerCard) => RANK[b.rarity] - RANK[a.rarity] || a.bestMintNumber - b.bestMintNumber || (catalogEntry(a.cardId)?.num ?? 0) - (catalogEntry(b.cardId)?.num ?? 0);
/** le mot seul, accordé (« doublon » / « doublons ») : le nombre est affiché à part, formaté par fmtN (audit UX3-05 :
 *  retirer le nombre de `plural()` par regex cassait dès 1 000, à cause de l'espace insécable des milliers) */
const fmtDate = (t: number) => new Date(t).toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' });
/** « nov. 2026 » (en-tête compact) */
const fmtMonth = (t: number) => new Date(t).toLocaleDateString(locale(), { month: 'short', year: 'numeric' });
/**
 * Photo / bannière importées (GIF, retours live 02) : un <img> — le GIF se lit tout seul, en boucle, sans son. En
 * « mouvements réduits » : une image FIXE, la 1re image peinte dans un <canvas> (affichable même si le fichier vient
 * d'un autre domaine : on ne relit jamais ses pixels).
 */
const lessMotion = matchMedia('not all');
const mediaHtml = (url: string) =>
  lessMotion.matches ? `<canvas class="pf-media pf-still" data-src="${esc(url)}" aria-hidden="true"></canvas>` : `<img class="pf-media" src="${esc(url)}" alt="" decoding="async">`;
function hydrateStills(root: HTMLElement) {
  root.querySelectorAll<HTMLCanvasElement>('canvas.pf-still[data-src]').forEach((c) => {
    const im = new Image();
    im.onload = () => {
      c.width = im.naturalWidth;
      c.height = im.naturalHeight;
      c.getContext('2d')?.drawImage(im, 0, 0);
    };
    im.src = c.dataset.src!;
    delete c.dataset.src;
  });
}
const ago = (t: number) => {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return tr('time.justNow');
  if (s < 3600) return tr('time.agoMin', { n: Math.floor(s / 60) });
  if (s < 86400) return tr('time.agoH', { n: Math.floor(s / 3600) });
  const d = Math.round(s / 86400);
  return d === 1 ? 'hier' : tr('time.agoD', { n: d });
};
type Tab = 'tableau' | 'collection' | 'activite' | 'classement';

export function createProfileView(backend: GameBackend, shell: Shell, getViewer: () => Promise<ViewerScene>, logout: () => void): ProfileView {
  const el = h('section', 'view profile');
  el.innerHTML = `
    <div class="pf-wrap">
      <i class="pf-bg" hidden aria-hidden="true"></i>
      <div class="pf-banner"><button class="btn-ghost pf-banner-btn" hidden>${tr('pf.customizeBtn')}</button></div>
      <div class="pf-head"></div>
      <div class="pf-tabs" role="tablist">
        <button role="tab" data-tab="tableau" class="on">${tr('pf.board')}</button><button role="tab" data-tab="collection">Collection</button><button role="tab" data-tab="activite">${tr('pf.activity')}</button><button role="tab" data-tab="classement">${tr('pf.ranking')}</button> <!-- i18n-ok -->
      </div>
      <div class="pf-pane p-tableau">
        <div class="pf-sec pf-case-sec">
          <div class="pf-tray">
            <div class="pf-sec-t"><h2>${tr('pf.vitrine')}</h2><span class="pf-count" hidden></span><span class="pf-auto"></span><span class="pf-tools"></span></div>
            <div class="pf-case all"></div>
            <div class="pf-edit-bar" hidden><span class="pf-edit-hint"></span><span class="pf-edit-more"><button type="button" class="pf-link pf-fill">${tr('pf.autoFill')}</button><button type="button" class="pf-link pf-clear">${tr('pf.removeAll')}</button></span></div>
          </div>
          <div class="pf-picker" hidden>
            <div class="pf-pick-t"><span class="pf-pick-h">${tr('pf.myColl')}</span><input class="search pf-search" type="search" placeholder="${tr('pf.search')}" autocomplete="off" spellcheck="false" aria-label="${tr('pf.searchMine')}"></div>
            <div class="pf-pick-hint"></div>
            <div class="starf pf-pick-stars" aria-label="${tr('pf.filterStars')}"></div>
            <div class="grid mini pf-pick-grid"></div>
            <div class="muted pf-pick-more" hidden></div>
          </div>
        </div>
        <div class="pf-keys"></div>
        <div class="pf-panels pf-stats">
          <section class="pf-panel pf-p-act" aria-label="${tr('pf.activity')}"></section>
          <section class="pf-panel pf-p-coll" aria-label="Collection"></section> <!-- i18n-ok -->
          <section class="pf-panel pf-p-rar" aria-label="${tr('pf.rarities')}"></section>
          <section class="pf-panel pf-p-th" aria-label="${tr('pf.universes')}"></section>
        </div>
      </div>
      <div class="pf-pane p-collection" hidden>
        <div class="pf-binders"></div>
        <div class="pf-nobinder muted" hidden></div>
        <div class="pf-sec pf-all-sec"><div class="pf-sec-t"><h2>${tr('pf.wholeColl')}</h2><span class="pf-count pf-all-n"></span></div>
          <div class="pf-all-tools"><input class="search pf-all-q" type="search" placeholder="${tr('pf.search')}" autocomplete="off" spellcheck="false" aria-label="${tr('pf.searchThis')}"><div class="pf-all-r" role="group" aria-label="${tr('pf.stars')}"></div></div>
          <div class="grid pf-all"></div><button class="btn-ghost pf-all-more" hidden>${tr('pf.more')}</button></div>
      </div>
      <div class="pf-pane p-activite" hidden><div class="pf-activity"></div></div>
      <div class="pf-pane p-classement" hidden></div>
      <div class="pf-sec pf-friends-sec"><div class="pf-sec-t"><h2>${tr('pf.others')}</h2><span class="pf-tools"><a class="btn-ghost pf-amis-go" href="#/amis">${tr('pf.myFriends')}</a></span></div><div class="pf-friends"></div></div>
      <div class="pf-sec pf-account" hidden><div class="pf-sec-t"><h2>${tr('pf.account')}</h2></div><div class="pf-account-b"></div></div>
    </div>
    <div class="viewer-ui" hidden><button class="close" aria-label="${tr('pf.close')}">✕</button><div class="v-info"></div><div class="v-actions"></div><div class="v-hint">${tr('pf.spin')}</div></div>`;
  const q = <T extends HTMLElement>(s: string) => el.querySelector<T>(s)!;
  const banner = q('.pf-banner');
  const head = q('.pf-head');
  const bgEl = q('.pf-bg');
  const keysEl = q('.pf-keys');
  const pActEl = q('.pf-p-act');
  const pCollEl = q('.pf-p-coll');
  const pThEl = q('.pf-p-th');
  const account = q('.pf-account');
  const caseSec = q('.pf-case-sec');
  const caseEl = q('.pf-case');
  const autoEl = q('.pf-case-sec .pf-auto');
  const countEl = q('.pf-case-sec .pf-count');
  const tools = q('.pf-case-sec .pf-tools');
  const editBar = q('.pf-edit-bar');
  const picker = q('.pf-picker');
  const rarEl = q('.pf-p-rar');
  const friendsEl = q('.pf-friends');
  const activityEl = q('.pf-activity');
  const leaderboard = createLeaderboard(backend, shell);
  q('.p-classement').append(leaderboard.el);
  const viewerUi = q('.viewer-ui');
  const vInfo = q('.v-info');

  let who = '';
  let prof: Profile | null = null;
  let cards: PlayerCard[] = [];
  let token = 0;
  let open = false;
  let tab: Tab = 'tableau';
  let leaderLoaded = false;
  let activity: ActivityItem[] | null = null;
  let cosmOpen = false;
  /** (14/11) l'atelier « Personnaliser » (./atelier.ts), ouvert par-dessus la page */
  let atelier: Atelier | null = null;
  /** shader du fond du profil (../bgShader.ts) : ce qui tourne, et de quoi l'arrêter */
  let bgShown = '';
  let bgStop: () => void = () => {};

  const isMe = () => !who || who === backend.state.user?.id;
  /** avatar : la photo importée (GIF) d'abord, sinon l'avatar Discord, sinon l'initiale */
  const avaHtml = (name: string) =>
    prof?.avatarMedia ? mediaHtml(prof.avatarMedia) : prof?.avatarUrl ? `<img src="${esc(prof.avatarUrl)}" alt="">` : `<span>${esc(name.slice(0, 1) || '?')}</span>`;
  lessMotion.addEventListener('change', () => el.isConnected && renderHead());
  const ownedOf = () => (isMe() ? backend.state.collection : cards).filter((c) => catalogEntry(c.cardId));
  /** stats affichées : celles du serveur, sinon (mon profil, avant la réponse) calculées localement */
  const statsOf = (): PlayerStats =>
    prof?.stats ?? statsFrom(ownedOf(), { packsOpened: prof?.packsOpened ?? backend.state.user?.totalPacksOpened ?? 0, tradesDone: 0, contractsSigned: 0, streak: backend.state.user?.streak?.count ?? 0 });

  // ── onglets
  el.querySelectorAll<HTMLButtonElement>('.pf-tabs button').forEach((b) =>
    b.addEventListener('click', () => {
      tab = b.dataset.tab as Tab;
      syncTabs();
      if (tab === 'activite' && !activity) void loadActivity();
      if (tab === 'classement' && !leaderLoaded) ((leaderLoaded = true), void leaderboard.load());
    }),
  );
  function syncTabs() {
    el.querySelectorAll<HTMLButtonElement>('.pf-tabs button').forEach((b) => {
      const on = b.dataset.tab === tab;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    });
    for (const t of ['tableau', 'collection', 'activite', 'classement'] as Tab[]) q(`.p-${t}`).hidden = t !== tab;
    if (tab === 'collection' && allStale) renderAllCards();
    requestAnimationFrame(markTabsOvf);
  }
  // onglets qui débordent à 360 px (« CLASSEMENT » coupé) : fondu au bord droit tant qu'il reste à voir (audit UX3-12)
  const tabsRow = q('.pf-tabs');
  const markTabsOvf = () => tabsRow.classList.toggle('ovf', tabsRow.scrollLeft + tabsRow.clientWidth < tabsRow.scrollWidth - 4);
  tabsRow.addEventListener('scroll', markTabsOvf, { passive: true });
  /** vitrine affichée : celle choisie (cartes encore possédées), sinon les 12 meilleures */
  function showcase(): { list: Array<{ cardId: string; rarity: RarityId }>; auto: boolean } {
    const mine = ownedOf();
    const has = new Set(mine.map((c) => `${c.cardId}:${c.rarity}`));
    const chosen = (prof?.showcase ?? []).filter((c) => has.has(`${c.cardId}:${c.rarity}`));
    if (chosen.length) return { list: chosen, auto: false };
    return { list: [...mine].sort(best).slice(0, SLOTS).map((c) => ({ cardId: c.cardId, rarity: c.rarity })), auto: true };
  }

  /**
   * Avatar + cadre (retours live 6, B4 / C14) : l'anneau de couleur (`--frame`, une couleur pure) et, pour un cadre
   * animé, son calque d'effets (`.pf-fx` : éclairs, flammes, auréole, cœurs, étoiles, néon — style.css). Ouvre
   * `.pf-ava-wrap` (à refermer par l'appelant, après l'étiquette éventuelle).
   */
  const avaRing = (fr: Cosmetic, ava: string, under = '') =>
    `<div class="pf-ava-wrap frame-${/^#/.test(fr.id) ? 'custom' : fr.id}">${framed(fr, ava, { cls: 'pf-ring', under })}`;

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
    // (retours live 6, C13) bannière GIF / image : la couleur choisie l'ENTOURE (contour) ; « Aucune couleur » = rien
    const bc = bannerColor(cos.banner);
    banner.style.setProperty('--bnc', bc ?? 'transparent');
    banner.classList.toggle('bn-color', !!bc);
    applyAccent(cos.accent);
    applyVitrine(cos.vitrine, cos.vitrineColor);
    // (14/11) fond du profil : généré par le navigateur, teinté par la couleur du profil (`--bgc`, cosmetiques.css)
    const bgc = backgroundOf(cos.background);
    bgEl.hidden = bgc.id === 'none';
    bgEl.style.background = bgc.css ?? '';
    bgEl.dataset.bg = bgc.id;
    // shader du fond (Braise, Orage, Nébuleuse, Synthwave) : un seul canevas, reposé seulement s'il change ; coupé sous l'atelier
    const bgKey = cosmOpen || bgc.id === 'none' ? '' : `${bgc.id}|${accentColor(cos.accent) ?? '#ffffff'}`;
    if (bgKey !== bgShown) {
      bgShown = bgKey;
      bgStop();
      bgStop = bgKey ? mountBgShader(bgEl, bgc.id, accentColor(cos.accent) ?? '#ffffff') : () => {};
    }
    // (14/11) accord : cadre + fond de la même matière → un plus derrière la photo, et la mention sous les badges
    const acc = accordOf(cos);
    // bannière importée (GIF ou image, retours live 02) : par-dessus la bannière cosmétique, sous le dégradé
    const bUrl = prof?.bannerMedia ?? '';
    const bm = banner.querySelector<HTMLElement>('.pf-bn-media');
    if ((bm?.dataset.url ?? '') !== bUrl || (bm && bm.dataset.still !== String(lessMotion.matches))) {
      bm?.remove();
      if (bUrl) {
        banner.insertAdjacentHTML('afterbegin', `<div class="pf-bn-media" data-url="${esc(bUrl)}" data-still="${lessMotion.matches}">${mediaHtml(bUrl)}</div>`);
        hydrateStills(banner);
      }
    }
    banner.classList.toggle('has-media', !!bUrl);
    const bb = q<HTMLButtonElement>('.pf-banner-btn');
    bb.hidden = !me;
    const fresh = me && !cosmOpen ? newCosmetics().size : 0;
    bb.innerHTML = tr('pf.customizeNew', { x: fresh ? ` <i class="pf-new" title="${tr('pf.newTitle', { n: fresh })}">${fresh}<span> ${tr('pf.newWord', { n: fresh })}</span></i>` : '' });
    const ava = avaHtml(name);
    const badges = (cos.badges ?? []).map((id) => badgeOf(id)).filter((b): b is Cosmetic => !!b);
    // en-tête compact (retours live 02) : pseudo, puis titre + badges sur UNE ligne, puis devise · « depuis » sur une ligne
    head.innerHTML = `${avaRing(fr, ava, acc ? accordFx(acc.matter) : '')}</div>
      <div class="pf-id">
        <div class="pf-eyebrow">${me ? tr('pf.myProfile') : tr('pf.profile')}</div>
        <h1>${esc(name)}</h1>
        ${title || badges.length ? `<div class="pf-tline">${title ? titleHtml(title.label, cos.titleStyle) : ''}${badges.length ? `<span class="pf-badges">${badges.map((b) => `<span class="pf-badge" title="${esc(b.label)} · ${esc(b.how)}" aria-label="${esc(b.label)}">${badgeIcon(b.id)} <i>${esc(b.label)}</i></span>`).join('')}</span>` : ''}</div>` : ''}
        ${acc ? `<div class="pf-accord" title="${esc(tr(`at.d.${acc.matter}` as MsgKey))}">${icon('link', 13)}<span>${tr('at.accordOn', { name: tr(`at.m.${acc.matter}` as MsgKey) })}</span></div>` : ''}
        <div class="pf-meta"><span class="pf-bio">${prof?.bio ? `« ${esc(prof.bio)} »` : me ? '<i>' + tr('pf.noInfo') + '</i>' : ''}</span>${prof?.joinedAt ? `<span class="pf-since" title="${tr('pf.since', { date: fmtDate(prof.joinedAt) })}">depuis ${fmtMonth(prof.joinedAt)}</span>` : ''}</div>
      </div>
      <div class="pf-actions">${me ? `<button class="btn-ghost pf-bio-edit" aria-label="${tr('pf.editInfo')}" title="${tr('pf.editInfo')}">${icon('pen', 14)}<span> ${tr('pf.info')}</span></button>` : `<button class="btn-primary pf-see-coll">${tr('pf.seeColl')}</button><a class="btn-ghost pf-trade" href="#/echanges">${tr('pf.offerTrade')}</a>${friendBtn(backend, who, name)}`}</div>`;
    hydrateStills(head);
    head.querySelector('.pf-see-coll')?.addEventListener('click', () => {
      tab = 'collection';
      syncTabs();
      q('.pf-tabs').scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
    head.querySelector('.pf-bio-edit')?.addEventListener('click', editBio);
    // action de compte (déconnexion / remise à zéro de la démo) : en bas de page, plus sous le pseudo (audit UX3-16)
    account.hidden = !me;
    const accB = q('.pf-account-b');
    const outLabel = backend.state.mode === 'demo' ? tr('pf.resetDemo') : tr('pf.logout');
    accB.innerHTML = me ? `<button class="btn-ghost pf-out">${outLabel}</button><span class="muted">${backend.state.mode === 'demo' ? tr('pf.resetDemoD') : tr('pf.logoutD')}</span>` : '';
    // (V2) notifications push : fiche au-dessus de la déconnexion (notif.ts)
    if (me) accB.prepend(notifPanel(backend));
    // (V2) hors connexion : tout télécharger (offline.ts), juste sous les notifications
    if (me) accB.querySelector('.nf-box')?.after(offlinePanel(backend));
    const out = accB.querySelector<HTMLButtonElement>('.pf-out');
    let armed = 0;
    out?.addEventListener('click', () => {
      if (!armed) {
        out.textContent = backend.state.mode === 'demo' ? tr('pf.resetSure') : tr('pf.logoutSure');
        out.classList.add('danger');
        // la confirmation se désarme seule au bout de 4 s
        armed = window.setTimeout(() => {
          armed = 0;
          out.textContent = outLabel;
          out.classList.remove('danger');
        }, 4000);
        return;
      }
      clearTimeout(armed);
      logout();
    });
    head.querySelector('.pf-trade')?.addEventListener('click', () => sessionStorage.setItem('bebou.tradeWith', who));
  }
  /**
   * Cosmétiques débloqués depuis la dernière ouverture du panneau (pastille « nouveau » : audit UX3-18). Clés
   * `famille:id` (« gold » existe en bannière ET en cadre). Première visite : tout ce qui est déjà débloqué est « vu ».
   */
  const COSM_SEEN = 'bebou.cosm.seen';
  const unlockedKeys = () => {
    const st = statsOf();
    return [
      ...unlockedIds(BANNERS, st).map((id) => `banner:${id}`),
      ...unlockedIds(FRAMES, st).map((id) => `frame:${id}`),
      ...unlockedIds(TITLES, st).map((id) => `title:${id}`),
      ...unlockedIds(BADGES, st).map((id) => `badge:${id}`),
      ...unlockedIds(ACCENTS, st).map((id) => `accent:${id}`),
      ...unlockedIds(VITRINES, st).map((id) => `vitrine:${id}`), // i18n-ok
      ...unlockedIds(BACKGROUNDS, st).map((id) => `background:${id}`),
      ...unlockedIds(TITLE_STYLES, st).map((id) => `tstyle:${id}`),
    ];
  };
  /**
   * Couleur du profil (retours 04/11) : on redéfinit les accents du site (--rose, --rose-l) à l'échelle de la page profil
   * + --pa pour les accents propres au profil (titre, cadre « aucun », bordures). Profil d'un ami : SA couleur.
   */
  function applyAccent(id?: string) {
    const c = accentColor(id);
    el.classList.toggle('has-accent', !!c);
    // texte posé SUR la couleur (onglet actif, boutons) : sombre sur une couleur claire, clair sur une couleur sombre
    const lum = c ? (([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b)([1, 3, 5].map((i) => (parseInt(c.slice(i, i + 2), 16) / 255) ** 2.2)) : 1;
    for (const [k, v] of [['--pa', c], ['--pa-ink', c ? (lum > 0.18 ? '#170a06' : '#fff6ee') : undefined], ['--rose', c], ['--rose-l', c ? `color-mix(in srgb, ${c} 45%, #fff6ee)` : undefined]] as const) {
      if (v) el.style.setProperty(k, v);
      else el.style.removeProperty(k);
    }
  }
  /** Vitrine (retours 05/11) : fond choisi + sa couleur (bordure, lueur, étagère) ; sans choix : celle du profil. */
  function applyVitrine(id?: string, color?: string) {
    const box = el.querySelector<HTMLElement>('.pf-case');
    if (!box) return;
    const v = vitrineOf(id);
    const c = accentColor(color);
    box.style.background = id || c ? v.css ?? '' : '';
    box.classList.toggle('has-vc', !!(id || c));
    box.dataset.vit = v.id;
    if (c) box.style.setProperty('--vc', c);
    else box.style.removeProperty('--vc');
  }
  function newCosmetics(): Set<string> {
    const all = unlockedKeys();
    try {
      const raw = localStorage.getItem(COSM_SEEN);
      if (!raw) {
        // pas de stats serveur encore (profil en chargement) : on n'initialise pas sur des stats partielles
        if (prof?.stats) localStorage.setItem(COSM_SEEN, JSON.stringify(all));
        return new Set();
      }
      const seen = new Set(JSON.parse(raw) as string[]);
      return new Set(all.filter((k) => !seen.has(k)));
    } catch {
      return new Set();
    }
  }
  const markCosmSeen = () => {
    try {
      localStorage.setItem(COSM_SEEN, JSON.stringify(unlockedKeys()));
    } catch {
      /* stockage bloqué */
    }
  };
  /**
   * (14/11) « Personnaliser » ouvre l'ATELIER (./atelier.ts) : aperçu vivant, tuiles, essai des éléments verrouillés.
   * Il travaille sur un brouillon ; la page ne change qu'à l'enregistrement (`closed(kept)`).
   */
  const openCosm = () => {
    if (atelier) return;
    const fresh = newCosmetics();
    markCosmSeen();
    const name = prof?.name ?? backend.state.user?.name ?? '';
    const f0 = [...fresh][0]?.split(':')[0] ?? '';
    const first = f0 === 'tstyle' ? 'title' : (['background', 'banner', 'frame', 'title', 'accent', 'vitrine', 'badge'].includes(f0) ? (f0 as AtelierFam) : undefined);
    cosmOpen = true;
    atelier = openAtelier({
      backend,
      shell,
      name,
      avaHtml: () => avaHtml(name),
      avaUrl: () => prof?.avatarMedia ?? prof?.avatarUrl ?? '',
      hasAvatar: () => !!prof?.avatarMedia,
      bannerUrl: () => prof?.bannerMedia ?? '',
      cosmetics: prof?.cosmetics ?? {},
      stats: statsOf(),
      showcase: showcase().list,
      fresh,
      first,
      media: mediaAction,
      closed: (kept) => {
        atelier = null;
        cosmOpen = false;
        if (kept) prof = prof ? { ...prof, cosmetics: kept } : prof;
        renderHead();
      },
    });
    renderHead();
  };
  q('.pf-banner-btn').addEventListener('click', openCosm);

  /**
   * Photo de profil / bannière À TOI (retours live 02) : GIF animé (ou image) importé, ≤ 2 Mo (démo : 700 Ko),
   * enregistré tout de suite (indépendant d'« Enregistrer » : ce n'est pas un cosmétique à débloquer). Sans fichier :
   * l'avatar Discord et la bannière choisie. (14/11) Lancé par les crayons posés sur la photo et la bannière de l'atelier.
   */
  function mediaAction(kind: ProfileMediaKind, remove: boolean, btn: HTMLButtonElement) {
    const field = kind === 'avatar' ? 'avatarMedia' : 'bannerMedia';
    const send = (file: File | null) =>
      void guarded(`media-${kind}`, btn, async () => {
        try {
          const url = await busyButton(btn, backend.setProfileMedia(kind, file));
          prof = prof ? { ...prof, [field]: url } : prof;
          toast(file ? (kind === 'avatar' ? tr('pf.avatarSaved') : tr('pf.bannerSaved')) : kind === 'avatar' ? tr('pf.avatarRemoved') : tr('pf.bannerRemoved'), 'ok');
          shell.sfx.chime(2, 0.06);
        } catch (e) {
          toast(errMsg(e), 'err');
        }
        renderHead();
        atelier?.refresh();
      });
    if (remove) return send(null);
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = PROFILE_MEDIA_TYPES.join(',');
    inp.addEventListener('change', () => {
      const f = inp.files?.[0];
      if (!f) return;
      // refus clair AVANT l'envoi (le serveur revérifie)
      const bad = profileMediaProblem(f.size, f.type, backend.state.mode === 'demo' ? PROFILE_MEDIA_DEMO_MAX : PROFILE_MEDIA_MAX);
      if (bad) return void toast(errText(bad), 'err');
      send(f);
    });
    inp.click();
  }

  function editBio() {
    const box = head.querySelector<HTMLElement>('.pf-bio')!;
    box.innerHTML = `<input class="pf-bio-in" maxlength="80" placeholder="${tr('pf.infoField')}" value="${esc(prof?.bio ?? '')}">`;
    const inp = box.querySelector<HTMLInputElement>('input')!;
    inp.focus();
    let done = false;
    const save = async () => {
      if (done) return;
      done = true;
      try {
        await backend.setBio(inp.value);
        prof = prof ? { ...prof, bio: inp.value.replace(/\s+/g, ' ').trim().slice(0, 80) || undefined } : prof;
        toast(tr('pf.infoSaved'), 'ok');
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

  // ── TABLEAU : 3 chiffres clés, puis 4 panneaux courts (Activité · Collection · Raretés · Univers)
  /**
   * (V2 lisibilité) Un CODE COULEUR fixe, tiré des raretés (la seule couleur de la DA) et le même partout :
   *  bleu (3★) = progression de la collection · doré (5★) = succès · arc-en-ciel (6★) / corail (secrète) = prestige ·
   *  vert (2★) = activité. Les zéros sont estompés : l'œil va aux vrais chiffres.
   */
  const panelHead = (title: string, c: string, extra = '') => `<h3 class="pf-ph" style="--c:${c}"><i aria-hidden="true"></i>${title}${extra}</h3>`;
  const row = (glyph: string, label: string, v: number, shown = fmtN(v), c = '', sub = '') =>
    `<div class="pf-row${v ? '' : ' zero'}"${c ? ` style="--c:${c}"` : ''}><span class="pf-ri" aria-hidden="true">${glyph}</span><span class="pf-rl">${label}${sub ? ` <small>${sub}</small>` : ''}</span><b class="pf-rv">${shown}</b></div>`;
  const barPct = (have: number, of: number) => (have ? Math.max(1.5, (have / Math.max(1, of)) * 100) : 0).toFixed(1);
  function renderStats() {
    const mine = ownedOf();
    const st = statsOf();
    const total = mine.reduce((a, c) => a + c.count, 0);
    const dups = mine.reduce((a, c) => a + Math.max(0, c.count - 1), 0);
    const all = st.total || PUBLIC_CARD_COUNT;
    const pct = (st.uniques / Math.max(1, all)) * 100;
    const sd = prof?.streakDay ?? ((st.streak - 1) % STREAK_CYCLE) + 1;
    // succès débloqués (les succès de l'espace Jeux) — remplace le « plus gros drop » (retours live n°1)
    // (perf : `eco.snapshot` est un calcul complet en démo — lu UNE fois, pas une fois par succès)
    const mySnap = () => (isMe() ? backend.eco.snapshot : null);
    const ach = prof?.achievements ?? ((snap) => (snap ? { done: ACHIEVEMENTS.filter((a) => achievementDone(a, snap.achievements.stats)).length, total: ACHIEVEMENTS.length } : null))(mySnap());
    // les 3 chiffres clés juste APRÈS la vitrine (retours live 02 : la vitrine d'abord)
    keysEl.innerHTML =
      `<div class="pf-key k-prog"><span class="pf-k-l">${tr('pf.completion')}</span><b class="pf-k-v">${fmtPct(pct)}</b><span class="pf-k-s">${tr('pf.cardsOf', { n: fmtN(st.uniques), total: fmtN(all) })}</span><i class="pf-k-bar"><i style="width:${barPct(st.uniques, all)}%"></i></i></div>` +
      `<div class="pf-key k-myth${st.mythics ? '' : ' zero'}"><span class="pf-k-l">${tr('pf.mythics')}</span><b class="pf-k-v">${fmtN(st.mythics)}</b><span class="pf-k-s${st.secrets ? ' has-secret' : ''}">${st.secrets ? `+ ${fmtN(st.secrets)} ${tr('pf.w.secret', { n: st.secrets })} ✷` : tr('pf.rarest')}</span></div>` +
      (ach
        ? `<${isMe() ? 'a href="#/succes"' : 'div'} class="pf-key k-ach"><span class="pf-k-l">${tr('pf.achievements')}</span><b class="pf-k-v">${ach.done}<small>/${ach.total}</small></b><span class="pf-k-s">${isMe() ? tr('pf.seeAch') : tr('pf.unlockedW')}</span><i class="pf-k-bar"><i style="width:${barPct(ach.done, ach.total)}%"></i></i></${isMe() ? 'a' : 'div'}>`
        : '');
    pActEl.innerHTML =
      panelHead(tr('pf.activity'), 'var(--pc-act)') +
      row('▣', 'Boosters ouverts', st.packsOpened) +
      row('🔥', tr('pf.streak'), st.streak, st.streak ? `${fmtN(st.streak)} j` : '—', 'var(--pc-fire)', st.streak ? tr('pf.cycleDay', { d: Math.max(1, sd), n: STREAK_CYCLE }) : '') +
      row('⇄', tr('pf.w.trades', { n: st.tradesDone }), st.tradesDone) +
      row('⚖', tr('pf.w.contracts', { n: st.contractsSigned }), st.contractsSigned);
    pCollEl.innerHTML =
      panelHead('Collection', 'var(--pc-coll)') + // i18n-ok
      row('▤', tr('pf.cardsTotal'), total, fmtN(total), '', tr('pf.distinct', { n: fmtN(mine.length) })) +
      row('⧉', tr('pf.w.dups', { n: dups }), dups) +
      row('✓', tr('pf.w.albums', { n: st.fullSubthemes }), st.fullSubthemes) +
      row('✷', tr('pf.w.secretCards', { n: st.secrets }), st.secrets, fmtN(st.secrets), 'var(--pc-secret)');
    // complétion par univers : barre à la couleur de l'univers, triée du plus avancé au moins avancé
    const ids = new Set(mine.filter((c) => c.rarity !== 'secret').map((c) => c.cardId));
    const themes = (prof?.themes ?? THEMES.map((t) => ({ id: t.id, have: t.cards.reduce((a, c) => a + (ids.has(c.id) ? 1 : 0), 0), total: t.cards.length })))
      .filter((t) => t.total)
      .sort((a, b) => b.have / b.total - a.have / a.total)
      .map((t) => {
        const th = THEMES.find((x) => x.id === t.id);
        return `<div class="pf-th${t.have ? '' : ' zero'}" style="--rc:${th?.style.accent ?? '#fff'}"><span class="pf-th-l"><i aria-hidden="true"></i>${esc(th?.label ?? t.id)}</span><i class="pf-th-bar"><i style="width:${barPct(t.have, t.total)}%"></i></i><em><b>${fmtN(t.have)}</b> / ${fmtN(t.total)}</em></div>`;
      })
      .join('');
    pThEl.innerHTML = panelHead(tr('pf.universes'), 'var(--pc-coll)', '<small>' + tr('pf.distinctW') + '</small>') + `<div class="pf-themes">${themes}</div>`;
  }

  /** Raretés : une barre de répartition (une couleur par rareté) + la légende chiffrée */
  function renderRarities() {
    const mine = ownedOf();
    const rows = [...STARS, ...(mine.some((c) => c.rarity === 'secret') ? (['secret'] as RarityId[]) : [])];
    const n = Object.fromEntries(rows.map((r) => [r, mine.filter((c) => c.rarity === r).length])) as Record<RarityId, number>;
    const sum = Math.max(1, rows.reduce((a, r) => a + n[r], 0));
    const seg = (r: RarityId) => (n[r] ? `<i class="pf-rs r-${r}" style="--rc:${rarity(r).hex};flex-grow:${n[r]}" title="${esc(rarity(r).label)} : ${fmtN(n[r])}"></i>` : '');
    rarEl.innerHTML =
      panelHead(tr('pf.rarities'), 'var(--pc-gold)', '<small>' + tr('pf.distinctW') + '</small>') +
      `<div class="pf-rbar" role="img" aria-label="${tr('pf.byRarity')}">${mine.length ? rows.map(seg).join('') : ''}</div>` +
      `<div class="pf-rlist">${rows
        .map((r) => `<div class="pf-rr r-${r}${n[r] ? '' : ' zero'}" style="--rc:${rarity(r).hex};--rt:${r === 'epic' ? '#e0607a' : r === 'rare' ? '#6f9be0' : rarity(r).hex}"><span class="pf-rr-s">${r === 'secret' ? '✷' : `${rarity(r).rank + 1}★`}</span><span class="pf-rr-l">${esc(rarity(r).label)}</span><b>${fmtN(n[r])}</b><em>${n[r] ? fmtPct((n[r] / sum) * 100) : ''}</em></div>`)
        .join('')}</div>`;
  }


  // ── VITRINE : affichage (lecture) ; l'édition (choix, retrait, glisser-déposer) est dans showcaseEditor.ts
  const editor = createShowcaseEditor({
    slots: SLOTS,
    caseEl,
    pickerEl: picker,
    owned: ownedOf,
    sort: best,
    sfx: shell.sfx,
    onChange: renderEditTools,
  });
  /** en édition : compteur « 8/12 », consigne, Annuler / Enregistrer (actif seulement s'il y a un changement) */
  function renderEditTools() {
    if (!editor.active) return;
    const n = editor.value().length;
    countEl.hidden = false;
    countEl.innerHTML = `<b>${n}</b>/${SLOTS}`;
    countEl.classList.toggle('full', n >= SLOTS);
    const save = tools.querySelector<HTMLButtonElement>('.pf-save');
    if (save) save.disabled = !editor.dirty();
    editBar.querySelector<HTMLElement>('.pf-edit-hint')!.textContent = n ? (coarseQ.matches ? tr('pf.vit.dragTouch') : tr('pf.vit.dragMouse')) : tr('pf.vit.empty');
    editBar.querySelector<HTMLButtonElement>('.pf-fill')!.disabled = n >= SLOTS;
    editBar.querySelector<HTMLButtonElement>('.pf-clear')!.disabled = !n;
  }
  const coarseQ = matchMedia('(pointer: coarse)');
  editBar.querySelector('.pf-fill')!.addEventListener('click', () => editor.fill());
  editBar.querySelector('.pf-clear')!.addEventListener('click', () => editor.clear());

  function startEditing() {
    if (open) closeViewer();
    caseSec.classList.add('editing');
    el.classList.add('pf-editing');
    editBar.hidden = false;
    autoEl.textContent = '';
    tools.innerHTML = `<button class="btn-ghost pf-cancel">${tr('pf.cancel')}</button><button class="btn-primary pf-save" disabled>${tr('pf.save')}</button>`;
    tools.querySelector('.pf-cancel')!.addEventListener('click', stopEditing);
    const saveBtn = tools.querySelector<HTMLButtonElement>('.pf-save')!;
    saveBtn.addEventListener('click', async () => {
      const cardsOut = editor.value();
      try {
        await busyButton(saveBtn, backend.setShowcase(cardsOut));
        prof = prof ? { ...prof, showcase: cardsOut } : prof;
        toast(cardsOut.length ? tr('pf.vit.saved') : tr('pf.vit.auto'), 'ok');
        shell.sfx.chime(2, 0.06);
        stopEditing();
      } catch (e) {
        toast(errMsg(e), 'err');
      }
    });
    editor.start(showcase().list);
    // bouton « retour » du téléphone : quitte l'édition (sans enregistrer) au lieu de quitter la page
    pushLayer(stopEditing);
    caseSec.scrollIntoView({ block: 'start', behavior: lessMotion.matches ? 'auto' : 'smooth' });
  }
  function stopEditing() {
    if (!editor.active) return;
    popLayer(stopEditing);
    editor.stop();
    caseSec.classList.remove('editing');
    el.classList.remove('pf-editing');
    editBar.hidden = true;
    countEl.hidden = true;
    renderCase();
  }
  // Échap : quitte l'édition sans enregistrer (pendant un glissé, l'éditeur annule le glissé et arrête l'événement)
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !editor.active || !el.isConnected || open) return;
    if ((e.target as HTMLElement)?.closest?.('.pf-search') && (e.target as HTMLInputElement).value) return;
    stopEditing();
  });

  function renderCase() {
    if (editor.active) return;
    const me = isMe();
    // (v2.0.6, retour de Tom) profil en cours de chargement : cases vides, pas une vitrine provisoire (mes meilleures
    // cartes ou l'ancienne vitrine s'affichaient une seconde avant la vraie)
    const loading = el.classList.contains('loading');
    const sc = loading ? { list: [], auto: false } : showcase();
    const list = sc.list;
    autoEl.textContent = sc.auto && list.length ? (me ? tr('pf.vit.bestMine') : tr('pf.vit.bestTheirs')) : '';
    tools.innerHTML = me && !loading && ownedOf().length ? `<button class="btn-ghost pf-edit">${sc.auto ? tr('pf.vit.pick') : tr('pf.edit')}</button>` : '';
    tools.querySelector('.pf-edit')?.addEventListener('click', startEditing);
    caseEl.replaceChildren();
    caseEl.classList.toggle('is-empty', !list.length);
    // retours live 02 : les 12 cases toujours (plus de « Voir les 12 » au téléphone), au premier écran
    for (let i = 0; i < SLOTS; i++) {
      const c = list[i];
      const wrap = h('div', `pf-slot${c ? ' filled' : ' free'}`);
      wrap.style.setProperty('--i', String(i));
      if (c) {
        const t = cardTile(c.cardId, c.rarity);
        wrap.append(t);
        t.addEventListener('click', () => void openCard(c.cardId, c.rarity));
      } else wrap.innerHTML = `<div class="pf-empty"></div>`;
      caseEl.append(wrap);
    }
    if (!list.length && !loading) caseEl.insertAdjacentHTML('beforeend', `<div class="pf-none">${me ? tr('pf.vit.openSome') : tr('pf.noCardYet')}</div>`);
  }
  /**
   * (retours Hugo et Tom, 10/11) TOUTE LA COLLECTION d'un joueur, pas seulement son classeur épinglé : recherche par nom,
   * filtre par étoiles, de la plus rare à la moins rare, par paquets de 60 (« Voir plus »). Toucher = la carte en grand.
   */
  const ALL_STEP = 60;
  let allShown = ALL_STEP;
  let allR = '';
  const allQ = q<HTMLInputElement>('.pf-all-q');
  const fold = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  // (audit 12/11, S14 / M-07) la grille « Toute la collection » (tri complet + 60 tuiles) n'est construite que si son
  // onglet est affiché ; sinon elle est marquée à refaire et se construit à l'ouverture de l'onglet
  let allStale = false;
  function renderAllCards() {
    if (tab !== 'collection') return void (allStale = true);
    allStale = false;
    const owned = ownedOf();
    const rEl = q('.pf-all-r');
    const ranks = [...new Set(owned.map((c) => c.rarity))].sort((a, b) => rarity(b).rank - rarity(a).rank);
    rEl.innerHTML = `<button class="chip${allR ? '' : ' on'}" data-r="">${tr('pf.all')}</button>${ranks.map((r) => `<button class="chip${allR === r ? ' on' : ''}" data-r="${r}" style="--rc:${rarity(r).hex}">${starsHtml(r)}</button>`).join('')}`;
    const needle = fold(allQ.value.trim());
    const list = owned
      .filter((c) => (!allR || c.rarity === allR) && (!needle || fold(catalogEntry(c.cardId)?.name ?? '').includes(needle)))
      .sort((a, b) => rarity(b.rarity).rank - rarity(a.rarity).rank || (catalogEntry(a.cardId)?.name ?? '').localeCompare(catalogEntry(b.cardId)?.name ?? '', locale()));
    q('.pf-all-n').textContent = `${fmtN(list.length)} carte${list.length > 1 ? 's' : ''}`;
    const g = q('.pf-all');
    g.replaceChildren();
    for (const c of list.slice(0, allShown)) {
      const t = cardTile(c.cardId, c.rarity, { count: c.count });
      t.addEventListener('click', () => void openCard(c.cardId, c.rarity));
      g.append(t);
    }
    if (!list.length) g.append(h('div', 'muted', owned.length ? tr('pf.noMatch') : tr('pf.noCardYet')));
    q('.pf-all-more').hidden = list.length <= allShown;
  }
  q('.pf-all-r').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-r]');
    if (!b) return;
    allR = b.dataset.r ?? '';
    allShown = ALL_STEP;
    renderAllCards();
  });
  // (audit 12/11, S14 / A4-06) recherche temporisée (tri complet de la collection à chaque frappe sinon)
  let allQT = 0;
  allQ.addEventListener('input', () => {
    allShown = ALL_STEP;
    clearTimeout(allQT);
    allQT = window.setTimeout(renderAllCards, 150);
  });
  q('.pf-all-more').addEventListener('click', () => {
    allShown += ALL_STEP * 2;
    renderAllCards();
  });

  /** Classeurs épinglés : un bloc par classeur, 3 au plus (sondage 11/11). Seul : 24 cartes ; à plusieurs : 12 chacun, « + N autres » déplie. */
  function renderBinder() {
    const box = q('.pf-binders');
    const list = isMe() ? backend.state.binders.filter((x) => x.pinned).slice(0, 3) : prof?.pinnedBinders ?? (prof?.pinnedBinder ? [prof.pinnedBinder] : []);
    box.replaceChildren();
    const nob = q('.pf-nobinder');
    nob.hidden = list.length > 0;
    nob.innerHTML = isMe() ? tr('pf.noBinderMine') : tr('pf.noBinder');
    if (!list.length) return;
    const have = new Map(ownedOf().map((c) => [`${c.cardId}:${c.rarity}`, c]));
    const first = list.length > 1 ? 12 : 24;
    list.forEach((b, i) => {
      const sec = h('div', 'pf-sec pf-binder-sec');
      sec.innerHTML = `<div class="pf-sec-t"><h2 class="pf-binder-t"></h2><span class="pf-auto">${tr('pf.pinned')}</span>${isMe() && i === 0 ? '<span class="pf-tools"><a class="btn-ghost pf-binder-go" href="#/collection/classeurs">' + tr('pf.myBinders') + '</a></span>' : ''}</div><div class="grid mini pf-binder"></div>`;
      sec.querySelector('.pf-binder-t')!.textContent = b.name;
      const g = sec.querySelector<HTMLElement>('.pf-binder')!;
      const fill = (n: number) => {
        g.replaceChildren();
        for (const c of b.cards.slice(0, n)) {
          const row = have.get(`${c.cardId}:${c.rarity}`);
          const t = cardTile(c.cardId, c.rarity, { owned: !!row, count: row?.count });
          if (row) t.addEventListener('click', () => void openCard(c.cardId, c.rarity));
          g.append(t);
        }
        if (b.cards.length > n) {
          const more = h('button', 'btn-ghost pf-binder-more');
          more.textContent = `+ ${fmtN(b.cards.length - n)} autres`;
          more.addEventListener('click', () => fill(n + 48));
          g.append(more);
        }
      };
      fill(first);
      box.append(sec);
    });
  }

  // ── ACTIVITÉ
  async function loadActivity() {
    activityEl.innerHTML = '<div class="muted">' + tr('common.loading2') + '</div>';
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
    if (!list.length) return void (activityEl.innerHTML = `<div class="muted">${isMe() ? tr('pf.nothingMine') : tr('pf.nothing')}</div>`);
    const ICON: Record<string, string> = { pull: '✦', mythic_pull: '✺', secret_pull: '✷', trade: '⇄', contract: '⚖', joined: '👋', achievement: '🏅' };
    for (const a of list) {
      const e = a.cardId ? catalogEntry(a.cardId) : undefined;
      const rr = a.rarity ? rarity(a.rarity) : null;
      const row = h('div', `pf-act k-${a.kind}${rr ? ` r-${a.rarity}` : ''}`);
      if (rr) row.style.setProperty('--rc', rr.hex);
      row.innerHTML = `<span class="pa-ico">${ICON[a.kind] ?? '•'}</span>${e && a.rarity !== 'secret' ? `<img class="pa-img" alt="" loading="lazy" src="${thumbUrl(e)}">` : ''}<span class="pa-txt">${esc(feedText(a))}</span><span class="pa-when">${ago(a.createdAt)}</span>`;
      if (e && a.rarity) row.addEventListener('click', () => void openCard(e.id, a.rarity!));
      activityEl.append(row);
    }
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
    renderAllCards();
    renderFriends();
    syncTabs();
    renderActivity();
  }

  async function load(id: string) {
    const my = ++token;
    if (who !== id) {
      allShown = ALL_STEP;
      allR = '';
      allQ.value = '';
    }
    who = id;
    stopEditing();
    atelier?.close();
    activity = null;
    leaderLoaded = false;
    const me = backend.state.user;
    prof = isMe() && me ? { id: me.id, name: me.name, avatarUrl: me.avatarUrl, showcase: [], packsOpened: me.totalPacksOpened } : null;
    cards = [];
    el.classList.add('loading');
    renderAll();
    try {
      // (audit 12/11, A4-02) profil d'un ami : une seule lecture de sa collection côté serveur (avant : deux)
      const [p, c] = isMe() ? [await backend.profile(me?.id ?? 'me'), backend.state.collection] : await backend.friendProfile(id).then((r) => [r.profile, r.cards] as const);
      if (my !== token) return;
      if (p) prof = p;
      cards = c;
    } catch (e) {
      if (my === token) toast(errMsg(e), 'err');
    }
    if (my !== token) return;
    el.classList.remove('loading');
    renderAll();
    // « Équiper → » depuis les succès : le panneau de personnalisation s'ouvre tout de suite
    if (isMe() && sessionStorage.getItem('bebou.openCosm')) {
      sessionStorage.removeItem('bebou.openCosm');
      openCosm();
    }
    if (tab === 'activite') void loadActivity();
    // (audit 12/11, A5-11) un re-rendu du profil (collection, amis, classeurs) ne recharge plus le classement déjà affiché
    if (tab === 'classement' && !leaderLoaded) ((leaderLoaded = true), void leaderboard.load());
  }

  // ── une carte en grand ; un toucher à côté la referme (audit UX3-09, même règle que la boutique)
  let viewerRef: ViewerScene | null = null;
  let openedAt = 0;
  shell.input.onTap((x, y) => {
    if (!open || !viewerRef || performance.now() - openedAt < 450 || !el.isConnected) return;
    if (!viewerRef.hits(x, y)) closeViewer();
  });
  async function openCard(cardId: string, r: RarityId) {
    const viewer = await getViewer();
    viewerRef = viewer;
    openedAt = performance.now();
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
    viewerUi.querySelector('.v-actions')!.replaceChildren(imageReportButton(backend, cardId, 'profil/carte'));
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
    if (!el.isConnected || !isMe() || editor.active || open || cosmOpen) return;
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
      // #/profil/classement : la page dédiée #/classement (même composant, sans l'en-tête du profil devant : UX3-17)
      if (id === 'classement') {
        location.replace('#/classement');
        return;
      }
      // (10/11) #/profil/<id>/collection : directement l'onglet Collection (bouton « Sa collection » des amis, du classement)
      if (parts[1] === 'collection') tab = 'collection';
      void load(id);
    },
    leave() {
      if (open) closeViewer();
      stopEditing();
      atelier?.close();
      bgStop();
      bgShown = '';
    },
  };
}
