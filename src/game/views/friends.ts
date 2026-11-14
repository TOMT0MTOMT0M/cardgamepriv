import { t as tr } from '../../core/i18n';
import '../../core/i18n/fr/game.views.friends'; // (textes de ce module, version anglaise)
import { friendState, isOnline, type FriendLink, type FriendRequest, type GameBackend, type Social } from '../backend';
import type { Shell } from '../shell';
import { busyButton, errMsg, esc, h, loginPrompt, navigate, plural, toast } from '../ui';
import { feedText } from '../msgView';
import { statusText } from '../../core/msgRefs';
import { confirmTap, guarded } from './safety';
import { REFERRAL, referralLink } from '../../core/referral';

/**
 * AMIS (#/amis — retours live 02, point 8, lot A2) : demander quelqu'un en ami par son pseudo exact (ou depuis son
 * profil / le classement), répondre aux demandes reçues, annuler les envoyées, retrouver ses amis (en ligne, vu il y
 * a…, dernière activité) et aller sur leur profil d'un toucher. Les échanges restent ouverts à TOUS les joueurs.
 *
 * Mise en page : ordinateur (≥ 900 px) = deux colonnes, la liste d'amis à gauche, « Ajouter » + demandes à droite
 * (colonne collante) ; téléphone = une colonne, « Ajouter » et les demandes reçues d'abord (ce qui attend une action).
 */
export interface FriendsView {
  el: HTMLElement;
  enter(sub?: string): void;
  leave(): void;
}

/** « à l'instant », « il y a 12 min », « il y a 3 h », « hier », « il y a 4 j » */
export function ago(t: number, now = Date.now()): string {
  const s = Math.max(0, (now - t) / 1000);
  if (s < 60) return tr('time.justNow');
  if (s < 3600) return tr('time.agoMin', { n: Math.floor(s / 60) });
  if (s < 86400) return tr('time.agoH', { n: Math.floor(s / 3600) });
  const d = Math.floor(s / 86400);
  return d === 1 ? tr('time.yesterday') : tr('time.agoD', { n: d });
}
/**
 * Bouton « ami » réutilisable (profil d'un autre joueur, lignes du classement) : son libellé suit l'état du lien
 * (rien → « Ajouter en ami », envoyée → « Demande envoyée » (2e toucher = annuler), reçue → « Accepter », ami → « ✓ Ami »
 * qui mène à #/amis). Un seul écouteur de clic (délégué) et une seule mise à jour pour tous les boutons de la page.
 * Rien (chaîne vide) pour soi-même, hors connexion ou tant que les amis ne sont pas arrivés.
 */
export function friendBtn(backend: GameBackend, userId: string, name: string, variant: 'profile' | 'row' = 'profile'): string {
  installFriendBtns(backend);
  const s = backend.state.social;
  if (!backend.state.user || !userId || userId === backend.state.user.id || userId === 'me') return '';
  // (amis pas encore arrivés : bouton caché, il apparaît avec la réponse du serveur)
  const v = btnLook(s.ready ? friendState(s, userId).kind : 'none', variant);
  return `<button class="fr-btn ${variant === 'row' ? 'fr-row' : 'btn-ghost'} k-${v.k}" data-uid="${esc(userId)}" data-name="${esc(name)}" data-v="${variant}" aria-label="${esc(v.aria(name))}"${s.ready ? '' : ' hidden'}>${v.label}</button>`;
}
function btnLook(k: 'none' | 'out' | 'in' | 'friend', variant: 'profile' | 'row') {
  const row = variant === 'row';
  const L = {
    none: { label: row ? tr('am.addShort') : tr('am.add'), aria: (n: string) => tr('am.addTitle', { n }) },
    out: { label: row ? tr('am.sentShort') : tr('am.sent'), aria: (n: string) => tr('am.sentTitle', { n }) },
    in: { label: row ? tr('am.accept') : tr('am.acceptLong'), aria: (n: string) => tr('am.acceptTitle', { n }) },
    friend: { label: row ? tr('am.isFriend') : tr('am.isFriend'), aria: (n: string) => tr('am.isFriendTitle', { n }) },
  }[k];
  return { k, ...L };
}
let btnsFor: GameBackend | null = null;
function installFriendBtns(backend: GameBackend) {
  if (btnsFor === backend) return;
  btnsFor = backend;
  // les libellés suivent l'état (demande acceptée par l'autre, réponse depuis un autre appareil…)
  const refresh = (st: GameBackend['state']) => {
    const btns = document.querySelectorAll<HTMLElement>('.fr-btn[data-uid]');
    if (!btns.length) return;
    for (const b of btns) {
      if (b.dataset.armedAt || b.dataset.busy) continue;
      const hide = !st.user || !st.social.ready;
      if (b.hidden !== hide) b.hidden = hide;
      if (hide) continue;
      const v = btnLook(friendState(st.social, b.dataset.uid!).kind, b.dataset.v === 'row' ? 'row' : 'profile');
      if (b.classList.contains(`k-${v.k}`) && b.textContent === v.label) continue;
      b.classList.remove('k-none', 'k-out', 'k-in', 'k-friend');
      b.classList.add(`k-${v.k}`);
      b.textContent = v.label;
      b.setAttribute('aria-label', v.aria(b.dataset.name ?? ''));
    }
  };
  backend.onChange(refresh);
  document.addEventListener('click', (e) => {
    const b = (e.target as Element | null)?.closest?.<HTMLElement>('.fr-btn[data-uid]');
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    const uid = b.dataset.uid!;
    const name = b.dataset.name ?? '';
    const st = friendState(backend.state.social, uid);
    if (st.kind === 'friend') return void navigate('#/amis');
    if (st.kind === 'out' && !confirmTap(b, tr('am.cancelQ'))) return;
    void guarded(`fr-u-${uid}`, null, async () => {
      try {
        if (st.kind === 'none') {
          const r = await busyButton(b, backend.requestFriend({ userId: uid }));
          toast(r.status === 'accepted' ? tr('am.mutual', { name: r.name }) : tr('am.sentTo', { name: r.name }), 'ok');
        } else if (st.kind === 'in') {
          await busyButton(b, backend.acceptFriend(st.req.id));
          toast(tr('am.nowFriends', { name }), 'ok');
        } else if (st.kind === 'out') {
          await busyButton(b, backend.cancelFriend(st.req.id));
          toast(tr('am.cancelled', { name }), 'ok');
        }
      } catch (err) {
        toast(errMsg(err), 'err');
      }
      // (pendant l'attente le bouton était « occupé » : la mise à jour l'avait sauté)
      refresh(backend.state);
    });
  });
}

const ACT_ICON: Record<string, string> ={ pull: '✦', mythic_pull: '✺', secret_pull: '✷', trade: '⇄', contract: '⚖', joined: '👋', game: '🎲' };

/** Messages d'un parrainage refusé (onglet Amis et arrivée par un lien). */
export const REF_FAIL = {
  already: tr('am.ref.already'),
  invalid: tr('am.ref.notFound'),
  self: tr('am.ref.self'),
  tooLate: tr('am.ref.tooLate', { days: Math.round(REFERRAL.newAccountMs / 86_400_000), nth: REFERRAL.packsToPay + 1 }),
} as const;

export function createFriendsView(backend: GameBackend, shell: Shell): FriendsView {
  const el = h('section', 'view amis'); // i18n-ok
  el.innerHTML = `
    <div class="am-wrap">
      <header class="am-head"><span class="kicker">${tr('am.kicker')}</span><h1>${tr('am.title')}</h1><p class="muted am-sum"></p></header>
      <div class="am-login" hidden></div>
      <div class="am-grid">
        <aside class="am-side">
          <section class="am-card am-ref" aria-labelledby="am-ref-t">
            <h2 id="am-ref-t">${tr('notif.k.referral')}</h2>
            <p class="muted am-ref-rules">${tr('am.ref.rules', { n: REFERRAL.packs, k: REFERRAL.packsToPay })}</p>
            <div class="am-ref-link"><input class="search am-ref-in" type="text" readonly aria-label="${tr('am.ref.myLink')}" value="…"><button class="btn-primary am-ref-copy" type="button" disabled>${tr('am.copy')}</button></div>
            <p class="am-ref-stats muted"></p>
            <div class="am-list am-ref-list"></div>
            <p class="muted am-ref-mine" hidden></p>
            <form class="am-ref-claim" hidden autocomplete="off">
              <label class="am-ref-q" for="am-ref-claim-in">${tr('am.ref.invited')}</label>
              <div class="am-ref-link"><input id="am-ref-claim-in" class="search am-ref-claim-in" type="text" maxlength="200" placeholder="${tr('am.ref.field')}" spellcheck="false" autocapitalize="none" enterkeyhint="send"><button class="btn-primary am-ref-claim-go" type="submit">${tr('am.ok')}</button></div>
            </form>
          </section>
          <form class="am-card am-add" autocomplete="off">
            <h2 id="am-add-t">${tr('am.addTitleH')}</h2>
            <div class="am-add-row">
              <input class="search am-input" type="text" name="pseudo" maxlength="64" placeholder="Pseudo exact" aria-labelledby="am-add-t" spellcheck="false" autocapitalize="none" enterkeyhint="send">
              <button class="btn-primary am-send" type="submit">${tr('am.ask')}</button>
            </div>
            <p class="muted am-hint">${tr('am.addHelp')}</p>
          </form>
          <section class="am-card am-in" aria-labelledby="am-in-t"><h2 id="am-in-t">${tr('am.incoming')} <b class="am-n"></b></h2><div class="am-list"></div></section>
          <section class="am-card am-out" aria-labelledby="am-out-t"><h2 id="am-out-t">${tr('am.outgoing')} <b class="am-n"></b></h2><div class="am-list"></div></section>
        </aside>
        <section class="am-card am-main" aria-labelledby="am-f-t"><h2 id="am-f-t">${tr('nav.friends.aria')} <b class="am-n"></b></h2><div class="am-list am-friends"></div></section>
      </div>
      <p class="muted am-foot">${tr('am.openToAll')}</p>
    </div>`;
  const q = <T extends HTMLElement>(s: string) => el.querySelector<T>(s)!;
  const form = q<HTMLFormElement>('.am-add');
  const input = q<HTMLInputElement>('.am-input');
  const sendBtn = q<HTMLButtonElement>('.am-send');
  const loginEl = q('.am-login');
  const grid = q('.am-grid');
  const sumEl = q('.am-sum');
  const inSec = q('.am-in');
  const outSec = q('.am-out');
  const mainSec = q('.am-main');

  /** action sur une demande / un lien : une seule à la fois par ligne, même si la liste est redessinée entre-temps */
  const act = (key: string, btn: HTMLElement, run: () => Promise<unknown>, ok?: string) =>
    void guarded(key, null, async () => {
      try {
        await busyButton(btn, run());
        if (ok) toast(ok, 'ok');
      } catch (e) {
        toast(errMsg(e), 'err');
      }
    });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = input.value.trim();
    if (!name) {
      toast(tr('am.typeName'), 'info');
      input.focus();
      return;
    }
    void guarded('friend-request', null, async () => {
      try {
        const r = await busyButton(sendBtn, backend.requestFriend({ name }));
        input.value = '';
        toast(r.status === 'accepted' ? tr('am.mutual', { name: r.name }) : tr('am.sentTo2', { name: r.name }), 'ok');
        shell.sfx.tick(1.3, 0.05);
      } catch (err) {
        toast(errMsg(err), 'err');
        input.focus();
      }
    });
  });

  const ava = (p: { name: string; avatarUrl?: string }, online?: boolean) =>
    `<span class="am-ava${online ? ' on' : ''}">${p.avatarUrl ? `<img src="${esc(p.avatarUrl)}" alt="" loading="lazy">` : `<span>${esc(p.name.slice(0, 1).toUpperCase() || '?')}</span>`}${online === undefined ? '' : `<i class="am-dot" aria-hidden="true"></i>`}</span>`;
  const profileHref = (userId: string) => `#/profil/${encodeURIComponent(userId)}`;

  function reqRow(r: FriendRequest, kind: 'in' | 'out'): HTMLElement {
    const row = h('div', `am-row am-req k-${kind}`);
    row.innerHTML = `<a class="am-who" href="${profileHref(r.userId)}" aria-label="${tr('am.profileOf', { name: esc(r.name) })}">${ava(r)}<span class="am-txt"><b>${esc(r.name)}</b><small>${kind === 'in' ? tr('am.asksYou') : tr('am.requestSent')} · ${ago(r.createdAt)}</small></span></a>
      <span class="am-acts">${kind === 'in' ? `<button class="btn-primary am-ok">${tr('am.accept')}</button><button class="btn-ghost am-no">${tr('am.refuse')}</button>` : `<button class="btn-ghost am-cancel">${tr('am.cancel')}</button>`}</span>`;
    const ok = row.querySelector<HTMLElement>('.am-ok');
    ok?.addEventListener('click', () => act(`fr-${r.id}`, ok, () => backend.acceptFriend(r.id), tr('am.nowFriends', { name: r.name })));
    const no = row.querySelector<HTMLElement>('.am-no');
    no?.addEventListener('click', () => act(`fr-${r.id}`, no, () => backend.declineFriend(r.id), tr('am.refused', { name: r.name })));
    const cancel = row.querySelector<HTMLElement>('.am-cancel');
    cancel?.addEventListener('click', () => act(`fr-${r.id}`, cancel, () => backend.cancelFriend(r.id), tr('am.cancelled', { name: r.name })));
    return row;
  }

  function friendRow(f: FriendLink, now: number): HTMLElement {
    const on = isOnline(f, now);
    const row = h('div', `am-row am-friend${on ? ' is-on' : ''}`);
    const seen = on ? `<span class="am-live">${tr('am.online')}</span>${f.status ? ` · ${esc(statusText(f.status))}` : ''}` : tr('am.seen', { when: ago(f.lastSeenAt, now) });
    const a = f.lastActivity;
    row.innerHTML = `<a class="am-who" href="${profileHref(f.userId)}" aria-label="${tr('am.profileOfOn', { name: esc(f.name), on: on ? tr('am.onlineSuffix') : '' })}">${ava(f, on)}<span class="am-txt"><b>${esc(f.name)}</b><small class="am-seen">${seen}</small>${a ? `<small class="am-act"><i aria-hidden="true">${ACT_ICON[a.kind] ?? '•'}</i> ${esc(feedText(a))} · ${ago(a.createdAt, now)}</small>` : `<small class="am-act">${plural(f.packsOpened, 'booster ouvert', 'boosters ouverts')}</small>`}</span></a>
      <span class="am-acts"><a class="btn-ghost am-prof" href="${profileHref(f.userId)}">${tr('am.profile')}</a><button class="btn-ghost am-rm" aria-label="${tr('am.removeTitle', { name: esc(f.name) })}">${tr('am.remove')}</button></span>`;
    const rm = row.querySelector<HTMLElement>('.am-rm')!;
    rm.addEventListener('click', () => {
      if (!confirmTap(rm, tr('am.removeQ'))) return;
      act(`fr-${f.id}`, rm, () => backend.removeFriend(f.id), tr('am.removed', { name: f.name }));
    });
    return row;
  }

  let sig = '';
  const sigOf = (s: Social, now: number) =>
    JSON.stringify([s.ready, !!backend.state.user, s.incoming.map((r) => r.id), s.outgoing.map((r) => r.id), s.friends.map((f) => [f.id, f.name, f.status, isOnline(f, now), f.lastActivity?.createdAt ?? 0, Math.floor((now - f.lastSeenAt) / 60000)])]);

  function render(force = false) {
    const s = backend.state.social;
    const now = Date.now();
    const next = sigOf(s, now);
    if (!force && next === sig) return;
    // « Retirer ? » armé : on n'efface pas la confirmation en cours (le prochain passage redessinera)
    if (!force && el.querySelector('.am-rm.armed')) return;
    sig = next;
    const logged = !!backend.state.user;
    loginEl.hidden = logged;
    grid.hidden = !logged;
    if (!logged) {
      loginEl.innerHTML = loginPrompt(backend,tr('am.login'));
      loginEl.querySelector('.login-cta')?.addEventListener('click', () => backend.login());
      sumEl.textContent = tr('am.pitch');
      return;
    }
    const onlineN = s.friends.filter((f) => isOnline(f, now)).length;
    sumEl.textContent = !s.ready ? tr('common.loading2') : s.friends.length ? tr('am.countOnline', { friends: plural(s.friends.length, 'ami'), n: onlineN }) : tr('am.emptyPitch');

    const fill = (sec: HTMLElement, rows: HTMLElement[], empty: string) => {
      const n = sec.querySelector<HTMLElement>('.am-n')!;
      n.textContent = rows.length ? String(rows.length) : '';
      const list = sec.querySelector<HTMLElement>('.am-list')!;
      list.replaceChildren(...rows);
      if (!rows.length) list.innerHTML = `<div class="muted am-empty">${empty}</div>`;
    };
    if (!s.ready) {
      fill(mainSec, [], tr('common.loading2'));
      inSec.hidden = outSec.hidden = true;
      return;
    }
    fill(mainSec, s.friends.map((f) => friendRow(f, now)), tr('am.none'));
    fill(inSec, s.incoming.map((r) => reqRow(r, 'in')), tr('am.noReq'));
    fill(outSec, s.outgoing.map((r) => reqRow(r, 'out')), '');
    inSec.classList.toggle('has', s.incoming.length > 0);
    // « Envoyées » n'apparaît que s'il y en a (moins de bruit)
    outSec.hidden = !s.outgoing.length;
  }

  // ── parrainage (retours live 02, §10)
  const refIn = q<HTMLInputElement>('.am-ref-in');
  const refCopy = q<HTMLButtonElement>('.am-ref-copy');
  const refStats = q('.am-ref-stats');
  const refList = q('.am-ref-list');
  const refMine = q('.am-ref-mine');
  const refClaim = q<HTMLFormElement>('.am-ref-claim');
  const refClaimIn = q<HTMLInputElement>('.am-ref-claim-in');
  let refAt = 0;
  let refFor: string | undefined;
  async function loadReferral() {
    // (audit 12/11, S11 / A5-07) `referrals.mine` est une mutation : au plus une fois toutes les 2 min sur la page
    // (avant : à chaque entrée sur Amis et jusqu'à 3 fois par minute au fil des émissions) ; remise à zéro après un geste
    if (backend.state.user?.id !== refFor) ((refFor = backend.state.user?.id), (refAt = 0)); // autre compte : son lien à lui
    if (!backend.state.user || Date.now() - refAt < 120_000) return;
    refAt = Date.now();
    try {
      const r = await backend.referral();
      const link = referralLink(location.origin, r.code);
      refIn.value = link;
      refCopy.disabled = false;
      refStats.innerHTML = `<b>${plural(r.clicks, 'personne a cliqué', 'personnes ont cliqué')}</b> ${tr('am.ref.clicked', { x: plural(r.referrals.length, 'filleul') })}`; // i18n-ok
      refMine.hidden = !r.myReferrer;
      refMine.textContent = r.myReferrer ? tr('am.ref.mine', { name: r.myReferrer }) : '';
      refClaim.hidden = !r.canClaim;
      refList.replaceChildren(
        ...r.referrals.map((k) => {
          const row = h('div', 'am-row am-ref-row');
          row.innerHTML = `<a class="am-who" href="${profileHref(k.userId)}">${ava(k)}<span class="am-txt"><b>${esc(k.name)}</b><small>${k.paid ? tr('am.ref.got', { n: REFERRAL.packs }) : `${Math.min(k.packsOpened, REFERRAL.packsToPay)}/${REFERRAL.packsToPay} boosters ouverts`}</small></span></a>`;
          return row;
        }),
      );
    } catch (e) {
      refAt = 0;
      refStats.textContent = errMsg(e);
    }
  }
  // (07/11) parrainage perdu (lien ouvert dans le navigateur de Discord, compte créé ailleurs) : le filleul colle le
  // lien ou le pseudo de son parrain — tant que son compte est neuf
  refClaim.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const v = refClaimIn.value.trim();
    if (!v) return refClaimIn.focus();
    const btn = q<HTMLButtonElement>('.am-ref-claim-go');
    btn.disabled = true;
    try {
      const r = await backend.referralClaim(v);
      if (r.status === 'ok') {
        toast(tr('am.ref.welcome', { name: r.referrer ?? tr('ref.yourSponsor'), n: r.packs ?? REFERRAL.packs }), 'ok');
        refClaimIn.value = '';
        refAt = 0;
        void loadReferral();
      } else toast(REF_FAIL[r.status], r.status === 'already' ? 'info' : 'err');
    } catch (e) {
      toast(errMsg(e), 'err');
    } finally {
      btn.disabled = false;
    }
  });
  refIn.addEventListener('focus', () => refIn.select());
  refCopy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(refIn.value);
      toast(tr('am.copied'), 'ok');
    } catch {
      refIn.focus();
      refIn.select();
      toast(tr('am.selected'), 'info');
    }
  });

  let tick = 0;
  backend.onChange(() => el.isConnected && (render(), void loadReferral()));
  return {
    el,
    enter() {
      shell.show(null);
      shell.setDimmed(true);
      el.scrollTo({ top: 0 });
      render(true);
      void loadReferral();
      // « en ligne » / « vu il y a… » : relus toutes les 30 s (les battements de cœur des amis n'émettent pas)
      clearInterval(tick);
      tick = window.setInterval(() => document.hidden || render(), 30_000);
    },
    leave() {
      clearInterval(tick);
    },
  };
}
