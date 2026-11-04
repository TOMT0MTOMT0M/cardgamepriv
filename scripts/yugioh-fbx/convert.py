"""
FBX extrait d'un jeu (squelette + jeux de textures T_<id>_<morceau>_C/N/ORM/A.tga) → GLB prêt pour la cinématique
d'invocation (public/fx/yugioh/models/<carte>.glb) : textures embarquées (couleur, normales, ORM, découpe alpha),
noms d'os d'origine gardés (userData.rig, lus par src/game/scenes/duelRig.ts), puis compression meshopt + WebP 1024.

  python3 scripts/yugioh-fbx/convert.py "imports/Raw Files/Blue Eyes White Dragon.fbx" public/fx/yugioh/models/blue-eyes-white-dragon.glb \
      --parts '{"eyeball":"eye","head":"head","body":"body"}' --alpha head

Les .tga doivent être à côté du .fbx. Il faut : Python (Pillow, playwright), Node (npx @gltf-transform/cli@4).
"""
import argparse, base64, functools, glob, http.server, json, os, re, shutil, subprocess, tempfile, threading
from PIL import Image
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument('fbx'); ap.add_argument('out')
ap.add_argument('--parts', required=True, help='morceau du nom de matériau → jeu de textures (JSON)')
ap.add_argument('--alpha', default='', help="jeux dont la texture _A est un masque de découpe (virgules)")
a = ap.parse_args()
root = os.path.dirname(os.path.abspath(__file__))
repo = os.path.abspath(os.path.join(root, '..', '..'))
work = tempfile.mkdtemp(prefix='fbx2glb-')
os.makedirs(os.path.join(work, 'tex'))
shutil.copy(a.fbx, os.path.join(work, 'model.fbx'))
shutil.copy(os.path.join(root, 'convert.html'), os.path.join(work, 'convert.html'))
os.symlink(os.path.join(repo, 'node_modules', 'three'), os.path.join(work, 'three'))
alpha = [x for x in a.alpha.split(',') if x]
for f in glob.glob(os.path.join(os.path.dirname(os.path.abspath(a.fbx)), 'T_*_*_*.tga')):
    m = re.match(r'T_[^_]+_([a-z]+)_([A-Z]+)\.tga$', os.path.basename(f))
    if not m: continue
    part, kind = m.groups()
    if kind == 'A': continue
    im = Image.open(f)
    if kind == 'C' and part in alpha:
        mask = os.path.join(os.path.dirname(f), os.path.basename(f).replace('_C.tga', '_A.tga'))
        im = im.convert('RGBA'); im.putalpha(Image.open(mask).convert('L').resize(im.size))
    else:
        im = im.convert('RGB')
    im.save(os.path.join(work, 'tex', f'{part}_{kind}.png'))
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(http.server.SimpleHTTPRequestHandler, directory=work))
threading.Thread(target=srv.serve_forever, daemon=True).start()
url = f'http://127.0.0.1:{srv.server_address[1]}/convert.html?parts={json.dumps(json.loads(a.parts))}&alpha={",".join(alpha)}'
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page()
    pg.goto(url); pg.wait_for_function('window.__glb', timeout=300000)
    raw = os.path.join(work, 'raw.glb')
    open(raw, 'wb').write(base64.b64decode(pg.evaluate('window.__glb'))); b.close()
srv.shutdown()
subprocess.run(['npx', '-y', '@gltf-transform/cli@4', 'optimize', raw, a.out, '--compress', 'meshopt', '--texture-compress', 'webp', '--texture-size', '1024',
                '--flatten', 'false', '--join', 'false', '--instance', 'false', '--palette', 'false', '--simplify', 'false', '--prune-solid-textures', 'false'], check=True)
print(a.out, os.path.getsize(a.out), 'octets')
