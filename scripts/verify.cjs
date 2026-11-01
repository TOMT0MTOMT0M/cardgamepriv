/* eslint-disable */
/**
 * Vérification headless (Playwright + Chromium, WebGPU via SwiftShader si pas de GPU).
 *
 *   npm run build && node scripts/verify.cjs            (Windows/macOS : GPU réel)
 *   npm run build && xvfb-run -a node scripts/verify.cjs --sw   (Linux sans GPU)
 *   options : [--ids=001-holo-thinfilm,002-…] [--backend=webgl]
 *        [--shots=1500,4000] [--tap=1200] [--rarity=legendary] [--size=1280x800] [--leak=3]
 *
 * - lance `vite preview` (dist/) sur un port libre
 * - pour chaque expérience : charge, attend `__lab.ready`, capture aux instants demandés,
 *   collecte erreurs console + exceptions
 * - --leak=N : enchaîne N fois toutes les expériences dans la même page et compare renderer.info.memory
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('@playwright/test'));
}

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  }),
);
const PORT = +(args.port || 4179);
const BASE = args.url || `http://localhost:${PORT}/`;
const backend = args.backend || 'webgpu';
const shots = (args.shots || '1800').split(',').map(Number);
const [W, H] = (args.size || '1180x780').split('x').map(Number);
const outDir = path.resolve(args.out || 'shots');
fs.mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function startServer() {
  if (args.url) return null;
  const p = spawn(process.execPath, [path.resolve(__dirname, '../node_modules/vite/bin/vite.js'), 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', cwd: path.resolve(__dirname, '..') });
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(BASE);
      if (r.ok) return p;
    } catch {}
    await sleep(250);
  }
  throw new Error('preview server did not start');
}

(async () => {
  const server = await startServer();
  // NB : en headless pur, la présentation d'un canvas WebGPU échoue (device perdu).
  // Sur Linux sans GPU : `xvfb-run -a node scripts/verify.cjs --sw` (fenêtre réelle + SwiftShader).
  const launchArgs = ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'];
  if (args.sw) launchArgs.push('--use-webgpu-adapter=swiftshader');
  const browser = await chromium.launch({ headless: args.headless === 'true', args: launchArgs });
  const results = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    // découverte des ids
    const probe = await ctx.newPage();
    await probe.goto(`${BASE}?backend=${backend}`);
    await probe.waitForFunction(() => window.__lab && window.__lab.ready, null, { timeout: 120000 });
    const all = await probe.evaluate(() => window.__lab.ids());
    const backendName = await probe.evaluate(() => window.__lab.backend());
    await probe.close();
    const ids = args.ids ? args.ids.split(',').map((s) => all.find((x) => x.startsWith(s)) || s) : all;
    console.log(`backend demandé=${backend} → effectif=${backendName} · ${ids.length} expérience(s)`);

    if (args.leak) {
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      await page.goto(`${BASE}?backend=${backend}#/exp/${ids[0]}`);
      await page.waitForFunction(() => window.__lab && window.__lab.ready, null, { timeout: 120000 });
      const snaps = [];
      for (let c = 0; c < +args.leak; c++) {
        for (const id of ids) {
          await page.evaluate((id) => window.__lab.goto(id), id);
          await page.waitForFunction((id) => window.__lab.ready && window.__lab.id === id, id, { timeout: 120000 });
          await sleep(+(args.leakwait || 250));
        }
        await page.evaluate((id) => window.__lab.goto(id), ids[0]);
        await page.waitForFunction((id) => window.__lab.ready && window.__lab.id === id, ids[0], { timeout: 120000 });
        await sleep(400);
        const m = await page.evaluate(() => window.__lab.memory());
        snaps.push(m);
        console.log(`cycle ${c + 1}: textures=${m.textures} geometries=${m.geometries} renderTargets=${m.renderTargets} storage=${m.storageAttributes} attributes=${m.attributes} total=${(m.total / 1e6).toFixed(1)}MB`);
      }
      console.log(errors.length ? `ERREURS:\n${errors.join('\n')}` : 'aucune erreur pendant le cycle');
      await page.close();
    }

    if (!args.leak || args.shots) {
      for (const id of ids) {
        const page = await ctx.newPage();
        const errors = [];
        const warnings = [];
        page.on('pageerror', (e) => errors.push(String(e)));
        page.on('console', (m) => {
          if (m.type() === 'error') errors.push(m.text());
          else if (m.type() === 'warning') warnings.push(m.text());
        });
        const q = new URLSearchParams({ backend });
        if (args.rarity) q.set('rarity', args.rarity);
        if (args.clean) q.set('clean', '1');
        const t0 = Date.now();
        await page.goto(`${BASE}?${q}#/exp/${id}`);
        try {
          await page.waitForFunction((id) => window.__lab && window.__lab.ready && window.__lab.id === id, id, { timeout: 150000 });
        } catch (e) {
          errors.push('TIMEOUT ready');
        }
        const tReady = Date.now();
        const files = [];
        let last = 0;
        let tapped = false;
        for (const t of shots) {
          if (args.tap && !tapped && +args.tap <= t) {
            await sleep(Math.max(0, +args.tap - last));
            last = +args.tap;
            await page.evaluate(() => window.__lab.tap(0, 0));
            tapped = true;
          }
          await sleep(Math.max(0, t - last));
          last = t;
          const f = path.join(outDir, `${id}${args.rarity ? '-' + args.rarity : ''}${backend === 'webgl' ? '-gl' : ''}-${t}.png`);
          await page.screenshot({ path: f, timeout: 180000 });
          files.push(path.basename(f));
        }
        const fps = await page.evaluate(() => (window.__lab ? window.__lab.fps : 0)).catch(() => 0);
        const info = await page.evaluate(() => (window.__lab ? window.__lab.info() : null)).catch(() => null);
        results.push({ id, readyMs: tReady - t0, fps: +fps.toFixed(1), errors, warnings: warnings.slice(0, 5), files, calls: info?.render?.drawCalls ?? info?.render?.calls });
        console.log(`${errors.length ? '✗' : '✓'} ${id}  ready ${tReady - t0}ms  fps(sw)=${fps.toFixed(1)}  ${errors.length ? 'ERR ' + errors.slice(0, 3).join(' | ') : ''}${warnings.length ? '  warn: ' + warnings.slice(0, 2).join(' | ').slice(0, 300) : ''}`);
        await page.close();
      }
      fs.writeFileSync(path.join(outDir, `report-${backend}.json`), JSON.stringify(results, null, 2));
    }
  } finally {
    await browser.close();
    if (server) server.kill();
  }
  const failed = results.filter((r) => r.errors.length);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
