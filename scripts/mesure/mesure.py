"""Mesure de fluidité Bebou Card (Playwright + Chrome, WebGPU logiciel SwiftShader).
usage : xvfb-run -a python3 mesure.py <url /jeu/> <étiquette> <mobile|pc>
mobile = 390×844 DPR 2, CPU ×4, 4G (9 Mbit/s ↓, 1,5 Mbit/s ↑, 85 ms) · pc = 1440×900, sans bride.
NB : la 3D tourne sur un GPU LOGICIEL : les temps par image des scènes 3D ne valent qu'en comparaison avant/après."""
import sys, time, json
from playwright.sync_api import sync_playwright
url, label, prof = sys.argv[1], sys.argv[2], sys.argv[3]
MOB = prof == 'mobile'
INIT = r"""
(() => {
  const P = (window.__perf = { long: [], frames: [], rec: false, lcp: 0 });
  try { new PerformanceObserver((l) => l.getEntries().forEach((e) => P.long.push([Math.round(e.startTime), Math.round(e.duration)]))).observe({ type: 'longtask', buffered: true }); } catch {}
  let last = 0;
  const loop = (t) => { if (P.rec && last) P.frames.push(t - last); last = t; requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  P.start = () => { P.frames = []; P.rec = true; P.l0 = P.long.length; };
  P.stop = () => {
    P.rec = false;
    const f = P.frames.slice().sort((a, b) => a - b); const n = f.length || 1;
    const q = (p) => +(f[Math.min(n - 1, Math.floor(n * p))] || 0).toFixed(1);
    const lt = P.long.slice(P.l0);
    return { n: f.length, p50: q(0.5), p90: q(0.9), max: +(f[n - 1] || 0).toFixed(1), perdues: f.filter((x) => x > 25).length, longues: lt.length, longuesMs: lt.reduce((a, b) => a + b[1], 0) };
  };
  // délai toucher → première image où le DOM a changé
  P.react = (sel) => new Promise((res) => {
    const el = document.querySelector(sel); if (!el) return res(-1);
    const t0 = performance.now(); let done = false;
    const mo = new MutationObserver(() => { if (done) return; done = true; mo.disconnect(); requestAnimationFrame(() => res(+(performance.now() - t0).toFixed(1))); });
    mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    el.click();
    setTimeout(() => { if (!done) { done = true; mo.disconnect(); res(-2); } }, 4000);
  });
})();
"""
out = {'label': label, 'profil': prof}
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=False, args=['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-webgpu-adapter=swiftshader', '--no-sandbox', '--enable-precise-memory-info'])
    ctx = b.new_context(viewport={'width': 390, 'height': 844} if MOB else {'width': 1440, 'height': 900}, device_scale_factor=2 if MOB else 1, is_mobile=MOB, has_touch=MOB, storage_state='seed.json')
    ctx.add_init_script(INIT)
    pg = ctx.new_page()
    cdp = ctx.new_cdp_session(pg)
    cdp.send('Network.enable')
    net = {'n': 0, 'octets': 0, 'cache': 0}
    cdp.on('Network.loadingFinished', lambda e: (net.__setitem__('n', net['n'] + 1), net.__setitem__('octets', net['octets'] + int(e.get('encodedDataLength', 0)))))
    cdp.on('Network.requestServedFromCache', lambda e: net.__setitem__('cache', net['cache'] + 1))
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
    def bride(on):
        cdp.send('Emulation.setCPUThrottlingRate', {'rate': 4 if (MOB and on) else 1})
        if MOB and on: cdp.send('Network.emulateNetworkConditions', {'offline': False, 'latency': 85, 'downloadThroughput': 9e6 / 8, 'uploadThroughput': 1.5e6 / 8})
        else: cdp.send('Network.emulateNetworkConditions', {'offline': False, 'latency': 0, 'downloadThroughput': -1, 'uploadThroughput': -1})
    def demarrage(nom):
        net.update(n=0, octets=0, cache=0)
        t = time.time()
        if nom == 'froid': pg.goto(url, wait_until='commit')
        else: pg.reload(wait_until='commit')
        pg.wait_for_function('window.__jeu && window.__jeu.ready', timeout=180000)
        tti = round(time.time() - t, 2)
        lt = pg.evaluate('window.__perf.long')
        out[nom] = {'interactif_s': tti, 'requetes': net['n'], 'ko': round(net['octets'] / 1024), 'depuis_cache': net['cache'], 'taches_longues': len(lt), 'taches_longues_ms': sum(x[1] for x in lt), 'pire_ms': max([x[1] for x in lt] or [0])}
    bride(True)
    demarrage('froid')
    time.sleep(6)  # laisse finir les préchargements de fond
    out['froid']['ko_apres_6s'] = round(net['octets'] / 1024); out['froid']['requetes_apres_6s'] = net['n']
    demarrage('chaud')
    time.sleep(5)
    def ecran(nom, action=None, dur=3.0):
        pg.evaluate('window.__perf.start()')
        if action: action()
        time.sleep(dur)
        out.setdefault('ecrans', {})[nom] = pg.evaluate('window.__perf.stop()')
    def react(nom, sel):
        out.setdefault('reaction_ms', {})[nom] = pg.evaluate('(s) => window.__perf.react(s)', sel)
    ecran('boutique au repos', dur=4)
    out['memoire'] = pg.evaluate("({ tasJS_Mo: Math.round(performance.memory.usedJSHeapSize / 1048576), gpu: (() => { try { const m = window.__jeu.shell.renderer.info.memory; return { textures: m.textures, geometries: m.geometries, renderTargets: m.renderTargets ?? null, total_Mo: m.total ? Math.round(m.total / 1048576) : null }; } catch (e) { return String(e); } })() })")
    # navigation boutique → collection
    pg.evaluate('window.__perf.start()')
    react('boutique → collection', 'nav a[data-r="collection"]')
    try: pg.wait_for_selector('.tile', timeout=20000)
    except Exception: errs.append('pas de tuile en collection')
    time.sleep(1.5)
    out.setdefault('ecrans', {})['transition → collection'] = pg.evaluate('window.__perf.stop()')
    def defile():
        pg.evaluate("(async () => { const s = document.scrollingElement; for (let i = 0; i < 40; i++) { s.scrollBy(0, 60); await new Promise((r) => requestAnimationFrame(r)); } for (let i = 0; i < 40; i++) { s.scrollBy(0, -60); await new Promise((r) => requestAnimationFrame(r)); } })()")
    ecran('collection : défilement', defile, 2.5)
    out['images_collection'] = pg.evaluate("({ img: document.images.length, chargees: [...document.images].filter((i) => i.complete && i.naturalWidth).length, tuiles: document.querySelectorAll('.tile').length })")
    # vue détail
    pg.evaluate('window.__perf.start()')
    react('tuile → vue détail', '.tile[role="button"], .tile')
    time.sleep(3)
    out['ecrans']['transition → vue détail'] = pg.evaluate('window.__perf.stop()')
    ecran('vue détail au repos', dur=3)
    pg.evaluate('window.__perf.start()'); pg.go_back(); time.sleep(1.5)
    out['ecrans']['retour arrière'] = pg.evaluate('window.__perf.stop()')
    out['retour'] = pg.evaluate("({ hash: location.hash, tuiles: document.querySelectorAll('.tile').length, defilement: document.scrollingElement.scrollTop })")
    for nom, r in [('jeux', 'jeux'), ('échanges', 'echanges'), ('boutique', '')]:
        pg.evaluate('window.__perf.start()')
        react('→ ' + nom, f'nav a[data-r="{r}"]')
        time.sleep(2)
        out['ecrans']['transition → ' + nom] = pg.evaluate('window.__perf.stop()')
    # ouverture d'un booster (GPU logiciel : comparaison relative seulement)
    try:
        pg.evaluate('window.__perf.start()')
        react('bouton Ouvrir', '.open-btn')
        for _ in range(14):
            time.sleep(1); pg.evaluate('window.__jeu.tap()')
        out['ecrans']['ouverture de booster (15 s)'] = pg.evaluate('window.__perf.stop()')
    except Exception as e: errs.append('ouverture: ' + str(e)[:120])
    out['memoire_fin'] = pg.evaluate("({ tasJS_Mo: Math.round(performance.memory.usedJSHeapSize / 1048576) })")
    out['erreurs'] = errs[:10]
    pg.screenshot(path=f'fin-{label}-{prof}.png')
    b.close()
json.dump(out, open(f'res-{label}-{prof}.json', 'w'), ensure_ascii=False, indent=1)
print(json.dumps(out, ensure_ascii=False, indent=1))
