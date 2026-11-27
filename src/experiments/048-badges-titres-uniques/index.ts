import type { Experiment, LabContext } from '../../core/Experiment';
import { TITRES, type TitreUnique } from './data';
import { SYMBOLES } from './symboles';

/**
 * 048 — BADGES DES TITRES UNIQUES (27/11, demande de Hugo validée par Tom) : un insigne dessiné par titre unique (83),
 * en SVG : médaillon commun (fond noir, double filet, teinte du titre en accent) + un symbole générique de l'univers.
 *  - la PLANCHE : les 83 insignes triés par univers, nom du titre dessous ; taille 20 / 32 / 64 / 96 px ;
 *  - l'aperçu EN SITUATION : ligne de profil et lignes de classement à 20-24 px, sur fond noir ;
 *  - toucher un insigne = zoom (grand + nom + collection) ; il devient aussi celui des maquettes.
 * `?t=hokage&px=32` : insigne de départ, taille de la planche. Le labo reste en français (hors de check:i18n).
 */

/** Le même gabarit pour tous : seul le symbole et la teinte changent. */
export function insigne(t: TitreUnique): string {
  return (
    `<svg class="b48" viewBox="-50 -50 100 100" aria-hidden="true" style="color:${t.teinte}">` +
    `<circle r="47" fill="#08080a" stroke="currentColor" stroke-width="3.4"/>` +
    `<circle r="41" fill="currentColor" fill-opacity=".1" stroke="currentColor" stroke-opacity=".5" stroke-width="1.1"/>` +
    `<g transform="scale(1.04)" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${SYMBOLES[t.sym] ?? ''}</g>` +
    `</svg>`
  );
}

const collection = (setId: string) => {
  const s = setId.replace(/^(grp|sub):/, '').replace(/^jv-/, '').replace(/-/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const CSS = `
.b48-root { position: absolute; inset: 0; overflow-y: auto; background: #000; color: #e9e9ee; font: 500 13px/1.35 Inter, system-ui, sans-serif; pointer-events: auto; padding: 100px 12px 60px; box-sizing: border-box; }
.b48 { display: block; width: 100%; height: 100%; }
.b48-bar { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 0 0 14px; }
.b48-bar span { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: #8d8b96; margin-right: 4px; }
.b48-bar button { background: none; border: 1px solid #2c2b33; color: #cfcdd6; padding: 6px 12px; border-radius: 4px; font: inherit; cursor: pointer; }
.b48-bar button.on { border-color: #fff; color: #fff; }
.b48-h { font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: #8d8b96; margin: 18px 0 8px; padding-bottom: 5px; border-bottom: 1px solid #1e1d24; }
.b48-grid { display: grid; gap: 10px 6px; }
.b48-c { background: none; border: 0; padding: 4px 2px; color: inherit; font: inherit; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; }
.b48-c .b48 { flex: none; }
.b48-c em { font-style: normal; font-size: 10.5px; line-height: 1.25; color: #b9b6c2; }
.b48-c:active { background: #111; }
.b48-sit { margin-top: 26px; border: 1px solid #1e1d24; border-radius: 6px; padding: 12px; background: #050506; max-width: 460px; }
.b48-prof { display: flex; align-items: center; gap: 10px; padding-bottom: 10px; border-bottom: 1px solid #1e1d24; margin-bottom: 6px; }
.b48-av { width: 38px; height: 38px; border-radius: 50%; border: 1px solid #2c2b33; background: #141418; flex: none; }
.b48-prof b { display: block; font-size: 15px; color: #fff; }
.b48-tit { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; }
.b48-row { display: flex; align-items: center; gap: 10px; padding: 7px 2px; border-bottom: 1px solid #141418; }
.b48-row i { font-style: normal; width: 18px; color: #6d6b76; text-align: right; font-size: 12px; }
.b48-row .n { flex: 1; color: #e9e9ee; display: flex; align-items: center; gap: 7px; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.b48-row .n small { color: #8d8b96; font-size: 11px; }
.b48-row .s { color: #8d8b96; font-variant-numeric: tabular-nums; }
.b48-zoom { position: fixed; inset: 0; z-index: 20; background: rgba(0, 0, 0, .86); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; text-align: center; padding: 20px; }
.b48-zoom .b48 { width: min(70vw, 300px); height: min(70vw, 300px); }
.b48-zoom b { font-size: 20px; color: #fff; }
.b48-zoom span { color: #8d8b96; font-size: 12px; }
`;

const UNIVERS = [...new Set(TITRES.map((t) => t.univers))];

export default function create(): Experiment {
  let ctx!: LabContext;
  let root!: HTMLElement;
  const qs = new URLSearchParams(location.search || location.hash.split('?')[1] || '');
  const state = {
    px: ([20, 32, 64, 96] as const).includes(Number(qs.get('px')) as 20) ? Number(qs.get('px')) : 64,
    sel: TITRES.find((t) => t.id === qs.get('t')) ?? TITRES.find((t) => t.id === 'maitre-pokemon')!,
  };
  (window as unknown as { __b48?: unknown }).__b48 = state;

  const render = () => {
    const bar =
      `<div class="b48-bar"><span>Taille</span>` +
      ([20, 32, 64, 96] as const).map((p) => `<button data-px="${p}" class="${p === state.px ? 'on' : ''}">${p} px</button>`).join('') +
      `</div>`;
    const col = Math.max(state.px, 56) + 18;
    const planche = UNIVERS.map((u) => {
      const items = TITRES.filter((t) => t.univers === u);
      return (
        `<div class="b48-h">${u} · ${items.length}</div><div class="b48-grid" style="grid-template-columns:repeat(auto-fill,minmax(${col}px,1fr))">` +
        items.map((t) => `<button class="b48-c" data-id="${t.id}"><span style="width:${state.px}px;height:${state.px}px;display:block">${insigne(t)}</span><em>${t.nom}</em></button>`).join('') +
        `</div>`
      );
    }).join('');
    const s = state.sel;
    const autres = [TITRES.find((t) => t.id === 'roi-des-pistes')!, TITRES.find((t) => t.id === 'hokage')!, TITRES.find((t) => t.id === 'oscar')!, TITRES.find((t) => t.id === 'maillot-jaune')!];
    const rows = [s, ...autres.filter((a) => a.id !== s.id)].slice(0, 5);
    const sit =
      `<div class="b48-h">En situation (insigne choisi : ${s.nom})</div><div class="b48-sit">` +
      `<div class="b48-prof"><div class="b48-av"></div><div><b>Hugo</b><span class="b48-tit"><span style="width:24px;height:24px;display:block">${insigne(s)}</span>${s.nom}</span></div></div>` +
      rows.map((t, i) => `<div class="b48-row"><i>${i + 1}</i><span class="n"><span style="width:20px;height:20px;flex:none;display:block">${insigne(t)}</span>${['Hugo', 'Tom', 'Léa', 'Max', 'Inès'][i]} <small>${t.nom}</small></span><span class="s">${(4210 - i * 380).toLocaleString('fr-FR')}</span></div>`).join('') +
      `</div>`;
    root.innerHTML = bar + planche + sit;
  };

  const zoom = (t: TitreUnique) => {
    state.sel = t;
    const z = document.createElement('div');
    z.className = 'b48-zoom';
    z.innerHTML = `${insigne(t)}<b>${t.nom}</b><span>${collection(t.setId)} · ${t.univers}</span><span>toucher pour fermer</span>`;
    z.onclick = () => { z.remove(); render(); };
    root.append(z);
  };

  return {
    setup(c) {
      ctx = c;
      const style = document.createElement('style');
      style.textContent = CSS;
      root = document.createElement('div');
      root.className = 'b48-root';
      root.addEventListener('click', (e) => {
        const el = e.target as HTMLElement;
        const b = el.closest<HTMLElement>('[data-px]');
        if (b) { state.px = Number(b.dataset.px); render(); return; }
        const cell = el.closest<HTMLElement>('[data-id]');
        if (cell) zoom(TITRES.find((t) => t.id === cell.dataset.id)!);
      });
      c.overlay.append(style, root);
      render();
      if (qs.has('zoom')) zoom(state.sel);
    },
    update() {},
    dispose() {
      root?.remove();
      void ctx;
    },
  };
}
