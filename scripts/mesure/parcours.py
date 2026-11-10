import time, sys, json
from playwright.sync_api import sync_playwright
out={}
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=False, args=['--enable-unsafe-webgpu','--ignore-gpu-blocklist','--use-webgpu-adapter=swiftshader','--no-sandbox'])
    for nom, vp, mob in [('390', {'width':390,'height':844}, True), ('1440', {'width':1440,'height':900}, False)]:
        ctx = b.new_context(viewport=vp, device_scale_factor=1, is_mobile=mob, has_touch=mob, storage_state='seed.json')
        pg = ctx.new_page(); errs=[]
        pg.on('pageerror', lambda e: errs.append('EXC '+str(e)[:160]))
        pg.on('console', lambda m: errs.append('ERR '+m.text[:160]) if m.type=='error' else None)
        pg.on('requestfailed', lambda r: errs.append('NET '+r.url[-70:]))
        pg.goto('http://localhost:4310/jeu/'); pg.wait_for_function('window.__jeu && window.__jeu.ready', timeout=180000)
        pg.evaluate("(() => { const s = JSON.parse(localStorage.getItem('bebou.demo.v1')); s.packBalance = 20; localStorage.setItem('bebou.demo.v1', JSON.stringify(s)); })()")
        pg.reload(); pg.wait_for_function('window.__jeu && window.__jeu.ready', timeout=180000); time.sleep(6)
        pg.screenshot(path=f'p-{nom}-1-boutique.png')
        pg.evaluate("document.querySelector('.open-btn').click()")
        for i in range(30):
            time.sleep(1.5); pg.evaluate('window.__jeu.tap()')
            if i==12: pg.screenshot(path=f'p-{nom}-2-ouverture.png')
        res={}
        for r in ['collection','echanges','jeux','classement','succes','amis','profil']:
            pg.evaluate(f"location.hash='#/{r}'"); time.sleep(5)
            res[r]=pg.evaluate("({txt: document.querySelector('main').innerText.replace(/\\s+/g,' ').slice(0,70), tuiles: document.querySelectorAll('.tile').length, visibles: [...document.querySelectorAll('.tile .art img')].filter(i=>getComputedStyle(i).opacity!=='0').length, imgs: document.querySelectorAll('.tile .art img').length})")
            pg.screenshot(path=f'p-{nom}-3-{r}.png')
            if r=='collection':
                pg.evaluate("document.querySelector('.tile.owned').click()"); time.sleep(8)
                pg.screenshot(path=f'p-{nom}-4-detail.png')
                pg.go_back(); time.sleep(3)
                res['retour']=pg.evaluate("({hash: location.hash, tuiles: document.querySelectorAll('.tile').length, visibles: [...document.querySelectorAll('.tile .art img')].filter(i=>getComputedStyle(i).opacity!=='0').length})")
                pg.screenshot(path=f'p-{nom}-5-retour.png')
        time.sleep(40)
        res['sw']=pg.evaluate("(async()=>({ctl: !!navigator.serviceWorker.controller, app: (await (await caches.open('bebou-app-v1')).keys()).length, art: (await (await caches.open('bebou-art-v1')).keys()).length}))()")
        out[nom]={'pages':res,'erreurs':list(dict.fromkeys(errs))[:15]}
        ctx.close()
    b.close()
print(json.dumps(out, ensure_ascii=False, indent=1))
