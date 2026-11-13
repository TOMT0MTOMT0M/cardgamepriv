/**
 * NOTIFICATIONS PUSH côté jeu (V2, docs/IDEES-V2.md §1) : enregistrement du service worker (public/sw.js),
 * abonnement de CET appareil (clé VAPID publique lue sur le serveur), préférences par type, et la petite fiche
 * « Notifications » du profil (bouton Activer / Couper, cases à cocher, test, guide iPhone).
 *
 * iPhone : les notifications web n'existent que pour une appli ajoutée à l'écran d'accueil (iOS 16.4+) → on
 * l'explique en 2 étapes tant que le jeu tourne dans Safari.
 */
import type { GameBackend } from './backend';
import { siteUrl } from '../core/siteRoot';
import { busyButton, errMsg, esc, h, toast } from './ui';
import { haptics } from '../core/haptics';

export const KIND_LABELS: Array<[string, string, string]> = [
  ['reserve', 'Réserve pleine', '15 boosters : viens ouvrir'],
  ['trade', 'Échanges', 'proposition, contre-proposition, réponse'],
  ['friend', 'Amis', 'demande reçue, demande acceptée'],
  ['referral', 'Parrainage', 'ton filleul a ouvert ses boosters'],
  ['game', 'Jeux', 'défi Pack Battle, gain à la roulette'],
  ['chat', 'Chat', 'message privé, mention, le chat général qui se réveille'],
  ['roulette', 'Roulette', '10 min avant chaque tirage (10 h, 20 h) — à cocher'],
  ['news', 'Annonces de l’équipe', 'nouveau patch, événement'],
];

const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
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
}

async function disable(backend: GameBackend): Promise<void> {
  const s = await currentSub();
  if (!s) return;
  await backend.push!.unsubscribe(s.endpoint).catch(() => undefined);
  await s.unsubscribe();
}

/** La fiche « Notifications » du profil (section Compte). */
export function notifPanel(backend: GameBackend): HTMLElement {
  const box = h('div', 'nf-box');
  if (!backend.push) {
    box.innerHTML = '<span class="muted">Notifications : seulement en ligne (pas en démo).</span>';
    return box;
  }
  if (!supported()) {
    box.innerHTML = isIOS() && !standalone()
      ? `<div class="nf-ios"><b>Sur iPhone, les notifications marchent seulement une fois le jeu ajouté à l’écran d’accueil :</b><ol><li>Dans Safari : <b>Partager</b> (le carré avec la flèche) → <b>Sur l’écran d’accueil</b>.</li><li>Ouvre <b>Bébou</b> depuis l’écran d’accueil, reviens ici et touche <b>Activer</b>.</li></ol></div>`
      : '<span class="muted">Ce navigateur ne gère pas les notifications.</span>';
    return box;
  }
  const render = async () => {
    const s = await currentSub().catch(() => null);
    const st = await backend.push!.status(s?.endpoint ?? undefined).catch(() => null);
    if (!st) return (box.innerHTML = '<span class="muted">Notifications indisponibles pour l’instant.</span>');
    const on = st.thisDevice && Notification.permission === 'granted';
    box.innerHTML = `
      <div class="nf-row"><button class="${on ? 'btn-ghost' : 'btn-primary'} nf-toggle">${on ? 'Couper sur cet appareil' : 'Activer les notifications'}</button>
        <span class="muted">${!st.configured ? 'Pas encore activées côté serveur.' : on ? `Cet appareil reçoit les notifications${st.devices > 1 ? ` (${st.devices} appareils au total)` : ''}.` : st.devices ? `${st.devices} autre${st.devices > 1 ? 's' : ''} appareil${st.devices > 1 ? 's' : ''} abonné${st.devices > 1 ? 's' : ''} — pas celui-ci.` : 'Échanges, amis, réserve pleine… même jeu fermé.'}</span></div>
      ${st.devices ? `<div class="nf-prefs">${KIND_LABELS.map(([k, l, d]) => `<label class="nf-k"><input type="checkbox" data-k="${k}" ${st.prefs.includes(k) ? 'checked' : ''}><span><b>${esc(l)}</b><small>${esc(d)}</small></span></label>`).join('')}</div>
      <div class="nf-row"><button class="btn-ghost nf-test">M’envoyer un test</button><span class="muted">Pas de notification entre 23 h et 8 h.</span></div>` : ''}`;
    const tg = box.querySelector<HTMLButtonElement>('.nf-toggle')!;
    tg.addEventListener('click', () =>
      busyButton(tg, (async () => {
        haptics.pulse(8);
        try {
          if (on) {
            await disable(backend);
            toast('Notifications coupées sur cet appareil.', 'info');
          } else {
            await enable(backend);
            toast('Notifications activées !', 'ok');
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
          toast(`Test envoyé à ${r.devices} appareil${r.devices > 1 ? 's' : ''} (quelques secondes).`, 'ok');
        } catch (e) {
          toast(errMsg(e), 'err');
        }
      })()),
    );
  };
  void render();
  return box;
}
