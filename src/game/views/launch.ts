import '../../core/i18n/fr/game.views.launch'; // (textes de ce module, version anglaise)
import { locale, t as tr } from '../../core/i18n';
import type { GameBackend } from '../backend';
import { h, toast } from '../ui';

/**
 * ÉCRAN D'OUVERTURE (07/11) — (13/11) texte de la sortie V2 : « Grosse mise à jour », « réouverture dans 02h14 » tant que l'heure posée par `launch:setLaunch` n'est pas passée.
 * Couvre tout le jeu (qui continue de se charger dessous : à l'heure pile, il est prêt), sauf pour l'équipe
 * (admin / modérateur : Tom et Hugo jouent et vérifient avant tout le monde). À zéro : « C'est ouvert », l'écran
 * s'efface et la fenêtre de création de compte s'ouvre.
 */
export function createLaunchGate(backend: GameBackend) {
  let el: HTMLElement | null = null;
  let timer = 0;
  let target = 0;
  const parts: Record<string, string> = {};
  const two = (n: number) => String(n).padStart(2, '0');
  const when = (ms: number) => {
    const d = new Intl.DateTimeFormat(locale(), { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long' }).format(ms);
    const t = new Intl.DateTimeFormat(locale(), { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).format(ms).replace(':', ' h ');
    return `${d} · ${t}`;
  };

  const shouldShow = () => {
    const s = backend.state;
    const at = s.launch?.launchAt ?? 0;
    return s.mode === 'online' && at > Date.now() && !s.user?.staff;
  };

  function mount() {
    el = h('div', 'lc');
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'lc-k');
    el.innerHTML = `<i class="lc-scan" aria-hidden="true"></i>
      <div class="lc-in">
        <div class="lc-logo" aria-hidden="true">${tr('boot.logo')}</div>
        <p class="lc-v2-t">${tr('launch.big')}</p>
        <p class="lc-k" id="lc-k">${tr('launch.reopen')}</p>
        <div class="lc-time" role="timer" aria-live="off"><span class="lc-a"></span><i class="lc-u"></i><span class="lc-b"></span><small class="lc-c"></small></div>
        <p class="lc-when"></p>
        <ul class="lc-pts">
          <li><b>${tr('launch.kept')}</b> ${tr('launch.keptD')}</li>
          <li><b>${tr('launch.v2')}</b> ${tr('launch.v2D')}</li>
          <li>${tr('launch.auto')}</li>
        </ul>
      </div>
      <button class="lc-staff" type="button">${tr('launch.team')}</button>`;
    el.querySelector('.lc-staff')!.addEventListener('click', () => backend.login());
    document.body.append(el);
    const app = document.getElementById('app');
    if (app) app.inert = true;
    requestAnimationFrame(() => el?.classList.add('on'));
    for (const k of Object.keys(parts)) delete parts[k];
    tick();
    timer = window.setInterval(tick, 250);
  }

  function set(cls: string, v: string) {
    if (parts[cls] === v || !el) return;
    parts[cls] = v;
    const n = el.querySelector<HTMLElement>(`.${cls}`)!;
    n.textContent = v;
    // le chiffre qui change entre en douceur (flou → net) ; les autres ne bougent pas
    n.classList.remove('tk');
    void n.offsetWidth;
    n.classList.add('tk');
  }

  function tick() {
    if (!el) return;
    const left = Math.max(0, target - Date.now());
    const s = Math.ceil(left / 1000);
    const d = Math.floor(s / 86400);
    const hh = Math.floor((s % 86400) / 3600);
    const mm = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    el.classList.toggle('lc-last', s <= 10 && s > 0);
    if (d > 0) {
      set('lc-a', String(d));
      set('lc-u', 'j');
      set('lc-b', two(hh));
      set('lc-c', `h ${two(mm)}`);
    } else if (hh > 0) {
      set('lc-a', two(hh));
      set('lc-u', 'h');
      set('lc-b', two(mm));
      set('lc-c', two(ss));
    } else {
      set('lc-a', two(mm));
      set('lc-u', ':');
      set('lc-b', two(ss));
      set('lc-c', '');
    }
    const label = d > 0 ? `${d} j ${hh} h ${mm} min` : hh > 0 ? `${hh} h ${mm} min` : `${mm} min ${ss} s`;
    el.querySelector('.lc-time')!.setAttribute('aria-label', tr('launch.reopenIn', { label }));
    if (left <= 0) opened();
  }

  /** l'heure est passée : on le dit, on s'efface, on propose de créer son compte */
  function opened() {
    if (!el) return;
    clearInterval(timer);
    const gate = el;
    el = null;
    gate.classList.add('lc-open');
    gate.querySelector('.lc-k')!.textContent = tr('launch.open');
    setTimeout(() => {
      gate.classList.add('out');
      const app = document.getElementById('app');
      if (app) app.inert = false;
      setTimeout(() => gate.remove(), 700);
      if (!backend.state.user) backend.login();
      else toast(tr('launch.reopened'), 'ok');
    }, 1400);
  }

  function unmount() {
    if (!el) return;
    clearInterval(timer);
    el.remove();
    el = null;
    const app = document.getElementById('app');
    if (app) app.inert = false;
  }

  backend.onChange((s) => {
    const at = s.launch?.launchAt ?? 0;
    if (shouldShow()) {
      target = at;
      if (!el) mount();
      el!.querySelector('.lc-when')!.textContent = when(at);
    } else if (el && !(at > Date.now() && !s.user?.staff && s.mode === 'online')) {
      // date retirée / avancée, ou un compte équipe vient de se connecter
      unmount();
    }
  });
}
