/**
 * NOTIFICATIONS PUSH côté jeu (V2, docs/IDEES-V2.md §1) : enregistrement du service worker (public/sw.js),
 * abonnement de CET appareil (clé VAPID publique lue sur le serveur), préférences par type, et la petite fiche
 * « Notifications » du profil (bouton Activer / Couper, cases à cocher, test, guide iPhone).
 *
 * iPhone : les notifications web n'existent que pour une appli ajoutée à l'écran d'accueil (iOS 16.4+) → on
 * l'explique en 2 étapes tant que le jeu tourne dans Safari.
 */
import { t } from '../core/i18n';
import type { GameBackend } from './backend';
import { siteUrl } from '../core/siteRoot';
import { busyButton, errMsg, esc, h, popLayer, pushLayer, toast } from './ui';
import { haptics } from '../core/haptics';

/** (fonction : les libellés suivent la langue) */
export const KIND_LABELS = (): Array<[string, string, string]> => [
  ['reserve', t('notif.k.reserve'), t('notif.k.reserveD')],
  ['trade', t('nav.trades.label'), t('notif.k.tradeD')],
  ['friend', t('nav.friends.aria'), t('notif.k.friendD')],
  ['referral', t('notif.k.referral'), t('notif.k.referralD')],
  ['game', t('notif.k.games'), t('notif.k.gamesD')],
  ['chat', t('notif.k.chat'), t('notif.k.chatD')],
  ['roulette', t('notif.k.roulette'), t('notif.k.rouletteD')],
  ['news', t('notif.k.news'), t('notif.k.newsD')],
];

const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; // i18n-ok
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

let regP: Promise<ServiceWorkerRegistration | null> | null = null;
/** Enregistre le service worker (une fois) ; null si pas possible ici. */
export function registerSw(): Promise<ServiceWorkerRegistration | null> {
  if (!supported()) return Promise.resolve(null);
  return (regP ??= navigator.serviceWorker.register(siteUrl('sw.js'), { scope: siteUrl('') }).catch((e) => {
    console.warn('[notif] service worker', e);
    return null;
  }));
}

function b64ToU8(b64: string): Uint8Array {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function currentSub(): Promise<PushSubscription | null> {
  const reg = await registerSw();
  return reg ? await reg.pushManager.getSubscription() : null;
}

const subJson = (s: PushSubscription) => {
  const j = s.toJSON();
  return { endpoint: s.endpoint, keys: { p256dh: j.keys!.p256dh, auth: j.keys!.auth } };
};

/** Au lancement : si cet appareil est déjà abonné, on renvoie l'abonnement au serveur (clés renouvelées, nouveau compte…). */
export async function syncPush(backend: GameBackend): Promise<void> {
  if (!backend.push || !supported()) return;
  try {
    const s = await currentSub();
    if (!s) return;
    // (audit 12/11, S11 / E1-07) déjà envoyé pour ce compte et cet abonnement depuis moins d'un jour : pas d'appel
    // (avant : une mutation à chaque chargement de l'appli). Clés renouvelées ou autre compte → l'empreinte change.
    // (un jour, pas plus : le serveur retire un abonnement après 3 envois ratés ; il est ainsi recréé dès le lendemain)
    const j = subJson(s);
    const uid = backend.state.user?.id; // compte pas encore connu : on envoie, sans rien retenir
    const print = `${uid ?? ''}|${j.endpoint}|${j.keys.p256dh}`;
    const KEY = 'bebou.pushSync';
    try {
      const [p, at] = (localStorage.getItem(KEY) ?? '').split('\n');
      if (uid && p === print && Date.now() - Number(at) < 86400_000) return;
    } catch {
      /* stockage bloqué : on envoie */
    }
    await backend.push.subscribe(j);
    try {
      if (uid) localStorage.setItem(KEY, `${print}\n${Date.now()}`);
    } catch {
      /* ignore */
    }
  } catch {
    /* hors ligne, pas grave */
  }
}

async function enable(backend: GameBackend): Promise<void> {
  const key = await backend.push!.publicKey();
  if (!key) throw new Error('Notifications pas encore activées côté serveur (lanceur activer-notifications.cmd).');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Autorisation refusée : à changer dans les réglages du navigateur.');
  const reg = await registerSw();
  if (!reg) throw new Error('Service worker indisponible.');
  let s = await reg.pushManager.getSubscription();
  if (!s) s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(key) as BufferSource });
  await backend.push!.subscribe(subJson(s));
  flag(OFF_KEY, false);
  flag(NO_KEY, false);
}

/** (v2.0.7) choix retenus sur l'appareil : « coupées ici » (bouton du profil) et « non merci » (fiche de demande) */
const OFF_KEY = 'bebou.pushOff';
const NO_KEY = 'bebou.pushNo';
function flag(key: string, on?: boolean): boolean {
  try {
    if (on === undefined) return localStorage.getItem(key) === '1';
    if (on) localStorage.setItem(key, '1');
    else localStorage.removeItem(key);
  } catch {
    /* stockage bloqué */
  }
  return !!on;
}

/**
 * (v2.0.7, demande de Tom) DEMANDE D'ACTIVATION À CHAQUE CONNEXION : tant que le joueur n'a ni accepté ni refusé, le
 * jeu lui propose d'activer les notifications à chaque lancement (le navigateur n'affiche sa propre demande qu'après un
 * toucher : d'où la fiche et son bouton). Déjà autorisé mais pas abonné sur cet appareil : abonné tout seul, sans fiche.
 * « Non merci », notifications coupées depuis le profil, ou refus dans le navigateur : plus de demande — tout se
 * réactive depuis la fiche « Notifications » du profil. iPhone hors écran d'accueil : la fiche explique les 2 étapes.
 */
let asked = false;
export async function promptPush(backend: GameBackend): Promise<void> {
  if (asked || !backend.push || !backend.state.user || flag(NO_KEY) || flag(OFF_KEY)) return;
  const ios = isIOS() && !standalone();
  if (!supported() && !ios) return;
  asked = true;
  if (supported()) {
    if (Notification.permission === 'denied') return;
    if (Notification.permission === 'granted') {
      if (!(await currentSub().catch(() => null))) await enable(backend).catch(() => undefined);
      return;
    }
    if (!(await backend.push.publicKey().catch(() => null))) return; // pas configurées côté serveur : rien à demander
  }
  const veil = h('div', 'ow-veil nf-ask');
  veil.innerHTML = `<div class="ow" role="dialog" aria-modal="true" aria-label="${t('notif.on')}">
    <div class="ow-h"><div class="ow-id"><span class="ow-k">${t('notif.ask.k')}</span><span class="ow-me">${t('notif.ask.title')}</span></div><button class="ow-x" aria-label="${t('common.close')}">✕</button></div>
    <div class="nf-ask-b">
      <p>${t('notif.ask.body')}</p>
      ${ios ? `<div class="nf-ios"><b>${t('notif.ios.title')}</b><ol><li>${t('notif.ios.step1')}</li><li>${t('notif.ios.step2')}</li></ol></div>` : ''}
      <div class="nf-ask-a">${ios ? '' : `<button class="btn-primary nf-ask-ok">${t('notif.on')}</button>`}<button class="btn-ghost nf-ask-later">${t('notif.ask.later')}</button><button class="linkish nf-ask-no">${t('notif.ask.no')}</button></div>
      <small class="muted">${t('notif.ask.where')}</small>
    </div></div>`;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    popLayer(close);
    veil.classList.remove('on');
    setTimeout(() => veil.remove(), 260);
  };
  document.body.append(veil);
  pushLayer(close);
  requestAnimationFrame(() => veil.classList.add('on'));
  veil.addEventListener('click', (e) => e.target === veil && close());
  veil.querySelector('.ow-x')!.addEventListener('click', close);
  veil.querySelector('.nf-ask-later')!.addEventListener('click', close);
  veil.querySelector('.nf-ask-no')!.addEventListener('click', () => {
    flag(NO_KEY, true);
    toast(t('notif.ask.noToast'), 'info');
    close();
  });
  const ok = veil.querySelector<HTMLButtonElement>('.nf-ask-ok');
  ok?.addEventListener('click', () =>
    busyButton(ok, (async () => {
      try {
        await enable(backend);
        toast(t('notif.onToast'), 'ok');
      } catch (e) {
        toast(errMsg(e), 'err');
      }
      close();
    })()),
  );
}

async function disable(backend: GameBackend): Promise<void> {
  const s = await currentSub();
  if (!s) return;
  await backend.push!.unsubscribe(s.endpoint).catch(() => undefined);
  await s.unsubscribe();
  flag(OFF_KEY, true); // coupées exprès sur cet appareil : la demande du lancement ne revient pas
}

/** La fiche « Notifications » du profil (section Compte). */
export function notifPanel(backend: GameBackend): HTMLElement {
  const box = h('div', 'nf-box');
  if (!backend.push) {
    box.innerHTML = '<span class="muted">' + t('notif.demo') + '</span>';
    return box;
  }
  if (!supported()) {
    box.innerHTML = isIOS() && !standalone()
      ? `<div class="nf-ios"><b>${t('notif.ios.title')}</b><ol><li>${t('notif.ios.step1')}</li><li>${t('notif.ios.step2')}</li></ol></div>`
      : '<span class="muted">' + t('notif.unsupported') + '</span>';
    return box;
  }
  const render = async () => {
    const s = await currentSub().catch(() => null);
    const st = await backend.push!.status(s?.endpoint ?? undefined).catch(() => null);
    if (!st) return (box.innerHTML = '<span class="muted">' + t('notif.unavailable') + '</span>');
    const on = st.thisDevice && Notification.permission === 'granted';
    box.innerHTML = `
      <div class="nf-row"><button class="${on ? 'btn-ghost' : 'btn-primary'} nf-toggle">${on ? t('notif.off') : t('notif.on')}</button>
        <span class="muted">${!st.configured ? t('notif.notConfigured') : on ? t('notif.thisDevice', { total: st.devices > 1 ? t('notif.total', { n: st.devices }) : '' }) : st.devices ? t('notif.others', { n: st.devices }) : t('notif.pitch')}</span></div>
      ${st.devices ? `<div class="nf-prefs">${KIND_LABELS().map(([k, l, d]) => `<label class="nf-k"><input type="checkbox" data-k="${k}" ${st.prefs.includes(k) ? 'checked' : ''}><span><b>${esc(l)}</b><small>${esc(d)}</small></span></label>`).join('')}</div>
      <div class="nf-row"><button class="btn-ghost nf-test">${t('notif.test')}</button><span class="muted">${t('notif.quiet')}</span></div>` : ''}`;
    // (v2.0.7) refusées dans le navigateur : lui seul peut les rouvrir — on dit où
    if (Notification.permission === 'denied') box.insertAdjacentHTML('beforeend', `<p class="muted nf-denied">${t('notif.denied')}</p>`);
    const tg = box.querySelector<HTMLButtonElement>('.nf-toggle')!;
    tg.addEventListener('click', () =>
      busyButton(tg, (async () => {
        haptics.pulse(8);
        try {
          if (on) {
            await disable(backend);
            toast(t('notif.offToast'), 'info');
          } else {
            await enable(backend);
            toast(t('notif.onToast'), 'ok');
          }
        } catch (e) {
          toast(errMsg(e), 'err');
        }
        await render();
      })()),
    );
    box.querySelectorAll<HTMLInputElement>('.nf-k input').forEach((cb) =>
      cb.addEventListener('change', async () => {
        const prefs = [...box.querySelectorAll<HTMLInputElement>('.nf-k input')].filter((c) => c.checked).map((c) => c.dataset.k!);
        try {
          await backend.push!.setPrefs(prefs);
        } catch (e) {
          toast(errMsg(e), 'err');
        }
      }),
    );
    const test = box.querySelector<HTMLButtonElement>('.nf-test');
    test?.addEventListener('click', () =>
      busyButton(test, (async () => {
        try {
          const r = await backend.push!.test();
          toast(t('notif.testSent', { n: r.devices }), 'ok');
        } catch (e) {
          toast(errMsg(e), 'err');
        }
      })()),
    );
  };
  void render();
  return box;
}
