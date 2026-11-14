"""Contrôle visuel d'une cuisson de déchirure (npm run bake:tear -- --only=0 --preview).

    python3 scripts/bake-tear/preview.py [.cache/bake-tear/preview-0.json] [sortie.png]

Planche : pour chaque image enregistrée, vue de 3/4 (filaire ombré) et vue de profil (x = profondeur, y = hauteur).
"""
import json, sys
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection

src = sys.argv[1] if len(sys.argv) > 1 else '.cache/bake-tear/preview-0.json'
out = sys.argv[2] if len(sys.argv) > 2 else '.cache/bake-tear/preview-0.png'
d = json.load(open(src))
nx = d['nx']
frames = d['frames']
cols = min(6, len(frames))
rows = (len(frames) + cols - 1) // cols
fig = plt.figure(figsize=(cols * 3.2, rows * 4.4), dpi=90)
colors = {('body', 1): '#9aa4b0', ('body', -1): '#5c6570', ('strip', 1): '#d9a441', ('strip', -1): '#9c6f1f'}
for fi, fr in enumerate(frames):
    P = np.array(fr['p']).reshape(-1, 3)
    ax = fig.add_subplot(rows, cols, fi + 1, projection='3d')
    for s in d['sheets']:
        b, ny = s['base'], s['ny']
        G = P[b:b + ny * nx].reshape(ny, nx, 3)[:, :, [0, 2, 1]]
        st = 2
        polys = []
        for j in range(0, ny - 1, 1):
            for i in range(0, nx - 1, st):
                i2 = min(nx - 1, i + st)
                polys.append([G[j, i], G[j, i2], G[j + 1, i2], G[j + 1, i]])
        pc = Poly3DCollection(polys, facecolor=colors[(s['part'], s['side'])], edgecolor='k', linewidths=0.05, alpha=0.85)
        ax.add_collection3d(pc)
    ax.set_xlim(-0.6, 0.6); ax.set_ylim(-0.4, 0.8); ax.set_zlim(-0.7, 0.9)
    # three.js : x droite, y haut, z vers la caméra → matplotlib : (x, z, y)
    ax.view_init(elev=12, azim=-62)
    ax.set_box_aspect((1.2, 1.2, 1.6))
    ax.set_axis_off()
    f = fr['f']
    label = f"p={f / (d['nTear'] - 1):.2f}" if f < d['nTear'] else f"t={(f - d['nTear']) / d['exitFps']:.2f}s"
    ax.set_title(label, fontsize=9)
plt.tight_layout()
plt.savefig(out)
print(out)

# ── profils (colonne du milieu) : corps avant / dos et cartes — on doit voir les lèvres s'écarter au passage des cartes
import math
def glide(x):
    # cubicBezier(0.16, 1, 0.3, 1)
    if x <= 0: return 0.0
    if x >= 1: return 1.0
    ax, bx, cx = 1 - 3 * 0.3 + 3 * 0.16, 3 * 0.3 - 6 * 0.16, 3 * 0.16
    ay, by, cy = 1 - 3 * 1 + 3 * 1, 3 * 1 - 6 * 1, 3 * 1
    t = x
    for _ in range(8):
        sx = ((ax * t + bx) * t + cx) * t
        dx = (3 * ax * t + 2 * bx) * t + cx
        if abs(dx) < 1e-6: break
        t -= (sx - x) / dx
    return ((ay * t + by) * t + cy) * t
H = 1.357
cyy, hh, t_card = -0.03, 0.88 * 0.92 / 2, 0.012 * 0.92
fig2 = plt.figure(figsize=(len(frames) * 1.6, 5.5), dpi=90)
for fi, fr in enumerate(frames):
    P = np.array(fr['p']).reshape(-1, 3)
    ax = fig2.add_subplot(1, len(frames), fi + 1)
    for s in d['sheets']:
        b, ny = s['base'], s['ny']
        G = P[b:b + ny * nx].reshape(ny, nx, 3)
        for col, c in ((nx // 2, colors[(s['part'], s['side'])]), (nx // 5, '#bbbbbb')):
            ax.plot(G[:, col, 2], G[:, col, 1], '-', color=c, lw=1.2 if col == nx // 2 else 0.6)
    f = fr['f']
    t = (f - d['nTear']) / d['exitFps'] if f >= d['nTear'] else -1
    for k in range(5):
        y = cyy
        if t >= 0:
            u = min(1, max(0, (t - (0.25 + (4 - k) * 0.035)) / 0.8))
            y = cyy + (H / 1.18 - cyy) * glide(u)
        z = (k - 2) * 0.0072
        ax.add_patch(plt.Rectangle((z - t_card / 2, y - hh), t_card, 2 * hh, color='#3b82f6', alpha=0.35))
    ax.set_xlim(-0.06, 0.06); ax.set_ylim(0.25, 0.75)
    ax.set_xticks([]); ax.set_yticks([])
    ax.set_title(f"p={f / (d['nTear'] - 1):.2f}" if f < d['nTear'] else f"t={t:.2f}s", fontsize=8)
plt.tight_layout()
out2 = out.replace('.png', '-profil.png')
plt.savefig(out2)
print(out2)
