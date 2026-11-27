"""Contrôle visuel d'une cuisson de déchirure (npm run bake:tear -- --only=0 --preview).

    python3 scripts/bake-tear/preview.py [.cache/bake-tear/preview-0.json] [sortie.png]

Planche : pour chaque image enregistrée, vue de 3/4 (filaire ombré) et vue de profil (x = profondeur, y = hauteur).
(27/11) Retroussé (npm run bake:retrousse -- --only=0 --preview → .cache/bake-retrousse/preview-0.json) : bornes
élargies (le revers descend vers y ≈ −1,5), profils aux colonnes 32 ET 1, cartes lues dans le JSON, et une 3e planche :
charnière yF(p), ruptures, étirement / dièdre / écart des pinces image par image.
"""
import json, sys
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection

src = sys.argv[1] if len(sys.argv) > 1 else '.cache/bake-tear/preview-0.json'
out = sys.argv[2] if len(sys.argv) > 2 else src.replace('.json', '.png')
d = json.load(open(src))
roll = d.get('scenario') == 'retrousse'
nx = d['nx']
frames = d['frames']
cols = min(6, len(frames))
rows = (len(frames) + cols - 1) // cols
fig = plt.figure(figsize=(cols * 3.2, rows * (5.4 if roll else 4.4)), dpi=90)
colors = {('body', 1): '#9aa4b0', ('body', -1): '#5c6570', ('strip', 1): '#d9a441', ('strip', -1): '#9c6f1f'}
def label_of(f):
    return f"p={f / (d['nTear'] - 1):.2f}" if f < d['nTear'] else f"t={(f - d['nTear']) / d['exitFps']:.2f}s"

def render(ax, P, az, el, cy=None):
    """Rendu ombré (peintre, Lambert) : face imprimée (alu) bleu-gris, ENVERS (intérieur du film) brun mat, cartes."""
    from matplotlib.collections import PolyCollection
    a, e = np.radians(az), np.radians(el)
    # caméra : rotation autour de y (az) puis de x (el) ; on regarde vers −z'
    Ry = np.array([[np.cos(a), 0, np.sin(a)], [0, 1, 0], [-np.sin(a), 0, np.cos(a)]])
    Rx = np.array([[1, 0, 0], [0, np.cos(e), -np.sin(e)], [0, np.sin(e), np.cos(e)]])
    M = Rx @ Ry
    L = np.array([-0.35, 0.55, 0.76]); L /= np.linalg.norm(L)
    polys, cols, depth = [], [], []
    for s in d['sheets']:
        b, ny = s['base'], s['ny']
        G = P[b:b + ny * nx].reshape(ny, nx, 3) @ M.T
        A, B, C, D = G[:-1, :-1], G[:-1, 1:], G[1:, 1:], G[1:, :-1]
        n = np.cross(C - A, D - B) * s['side']
        n /= np.linalg.norm(n, axis=-1, keepdims=True) + 1e-12
        outer = n[..., 2] > 0  # on voit le côté extérieur (imprimé)
        nn = np.where(outer[..., None], n, -n)
        lam = np.clip(nn @ L, 0, 1)
        spec = np.clip(nn[..., 2], 0, 1) ** 24
        base_o, base_i = np.array([0.62, 0.68, 0.76]), np.array([0.55, 0.42, 0.30])
        col = np.where(outer[..., None], base_o * (0.25 + 0.75 * lam[..., None]) + 0.35 * spec[..., None], base_i * (0.3 + 0.7 * lam[..., None]))
        q = np.stack([A, B, C, D], axis=2)
        polys.append(q[..., :2].reshape(-1, 4, 2)); cols.append(np.clip(col.reshape(-1, 3), 0, 1)); depth.append(q[..., 2].mean(-1).reshape(-1))
    if cy is not None:
        hw, hh = 0.63 * 0.92 / 2, 0.88 * 0.92 / 2
        # cartes découpées en petits carreaux (sinon le tri du peintre les met devant le film)
        us = np.linspace(-hw, hw, 13); vs = np.linspace(cy - hh, cy + hh, 17)
        for k in range(5):
            z = (k - 2) * 0.0072
            for a0, a1 in zip(us[:-1], us[1:]):
                for b0, b1 in zip(vs[:-1], vs[1:]):
                    c = np.array([[a0, b0, z], [a1, b0, z], [a1, b1, z], [a0, b1, z]]) @ M.T
                    polys.append(c[None, :, :2]); cols.append(np.array([[0.30, 0.55, 0.95]])); depth.append(np.array([c[:, 2].mean()]))
    polys, cols, depth = np.concatenate(polys), np.concatenate(cols), np.concatenate(depth)
    o = np.argsort(depth)
    ax.add_collection(PolyCollection(polys[o], facecolors=cols[o], edgecolors='none'))
    ax.set_xlim(-0.75, 0.75); ax.set_ylim(-1.6, 0.85); ax.set_aspect('equal'); ax.set_axis_off()

if roll:
    views = [(-38, 12), (0, 0), (-90, 0)]
    fig = plt.figure(figsize=(len(frames) * 1.9, 3 * 3.6), dpi=90)
    for fi, fr in enumerate(frames):
        P = np.array(fr['p']).reshape(-1, 3)
        for vi, (az, el) in enumerate(views):
            ax = fig.add_subplot(3, len(frames), vi * len(frames) + fi + 1)
            render(ax, P, az, el, fr.get('cy'))
            if vi == 0: ax.set_title(label_of(fr['f']), fontsize=8)
    plt.tight_layout()
    plt.savefig(out)
    print(out)
for fi, fr in enumerate(frames if not roll else []):
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
    if roll:
        ax.set_xlim(-0.6, 0.6); ax.set_ylim(-0.6, 0.6); ax.set_zlim(-1.6, 0.8)
        ax.view_init(elev=14, azim=-58)
        ax.set_box_aspect((1.2, 1.2, 2.4), zoom=1.7)
    else:
        ax.set_xlim(-0.6, 0.6); ax.set_ylim(-0.4, 0.8); ax.set_zlim(-0.7, 0.9)
        # three.js : x droite, y haut, z vers la caméra → matplotlib : (x, z, y)
        ax.view_init(elev=12, azim=-62)
        ax.set_box_aspect((1.2, 1.2, 1.6))
    ax.set_axis_off()
    ax.set_title(label_of(fr['f']), fontsize=9)
if not roll:
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
fig2 = plt.figure(figsize=(len(frames) * (1.9 if roll else 1.6), 7.5 if roll else 5.5), dpi=90)
for fi, fr in enumerate(frames):
    P = np.array(fr['p']).reshape(-1, 3)
    ax = fig2.add_subplot(1, len(frames), fi + 1)
    for s in d['sheets']:
        b, ny = s['base'], s['ny']
        G = P[b:b + ny * nx].reshape(ny, nx, 3)
        prof = ((nx // 2, colors[(s['part'], s['side'])], 1.2), (1, '#e0662b' if s['side'] > 0 else '#8a3a12', 0.7)) if roll else ((nx // 2, colors[(s['part'], s['side'])], 1.2), (nx // 5, '#bbbbbb', 0.6))
        for col, c, lw in prof:
            ax.plot(G[:, col, 2], G[:, col, 1], '-', color=c, lw=lw)
    f = fr['f']
    t = (f - d['nTear']) / d['exitFps'] if f >= d['nTear'] else -1
    for k in range(5):
        if roll:
            y = fr['cy']
        else:
            y = cyy
            if t >= 0:
                u = min(1, max(0, (t - (0.25 + (4 - k) * 0.035)) / 0.8))
                y = cyy + (H / 1.18 - cyy) * glide(u)
        z = (k - 2) * 0.0072
        ax.add_patch(plt.Rectangle((z - t_card / 2, y - hh), t_card, 2 * hh, color='#3b82f6', alpha=0.35))
    if roll:
        ax.set_xlim(-0.35, 0.35); ax.set_ylim(-1.6, 0.8); ax.set_aspect('equal')
        ax.axhline(-H / 2, color='#999', lw=0.4, ls=':')
    else:
        ax.set_xlim(-0.06, 0.06); ax.set_ylim(0.25, 0.75)
    ax.set_xticks([]); ax.set_yticks([])
    ax.set_title(label_of(f), fontsize=8)
plt.tight_layout()
out2 = out.replace('.png', '-profil.png')
plt.savefig(out2)
print(out2)

# ── Retroussé : la charnière, les ruptures et les mesures image par image
if roll:
    nT = d['nTear']
    ps = np.arange(nT) / (nT - 1)
    fig3, axs = plt.subplots(3, 1, figsize=(11, 8), dpi=90, sharex=True)
    axs[0].plot(ps, d['yF'], color='#333', lw=1.2, label='charnière yF')
    for e in d['events']:
        if 'p' not in e: continue
        c = {'lock': '#d62728', 'top': '#ff7f0e', 'side': '#1f77b4'}[e['k']]
        axs[0].plot([e['p']], [e['y']], 'o' if e['k'] != 'side' else ('<' if e['x'] < 0 else '>'), color=c, ms=3 + 4 * e['f'])
    axs[0].set_ylabel('y'); axs[0].legend(fontsize=8); axs[0].grid(alpha=0.3)
    axs[0].set_title('ruptures : rouge = verrou, orange = haut, bleu = crans (◁ gauche ▷ droite) ; taille = intensité', fontsize=9)
    dg = d['diags'][:nT]
    axs[1].plot(ps, [100 * x['st'] for x in dg], label='étirement max %')
    axs[1].plot(ps, [100 * x['stSh'] for x in dg], label='étirement épaules %')
    axs[1].plot(ps, [100 * x['grip'] for x in dg], label='écart pinces mm')
    axs[1].axhline(1, color='#999', lw=0.5, ls='--'); axs[1].legend(fontsize=8); axs[1].grid(alpha=0.3)
    axs[2].plot(ps, [x['dh'] for x in dg], label='|Δ dièdre| max (rad)')
    axs[2].plot(ps, [x['dhSh'] for x in dg], label='|Δ dièdre| épaules')
    axs[2].axhline(0.35, color='#999', lw=0.5, ls='--'); axs[2].legend(fontsize=8); axs[2].grid(alpha=0.3)
    axs[2].set_xlabel('p')
    plt.tight_layout()
    out3 = out.replace('.png', '-mesures.png')
    plt.savefig(out3)
    print(out3)
