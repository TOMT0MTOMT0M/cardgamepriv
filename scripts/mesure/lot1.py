import time, json, sys
from playwright.sync_api import sync_playwright
ARGS=['--enable-unsafe-webgpu','--ignore-gpu-blocklist','--use-webgpu-adapter=swiftshader','--no-sandbox']
def ctx_new(b): return b.new_context(viewport={'width':390,'height':844}, device_scale_factor=2, is_mobile=True, has_touch=True)
def throttle(ctx, pg):
    c = ctx.new_cdp_session(pg); c.send('Network.enable')
    c.send('Network.emulateNetworkConditions', {'offline': False, 'latency': 85, 'downloadThroughput': 9e6/8, 'uploadThroughput': 1.5e6/8})
    return c
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=False, args=ARGS)
    # 1) catalogue : fin de téléchargement, base (4311) vs lot 1 (4310), 4G
    for port, nom in [(4310,'lot1')]:
        ctx = ctx_new(b); pg = ctx.new_page(); throttle(ctx, pg)
        texts=[]
        pg.expose_function('__t', lambda s: texts.append(s))
        pg.add_init_script("new MutationObserver(()=>{const t=document.querySelector('.l-txt'); if(t) window.__t(t.textContent)}).observe(document,{subtree:true,childList:true,characterData:true})")
        t=time.time(); pg.goto(f'http://localhost:{port}/jeu/', wait_until='commit')
        pg.wait_for_function('window.__jeu && window.__jeu.ready', timeout=180000)
        r = pg.evaluate("(() => { const e = performance.getEntriesByType('resource'); const c = e.filter(x=>/catalogBig/.test(x.name)).map(x=>Math.round(x.responseEnd)); return {catalogue_fin_ms: Math.max(...c), dernier_js_ms: Math.round(Math.max(...e.filter(x=>/assets\\/.*\\.js/.test(x.name)).map(x=>x.responseEnd)))} })()")
        print(nom, r, 'interactif', round(time.time()-t,1), 'textes', list(dict.fromkeys(texts))[:12])
        if nom=='lot1':
            # 2) installation : attendre la fin, puis inventaire
            for i in range(90):
                st = pg.evaluate("(async()=>{ const c=await caches.open('bebou-app-v1'); const k=await c.keys(); return {n:k.length, ctl: !!navigator.serviceWorker.controller, id: localStorage.getItem('bebou.bundle.id')} })()")
                if st['id']: break
                time.sleep(2)
            print('installé', st, 'après', round(time.time()-t), 's')
            man = pg.evaluate("fetch('../precache.json').then(r=>r.json())")
            print('manifeste', len(man['files']))
            # 3) relance en ligne : combien de requêtes sortent du SW / du réseau ?
            seen=[]
            pg.on('response', lambda r: seen.append((r.from_service_worker, r.url.split('4310')[1][:60], r.status)))
            pg.reload(); pg.wait_for_function('window.__jeu && window.__jeu.ready', timeout=180000); time.sleep(8)
            print('relance: total', len(seen), 'depuis SW', sum(1 for s in seen if s[0]), 'hors SW', [s for s in seen if not s[0]][:12])
            # 4) hors ligne
            ctx.set_offline(True)
            try:
                pg.reload(); pg.wait_for_function('window.__jeu && window.__jeu.ready', timeout=180000)
                print('HORS LIGNE: le jeu démarre')
                pg.evaluate("location.hash='#/collection'"); time.sleep(3)
                pg.evaluate("location.hash='#/jeux'"); time.sleep(3)
                print('pages hors ligne:', pg.evaluate("document.querySelector('main').innerText.slice(0,80)"))
            except Exception as e: print('HORS LIGNE: ÉCHEC', str(e)[:200])
            pg.screenshot(path='offline.png')
        ctx.close()
    b.close()
