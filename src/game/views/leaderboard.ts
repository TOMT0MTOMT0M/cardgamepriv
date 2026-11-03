import type { GameBackend, LeaderRow } from '../backend';
import type { Shell } from '../shell';
import { frameOf, titleOf } from '../../core/cosmetics';
import { errMsg, esc, fmtN, fmtPct, h, plural, toast } from '../ui';

/**
 * CLASSEMENT entre nous — composant partagé par la page #/classement (onglet de la navigation) et l'onglet Classement
 * du profil. 5 catégories : Complétion (le classement roi), 6★ & secrets, Boosters, Échanges, Série.
 * Podium (2e – 1er – 3e) + liste complète ; ma ligne est surlignée SANS changer la taille ni l'alignement (correctif
 * retours live n°1 : la classe `me` héritait du style de l'en-tête — marge auto, flex — et décalait podium et ligne).
 */
type Board = 'pct' | 'mythic' | 'packs' | 'trades' | 'streak';
const BOARDS: Array<{ id: Board; label: string; unit: (r: LeaderRow) => string; value: (r: LeaderRow) => number; crown?: boolean }> = [
  { id: 'pct', label: 'Complétion', crown: true, value: (r) => r.pct, unit: (r) => `${fmtPct(r.pct)} · ${fmtN(r.uniques)} cartes` },
  { id: 'mythic', label: '6★ & secrets', value: (r) => r.mythics + r.secrets * 10, unit: (r) => `${fmtN(r.mythics)} × 6★${r.secrets ? ` · ✷ ${fmtN(r.secrets)}` : ''}` },
  { id: 'packs', label: 'Boosters', value: (r) => r.packsOpened, unit: (r) => plural(r.packsOpened, 'booster') },
  { id: 'trades', label: 'Échanges', value: (r) => r.tradesDone, unit: (r) => plural(r.tradesDone, 'échange', 'échanges') },
  { id: 'streak', label: 'Série', value: (r) => r.streak, unit: (r) => plural(r.streak, 'jour') },
];

export interface Leaderboard {
  el: HTMLElement;
  /** recharge les données (à l'arrivée sur la page / l'onglet) */
  load(): Promise<void>;
}

export function createLeaderboard(backend: GameBackend, shell?: Shell): Leaderboard {
  const el = h('div', 'lb-wrap');
  el.innerHTML = `
    <div class="seg lb-boards">${BOARDS.map((b) => `<button data-b="${b.id}"${b.id === 'pct' ? ' class="on"' : ''}>${b.crown ? '👑 ' : ''}${b.label}</button>`).join('')}</div>
    <div class="lb-podium"></div>
    <div class="lb-list"></div>`;
  const podiumEl = el.querySelector<HTMLElement>('.lb-podium')!;
  const listEl = el.querySelector<HTMLElement>('.lb-list')!;
  let board: Board = 'pct';
  let rows: LeaderRow[] | null = null;

  // catégories qui débordent (« Échanges », « Série » cachés à 360 px) : fondu au bord droit (audit UX3-12)
  const boardsRow = el.querySelector<HTMLElement>('.lb-boards')!;
  const markOvf = () => boardsRow.classList.toggle('ovf', boardsRow.scrollLeft + boardsRow.clientWidth < boardsRow.scrollWidth - 4);
  boardsRow.addEventListener('scroll', markOvf, { passive: true });
  el.querySelectorAll<HTMLButtonElement>('.lb-boards button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.b === 'pct')));
  el.querySelectorAll<HTMLButtonElement>('.lb-boards button').forEach((b) =>
    b.addEventListener('click', () => {
      board = b.dataset.b as Board;
      el.querySelectorAll<HTMLButtonElement>('.lb-boards button').forEach((x) => (x.classList.toggle('on', x === b), x.setAttribute('aria-pressed', String(x === b))));
      b.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
      shell?.sfx.tick(1.2, 0.04);
      render();
    }),
  );

  const ava = (r: LeaderRow) => {
    const f = frameOf(r.cosmetics.frame);
    return `<span class="lb-ava frame-${f.id}" style="--frame:${f.css ?? 'transparent'}">${r.avatarUrl ? `<img src="${esc(r.avatarUrl)}" alt="">` : `<span>${esc(r.name.slice(0, 1))}</span>`}</span>`;
  };

  function render() {
    requestAnimationFrame(markOvf);
    const b = BOARDS.find((x) => x.id === board)!;
    const sorted = [...(rows ?? [])].sort((x, y) => b.value(y) - b.value(x) || x.name.localeCompare(y.name, 'fr'));
    const me = backend.state.user?.id;
    podiumEl.replaceChildren();
    listEl.replaceChildren();
    if (!rows) return void (podiumEl.innerHTML = '<div class="muted">Chargement…</div>');
    if (!sorted.length) return void (podiumEl.innerHTML = '<div class="muted">Personne au classement pour l’instant.</div>');
    // podium : toujours 3 places de même gabarit, dans l'ordre 2e – 1er – 3e (places vides si moins de 3 joueurs)
    const row = h('div', 'lb-pd-row');
    for (const i of [1, 0, 2]) {
      const r = sorted[i];
      if (!r) {
        row.append(h('div', `lb-pd p${i + 1} empty`, `<span class="lb-pd-rank">${['🥇', '🥈', '🥉'][i]}</span><span class="lb-ava"><span>—</span></span><b>—</b><span class="lb-pd-v">&nbsp;</span>`));
        continue;
      }
      const a = h('a', `lb-pd p${i + 1}${r.id === me ? ' is-me' : ''}`);
      a.href = `#/profil/${encodeURIComponent(r.id)}`;
      a.innerHTML = `<span class="lb-pd-rank">${i === 0 && b.crown ? '👑' : ['🥇', '🥈', '🥉'][i]}</span>${ava(r)}<b>${esc(r.name)}</b>${r.id === me ? '<span class="lb-you">toi</span>' : '<span class="lb-you none">&nbsp;</span>'}<span class="lb-pd-v">${b.unit(r)}</span>`;
      row.append(a);
    }
    podiumEl.append(row);
    // la liste reprend APRÈS le podium (les 3 premiers n'y sont plus répétés : audit UX3-17)
    for (const [i, r] of sorted.entries()) {
      if (i < 3) continue;
      const line = h('a', `lb-row${r.id === me ? ' is-me' : ''}${i < 3 ? ` top${i + 1}` : ''}`);
      line.href = `#/profil/${encodeURIComponent(r.id)}`;
      const t = titleOf(r.cosmetics.title);
      line.innerHTML = `<span class="lb-rank">${i + 1}</span>${ava(r)}<span class="lb-name"><span>${esc(r.name)}${r.id === me ? ' <span class="lb-you">toi</span>' : ''}</span>${t ? `<small>${esc(t.label)}</small>` : ''}</span><span class="lb-v">${b.unit(r)}</span>`;
      listEl.append(line);
    }
    if (b.id === 'pct') listEl.insertAdjacentHTML('beforeend', '<div class="muted lb-note">👑 Le classement roi : la complétion globale de la collection.</div>');
  }

  return {
    el,
    async load() {
      rows = null;
      render();
      try {
        rows = await backend.leaderboard();
      } catch (e) {
        rows = [];
        toast(errMsg(e), 'err');
      }
      render();
    },
  };
}
