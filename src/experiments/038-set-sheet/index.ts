import type { Experiment, LabContext } from '../../core/Experiment';
import { CARDS, CARD_SETS, activeSet, setActiveSet, type CardData, type CardSetId } from '../../core/cardData';
import { DESIGNS, cardImage, ensureCardImages, ensureFonts, generateCardArt, imageStatus } from '../../core/art';
import { rarity, RARITIES, type RarityId } from '../../core/rarity';

type Filter = 'toutes' | 'basse déf' | 'détourées' | 'en échec';

// styles locaux (le shell et style.css appartiennent à l'infra : on n'y touche pas)
const CSS = `
.sheet { position: absolute; inset: 0; overflow: auto; padding: 92px 18px 170px; background: var(--bg); }
.sheet header { margin-bottom: 14px; }
.sheet header .t { font: 600 16px var(--sans); margin-bottom: 6px; }
.sheet .pills { display: flex; flex-wrap: wrap; gap: 5px; }
.sheet .pill { font: 11px var(--mono); border: 1px solid var(--line); border-radius: 4px; padding: 1px 6px; color: var(--muted); display: inline-flex; align-items: center; gap: 4px; }
.sheet .pill i, .sheet figcaption i { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex: none; }
.sheet .pill.ok { color: var(--up); border-color: var(--up); }
.sheet .pill.warn, .sheet .warn { color: var(--accent); }
.sheet .pill.bad, .sheet .bad { color: var(--down); }
.sheet .fail { margin-top: 8px; font: 11px var(--mono); color: var(--down); }
.sheet .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
.sheet .cell { margin: 0; cursor: zoom-in; }
.sheet .cell canvas { width: 100%; height: auto; display: block; border-radius: 6px; box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45); }
.sheet figcaption { font: 11px var(--mono); color: var(--muted); margin-top: 5px; display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
.sheet figcaption span { display: inline-flex; gap: 4px; }
.sheet figcaption b { font-weight: 500; border: 1px solid currentColor; border-radius: 3px; padding: 0 3px; font-size: 10px; }
.sheet-modal { position: absolute; inset: 0; z-index: 8; background: rgba(10, 9, 8, 0.92); display: flex; gap: 22px; align-items: center; justify-content: center; padding: 60px 24px; cursor: zoom-out; flex-wrap: wrap; overflow: auto; }
.sheet-modal > canvas { max-height: 100%; max-width: min(476px, 100%); height: auto; border-radius: 10px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6); }
.sheet-modal .meta { max-width: 320px; display: grid; gap: 6px; font: 12px var(--mono); color: #cfc8bb; }
.sheet-modal .meta .t { font: 600 18px var(--sans); color: var(--text); }
.sheet-modal .sws { display: flex; flex-wrap: wrap; gap: 6px; }
.sheet-modal .sw { display: inline-flex; align-items: center; gap: 4px; font-size: 10px; color: var(--muted); }
.sheet-modal .sw i { width: 14px; height: 14px; border-radius: 3px; border: 1px solid var(--line); }
.sheet-modal .src canvas { max-width: 100%; background: repeating-conic-gradient(#2a2724 0% 25%, #1c1a18 0% 50%) 0 0 / 16px 16px; border-radius: 4px; }
.sheet-modal .hint { color: var(--accent); font-size: 11px; }
`;

/**
 * Planche de contrôle du set actif : chaque carte rendue (calque aplati) avec son illustration,
 * badges de diagnostic (source basse résolution, fond détouré, échec de chargement) et
 * répartition des raretés. Clic = aperçu grand format + métadonnées de l'illustration.
 */
export default (): Experiment => {
  let ctx: LabContext;
  let root: HTMLElement;
  let grid: HTMLElement;
  let head: HTMLElement;
  let gen = 0;
  const params = { set: activeSet().id as CardSetId, design: activeSet().id === 'bebous' ? 'bebou' : 'classic', rareté: 'naturelle' as 'naturelle' | 'shell', filtre: 'toutes' as Filter };

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  };

  function flags(cd: CardData) {
    const im = cardImage(cd.image);
    const failed = !!cd.image && !im;
    return { im, failed, low: !!im?.lowRes, keyed: !!im?.keyed };
  }

  function keep(cd: CardData) {
    const f = flags(cd);
    switch (params.filtre) {
      case 'basse déf':
        return f.low;
      case 'détourées':
        return f.keyed;
      case 'en échec':
        return f.failed;
      default:
        return true;
    }
  }

  function header() {
    const set = activeSet();
    const st = imageStatus();
    const mine = new Set(CARDS.map((c) => c.image).filter(Boolean));
    const loaded = st.loaded.filter((x) => mine.has(x.url));
    const failed = st.failed.filter((x) => mine.has(x.url));
    const counts = RARITIES.map((r) => `<span class="pill"><i style="background:${r.hex}"></i>${r.label} ${CARDS.filter((c) => c.rarity === r.id).length}</span>`).join('');
    const img = mine.size
      ? `<span class="pill ${failed.length ? 'bad' : 'ok'}">illustrations ${loaded.length}/${mine.size}</span><span class="pill">détourées ${loaded.filter((x) => x.keyed).length}</span><span class="pill ${loaded.some((x) => x.lowRes) ? 'warn' : ''}">basse déf ${loaded.filter((x) => x.lowRes).length}</span>`
      : '<span class="pill">set procédural (pas d’illustrations)</span>';
    head.innerHTML = `<div class="t">${set.label} · ${CARDS.length} cartes</div><div class="pills">${img}${counts}</div>${
      failed.length ? `<div class="fail">${failed.map((f) => `✗ ${f.url}`).join('<br>')}</div>` : ''
    }`;
  }

  function preview(cd: CardData) {
    root.querySelector('.sheet-modal')?.remove();
    const m = el('div', 'sheet-modal');
    const art = generateCardArt(cd, params.rareté === 'shell' ? ctx.rarity : cd.rarity, { scale: 0.62, flatOnly: true, design: params.design });
    const cv = art.canvases.flat;
    art.dispose();
    const { im } = flags(cd);
    const pal = im?.palette ?? cd.palette;
    const sw = (Object.entries(pal) as Array<[string, string]>).map(([k, v]) => `<span class="sw" title="${k} ${v}"><i style="background:${v}"></i>${k}</span>`).join('');
    const meta = el(
      'div',
      'meta',
      `<div class="t">${String(cd.num).padStart(3, '0')} · ${cd.name}</div>
       <div>${rarity(cd.rarity).label} · id <code>${cd.id}</code></div>
       ${
         im
           ? `<div>source ${im.srcW}×${im.srcH}${im.lowRes ? ' <b class="warn">basse déf</b>' : ''} · ${im.keyed ? `fond blanc détouré (${Math.round(im.keyedRatio * 100)} %)` : 'alpha d’origine'}</div>
              <div>teinte ${Math.round(im.hue)}° · chroma ${im.chroma.toFixed(2)}</div><div class="sws">${sw}</div>`
           : cd.image
             ? `<div class="bad">illustration non chargée : ${cd.image}</div>`
             : '<div>carte procédurale</div>'
       }
       <div class="hint">clic pour fermer</div>`,
    );
    if (im) {
      const src = el('div', 'src');
      const c2 = document.createElement('canvas');
      c2.width = im.canvas.width;
      c2.height = im.canvas.height;
      c2.getContext('2d')!.drawImage(im.canvas, 0, 0);
      src.append(c2);
      meta.append(src);
    }
    m.append(cv, meta);
    m.addEventListener('click', () => m.remove());
    root.append(m);
  }

  async function build() {
    const my = ++gen;
    grid.innerHTML = '';
    header();
    const scale = ctx.quality === 'mobile' ? 0.18 : 0.24;
    const BATCH = 24;
    for (let start = 0; start < CARDS.length; start += BATCH) {
      const slice = CARDS.slice(start, start + BATCH);
      await ensureCardImages(slice);
      if (my !== gen) return;
      header();
      for (const cd of slice) {
        if (!keep(cd)) continue;
        const f = flags(cd);
        const rid: RarityId = params.rareté === 'shell' ? ctx.rarity : cd.rarity;
        const art = generateCardArt(cd, rid, { scale, flatOnly: true, design: params.design });
        const cell = el('figure', 'cell');
        cell.append(art.canvases.flat);
        art.dispose();
        const badges = [f.failed ? '<b class="bad">échec</b>' : '', f.low ? '<b class="warn">160px</b>' : '', f.keyed ? '<b>détourée</b>' : ''].join('');
        cell.append(el('figcaption', '', `<i style="background:${rarity(cd.rarity).hex}"></i>${String(cd.num).padStart(3, '0')} ${cd.name}<span>${badges}</span>`));
        cell.addEventListener('click', () => preview(cd));
        grid.append(cell);
      }
      await new Promise((r) => setTimeout(r));
    }
  }

  return {
    params,
    async setup(c) {
      ctx = c;
      await ensureFonts();
      root = el('div', 'sheet');
      head = el('header');
      grid = el('div', 'grid');
      root.append(el('style', '', CSS), head, grid);
      c.overlay.append(root);
      const sets = Object.fromEntries(Object.values(CARD_SETS).map((s) => [s.label, s.id]));
      c.gui
        .add(params, 'set', sets)
        .name('set (toutes les expériences)')
        .onChange((id: CardSetId) => (setActiveSet(id, true), void build()));
      c.gui.add(params, 'design', [...DESIGNS.map((d) => d.id), 'bebou']).name('gabarit').onChange(() => void build());
      c.gui.add(params, 'rareté', ['naturelle', 'shell']).name('rareté affichée').onChange(() => void build());
      c.gui.add(params, 'filtre', ['toutes', 'basse déf', 'détourées', 'en échec'] as Filter[]).onChange(() => void build());
      c.bag.fn(() => (gen++, root.remove()));
      // la première rangée est prête avant de rendre la main : le shell masque alors son « chargement… »
      void build();
    },
    setRarity() {
      if (params.rareté === 'shell') void build();
    },
    replay() {
      void build();
    },
    update() {
      ctx.renderer.setClearColor(0x121110, 1);
      ctx.renderer.clear();
    },
    dispose() {},
  };
};
