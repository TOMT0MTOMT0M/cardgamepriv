import gsap from 'gsap';
import type { Experiment, LabContext } from '../../core/Experiment';
import { SUBTHEMES, catalogEntry } from '../../core/sets/themes';
import { createViewerScene } from '../../game/scenes/viewer';
import { MYTHIC_FAMILIES, mythicCard, mythicClues, mythicFamily, mythicScene } from '../../game/mythic';
import { actorWidth } from '../../game/mythic/kit';
import type { PreludeHandle } from '../../game/mythic/runtime';

/**
 * 045 — SCÈNES 6★ PAR FAMILLE (10/11) : les 26 mises en scène du jeu (game/mythic/scenes), seules, avec la vraie
 * visionneuse du jeu dessous — indices façon walkout → scène de la famille → la doublure se fond sur la carte 3D, qui se
 * retourne. Exactement le code du jeu (même moteur, mêmes scènes, même visionneuse) : ce qu'on règle ici part en jeu.
 *
 * Réglages : famille, sous-famille (certaines scènes ont des variantes : Valorant lame / arme / agent, sports
 * collectifs, précision, voitures, nourriture, animaux marins, teinte LoL), carte, version (ouverture complète, courte
 * ×2,2, visionneuse). `?famille=musique&sub=<id>&carte=<id>&version=courte|visionneuse&speed=0.25&t=1.8` (t : la scène
 * figée à cet instant, pour les captures). Un toucher pendant la scène passe à la carte ; ensuite, un toucher rejoue.
 */
const VERSIONS = { 'ouverture (complète)': 'full', 'ouverture (déjà vue, ×2,2)': 'courte', 'visionneuse (collection…)': 'visionneuse' } as const;
type Version = (typeof VERSIONS)[keyof typeof VERSIONS];

/** nom lisible des familles (le catalogue n'a que le libellé du groupe) */
const FAMILY_LABEL: Record<string, string> = {
  'jeux-video': 'Jeux vidéo — Cartouche', lol: 'League of Legends — Splash', cs: 'Skins CS — Caisse', valorant: 'Valorant — Inspection',
  anime: 'Mangas & anime — Case de manga', musique: 'Musique — Vinyle', series: 'Séries TV — Télé cathodique', films: 'Films — Salle de cinéma',
  dessins: 'Dessins animés — Celluloïds', stars: 'Acteurs & actrices — Tapis rouge', youtubeurs: 'YouTube — Le direct',
  foot: 'Football — Tunnel', collectifs: 'Sports collectifs — Buzzer', olympiques: 'Olympiques — Photo-finish', combat: 'Combat — Ring',
  raquettes: 'Raquettes — Arbitrage vidéo', glisse: 'Glisse — Chrono', meca: 'Sports mécaniques — Feux de départ', precision: 'Précision — Échecs / golf / cible',
  esport: 'Esport — Le dernier coup', coulisses: 'Coulisses — Vestiaire',
  animaux: 'Animaux — Piège photo', lieux: 'Lieux & pays — Globe', nourriture: 'Nourriture — Distributeur / Cloche', voitures: 'Voitures — Bâche', ardeche: 'Ardèche — Carte topo',
};

export default function create(): Experiment {
  const q = new URLSearchParams(location.search);
  const inner = createViewerScene();
  let ctx: LabContext;
  let run: PreludeHandle | null = null;
  let playing = false;
  let token = 0;
  let caption: HTMLElement;

  /** famille → sous-famille → cartes 6★ (celles qui jouent une scène : ni Pokémon, ni Yu-Gi-Oh) */
  const index = new Map<string, Map<string, { label: string; ids: string[] }>>();
  function buildIndex() {
    index.clear();
    for (const st of SUBTHEMES) {
      const fam = st.group?.id ?? st.id;
      if (!MYTHIC_FAMILIES.includes(fam)) continue;
      const ids = st.cards.filter((c) => c.rarity === 'mythic' && mythicFamily(c.id, 'mythic') === fam).map((c) => c.id);
      if (!ids.length) continue;
      if (!index.has(fam)) index.set(fam, new Map());
      index.get(fam)!.set(st.id, { label: st.label.replace(/^[^—]+—\s*/, '').replace(/\s*★\s*$/, ''), ids });
    }
  }

  const params = {
    famille: 'anime',
    sub: '',
    n: 0,
    version: 'full' as Version,
    vitesse: 1,
    rejouer: () => void play(),
    suivante: () => {
      const subs = index.get(params.famille);
      const ids = subs?.get(params.sub)?.ids ?? [];
      params.n = (params.n + 1) % Math.max(1, ids.length);
      void play();
    },
    famSuivante: () => {
      const fams = MYTHIC_FAMILIES.filter((f) => index.has(f));
      params.famille = fams[(fams.indexOf(params.famille) + 1) % fams.length];
      syncSubs();
      ctx.gui.controllersRecursive().forEach((c) => c.updateDisplay());
      void play();
    },
  };
  let subCtrl: { options(o: Record<string, string>): unknown } | null = null;

  function syncSubs() {
    const subs = index.get(params.famille);
    if (!subs?.has(params.sub)) params.sub = subs ? [...subs.keys()][0] : '';
    params.n = 0;
    if (!subCtrl || !subs) return;
    const opts: Record<string, string> = {};
    for (const [id, s] of subs) opts[`${s.label} (${s.ids.length})`] = id;
    const c = subCtrl.options(opts) as { name(n: string): unknown; onChange(f: () => void): unknown; options(o: Record<string, string>): unknown };
    c.name('sous-famille');
    c.onChange(() => {
      params.n = 0;
      void play();
    });
    subCtrl = c;
  }

  const cardId = () => {
    const forced = q.get('carte');
    if (forced && mythicFamily(forced, 'mythic') === params.famille) return forced;
    const ids = index.get(params.famille)?.get(params.sub)?.ids ?? [];
    return ids[params.n % Math.max(1, ids.length)];
  };

  async function play() {
    const my = ++token;
    run?.abort();
    run = null;
    const id = cardId();
    const card = id ? mythicCard(id) : null;
    const scene = mythicScene(params.famille);
    if (!id || !card || !scene) return;
    playing = true;
    caption.textContent = '';
    gsap.globalTimeline.timeScale(params.vitesse);
    const rt = await import('../../game/mythic/runtime');
    if (my !== token) return;
    const all = mythicClues(id);
    const viewer = params.version === 'visionneuse';
    const freeze = Number(q.get('t'));
    const r = (run = rt.runPrelude({
      host: { quality: ctx.quality, sfx: ctx.sfx },
      card,
      clues: viewer ? all.slice(1, 2).concat(all.length > 1 ? [] : all) : all,
      mode: 'viewer',
      short: params.version === 'courte',
      reduced: false,
      scene,
      mount: ctx.overlay,
      onScene: (tl) => {
        if (freeze > 0) tl.pause().time(freeze);
      },
    }));
    // la carte se prépare sous la scène et attend de dos (comme en jeu) ; elle se retourne quand le calque se fond
    void inner.show(id, 'mythic', { hold: r.handoff, fromW: actorWidth(ctx.overlay.clientWidth, ctx.overlay.clientHeight) });
    await r.done;
    if (my !== token) return;
    playing = false;
    const e = catalogEntry(id);
    caption.textContent = `${e?.name ?? id} · ${index.get(params.famille)?.get(params.sub)?.label ?? ''} · toucher = rejouer`;
  }

  return {
    dprCap: inner.dprCap,
    async setup(c) {
      ctx = c;
      await inner.setup(c);
      buildIndex();
      const fams = MYTHIC_FAMILIES.filter((f) => index.has(f));
      const f0 = q.get('famille');
      params.famille = f0 && fams.includes(f0) ? f0 : fams.includes('anime') ? 'anime' : fams[0];
      const s0 = q.get('sub');
      if (s0 && index.get(params.famille)?.has(s0)) params.sub = s0;
      const forced = q.get('carte');
      const fe = forced ? catalogEntry(forced) : null;
      if (fe && mythicFamily(fe.id, 'mythic') === params.famille) params.sub = fe.subthemeId;
      const v0 = q.get('version');
      if (v0 === 'courte' || v0 === 'visionneuse') params.version = v0;
      const sp = Number(q.get('speed'));
      if (sp > 0) params.vitesse = sp;

      caption = document.createElement('div');
      caption.style.cssText = 'position:absolute;left:0;right:0;top:62px;text-align:center;font:600 11px "Inter",system-ui,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.5);pointer-events:none;';
      c.overlay.append(caption);

      const famOpts: Record<string, string> = {};
      for (const f of fams) famOpts[FAMILY_LABEL[f] ?? f] = f;
      c.gui.add(params, 'famille', famOpts).name('famille').onChange(() => {
        syncSubs();
        void play();
      });
      subCtrl = c.gui.add(params, 'sub', { '—': '' }) as unknown as typeof subCtrl;
      const keep = params.sub;
      syncSubs();
      if (keep && index.get(params.famille)?.has(keep)) params.sub = keep;
      c.gui.add(params, 'version', VERSIONS).name('version').onChange(() => void play());
      c.gui.add(params, 'vitesse', 0.1, 2, 0.05).name('vitesse (×)').onChange((v: number) => gsap.globalTimeline.timeScale(v));
      c.gui.add(params, 'rejouer').name('▶ rejouer');
      c.gui.add(params, 'suivante').name('carte suivante');
      c.gui.add(params, 'famSuivante').name('famille suivante →');
      c.gui.controllersRecursive().forEach((k) => k.updateDisplay());

      c.bag.fn(c.input.onTap(() => !playing && void play()));
      c.bag.fn(() => {
        token++;
        run?.abort();
        gsap.globalTimeline.timeScale(1);
      });
      void play();
    },
    update: (dt, t) => inner.update(dt, t),
    resize: (w, h) => inner.resize?.(w, h),
    replay: () => void play(),
    dispose: () => inner.dispose(),
  };
}
