import type { GameBackend, LeaderRow } from '../backend';
import type { Shell } from '../shell';
import { frameOf, titleOf } from '../../core/cosmetics';
import { SEASON_PACKS, SEASON_PLAYED_PACKS, SEASON_TOP10_PACKS, seasonEndAt, seasonLabel, seasonOf, seasonStandings, type SeasonBoard } from '../../core/seasons';
import { errMsg, esc, fmtN, fmtPct, h, plural, toast } from '../ui';
import { friendBtn } from './friends';
import '../progression.css';

/**
 * CLASSEMENT entre nous — composant partagé par la page #/classement (onglet de la navigation) et l'onglet Classement
 * du profil. 5 catégories : Complétion (le classement roi), 6★ & secrets, Boosters, Échanges, Série.
 * Podium (2e – 1er – 3e) + liste complète ; ma ligne est surlignée SANS changer la taille ni l'alignement (correctif
 * retours live n°1 : la classe `me` héritait du style de l'en-tête — marge auto, flex — et décalait podium et ligne).
 */
/** case vide sous une place du podium (même hauteur que le bouton « + Ami ») */
const SLOT = '<span class="lb-pd-slot" aria-hidden="true"></span>';
type Board = 'pct' | 'season' | 'mythic' | 'packs' | 'trades' | 'streak';
/** (11/11) saison en cours : cartes différentes gagnées depuis le début du mois, par joueur (rempli au chargement) */
const seasonGain = new Map<string, number>();
/**
 * `gap(a, b)` : ce qui sépare `b` de `a` (devant lui), dans l'unité qui parle au joueur — (13/11, retours Hugo
 * « classement un peu fade, + visuel ») pour la carte « ta place » au-dessus du podium.
 */
const BOARDS: Array<{ id: Board; label: string; unit: (r: LeaderRow) => string; value: (r: LeaderRow) => number; gap: (a: LeaderRow, b: LeaderRow) => string; crown?: boolean }> = [
  { id: 'pct', label: 'Complétion', crown: true, value: (r) => r.pct, unit: (r) => `${fmtPct(r.pct)} · ${fmtN(r.uniques)} cartes`, gap: (a, b) => plural(Math.max(1, a.uniques - b.uniques), 'carte') },
  { id: 'season', label: 'Saison', value: (r) => seasonGain.get(r.id) ?? 0, unit: (r) => `+${plural(seasonGain.get(r.id) ?? 0, 'carte')}`, gap: (a, b) => plural(Math.max(1, (seasonGain.get(a.id) ?? 0) - (seasonGain.get(b.id) ?? 0)), 'carte') },
  { id: 'mythic', label: '6★ & secrets', value: (r) => r.mythics + r.secrets * 10, unit: (r) => `${fmtN(r.mythics)} × 6★${r.secrets ? ` · ✷ ${fmtN(r.secrets)}` : ''}`, gap: (a, b) => `${fmtN(Math.max(1, a.mythics + a.secrets * 10 - (b.mythics + b.secrets * 10)))} × 6★` },
  { id: 'packs', label: 'Boosters', value: (r) => r.packsOpened, unit: (r) => plural(r.packsOpened, 'booster'), gap: (a, b) => plural(Math.max(1, a.packsOpened - b.packsOpened), 'booster') },
  { id: 'trades', label: 'Échanges', value: (r) => r.tradesDone, unit: (r) => plural(r.tradesDone, 'échange', 'échanges'), gap: (a, b) => plural(Math.max(1, a.tradesDone - b.tradesDone), 'échange', 'échanges') },
  { id: 'streak', label: 'Série', value: (r) => r.streak, unit: (r) => plural(r.streak, 'jour'), gap: (a, b) => plural(Math.max(1, a.streak - b.streak), 'jour') },
];
/** 1er, 2e… */
const ord = (n: number) => `${n}<sup>${n === 1 ? 'er' : 'e'}</sup>`;

export interface Leaderboard {
  el: HTMLElement;
  /** recharge les données (à l'arrivée sur la page / l'onglet) */
  load(): Promise<void>;
}

export function createLeaderboard(backend: GameBackend, shell?: Shell): Leaderboard {
  const el = h('div', 'lb-wrap');
  el.innerHTML = `
    <div class="seg lb-boards">${BOARDS.map((b) => `<button data-b="${b.id}"${b.id === 'pct' ? ' class="on"' : ''}>${b.label}</button>`).join('')}</div>
    <div class="lb-season" hidden></div>
    <div class="lb-mine" hidden></div>
    <div class="lb-podium"></div>
    <div class="lb-list"></div>
    <div class="lb-past" hidden></div>`;
  const podiumEl = el.querySelector<HTMLElement>('.lb-podium')!;
  const mineEl = el.querySelector<HTMLElement>('.lb-mine')!;
  const listEl = el.querySelector<HTMLElement>('.lb-list')!;
  let board: Board = 'pct';
  let rows: LeaderRow[] | null = null;
  /** (11/11) saisons mensuelles : la saison en cours et l'historique des podiums */
  let season: SeasonBoard | null = null;
  const seasonEl = el.querySelector<HTMLElement>('.lb-season')!;
  const pastEl = el.querySelector<HTMLElement>('.lb-past')!;

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

  /** « dans 19 j 4 h » / « dans 3 h 12 min » */
  const until = (ms: number) => {
    const m = Math.max(0, Math.round(ms / 60000));
    const d = Math.floor(m / 1440), hh = Math.floor((m % 1440) / 60), mm = m % 60;
    return d ? `${d}\u00a0j ${hh}\u00a0h` : hh ? `${hh}\u00a0h ${mm}\u00a0min` : `${mm}\u00a0min`;
  };
  /** En-tête de l'onglet Saison (nom, fin, récompenses) et historique des podiums. */
  function renderSeason() {
    const on = board === 'season';
    seasonEl.hidden = pastEl.hidden = !on;
    if (!on) return;
    const cur = season?.current;
    const me = backend.state.user?.id;
    const inIt = !!cur && !!me && cur.bases.some((b) => b.userId === me);
    seasonEl.innerHTML = cur
      ? `<div class="lb-ss-h"><span class="lb-ss-k">Saison</span><b>${esc(seasonLabel(cur.key))}</b><span class="lb-ss-end">fin dans ${until(seasonEndAt(Date.now()) - Date.now())}</span></div>` +
        `<p class="lb-ss-rule">Score : les cartes différentes gagnées depuis le début du mois. Le classement est figé à la fin du mois, puis tout repart à zéro.${me && !inIt ? ' <b>Tu entres dans la saison dans l’heure</b> : tes cartes comptent à partir de là.' : ''}</p>` +
        `<ol class="lb-ss-rw"><li class="g1"><span>1<sup>er</sup></span>${plural(SEASON_PACKS[0], 'booster')} · titre « Champion de saison » · cadre « Podium de saison »</li><li class="g2"><span>2<sup>e</sup> · 3<sup>e</sup></span>${SEASON_PACKS[1]} / ${plural(SEASON_PACKS[2], 'booster')} · cadre « Podium de saison »</li><li><span>4<sup>e</sup> – 10<sup>e</sup></span>${plural(SEASON_TOP10_PACKS, 'booster')}</li><li><span>les autres</span>${plural(SEASON_PLAYED_PACKS, 'booster')} dès une carte gagnée</li></ol>`
      : '<p class="muted lb-ss-rule">La première saison démarre dans l’heure : à partir de là, chaque carte différente gagnée compte.</p>';
    const past = season?.past ?? [];
    if (!past.length) return void (pastEl.innerHTML = '<div class="lb-ss-t">Saisons passées</div><p class="muted">Aucune saison terminée pour l’instant : le premier podium sera gravé ici à la fin du mois.</p>');
    pastEl.innerHTML =
      '<div class="lb-ss-t">Saisons passées</div>' +
      past
        .map((p) => {
          const mine = me ? p.results.find((r) => r.userId === me) : undefined;
          const pod = [0, 1, 2].map((i) => p.results[i]);
          return `<section class="lb-ps"><header><b>Saison ${esc(seasonOf(p.key))}</b><span>${esc(seasonLabel(p.key).split(' ')[1] ?? '')}</span></header><ol class="lb-ps-pod">${pod
            .map((r, i) => (r ? `<li class="p${i + 1}"><span class="lb-ps-r">${i + 1}</span><a href="#/profil/${encodeURIComponent(r.userId)}">${esc(r.name)}</a><em>+${plural(r.gained, 'carte')}</em></li>` : `<li class="p${i + 1} empty"><span class="lb-ps-r">${i + 1}</span><span>—</span></li>`))
            .join('')}</ol>${mine ? `<p class="lb-ps-me">Toi : ${mine.rank}<sup>${mine.rank === 1 ? 'er' : 'e'}</sup> · +${plural(mine.gained, 'carte')} · ${plural(mine.boosters, 'booster')} reçu${mine.boosters > 1 ? 's' : ''}</p>` : ''}</section>`;
        })
        .join('');
  }

  function render() {
    requestAnimationFrame(markOvf);
    renderSeason();
    const b = BOARDS.find((x) => x.id === board)!;
    const sorted = [...(rows ?? [])].sort((x, y) => b.value(y) - b.value(x) || x.name.localeCompare(y.name, 'fr'));
    const me = backend.state.user?.id;
    podiumEl.replaceChildren();
    listEl.replaceChildren();
    mineEl.hidden = true;
    if (!rows) return void (podiumEl.innerHTML = '<div class="muted">Chargement…</div>');
    // (13/11) ta place, et ce qu'il manque pour passer devant le joueur juste au-dessus
    const mi = me ? sorted.findIndex((r) => r.id === me) : -1;
    if (mi >= 0 && sorted.length > 1 && !(board === 'season' && !season?.current)) {
      const r = sorted[mi];
      const ahead = sorted[mi - 1];
      const behind = sorted[mi + 1];
      mineEl.hidden = false;
      mineEl.innerHTML = `<span class="lb-mine-r">${ord(mi + 1)}</span><span class="lb-mine-t"><b>${mi === 0 ? 'Tu es en tête' : `Tu es ${ord(mi + 1)} sur ${sorted.length}`}</b><small>${
        ahead ? `Il te manque <b>${b.gap(ahead, r)}</b> pour passer devant ${esc(ahead.name)}` : behind ? `${esc(behind.name)} est à ${b.gap(r, behind)} derrière toi` : ''
      }</small></span><span class="lb-mine-v">${b.unit(r)}</span>`;
    }
    const topV = Math.max(1e-9, b.value(sorted[0]));
    const pctOf = (r: LeaderRow) => Math.max(2, Math.min(100, (b.value(r) / topV) * 100)).toFixed(1);
    if (!sorted.length) return void (podiumEl.innerHTML = '<div class="muted">Personne au classement pour l’instant.</div>');
    // podium : toujours 3 places de même gabarit, dans l'ordre 2e – 1er – 3e (places vides si moins de 3 joueurs)
    const row = h('div', 'lb-pd-row');
    for (const i of [1, 0, 2]) {
      const r = sorted[i];
      if (!r) {
        const cell = h('div', 'lb-pd-cell');
        cell.append(h('div', `lb-pd p${i + 1} empty`, `<span class="lb-pd-rank">${i + 1}</span><span class="lb-ava"><span>—</span></span><b>—</b><span class="lb-you none">&nbsp;</span><span class="lb-pd-v">&nbsp;</span>`));
        cell.insertAdjacentHTML('beforeend', SLOT);
        row.append(cell);
        continue;
      }
      const a = h('a', `lb-pd p${i + 1}${r.id === me ? ' is-me' : ''}`);
      a.href = `#/profil/${encodeURIComponent(r.id)}`;
      a.innerHTML = `<span class="lb-pd-rank">${i + 1}</span>${ava(r)}<b>${esc(r.name)}</b>${r.id === me ? '<span class="lb-you">toi</span>' : '<span class="lb-you none">&nbsp;</span>'}<span class="lb-pd-v">${b.unit(r)}</span><i class="lb-pd-step" aria-hidden="true"></i>`;
      // bouton ami (lot A2) sous la place du podium, hors du lien
      // retours live 02 (bug 3) : TOUTES les places ont la même case sous la carte — le bouton « + Ami » ou, pour moi
      // (on ne s'ajoute pas soi-même) / hors connexion, un emplacement vide de même hauteur → podium toujours aligné
      const cell = h('div', 'lb-pd-cell');
      cell.append(a);
      cell.insertAdjacentHTML('beforeend', friendBtn(backend, r.id, r.name, 'row') || SLOT);
      row.append(cell);
    }
    podiumEl.append(row);
    // la liste reprend APRÈS le podium (les 3 premiers n'y sont plus répétés : audit UX3-17)
    for (const [i, r] of sorted.entries()) {
      if (i < 3) continue;
      const line = h('a', `lb-row${r.id === me ? ' is-me' : ''}${i < 3 ? ` top${i + 1}` : ''}`);
      line.href = `#/profil/${encodeURIComponent(r.id)}`;
      const t = titleOf(r.cosmetics.title);
      line.innerHTML = `<i class="lb-bar" style="--w:${pctOf(r)}%" aria-hidden="true"></i><span class="lb-rank">${i + 1}</span>${ava(r)}<span class="lb-name"><span>${esc(r.name)}${r.id === me ? ' <span class="lb-you">toi</span>' : ''}</span>${t ? `<small>${esc(t.label)}</small>` : ''}</span><span class="lb-v">${b.unit(r)}</span>`;
      // bouton ami (lot A2) à côté de la ligne — pas dedans : un bouton dans un lien n'est ni valide ni accessible
      const fb = friendBtn(backend, r.id, r.name, 'row');
      if (!fb) listEl.append(line);
      else {
        const wrap = h('div', 'lb-line');
        wrap.append(line);
        wrap.insertAdjacentHTML('beforeend', fb);
        listEl.append(wrap);
      }
    }
    if (b.id === 'pct') listEl.insertAdjacentHTML('beforeend', '<div class="muted lb-note">Le classement roi : la complétion globale de la collection. Le premier gagne le titre « Numéro un ».</div>');
    if (b.id === 'season' && !season?.current) listEl.replaceChildren();
  }

  let loadId = 0;
  return {
    el,
    async load() {
      rows = null;
      render();
      const my = ++loadId;
      const show = () => {
        seasonGain.clear();
        if (season?.current && rows) for (const st of seasonStandings(rows.map((x) => ({ userId: x.id, name: x.name, avatarUrl: x.avatarUrl, uniques: x.uniques, packsOpened: x.packsOpened })), season.current.bases)) seasonGain.set(st.userId, st.gained);
        render();
      };
      try {
        // (11/11) les saisons à côté : une panne de ce côté ne prive pas du classement
        // (audit 12/11, A6-03) affiché tout de suite ; ma ligne recalculée arrive ensuite, seulement si elle a bougé
        let freshRows: LeaderRow[] | null = null;
        const fresh = (r: LeaderRow[]) => {
          if (my !== loadId) return;
          freshRows = r; // arrivée avant la première lecture (saisons lentes) : c'est elle qui sera affichée
          if (!rows) return;
          rows = r;
          show();
        };
        const [r, s] = await Promise.all([backend.leaderboard(fresh), backend.seasonBoard().catch(() => null)]);
        if (my !== loadId) return;
        rows = freshRows ?? r;
        season = s;
      } catch (e) {
        rows = [];
        toast(errMsg(e), 'err');
      }
      show();
    },
  };
}
