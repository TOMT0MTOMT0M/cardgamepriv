import time, sys
from playwright.sync_api import sync_playwright
INIT = """
(() => { const P = (window.__pipes = { n: 0, log: [] });
  const wrap = (name) => { const o = GPUDevice.prototype[name]; if (!o) return; GPUDevice.prototype[name] = function (d) { P.n++; P.log.push(Math.round(performance.now())); return o.call(this, d); }; };
  try { wrap('createRenderPipeline'); wrap('createRenderPipelineAsync'); } catch (e) {} })();
"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=False, args=['--enable-unsafe-webgpu','--ignore-gpu-blocklist','--use-webgpu-adapter=swiftshader','--no-sandbox'])
    for port, nom in [(4311,'base'),(4310,'lot3')]:
        ctx = b.new_context(viewport={'width':390,'height':844}, device_scale_factor=1, is_mobile=True, has_touch=True, storage_state='seed.json' if port==4310 else None)
        ctx.add_init_script(INIT)
        pg = ctx.new_page()
        if port==4311:
            pg.goto(f'http://localhost:{port}/jeu/'); pg.wait_for_function('window.__jeu && window.__jeu.ready', timeout=180000)
        else:
            pg.goto(f'http://localhost:{port}/jeu/'); pg.wait_for_function('window.__jeu && window.__jeu.ready', timeout=180000)
        pg.evaluate("(() => { const s = JSON.parse(localStorage.getItem('bebou.demo.v1')); s.packBalance = 50; localStorage.setItem('bebou.demo.v1', JSON.stringify(s)); })()")
        pg.reload(); pg.wait_for_function('window.__jeu && window.__jeu.ready', timeout=180000)
        time.sleep(12)
        n0 = pg.evaluate('window.__pipes.n')
        res=[]
        for k in range(2):
            pg.evaluate("document.querySelector('.open-btn').click()")
            for _ in range(40):
                time.sleep(1.5); pg.evaluate('window.__jeu.tap()')
            res.append(pg.evaluate('window.__pipes.n'))
            pg.screenshot(path=f'pipes-{nom}-{k}.png')
        print(nom, 'pipelines au démarrage', n0, '· après ouverture 1', res[0]-n0, '· après ouverture 2', res[1]-res[0], pg.evaluate("document.querySelector('.open-btn')?.textContent"))
        ctx.close()
    b.close()
