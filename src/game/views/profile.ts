import type { ActivityItem, GameBackend, PlayerCard, Profile } from '../backend';
import { createLeaderboard } from './leaderboard';
import { friendBtn } from './friends';
import type { Shell } from '../shell';
import type { ViewerScene } from '../scenes/viewer';
import { catalogEntry, PUBLIC_CARD_COUNT, THEMES } from '../../core/sets/themes';
import { rarity, type RarityId } from '../../core/rarity';
import { ACCENTS, BADGES, BANNERS, FRAMES, VITRINES, accentColor, vitrineOf, PROFILE_MEDIA_DEMO_MAX, PROFILE_MEDIA_MAX, PROFILE_MEDIA_TYPES, TITLES, badgeOf, bannerOf, fmtMo, frameOf, profileMediaProblem, statsFrom, titleOf, unlockedIds, type Cosmetic, type CosmeticChoice, type PlayerStats, type ProfileMediaKind } from '../../core/cosmetics';
import { guarded, isPending } from './safety';
import { ACHIEVEMENTS, achievementDone, achievementStats, emptyEcon } from '../../core/economy';
import { STREAK_CYCLE } from '../../core/streak';
import { busyButton, cardTile, errMsg, esc, fmtN, fmtPct, fold, h, plural, popLayer, pushLayer, starsHtml, thumbUrl, toast } from '../ui';

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
const word = (n: number, one: string, many = `${one}s`) => (n > 1 ? many : one);
const fmtDate = (t: number) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
/** « nov. 2026 » (en-tête compact) */
const fmtMonth = (t: number) => new Date(t).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
/**
 * Photo / bannière importées (GIF, retours live 02) : un <img> — le GIF se lit tout seul, en boucle, sans son. En
 * « mouvements réduits » : une image FIXE, la 1re image peinte dans un <canvas> (affichable même si le fichier vient
 * d'un autre domaine : on ne relit jamais ses pixels).
 */
const lessMotion = matchMedia('(prefers-reduced-motion: reduce)');
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
  if (s < 60) return 'à l’instant';
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  const d = Math.round(s / 86400);
  return d === 1 ? 'hier' : `il y a ${d} j`;
};
type Tab = 'tableau' | 'collection' | 'activite' | 'classement';

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
        <div class="pf-sec pf-case-sec">
          <div class="pf-sec-t"><h2>Vitrine</h2><span class="pf-auto"></span><span class="pf-tools"></span></div>
          <div class="pf-case all"></div>
          <div class="pf-picker" hidden>
            <div class="pf-pick-t"><span>Choisis une carte pour la case <b class="pf-slot-n">1</b></span><input class="search pf-search" type="search" placeholder="Chercher…" autocomplete="off" spellcheck="false" aria-label="Chercher une de mes cartes"></div>
            <div class="starf pf-pick-stars" aria-label="Filtrer par étoiles"></div>
            <div class="grid mini pf-pick-grid"></div>
            <div class="muted pf-pick-more" hidden></div>
          </div>
        </div>
        <div class="pf-keys"></div>
        <div class="pf-stats"></div>
        <div class="pf-sec"><div class="pf-sec-t"><h2>Raretés</h2></div><div class="pf-rar"></div></div>
      </div>
      <div class="pf-pane p-collection" hidden>
        <div class="pf-sec pf-binder-sec" hidden><div class="pf-sec-t"><h2 class="pf-binder-t">Classeur</h2><span class="pf-auto">· épinglé</span><span class="pf-tools"><a class="btn-ghost pf-binder-go" href="#/collection/classeurs" hidden>Mes classeurs</a></span></div><div class="grid mini pf-binder"></div></div>
        <div class="pf-nobinder muted" hidden></div>
      </div>
      <div class="pf-pane p-activite" hidden><div class="pf-activity"></div></div>
      <div class="pf-pane p-classement" hidden></div>
      <div class="pf-sec pf-friends-sec"><div class="pf-sec-t"><h2>Les autres</h2><span class="pf-tools"><a class="btn-ghost pf-amis-go" href="#/amis">Mes amis</a></span></div><div class="pf-friends"></div></div>
      <div class="pf-sec pf-account" hidden><div class="pf-sec-t"><h2>Compte</h2></div><div class="pf-account-b"></div></div>
    </div>
    <div class="viewer-ui" hidden><button class="close" aria-label="Fermer">✕</button><div class="v-info"></div><div class="v-hint">glisse pour la faire tourner</div></div>`;
  const q = <T extends HTMLElement>(s: string) => el.querySelector<T>(s)!;
  const banner = q('.pf-banner');
  const head = q('.pf-head');
  const cosm = q('.pf-cosm');
  const stats = q('.pf-stats');
  const keysEl = q('.pf-keys');
  const account = q('.pf-account');
  const caseEl = q('.pf-case');
  const autoEl = q('.pf-case-sec .pf-auto');
  const tools = q('.pf-case-sec .pf-tools');
  const picker = q('.pf-picker');
  const pickGrid = q('.pf-pick-grid');
  const pickSearch = q<HTMLInputElement>('.pf-search');
  const rarEl = q('.pf-rar');
  const friendsEl = q('.pf-friends');
  const activityEl = q('.pf-activity');
  const leaderboard = createLeaderboard(backend, shell);
  q('.p-classement').append(leaderboard.el);
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
  let leaderLoaded = false;
  let activity: ActivityItem[] | null = null;
  let cosmOpen = false;
  let cosmDraft: CosmeticChoice = {};

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
      tab = b.dataset.t as Tab;
      syncTabs();
      if (tab === 'activite' && !activity) void loadActivity();
      if (tab === 'classement' && !leaderLoaded) ((leaderLoaded = true), void leaderboard.load());
    }),
  );
  function syncTabs() {
    el.querySelectorAll<HTMLButtonElement>('.pf-tabs button').forEach((b) => {
      const on = b.dataset.t === tab;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    });
    for (const t of ['tableau', 'collection', 'activite', 'classement'] as Tab[]) q(`.p-${t}`).hidden = t !== tab;
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
    applyAccent(cos.accent);
    applyVitrine(cos.vitrine, cos.vitrineColor);
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
    bb.innerHTML = cosmOpen ? 'Fermer' : `Personnaliser${fresh ? ` <i class="pf-new">${fresh} nouveau${fresh > 1 ? 'x' : ''}</i>` : ''}`;
    const ava = avaHtml(name);
    const badges = (cos.badges ?? []).map((id) => badgeOf(id)).filter((b): b is Cosmetic => !!b);
    // en-tête compact (retours live 02) : pseudo, puis titre + badges sur UNE ligne, puis devise · « depuis » sur une ligne
    head.innerHTML = `<div class="pf-ava-wrap frame-${fr.id}" style="--frame:${fr.css ?? 'transparent'}"><div class="pf-ava">${ava}</div>${fr.id !== 'none' ? `<span class="pf-frame-l">${esc(fr.label)}</span>` : ''}</div>
      <div class="pf-id">
        <div class="pf-eyebrow">${me ? 'Mon profil' : 'Profil'}</div>
        <h1>${esc(name)}</h1>
        ${title || badges.length ? `<div class="pf-tline">${title ? `<span class="pf-title">${esc(title.label)}</span>` : ''}${badges.length ? `<span class="pf-badges">${badges.map((b) => `<span class="pf-badge" title="${esc(b.label)} · ${esc(b.how)}" aria-label="${esc(b.label)}">${b.glyph ?? '●'} <i>${esc(b.label)}</i></span>`).join('')}</span>` : ''}</div>` : ''}
        <div class="pf-meta"><span class="pf-bio">${prof?.bio ? `« ${esc(prof.bio)} »` : me ? '<i>Pas encore de devise.</i>' : ''}</span>${prof?.joinedAt ? `<span class="pf-since" title="Joue depuis le ${fmtDate(prof.joinedAt)}">depuis ${fmtMonth(prof.joinedAt)}</span>` : ''}</div>
      </div>
      <div class="pf-actions">${me ? `<button class="btn-ghost pf-bio-edit" aria-label="Modifier ma devise">✎ Devise</button>` : `<a class="btn-primary pf-trade" href="#/echanges">Proposer un échange</a>${friendBtn(backend, who, name)}`}</div>`;
    hydrateStills(head);
    head.querySelector('.pf-bio-edit')?.addEventListener('click', editBio);
    // action de compte (déconnexion / remise à zéro de la démo) : en bas de page, plus sous le pseudo (audit UX3-16)
    account.hidden = !me;
    const accB = q('.pf-account-b');
    const outLabel = backend.state.mode === 'demo' ? 'Remettre la démo à zéro' : 'Se déconnecter';
    accB.innerHTML = me ? `<button class="btn-ghost pf-out">${outLabel}</button><span class="muted">${backend.state.mode === 'demo' ? 'Efface toute la collection de démo de ce navigateur.' : 'Tu pourras te reconnecter quand tu veux : ta collection reste sur le serveur.'}</span>` : '';
    const out = accB.querySelector<HTMLButtonElement>('.pf-out');
    let armed = 0;
    out?.addEventListener('click', () => {
      if (!armed) {
        out.textContent = backend.state.mode === 'demo' ? 'Sûr ? Tout est effacé' : 'Sûr ? Se déconnecter';
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
  let cosmNew = new Set<string>();
  const unlockedKeys = () => {
    const st = statsOf();
    return [
      ...unlockedIds(BANNERS, st).map((id) => `banner:${id}`),
      ...unlockedIds(FRAMES, st).map((id) => `frame:${id}`),
      ...unlockedIds(TITLES, st).map((id) => `title:${id}`),
      ...unlockedIds(BADGES, st).map((id) => `badge:${id}`),
      ...unlockedIds(ACCENTS, st).map((id) => `accent:${id}`),
      ...unlockedIds(VITRINES, st).map((id) => `vitrine:${id}`),
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
    if (c) box.style.setProperty('--vc', c);
    else box.style.removeProperty('--vc');
  }
  /** onglet → champ choisi par la couleur libre */
  const pickField = (t: CosmTab): 'accent' | 'banner' | 'frame' | null => (t === 'accent' || t === 'banner' || t === 'frame' ? t : null);
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
  const openCosm = () => {
    cosmOpen = true;
    cosmNew = newCosmetics();
    markCosmSeen();
    cosmDraft = { ...(prof?.cosmetics ?? {}), badges: [...(prof?.cosmetics?.badges ?? [])] };
    cosmSaved = cosmKey(cosmDraft);
    // l'onglet du premier nouveau cosmétique s'ouvre directement
    const first = [...cosmNew][0]?.split(':')[0] as CosmTab | undefined;
    if (first) cosmTab = first;
    cosm.hidden = false;
    renderHead();
    renderCosm();
  };
  q('.pf-banner-btn').addEventListener('click', () => {
    if (!cosmOpen) return openCosm();
    // « Fermer » sans enregistrer : comme Annuler (l'aperçu ne doit pas faire croire que c'est enregistré)
    const dirty = cosmKey(cosmDraft) !== cosmSaved;
    cosmOpen = false;
    cosm.hidden = true;
    if (dirty) void load(who);
    else renderHead();
  });

  /**
   * Panneau de personnalisation : bannières, cadres, titres, badges (verrouillé = grisé avec la condition).
   * Audit UX3-08 : un onglet par famille (au lieu de 4 groupes empilés sur 2 400 px), aperçu collant en haut du panneau,
   * barre « Annuler / Enregistrer » collante en bas avec un résumé et un point « non enregistré », débloqués d'abord,
   * condition des verrouillés lisible avec la progression (« 180/500 »).
   */
  type CosmTab = 'banner' | 'frame' | 'title' | 'badge' | 'accent' | 'vitrine';
  let cosmTab: CosmTab = 'banner';
  /** état enregistré à l'ouverture du panneau (pour le point « modifications non enregistrées ») */
  let cosmSaved = '';
  const cosmKey = (c: CosmeticChoice) => JSON.stringify([c.banner ?? BANNERS[0].id, c.frame ?? 'none', c.title ?? '', c.badges ?? [], c.accent ?? ACCENTS[0].id, c.vitrine ?? VITRINES[0].id, c.vitrineColor ?? '']);
  /**
   * Photo de profil / bannière À TOI (retours live 02) : GIF animé (ou image) importé, ≤ 2 Mo (démo : 700 Ko),
   * enregistré tout de suite (indépendant d'« Enregistrer » : ce n'est pas un cosmétique à débloquer). Sans fichier :
   * l'avatar Discord et la bannière choisie ci-dessous.
   */
  function mediaBlock() {
    const max = backend.state.mode === 'demo' ? PROFILE_MEDIA_DEMO_MAX : PROFILE_MEDIA_MAX;
    const row = (kind: ProfileMediaKind, label: string, has: boolean) =>
      `<div class="cs-md-row"><span class="cs-md-l">${label}${has ? ' <b>✓ importée</b>' : ''}</span><button class="btn-ghost cs-md-b" data-media="${kind}"${isPending(`media-${kind}`) ? ' disabled' : ''}>${has ? 'Remplacer' : 'Importer un GIF'}</button>${has ? `<button class="btn-ghost cs-md-x" data-media="${kind}" data-rm="1"${isPending(`media-${kind}`) ? ' disabled' : ''} aria-label="Retirer ${kind === 'avatar' ? 'la photo' : 'la bannière'} importée">Retirer</button>` : ''}</div>`;
    return `<div class="cs-media"><div class="cs-t">Photo et bannière à toi <small>GIF animé (ou PNG, JPEG, WebP) · ${max >= 1024 * 1024 ? fmtMo(max) : `${Math.round(max / 1024)} Ko`} max · enregistré tout de suite · ${lessMotion.matches ? 'image fixe : « mouvements réduits » est activé' : 'lu en boucle, sans son'}</small></div>${row('avatar', 'Photo de profil', !!prof?.avatarMedia)}${row('banner', 'Bannière', !!prof?.bannerMedia)}</div>`;
  }
  function mediaAction(btn: HTMLButtonElement) {
    const kind = btn.dataset.media as ProfileMediaKind;
    const field = kind === 'avatar' ? 'avatarMedia' : 'bannerMedia';
    const send = (file: File | null) =>
      void guarded(`media-${kind}`, btn, async () => {
        try {
          const url = await busyButton(btn, backend.setProfileMedia(kind, file));
          prof = prof ? { ...prof, [field]: url } : prof;
          toast(file ? (kind === 'avatar' ? 'Photo de profil enregistrée' : 'Bannière enregistrée') : kind === 'avatar' ? 'Photo retirée : ton avatar Discord revient' : 'Bannière importée retirée', 'ok');
          shell.sfx.chime(2, 0.06);
        } catch (e) {
          toast(errMsg(e), 'err');
        }
        renderHead();
        if (cosmOpen) renderCosm();
      });
    if (btn.dataset.rm) return send(null);
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = PROFILE_MEDIA_TYPES.join(',');
    inp.addEventListener('change', () => {
      const f = inp.files?.[0];
      if (!f) return;
      // refus clair AVANT l'envoi (le serveur revérifie)
      const bad = profileMediaProblem(f.size, f.type, backend.state.mode === 'demo' ? PROFILE_MEDIA_DEMO_MAX : PROFILE_MEDIA_MAX);
      if (bad) return void toast(bad, 'err');
      send(f);
    });
    inp.click();
  }
  function renderCosm() {
    const st = statsOf();
    const achS = achievementStats(st, emptyEcon());
    const ok = { banner: new Set(unlockedIds(BANNERS, st)), frame: new Set(unlockedIds(FRAMES, st)), title: new Set(unlockedIds(TITLES, st)), badge: new Set(unlockedIds(BADGES, st)), accent: new Set(unlockedIds(ACCENTS, st)), vitrine: new Set(unlockedIds(VITRINES, st)) };
    /** « 🔒 Succès « … » : ouvre 500 boosters · 180/500 » */
    const lockLine = (c: Cosmetic) => {
      const a = c.need ? ACHIEVEMENTS.find((x) => x.id === c.need) : undefined;
      const cur = a ? Math.min(achS[a.stat] ?? 0, a.target) : 0;
      return `🔒 ${esc(c.how)}${a ? ` <em>${fmtN(cur)}/${fmtN(a.target)}</em>` : ''}`;
    };
    const TABS: Array<{ id: CosmTab; label: string; hint: string; items: Cosmetic[]; okSet: Set<string>; cls: string; sel: (c: Cosmetic) => boolean }> = [
      { id: 'banner', label: 'Bannière', hint: 'le fond du haut', items: BANNERS, okSet: ok.banner, cls: 'cs-banner', sel: (c) => (cosmDraft.banner ?? BANNERS[0].id) === c.id },
      { id: 'frame', label: 'Cadre', hint: 'autour de ta photo', items: FRAMES, okSet: ok.frame, cls: 'cs-frame', sel: (c) => (cosmDraft.frame ?? 'none') === c.id },
      { id: 'title', label: 'Titre', hint: 'sous ton pseudo (touche encore pour l’enlever)', items: TITLES, okSet: ok.title, cls: 'cs-title', sel: (c) => cosmDraft.title === c.id },
      { id: 'accent', label: 'Couleur', hint: 'les accents de ton profil (cadre, titre, onglets, bordures)', items: ACCENTS, okSet: ok.accent, cls: 'cs-accent', sel: (c) => (cosmDraft.accent ?? ACCENTS[0].id) === c.id },
      { id: 'vitrine', label: 'Vitrine', hint: 'le fond et la couleur de ta vitrine de cartes', items: VITRINES, okSet: ok.vitrine, cls: 'cs-vitrine', sel: (c) => (cosmDraft.vitrine ?? VITRINES[0].id) === c.id },
      { id: 'badge', label: 'Badges', hint: 'jusqu’à 5, dans l’ordre où tu les choisis', items: BADGES, okSet: ok.badge, cls: 'cs-badge', sel: (c) => (cosmDraft.badges ?? []).includes(c.id) },
    ];
    const tabDef = TABS.find((t) => t.id === cosmTab)!;
    // débloqués d'abord (l'ordre du catalogue est gardé à l'intérieur de chaque moitié)
    const items = [...tabDef.items].sort((a, b) => Number(tabDef.okSet.has(b.id)) - Number(tabDef.okSet.has(a.id)));
    const { okSet, cls, sel } = tabDef;
    const cells = items
      .map((c) => `<button class="cs ${cls}${sel(c) ? ' on' : ''}${okSet.has(c.id) ? '' : ' locked'}${cosmNew.has(`${cosmTab}:${c.id}`) ? ' new' : ''}" data-id="${esc(c.id)}" title="${esc(okSet.has(c.id) ? c.label : `${c.label} · ${c.how}`)}" aria-pressed="${sel(c)}" ${okSet.has(c.id) ? '' : 'aria-disabled="true"'}>${
        cls === 'cs-banner' ? `<span class="cs-sw" style="background:${c.css}"></span><b>${esc(c.label)}</b>` : cls === 'cs-frame' ? `<span class="cs-ring" style="--frame:${c.css}"></span><b>${esc(c.label)}</b>` : cls === 'cs-badge' ? `<span class="cs-g">${c.glyph ?? '●'}</span><b>${esc(c.label)}</b>` : cls === 'cs-accent' ? `<span class="cs-dot" style="background:${c.css}"></span><b>${esc(c.label)}</b>` : cls === 'cs-vitrine' ? `<span class="cs-sw cs-vit" style="background:${c.css};--vc:${accentColor(cosmDraft.vitrineColor) ?? accentColor(cosmDraft.accent) ?? '#e8927c'}"></span><b>${esc(c.label)}</b>` : `<b>${esc(c.label)}</b>`
      }${okSet.has(c.id) ? '' : `<small>${lockLine(c)}</small>`}</button>`)
    // couleur libre : juste après les couleurs débloquées (avant les verrouillées)
    // (retours 06/11) la couleur libre partout où on choisit une couleur : bannière, cadre, couleur du profil
    const pf = pickField(cosmTab);
    const pickCell = pf
      ? (() => {
          const v = cosmDraft[pf];
          const custom = /^#[0-9a-f]{6}$/i.test(v ?? '') ? v! : '';
          return `<label class="cs ${cls} cs-custom${custom ? ' on' : ''}" title="Choisis n’importe quelle couleur"><span class="cs-dot cs-dot-pick" style="background:${custom || 'conic-gradient(#ff6b6b, #ffd36b, #6bffb8, #6bc8ff, #c86bff, #ff6b6b)'}"><input type="color" value="${custom || accentColor(cosmDraft.accent) || ACCENTS[0].css}" aria-label="Couleur libre"></span><b>${custom ? esc(custom.toUpperCase()) : 'Libre…'}</b></label>`;
        })()
      : '';
    if (pickCell) cells.splice(items.filter((c) => okSet.has(c.id)).length, 0, pickCell);
    // vitrine : sa couleur, juste sous les fonds (couleurs débloquées + couleur libre)
    if (cosmTab === 'vitrine') {
      const vc = cosmDraft.vitrineColor;
      const custom = /^#[0-9a-f]{6}$/i.test(vc ?? '') ? vc! : '';
      cells.push(`</div><div class="cs-t">Couleur de la vitrine <small>bordure, lueur et étagère</small></div><div class="cs-list cs-vcl">` +
        `<button class="cs cs-vc${!vc ? ' on' : ''}" data-vc=""><span class="cs-dot" style="background:conic-gradient(var(--rose) 0 50%, #2a2220 0)"></span><b>Comme mon profil</b></button>` +
        ACCENTS.filter((a) => ok.accent.has(a.id)).map((a) => `<button class="cs cs-vc${vc === a.id ? ' on' : ''}" data-vc="${esc(a.id)}"><span class="cs-dot" style="background:${a.css}"></span><b>${esc(a.label)}</b></button>`).join('') +
        `<label class="cs cs-vc cs-custom-vc${custom ? ' on' : ''}"><span class="cs-dot cs-dot-pick" style="background:${custom || 'conic-gradient(#ff6b6b, #ffd36b, #6bffb8, #6bc8ff, #c86bff, #ff6b6b)'}"><input type="color" value="${custom || '#e8927c'}" aria-label="Couleur libre de la vitrine"></span><b>${custom ? esc(custom.toUpperCase()) : 'Libre…'}</b></label>`);
    }
    const list = cells.join('');
    // aperçu (collant) : bannière, avatar + cadre, pseudo, titre, badges
    const name = prof?.name ?? backend.state.user?.name ?? '';
    const bn = bannerOf(cosmDraft.banner);
    const fr = frameOf(cosmDraft.frame);
    const title = titleOf(cosmDraft.title);
    const badges = (cosmDraft.badges ?? []).map((id) => badgeOf(id)).filter((b): b is Cosmetic => !!b);
    const ava = avaHtml(name);
    const dirty = cosmKey(cosmDraft) !== cosmSaved;
    const acc = ACCENTS.find((a) => a.id === cosmDraft.accent);
    const summary = [bn.label, fr.id !== 'none' ? `Cadre ${fr.label}` : '', cosmDraft.accent && cosmDraft.accent !== ACCENTS[0].id ? `Couleur ${acc ? acc.label : cosmDraft.accent.toUpperCase()}` : '', title ? `« ${title.label} »` : '', badges.length ? plural(badges.length, 'badge') : ''].filter(Boolean).join(' · ');
    cosm.innerHTML =
      `<div class="cs-head"><b>Personnaliser mon profil</b><span class="muted">Tout se débloque en jouant — rien ne s’achète.</span></div>` +
      `<div class="cs-preview" aria-label="Aperçu"><div class="cs-pv-bn" style="background:${bn.css ?? ''}">${prof?.bannerMedia ? mediaHtml(prof.bannerMedia) : ''}</div><div class="pf-ava-wrap frame-${fr.id}" style="--frame:${fr.css ?? 'transparent'}"><div class="pf-ava">${ava}</div></div><div class="cs-pv-id"><b>${esc(name)}</b>${title ? `<span class="pf-title">${esc(title.label)}</span>` : ''}${badges.length ? `<span class="cs-pv-badges">${badges.map((b) => `<i title="${esc(b.label)}">${b.glyph ?? '●'}</i>`).join('')}</span>` : ''}</div></div>` +
      mediaBlock() +
      `<div class="seg cs-tabs" role="tablist" aria-label="Que personnaliser">${TABS.map((t) => `<button role="tab" data-tab="${t.id}" class="${t.id === cosmTab ? 'on' : ''}" aria-selected="${t.id === cosmTab}">${t.label} <em>${t.okSet.size}/${t.items.length}</em>${[...cosmNew].some((k) => k.startsWith(`${t.id}:`)) ? '<i class="pf-new-dot" aria-label="nouveau"></i>' : ''}</button>`).join('')}</div>` +
      `<div class="cs-group"><div class="cs-t">${tabDef.label} <small>${tabDef.hint} · ${okSet.size}/${tabDef.items.length} débloqué${okSet.size > 1 ? 's' : ''}</small></div><div class="cs-list">${list}</div></div>` +
      `<div class="cs-order"></div><div class="cs-actions"><span class="cs-sum">${dirty ? '<i class="cs-dirty" aria-hidden="true"></i>' : ''}<span>${esc(summary)}${dirty ? ' · <b>non enregistré</b>' : ''}</span></span><button class="btn-ghost cs-cancel">Annuler</button><button class="btn-primary cs-save"${dirty ? '' : ' disabled'}>Enregistrer</button></div>`;
    hydrateStills(cosm);
    cosm.querySelectorAll<HTMLButtonElement>('[data-media]').forEach((b) => b.addEventListener('click', () => mediaAction(b)));
    cosm.querySelectorAll<HTMLButtonElement>('.cs-tabs button').forEach((b) =>
      b.addEventListener('click', () => {
        cosmTab = b.dataset.tab as CosmTab;
        shell.sfx.tick(1.2, 0.04);
        renderCosm();
      }),
    );
    const renderOrder = () => {
      const o = cosm.querySelector<HTMLElement>('.cs-order')!;
      const list = cosmDraft.badges ?? [];
      o.innerHTML = cosmTab === 'badge' && list.length ? `<span class="cs-t">Ordre des badges</span>${list.map((id, i) => `<span class="cs-ord">${badgeOf(id)?.glyph ?? '●'} ${esc(badgeOf(id)?.label ?? id)}<button data-mv="-1" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Avant">◀</button><button data-mv="1" data-i="${i}" ${i === list.length - 1 ? 'disabled' : ''} aria-label="Après">▶</button></span>`).join('')}` : '';
      o.querySelectorAll<HTMLButtonElement>('button[data-mv]').forEach((b) =>
        b.addEventListener('click', () => {
          const i = Number(b.dataset.i), d = Number(b.dataset.mv);
          const l = cosmDraft.badges!;
          [l[i], l[i + d]] = [l[i + d], l[i]];
          renderCosm();
        }),
      );
    };
    renderOrder();
    cosm.querySelectorAll<HTMLButtonElement>('.cs:not(.cs-custom):not(.cs-vc)').forEach((b) =>
      b.addEventListener('click', () => {
        const id = b.dataset.id!;
        if (b.classList.contains('locked')) return toast(`Verrouillé : ${b.title.split(' · ')[1] ?? ''}`, 'info');
        if (b.classList.contains('cs-banner')) cosmDraft.banner = id;
        else if (b.classList.contains('cs-frame')) cosmDraft.frame = id;
        else if (b.classList.contains('cs-title')) cosmDraft.title = cosmDraft.title === id ? undefined : id;
        else if (b.classList.contains('cs-accent')) cosmDraft.accent = id === ACCENTS[0].id ? undefined : id;
        else if (b.classList.contains('cs-vitrine')) cosmDraft.vitrine = id === VITRINES[0].id ? undefined : id;
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
    // couleur de la vitrine
    const vcPreview = () => {
      prof = prof ? { ...prof, cosmetics: { ...cosmDraft, badges: [...(cosmDraft.badges ?? [])] } } : prof;
      renderHead();
    };
    cosm.querySelectorAll<HTMLButtonElement>('button.cs-vc').forEach((b) =>
      b.addEventListener('click', () => {
        cosmDraft.vitrineColor = b.dataset.vc || undefined;
        shell.sfx.tick(1.2, 0.04);
        vcPreview();
        renderCosm();
      }),
    );
    const vcPick = cosm.querySelector<HTMLInputElement>('.cs-custom-vc input');
    vcPick?.addEventListener('input', () => {
      cosmDraft.vitrineColor = vcPick.value.toLowerCase();
      applyVitrine(cosmDraft.vitrine, cosmDraft.vitrineColor);
      const dot = cosm.querySelector<HTMLElement>('.cs-custom-vc .cs-dot-pick');
      if (dot) dot.style.background = vcPick.value;
    });
    vcPick?.addEventListener('change', () => {
      cosmDraft.vitrineColor = vcPick.value.toLowerCase();
      vcPreview();
      renderCosm();
    });
    // couleur libre : aperçu en direct pendant qu'on glisse (sans reconstruire le panneau, sinon le sélecteur se ferme)
    const pick = cosm.querySelector<HTMLInputElement>('.cs-custom input');
    const pfield = pickField(cosmTab);
    pick?.addEventListener('input', () => {
      if (!pfield) return;
      cosmDraft[pfield] = pick.value.toLowerCase();
      if (pfield === 'accent') applyAccent(cosmDraft.accent);
      else {
        prof = prof ? { ...prof, cosmetics: { ...cosmDraft, badges: [...(cosmDraft.badges ?? [])] } } : prof;
        renderHead();
      }
      const dot = cosm.querySelector<HTMLElement>('.cs-custom .cs-dot-pick');
      if (dot) dot.style.background = pick.value;
    });
    pick?.addEventListener('change', () => {
      if (!pfield) return;
      cosmDraft[pfield] = pick.value.toLowerCase();
      shell.sfx.tick(1.2, 0.04);
      prof = prof ? { ...prof, cosmetics: { ...cosmDraft, badges: [...(cosmDraft.badges ?? [])] } } : prof;
      renderHead();
      renderCosm();
    });
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
    const pct = (st.uniques / Math.max(1, st.total || PUBLIC_CARD_COUNT)) * 100;
    const sd = prof?.streakDay ?? ((st.streak - 1) % STREAK_CYCLE) + 1;
    const cell = (v: string, l: string, cls = '') => `<div class="pf-stat ${cls}"><b>${v}</b><span>${l}</span></div>`;
    // les 3 chiffres clés (complétion, 6★, succès) juste APRÈS la vitrine (retours live 02 : la vitrine d'abord), puis le détail
    keysEl.innerHTML =
      cell(fmtPct(pct), `${fmtN(st.uniques)} / ${fmtN(st.total || PUBLIC_CARD_COUNT)} cartes uniques`, 'big') +
      cell(`✺ ${fmtN(st.mythics)}`, `${word(st.mythics, 'carte')} 6★`, 'mythic');
    stats.innerHTML =
      cell(fmtN(st.packsOpened), 'boosters ouverts') +
      (st.secrets ? cell(`✷ ${fmtN(st.secrets)}`, word(st.secrets, 'secrète'), 'secret') : '') +
      cell(st.streak ? `🔥 ${fmtN(st.streak)}` : '—', st.streak ? `jour${st.streak > 1 ? 's' : ''} d’affilée · ${Math.max(1, sd)}/${STREAK_CYCLE}` : 'série de connexion', 'streak') +
      cell(fmtN(st.tradesDone), word(st.tradesDone, 'échange conclu', 'échanges conclus')) +
      cell(fmtN(st.contractsSigned), word(st.contractsSigned, 'contrat signé', 'contrats signés')) +
      cell(fmtN(total), 'cartes en tout') +
      cell(fmtN(dups), word(dups, 'doublon')) +
      cell(fmtN(st.fullSubthemes), `album${st.fullSubthemes > 1 ? 's' : ''} à 100 %`);
    // succès débloqués (les 36 de l'espace Jeux) — remplace le « plus gros drop » (retours live n°1)
    // (perf : `eco.snapshot` est un calcul complet en démo — lu UNE fois, pas une fois par succès)
    const mySnap = () => (isMe() ? backend.eco.snapshot : null);
    const ach = prof?.achievements ?? ((snap) => (snap ? { done: ACHIEVEMENTS.filter((a) => achievementDone(a, snap.achievements.stats)).length, total: ACHIEVEMENTS.length } : null))(mySnap());
    if (ach) {
      const sc = h('a', 'pf-stat pf-ach');
      sc.href = '#/succes';
      sc.innerHTML = `<b>🏅 ${ach.done}<small>/${ach.total}</small></b><span>succès débloqués${isMe() ? ' · voir' : ''}</span><i class="pf-ach-bar"><i style="width:${((ach.done / ach.total) * 100).toFixed(1)}%"></i></i>`;
      if (!isMe()) sc.removeAttribute('href');
      keysEl.append(sc);
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
    // retours live 02 : les 12 cases toujours (plus de « Voir les 12 » au téléphone), au premier écran
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
    pickStarsEl.querySelectorAll<HTMLElement>('.chip').forEach((b) => (b.classList.toggle('on', b.dataset.r === pickStar), b.setAttribute('aria-pressed', String(b.dataset.r === pickStar))));
    const all = [...ownedOf()].sort(best).filter((c) => (!pickStar || c.rarity === pickStar) && (!qq || fold(catalogEntry(c.cardId)?.name ?? '').includes(qq)));
    const list = all.slice(0, PICK_CAP);
    // liste tronquée : on le dit (audit UX3-20)
    pickMore.hidden = all.length <= PICK_CAP;
    pickMore.textContent = `${fmtN(PICK_CAP)} sur ${fmtN(all.length)} · affine ta recherche ou filtre par étoiles`;
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
  const PICK_CAP = 240;
  const pickStarsEl = q('.pf-pick-stars');
  const pickMore = q('.pf-pick-more');
  let pickStar: RarityId | null = null;
  for (const r of [...STARS, 'secret'] as RarityId[]) {
    const b = h('button', 'chip', r === 'secret' ? '✷' : `${rarity(r).rank + 1}★`);
    b.dataset.r = r;
    b.title = rarity(r).label;
    b.style.setProperty('--rc', rarity(r).hex);
    // texte lisible pour Rare / Épique (UX5-09), la teinte de la carte ne change pas
    b.style.setProperty('--rt', r === 'epic' ? '#e0607a' : r === 'rare' ? '#6f9be0' : rarity(r).hex);
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => ((pickStar = pickStar === r ? null : r), renderPicker()));
    pickStarsEl.append(b);
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
    const nob = q('.pf-nobinder');
    nob.hidden = !!b;
    nob.innerHTML = isMe() ? 'Pas de classeur épinglé. Crée un classeur dans <a class="p-link" href="#/collection/classeurs">ta collection</a> et épingle-le : il s’affichera ici, visible des potes.' : 'Pas de classeur épinglé.';
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
    if (b.cards.length > 24) g.append(h('div', 'muted', `+ ${fmtN(b.cards.length - 24)} autres`));
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
    const ICON: Record<string, string> = { pull: '✦', mythic_pull: '✺', secret_pull: '✷', trade: '⇄', contract: '⚖', joined: '👋', achievement: '🏅' };
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
  }

  async function load(id: string) {
    const my = ++token;
    who = id;
    editing = false;
    cosmOpen = false;
    cosm.hidden = true;
    picker.hidden = true;
    activity = null;
    leaderLoaded = false;
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
    // « Équiper → » depuis les succès : le panneau de personnalisation s'ouvre tout de suite
    if (isMe() && sessionStorage.getItem('bebou.openCosm')) {
      sessionStorage.removeItem('bebou.openCosm');
      openCosm();
      cosm.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
    if (tab === 'activite') void loadActivity();
    if (tab === 'classement') ((leaderLoaded = true), void leaderboard.load());
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
      // #/profil/classement : la page dédiée #/classement (même composant, sans l'en-tête du profil devant : UX3-17)
      if (id === 'classement') {
        location.replace('#/classement');
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
