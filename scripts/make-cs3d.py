"""
Skins CS 6★ en 3D (11/11) : recompose hors ligne les peintures de CS2 sur les modèles du jeu, carte par carte.

Entrée : imports/cs2/export/ (lanceurs/extraire-cs2.cmd, Source 2 Viewer) : modèles GLB, « composite inputs » de chaque
modèle (masques de zones, position, AO), définitions des peintures (.vmat csgo_customweapon : style, 4 couleurs, motif…).
Sortie : .claude-tmp/cs3d/bake/<carte>-{color,orm}.png (puis converties par scripts/make-cs3d.mjs).

Styles (F_PAINT_STYLE) : 0 uni · 1 hydrographique · 2 spray · 4 anodisé multicolore · 5 anodisé aérographe · 6 peinture
personnalisée · 7 patine · 8 gunsmith. Canaux du motif → couleurs : noir = couleur 0, R = 1, G = 2, B = 3 ; zones du modèle (masques R, G, B) → couleurs 1, 2, 3.
Le shader du jeu n'est pas public : c'est une reconstitution, réglée à l'œil sur les rendus Steam (aperçus : --preview).

  python scripts/make-cs3d.py [--preview] [--only karambit]
Gants (11/11) : bake_glove (shader csgo_customglove : calques de matière, 8 teintes, motif, détails tuilés) → -color,
-orm et -normal (maillage « viewmodel » des gants, la paire).
"""
import glob, json, os, re, struct, sys, math
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# (CS3D_EXP / CS3D_BAKE : depuis une copie de travail git, l'export et les textures cuites du dossier principal)
EXP = os.environ.get('CS3D_EXP') or os.path.join(ROOT, 'imports', 'cs2', 'export')
OUT = os.environ.get('CS3D_BAKE') or os.path.join(ROOT, '.claude-tmp', 'cs3d', 'bake')
RES = 1024


def g1(pattern):
    r = glob.glob(os.path.join(EXP, pattern), recursive=True)
    return r[0] if r else None


def vmat(path):
    """Paramètres d'un .vmat décompilé (texte KV) → dict."""
    d = {}
    for k, v in re.findall(r'"([^"]+)"\s+"([^"]*)"', open(path, encoding='utf-8', errors='ignore').read()):
        d.setdefault(k, v)
    return d


def vec(s):
    return np.array([float(x) for x in s.strip('[]').split()], dtype=np.float32)


def img(path, mode='RGBA', size=RES):
    im = Image.open(path).convert(mode)
    if size and im.size != (size, size):
        im = im.resize((size, size), Image.LANCZOS)
    return np.asarray(im, dtype=np.float32) / 255.0


def exr(path, size=RES):
    import OpenEXR
    a = OpenEXR.File(path).channels()
    a = a.get('RGBA', a.get('RGB')).pixels.astype(np.float32)
    if a.shape[0] != size:
        idx = (np.arange(size) * a.shape[0] / size).astype(int)
        a = a[idx][:, idx]
    return a


# ───────────────────────────────────────────── modèles (maillage legacy : les peintures sont calées sur ses UV)
KNIVES = {'butterfly': 'knife_butterfly', 'karambit': 'knife_karambit', 'm9': 'knife_m9', 'talon': 'knife_talon'}


def model(key):
    if key in KNIVES:
        base = f'weapons_models_knife_{KNIVES[key]}/**/'
        glb = g1(base + f'weapon_{KNIVES[key]}.glb')
        ci = g1(base + 'composite_inputs/*_composite_inputs.vmat')
        mesh = 'body_legacy'
    elif key == 'awp':
        glb = g1('weapons_models_awp/**/weapon_snip_awp.glb')
        ci = g1('materials_models_weapons_customization_snip_awp/**/snip_awp_composite_inputs.vmat')
        mesh = 'body_legacy'
    elif key == 'm4a4':
        glb = g1('weapons_models_m4a4/**/weapon_rif_m4a4.glb')
        ci = g1('materials_models_weapons_customization_rif_m4a1/**/rif_m4a1_composite_inputs.vmat')
        mesh = 'body_legacy'
    p = vmat(ci)
    d = os.path.dirname(ci)
    f = lambda k: os.path.join(d, os.path.basename(p[k])) if k in p and os.path.exists(os.path.join(d, os.path.basename(p[k]))) else None
    m = dict(key=key, glb=glb, mesh=mesh, uvScale=float(p.get('g_flUvScale1', 1)), length=float(p.get('g_flWeaponLength1', 32)))
    m['color'] = img(f('TextureColor1'), 'RGB') if f('TextureColor1') else np.full((RES, RES, 3), 0.5, np.float32)
    m['rough'] = img(f('TextureRoughness1'), 'L') if f('TextureRoughness1') else np.full((RES, RES), 0.5, np.float32)
    m['metal'] = img(f('TextureMetalness1'), 'L') if f('TextureMetalness1') else np.zeros((RES, RES), np.float32)
    m['masks'] = img(f('TextureMasks1'), 'RGB')
    ao = f('TextureAmbientOcclusion1')
    m['ao'] = img(ao, 'RGBA') if ao else np.ones((RES, RES, 4), np.float32)
    pos = os.path.join(d, os.path.basename(p['TexturePosition1']).replace('.exr', '')) if 'TexturePosition1' in p else None
    pe = glob.glob(pos + '*.exr') if pos else []
    m['pos'] = exr(pe[0]) if pe else None
    return m


# ───────────────────────────────────────────── peintures
def paint(kit):
    v = g1(f'materials_models_weapons_customization_paints_vmats_*/**/{kit}.vmat') or g1(f'gloves_paints/**/{kit}.vmat')
    p = vmat(v)
    d = os.path.dirname(v)
    tex = lambda k: (os.path.join(d, os.path.basename(p[k])) if k in p and os.path.exists(os.path.join(d, os.path.basename(p[k]))) else None)
    k = dict(kit=kit, style=int(p.get('F_PAINT_STYLE', 0)), p=p)
    k['colors'] = [vec(p.get(f'g_vColor{i}', '[1 1 1 1]'))[:3] for i in range(4)]
    for n in ('Pattern', 'PaintRoughness', 'Normal'):
        k[n] = tex('Texture' + n)
    f = lambda n, dv: float(p.get(n, dv))
    k.update(scale=f('g_flPatternTexCoordScale', 1), rot=f('g_flPatternTexCoordRotation', 0), bright=f('g_flColorBrightness', 1),
             rough=f('g_flPaintRoughness', 0.4), pearl=f('g_flPearlescentScale', 0), ignoreSize=p.get('g_bIgnoreWeaponSizeScale', '0') == '1',
             off=vec(p.get('g_vPatternTexCoordOffset', '[0 0 0 0]'))[:2], pmetal=vec(p.get('g_vPaintMetalness', '[0 0 0 0]')),
             paintMetal=f('g_flPaintMetalness', 1))
    return k


# ───────────────────────────────────────────── graine du motif (paint seed) : générateur de Valve (vstdlib, ran1)
class ValveRandom:
    IA, IM, IQ, IR, NTAB = 16807, 2147483647, 127773, 2836, 32

    def __init__(self, seed):
        self.idum = seed if seed < 0 else -seed
        self.iy = 0
        self.iv = [0] * self.NTAB

    def _next(self):
        IA, IM, IQ, IR, NTAB = self.IA, self.IM, self.IQ, self.IR, self.NTAB
        if self.idum <= 0 or not self.iy:
            self.idum = 1 if -self.idum < 1 else -self.idum
            for j in range(NTAB + 7, -1, -1):
                k = self.idum // IQ
                self.idum = IA * (self.idum - k * IQ) - IR * k
                if self.idum < 0:
                    self.idum += IM
                if j < NTAB:
                    self.iv[j] = self.idum
            self.iy = self.iv[0]
        k = self.idum // IQ
        self.idum = IA * (self.idum - k * IQ) - IR * k
        if self.idum < 0:
            self.idum += IM
        j = min(self.iy // (1 + (IM - 1) // NTAB), NTAB - 1)
        self.iy = self.iv[j]
        self.iv[j] = self.idum
        return self.iy

    def float(self, lo, hi):
        fl = min(self._next() / self.IM, 1 - 1.2e-7)
        return fl * (hi - lo) + lo


def roll_bounds(kit):
    """Bornes du tirage (vcompmat de la peinture) : {'off': [(min,max),(min,max)] | None, 'rot': (min,max) | None}."""
    f = g1(f'weapons_paints_legacy/**/{kit}.vcompmat')
    b = {'off': None, 'rot': None}
    if not f:
        return b
    t = open(f, encoding='utf-8', errors='ignore').read()
    for name, body in re.findall(r'm_strName = "(g_\w+)"(.*?)\}', t, re.S):
        num = lambda key: (float(re.search(key + r' = (-?[\d.]+)', body).group(1)) if re.search(key + r' = (-?[\d.]+)', body) else None)
        if name == 'g_flPatternTexCoordRotation' and num('m_flValueFloatX_Min') is not None:
            b['rot'] = (num('m_flValueFloatX_Min'), num('m_flValueFloatX_Max'))
        if name == 'g_vPatternTexCoordOffset' and num('m_flValueFloatX_Min') is not None:
            b['off'] = [(num('m_flValueFloatX_Min'), num('m_flValueFloatX_Max')), (num('m_flValueFloatY_Min'), num('m_flValueFloatY_Max'))]
    return b


def apply_seed(k, seed):
    """Ordre du tirage (_shared_paint_generic.vcompmat) : décalage x, y, puis rotation."""
    if seed is None:
        return k
    k = dict(k)
    b = roll_bounds(k['kit'])
    r = ValveRandom(seed)
    ox, oy, rot = r.float(0, 1), r.float(0, 1), r.float(0, 1)
    if b['off']:
        k['off'] = np.array([b['off'][0][0] + ox * (b['off'][0][1] - b['off'][0][0]), b['off'][1][0] + oy * (b['off'][1][1] - b['off'][1][0])], np.float32)
    if b['rot']:
        k['rot'] = b['rot'][0] + rot * (b['rot'][1] - b['rot'][0])
    k['seed'] = seed
    return k


def to_lin(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def to_srgb(c):
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(np.maximum(c, 0), 1 / 2.4) - 0.055)


def sample(tex, u, v, wrap=True):
    """Échantillonnage bilinéaire (u, v en 0..1, v vers le bas comme les images)."""
    h, w = tex.shape[:2]
    x = u * w - 0.5
    y = v * h - 0.5
    x0 = np.floor(x).astype(int)
    y0 = np.floor(y).astype(int)
    fx = (x - x0)[..., None] if tex.ndim == 3 else x - x0
    fy = (y - y0)[..., None] if tex.ndim == 3 else y - y0
    if wrap:
        X0, X1, Y0, Y1 = x0 % w, (x0 + 1) % w, y0 % h, (y0 + 1) % h
    else:
        X0, X1, Y0, Y1 = np.clip(x0, 0, w - 1), np.clip(x0 + 1, 0, w - 1), np.clip(y0, 0, h - 1), np.clip(y0 + 1, 0, h - 1)
    a = tex[Y0, X0] * (1 - fx) + tex[Y0, X1] * fx
    b = tex[Y1, X0] * (1 - fx) + tex[Y1, X1] * fx
    return a * (1 - fy) + b * fy


UV_MODE = 'A'  # ordre décalage / rotation / échelle du motif (voir scan des graines connues)
SIZE_MODE = 'uvmul'  # échelle des motifs non calés : motif × uvScale du modèle (réglé à l'œil, 11/11)


def pattern_uv(m, k, u, v):
    if k['ignoreSize']:
        s = k['scale']
    elif k['style'] == 1:  # hydrographique : motif plus grand (toiles d'araignée : 2 à 3 par lame, comme en jeu)
        s = k['scale'] * m['uvScale'] * 0.5
    elif SIZE_MODE == 'uv':
        s = k['scale'] / max(1e-3, m['uvScale'])
    elif SIZE_MODE == 'uvmul':
        s = k['scale'] * m['uvScale']
    else:
        s = k['scale'] * m['uvScale'] * m['length'] / 32
    a = math.radians(k['rot']) * (-1 if UV_MODE in ('E', 'F') else 1)
    ox, oy = k['off'][0], k['off'][1]
    if UV_MODE in ('A', 'E'):
        x, y = (u - 0.5) * s, (v - 0.5) * s
        return x * math.cos(a) - y * math.sin(a) + 0.5 + ox, x * math.sin(a) + y * math.cos(a) + 0.5 + oy
    if UV_MODE == 'B':
        x, y = u - 0.5, v - 0.5
        return (x * math.cos(a) - y * math.sin(a) + 0.5) * s + ox, (x * math.sin(a) + y * math.cos(a) + 0.5) * s + oy
    if UV_MODE in ('C', 'F'):
        x, y = u * s, v * s
        return x * math.cos(a) - y * math.sin(a) + ox, x * math.sin(a) + y * math.cos(a) + oy
    if UV_MODE == 'D':
        x, y = (u + ox) * s, (v + oy) * s
        return x * math.cos(a) - y * math.sin(a), x * math.sin(a) + y * math.cos(a)
    if UV_MODE == 'G':  # décalage avant rotation, autour du centre
        x, y = (u - 0.5 + ox) * s, (v - 0.5 + oy) * s
        return x * math.cos(a) - y * math.sin(a) + 0.5, x * math.sin(a) + y * math.cos(a) + 0.5


def bake(m, k, opts=None):
    """→ couleur (RGB), rugosité, métal, en espace UV du modèle (RES²)."""
    opts = opts or {}
    v, u = np.mgrid[0:RES, 0:RES].astype(np.float32)
    u, v = (u + 0.5) / RES, (v + 0.5) / RES
    col, rough, metal = m['color'].copy(), m['rough'].copy(), m['metal'].copy()
    if k is None:
        return col, rough, metal
    st = k['style']
    zone = m['masks']  # R : lame (+ garde / anneau), G et B : poignée, pièces
    painted = zone[..., 0] if st not in (6, 8) else np.ones((RES, RES), np.float32)
    C = k['colors']
    pat = img(k['Pattern'], 'RGBA', None) if k['Pattern'] else None

    def mix4(w):  # w : poids R, G, B du motif
        c = np.broadcast_to(C[0], w.shape).copy()
        for i in range(3):
            c = c * (1 - w[..., i:i + 1]) + C[i + 1] * w[..., i:i + 1]
        return c

    if st == 6:  # peinture personnalisée : le motif EST la texture, calé sur les UV
        pu, pv = pattern_uv(m, k, u, v)
        p = sample(pat, pu, pv)
        c = p[..., :3] * k['bright']
        r = sample(img(k['PaintRoughness'], 'L', None), pu, pv) if k['PaintRoughness'] else np.full((RES, RES), k['rough'], np.float32)
        mt = np.zeros((RES, RES), np.float32)
    elif st == 8:  # gunsmith : motif calé sur les UV, posé (alpha) sur une couleur par zone ; hors peinture, le métal nu
        pu, pv = pattern_uv(m, k, u, v)
        p = sample(pat, pu, pv)
        al = p[..., 3:4]
        pr = sample(img(k['PaintRoughness'], 'L', None), pu, pv) if k['PaintRoughness'] else np.full((RES, RES), k['rough'], np.float32)
        # le motif partout (couleur), l'alpha dit le métal ; mode 1 (Black Laminate, M9 Autotronic) : teinté par zone
        tint = zone[..., 0:1] * C[1] + zone[..., 1:2] * C[2] + zone[..., 2:3] * C[3] if k['p'].get('g_nColorAdjustmentMode', '0') == '1' else 1.0
        c = p[..., :3] * tint * k['bright']
        r = pr
        mt = al[..., 0]
    elif st == 7:  # patine : le motif coloré, teinté par zone
        pu, pv = pattern_uv(m, k, u, v)
        p = sample(pat, pu, pv)[..., :3]
        tint = zone[..., 0:1] * C[1] + zone[..., 1:2] * C[2] + zone[..., 2:3] * C[3]
        # la patine teinte le MÉTAL (couleur de base du modèle) : sans elle, tout sortait blanc sous le studio
        # calcul en LINÉAIRE, comme le shader du jeu (en sRGB, « Stained » ×6 sortait blanc)
        c = to_srgb(np.clip(to_lin(p) * to_lin(tint) * k['bright'], 0, 0.42))  # plafond : sinon le métal éblouit (bloom)
        r = sample(img(k['PaintRoughness'], 'L', None), pu, pv) if k['PaintRoughness'] else np.full((RES, RES), k['rough'], np.float32)
        mt = np.ones((RES, RES), np.float32)
        painted = np.clip(zone[..., 0] + zone[..., 1], 0, 1)
    elif st in (4, 5, 1, 2):
        if st == 5 and m['pos'] is not None:  # aérographe (Fade) : dégradé le long de la lame, depuis la pointe
            P = m['pos']
            a = math.radians(opts.get('ang', m.get('fadeAng', 0)))
            t = P[..., 1] * math.cos(a) + P[..., 2] * math.sin(a)
            sel = zone[..., 0] > 0.5
            lo, hi = np.percentile(t[sel], 1), np.percentile(t[sel], 99)
            t = np.clip((t - lo) / max(1e-6, hi - lo), 0, 1)
            if opts.get('flip', m.get('fadeFlip', False)):
                t = 1 - t
            x0, x1 = opts.get('span', (0.25, 0.97))
            p = sample(pat, x0 + (x1 - x0) * t, np.full_like(t, 0.5), wrap=False)
        elif st == 2 and m['pos'] is not None:  # spray : projeté selon la position
            P = m['pos']
            pu, pv = pattern_uv(m, k, P[..., 1], P[..., 2])
            p = sample(pat, pu, pv)
        else:
            pu, pv = pattern_uv(m, k, u, v)
            p = sample(pat, pu, pv)
        w = np.clip(p[..., :3] * opts.get('gain', 2.5 if st == 1 else 1.0), 0, 1)  # hydro : traits (toiles) plus francs
        c = np.clip(mix4(w) * k['bright'], 0, 1)
        anod = st in (4, 5)
        r = np.full((RES, RES), k['rough'], np.float32)
        mt = np.ones((RES, RES), np.float32) if anod else np.full((RES, RES), float(k['pmetal'][0]), np.float32)
    else:  # uni : une couleur par zone
        c = zone[..., 0:1] * C[1] + zone[..., 1:2] * C[2] + zone[..., 2:3] * C[3]
        r = np.full((RES, RES), k['rough'], np.float32)
        mt = np.full((RES, RES), float(k['pmetal'][0]), np.float32)
        painted = np.ones((RES, RES), np.float32)
    w = painted[..., None]
    col = col * (1 - w) + c * w
    rough = rough * (1 - painted) + r * painted
    metal = metal * (1 - painted) + mt * painted
    return np.clip(col, 0, 1), np.clip(rough, 0, 1), np.clip(metal, 0, 1)


# ───────────────────────────────────────────── gants (shader csgo_customglove, 11/11)
GLOVES = {'specialist': 'glove_specialist', 'sporty': 'glove_sporty'}
GLOVE_GLB = 'agents_models_shared_arms_glove_s/**/{0}/{0}.glb'
# rugosité de base de chaque matière (nom du calque : gloves/textiles/<matière>.vmat), avant g_fDetailRoughnessBrightness
GLOVE_ROUGH = {'fabric': 0.62, 'chemicalfiber': 0.5, 'leather': 0.5, 'rubber': 0.42}


def glove_paint(kit):
    """Peinture de gants (.vmat csgo_customglove) : textures (relues dans l'export) et paramètres."""
    v = g1(f'gloves_paints/**/{kit}.vmat')
    p = vmat(v)
    d = os.path.dirname(v)

    def tex(k):
        if k not in p or p[k].startswith('['):
            return None
        b = os.path.basename(p[k]).replace('.psd', '.png').replace('.tga', '.png')
        f = os.path.join(d, b)
        return f if os.path.exists(f) else g1('**/' + b)
    f = lambda n, dv=0.0: float(p.get(n, dv))
    k = dict(kit=kit, p=p, tex=tex, f=f)
    k['tints'] = [vec(p.get(f'g_vColorTint{i}', '[0.5 0.5 0.5 0]'))[:3] for i in range(1, 9)]
    k['palette'] = [int(x) for x in vec(p.get('g_vPatternPaletteIndices', '[1 2 3 4]'))[:4]]
    k['replace'] = int(p.get('g_nPatternReplaceIndex', '0')) if p.get('F_PATTERN', '0') == '1' else 0
    k['layers'] = [re.sub(r'.*[\\/]', '', p.get(f'layer_name_{i}', 'fabric')).replace('.vmat', '') for i in range(1, 5)]
    return k


def bake_glove(k):
    """
    Reconstitution de csgo_customglove (le shader n'est pas public ; réglée à l'œil sur les aperçus Steam) :
     - masque de calques (TextureLayerMask) : RGB = matière (noir 1, R 2, G 3, B 4 : tissu, cuir, caoutchouc…) ;
       ALPHA = numéro de teinte en 8 paliers (18, 49, 77… 226) → g_vColorTint1..8 ;
     - motif : là où la teinte vaut g_nPatternReplaceIndex, le motif (tuilé ×g_fPatternTexCoordScale) remplace la
       couleur ; ses canaux noir / R / G / B prennent les teintes g_vPatternPaletteIndices ;
     - chaque matière : sa texture de détail tuilée ×g_fDetailScale (le grain du tissu, le labyrinthe de « Hedge Maze »
       est celui de chemicalfiber03), qui module la couleur et la rugosité ;
     - TextureSurfaceProperties : R = occlusion, G = cavités (coutures) → cuites dans la couleur ;
     - normale du modèle (TextureNormal) gardée telle quelle (3e texture, -n.webp).
    → couleur, rugosité, métal, normale (RES²).
    """
    p, tex, f = k['p'], k['tex'], k['f']
    v, u = np.mgrid[0:RES, 0:RES].astype(np.float32)
    u, v = (u + 0.5) / RES, (v + 0.5) / RES
    mask = img(tex('TextureLayerMask'), 'RGBA')
    # numéro de teinte (1..8), adouci (g_fColorMaskBlur) : mélange des deux paliers voisins
    tA = np.clip((mask[..., 3] * 255 - 18) / 29.7, 0, 7)
    blur = max(0.05, f('g_fColorMaskBlur', 1) * 0.08)
    lo = np.floor(tA).astype(int)
    fr = np.clip((tA - lo - 0.5) / blur + 0.5, 0, 1)
    hi = np.minimum(lo + 1, 7)
    T = np.array(k['tints'], np.float32)
    col = T[lo] * (1 - fr[..., None]) + T[hi] * fr[..., None]
    if k['replace'] and tex('TexturePattern'):
        pat = img(tex('TexturePattern'), 'RGBA', None)
        s = f('g_fPatternTexCoordScale', 1)
        a = math.radians(f('g_fPatternTexCoordRotation', 0))
        off = vec(p.get('g_fPatternTexCoordOffset', '[0 0 0 0]'))[:2]
        x, y = u * s, v * s
        pu, pv = x * math.cos(a) - y * math.sin(a) + off[0], x * math.sin(a) + y * math.cos(a) + off[1]
        # (aliasing : le motif est réduit avant d'être tuilé quand il serait plus fin qu'un texel)
        n = max(32, min(pat.shape[0], int(RES / s)))
        if n < pat.shape[0]:
            pat = np.asarray(Image.fromarray((pat * 255).astype(np.uint8)).resize((n, n), Image.LANCZOS), np.float32) / 255
        w = sample(pat, pu, pv)[..., :3]
        P = [T[i - 1] for i in k['palette']]
        pc = np.broadcast_to(P[0], w.shape).copy()
        for i in range(3):
            pc = pc * (1 - w[..., i:i + 1]) + P[i + 1] * w[..., i:i + 1]
        sel = np.clip(1 - np.abs(tA + 1 - k['replace']) / 0.5, 0, 1)[..., None]
        col = col * (1 - sel) + pc * sel
    # matière : noir = 1, R = 2, G = 3, B = 4 (poids doux)
    mr, mg, mb = mask[..., 0], mask[..., 1], mask[..., 2]
    W = [np.clip(1 - mr - mg - mb, 0, 1), mr, mg, mb]
    tot = sum(W) + 1e-6
    W = [x / tot for x in W]
    shade = np.zeros((RES, RES), np.float32)
    rough = np.zeros((RES, RES), np.float32)
    metal = np.zeros((RES, RES), np.float32)
    for i in range(4):
        dt = tex(f'TextureDetail{i + 1}')
        sc = f(f'g_fDetailScale{i + 1}', 2)
        if dt:
            d = img(dt, 'RGBA', None)
            n = max(16, min(d.shape[0], int(RES / sc)))
            if n < d.shape[0]:
                d = np.asarray(Image.fromarray((d * 255).astype(np.uint8)).resize((n, n), Image.LANCZOS), np.float32) / 255
            g = sample(d, u * sc, v * sc)[..., 1]
            g = g / max(1e-3, float(d[..., 1].mean()))
        else:
            g = np.ones((RES, RES), np.float32)
        bp = f(f'g_fDetailBlackPoint{i + 1}', 0)
        det = np.clip(1 + 0.55 * (g - 1) - bp, 0.25, 1.6)
        mat = k['layers'][i]
        base = next((r for m, r in GLOVE_ROUGH.items() if mat.startswith(m)), 0.6)
        rb = f(f'g_fDetailRoughnessBrightness{i + 1}', 1)
        r = np.clip(base * (0.6 + 0.4 * rb) * (1.15 - 0.15 * det), 0.28, 0.95)
        shade += W[i] * det
        rough += W[i] * r
        metal += W[i] * f(f'g_fDetailMetalness{i + 1}', 0) * 0.5
    sp = tex('TextureSurfaceProperties')
    if sp:
        S = img(sp, 'RGBA')
        ao = 0.35 + 0.65 * S[..., 0] / max(1e-3, float(np.percentile(S[..., 0], 95)))
        cav = 0.55 + 0.45 * S[..., 1] / max(1e-3, float(np.percentile(S[..., 1], 95)))
        shade = shade * np.clip(ao, 0, 1) * np.clip(cav, 0, 1)
    col = np.clip(col * shade[..., None], 0, 1)
    nt = tex('TextureNormal')
    nrm = img(nt, 'RGB') if nt else np.broadcast_to(np.array([0.5, 0.5, 1], np.float32), (RES, RES, 3)).copy()
    return col, rough, np.clip(metal, 0, 1), nrm


# ───────────────────────────────────────────── sticker holo (shader csgo_weapon_sticker, 11/11)
STICKERS = {'sticker-74': ('emskatowice2014', 'reason')}  # Reason Gaming (Holo) | Katowice 2014


def bake_sticker(card):
    """
    Le sticker sur sa FEUILLE (objet plat, pas de maillage de CS2) : une feuille de papier mat (fibres légères), le
    sticker au centre avec sa ligne de prédécoupe (un sillon sombre, légèrement décalé du bord) ; la forme vient de
    l'alpha de la normale du sticker (net, texte compris : l'alpha de la couleur est flou).
    → couleur ; « orm » repurposé : R = masque holo (canaux R et B du holomask), G = rugosité, B = motif du holo
    (canal G du holomask, le « GAMING » en filigrane : décale la couleur du spectre) ; normale (relief du sticker + sillon).
    Le spectre (holowarp_default) part à côté, une fois pour tous : art/cs3d/holo-spectre.webp (make-cs3d.mjs).
    """
    ev, nm = STICKERS[card.replace('cs-', '')]
    d = lambda f: g1(f'stickers_{ev}_sticker_{nm}/**/{f}')
    col = img(d(f'sticker_{nm}_psd_*.png'), 'RGBA', None)
    nor = img(d(f'sticker_{nm}_normal_psd_*.png'), 'RGBA', None)
    hm = img(d(f'sticker_{nm}_holomask_psd_*.png'), 'RGBA', None)
    n = col.shape[0]
    shape = np.clip((nor[..., 3] * 255 - 26) / 12, 0, 1)
    # feuille RES² : le sticker occupe 78 % du côté, centré
    k = 0.78
    v, u = np.mgrid[0:RES, 0:RES].astype(np.float32)
    su, sv = ((u + 0.5) / RES - 0.5) / k + 0.5, ((v + 0.5) / RES - 0.5) / k + 0.5
    inside = (su >= 0) & (su <= 1) & (sv >= 0) & (sv <= 1)
    S = lambda a: np.where(inside[..., None] if a.ndim == 3 else inside, sample(a, np.clip(su, 0, 1), np.clip(sv, 0, 1), wrap=False), 0)
    m = S(shape)
    # prédécoupe : la forme élargie de ~5 texels, son contour (un trait de ~1,5 texel)
    from PIL import ImageFilter
    big = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(11)).filter(ImageFilter.GaussianBlur(1.2)), np.float32) / 255
    cut = np.clip(1 - np.abs(big - 0.5) / 0.22, 0, 1) * (1 - m)
    rng = np.random.default_rng(74)
    fib = np.asarray(Image.fromarray((rng.random((RES // 2, RES // 2)) * 255).astype(np.uint8)).resize((RES, RES), Image.BICUBIC).filter(ImageFilter.GaussianBlur(0.8)), np.float32) / 255
    paper = np.array([0.86, 0.86, 0.845], np.float32) * (0.97 + 0.06 * fib)[..., None]
    paper = paper * (1 - 0.45 * cut[..., None])
    c = S(col)[..., :3]
    color = paper * (1 - m[..., None]) + c * m[..., None]
    H = S(hm)
    holo = np.clip(np.maximum(H[..., 0], H[..., 2]), 0, 1) * m
    rough = 0.82 * (1 - m) + 0.38 * m
    pat = H[..., 1] * m
    N = S(nor)[..., :3]
    flat = np.array([0.5, 0.5, 1], np.float32)
    # sillon de la prédécoupe : la pente de son profil
    gy, gx = np.gradient(cut * 0.6)
    groove = np.stack([0.5 - gx * 6, 0.5 + gy * 6, np.ones_like(gx)], -1)
    normal = np.clip(N * m[..., None] + groove * (1 - m[..., None]), 0, 1)
    normal[..., 2] = np.where(m > 0.5, normal[..., 2], 1.0)
    return np.clip(color, 0, 1), np.stack([holo, rough, pat], -1), normal


# ───────────────────────────────────────────── maillage (GLB exporté par Source 2 Viewer) + aperçu logiciel
def load_mesh(path, name):
    b = open(path, 'rb').read()
    n = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + n])
    bin0 = 20 + n + 8
    def acc(i):
        a = j['accessors'][i]
        bv = j['bufferViews'][a['bufferView']]
        comp = {5126: ('<f4', 4), 5125: ('<u4', 4), 5123: ('<u2', 2)}[a['componentType']]
        cnt = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
        off = bin0 + bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        stride = bv.get('byteStride', comp[1] * cnt)
        raw = np.frombuffer(b, dtype=np.uint8, count=stride * (a['count'] - 1) + comp[1] * cnt, offset=off)
        out = np.lib.stride_tricks.as_strided(raw, shape=(a['count'], comp[1] * cnt), strides=(stride, 1)).copy()
        return out.view(comp[0]).reshape(a['count'], cnt)
    tris = []
    for me in j['meshes']:
        if not me['name'].endswith(name):
            continue
        for pr in me['primitives']:
            P, UV, N = acc(pr['attributes']['POSITION']), acc(pr['attributes']['TEXCOORD_0']), acc(pr['attributes']['NORMAL'])
            I = acc(pr['indices']).reshape(-1, 3)
            tris.append((P, UV, N, I, j['materials'][pr['material']]['name']))
    return tris


def preview(tris, col, rough, metal, view=(0, 1, 2), flip=(1, 1), size=600, back=False):
    """Rendu logiciel orthographique (projection sur les axes view[0], view[1], profondeur view[2])."""
    zb = np.full((size, size), -1e9, np.float32)
    out = np.full((size, size, 3), 0.16, np.float32)
    allP = np.concatenate([t[0] for t in tris])
    lo, hi = allP.min(0), allP.max(0)
    span = max(hi[view[0]] - lo[view[0]], hi[view[1]] - lo[view[1]]) * 1.05
    cx, cy = (lo + hi)[[view[0], view[1]]] / 2
    L = np.array([0.4, 0.7, 0.6]); L /= np.linalg.norm(L)
    for P, UV, N, I, _ in tris:
        X = ((P[:, view[0]] - cx) * flip[0] / span + 0.5) * size
        Y = ((-(P[:, view[1]] - cy)) * flip[1] / span + 0.5) * size
        Z = -P[:, view[2]] if back else P[:, view[2]]
        for a, bb, c in I:
            xs, ys = X[[a, bb, c]], Y[[a, bb, c]]
            x0, x1 = int(max(0, xs.min())), int(min(size - 1, xs.max()) + 1)
            y0, y1 = int(max(0, ys.min())), int(min(size - 1, ys.max()) + 1)
            if x1 <= x0 or y1 <= y0:
                continue
            gx, gy = np.meshgrid(np.arange(x0, x1) + 0.5, np.arange(y0, y1) + 0.5)
            d = (ys[1] - ys[2]) * (xs[0] - xs[2]) + (xs[2] - xs[1]) * (ys[0] - ys[2])
            if abs(d) < 1e-9:
                continue
            w0 = ((ys[1] - ys[2]) * (gx - xs[2]) + (xs[2] - xs[1]) * (gy - ys[2])) / d
            w1 = ((ys[2] - ys[0]) * (gx - xs[2]) + (xs[0] - xs[2]) * (gy - ys[2])) / d
            w2 = 1 - w0 - w1
            ins = (w0 >= 0) & (w1 >= 0) & (w2 >= 0)
            if not ins.any():
                continue
            z = w0 * Z[a] + w1 * Z[bb] + w2 * Z[c]
            sub = zb[y0:y1, x0:x1]
            upd = ins & (z > sub)
            if not upd.any():
                continue
            uu = (w0 * UV[a, 0] + w1 * UV[bb, 0] + w2 * UV[c, 0])[upd]
            vv = (w0 * UV[a, 1] + w1 * UV[bb, 1] + w2 * UV[c, 1])[upd]
            n = (w0[..., None] * N[a] + w1[..., None] * N[bb] + w2[..., None] * N[c])[upd]
            n /= np.linalg.norm(n, axis=1, keepdims=True) + 1e-9
            tx = (np.mod(uu, 1) * (RES - 1)).astype(int)
            ty = (np.mod(vv, 1) * (RES - 1)).astype(int)
            alb = col[ty, tx]
            ro, me = rough[ty, tx], metal[ty, tx]
            nd = np.abs(n @ L)[:, None]
            spec = (np.abs(n[:, view[2]]) ** (2 + 30 * (1 - ro)))[:, None]
            sh = alb * (0.25 + 0.75 * nd) * (1 - 0.5 * me[:, None]) + spec * (0.15 + 0.6 * me[:, None]) * (alb * me[:, None] + (1 - me[:, None]))
            sub[upd] = z[upd]
            o = out[y0:y1, x0:x1]
            o[upd] = sh
    return Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8))


def uv_normals(tris, res=256):
    """Normale moyenne par texel (espace UV) : sert à séparer les deux faces de la lame (playside / backside)."""
    N = np.zeros((res, res, 3), np.float32)
    for P, UV, Nn, I, _ in tris:
        X, Y = np.mod(UV[:, 0], 1) * res, np.mod(UV[:, 1], 1) * res
        for a, b, c in I:
            xs, ys = X[[a, b, c]], Y[[a, b, c]]
            x0, x1 = int(max(0, xs.min())), int(min(res - 1, xs.max()) + 1)
            y0, y1 = int(max(0, ys.min())), int(min(res - 1, ys.max()) + 1)
            if x1 <= x0 or y1 <= y0:
                continue
            gx, gy = np.meshgrid(np.arange(x0, x1) + 0.5, np.arange(y0, y1) + 0.5)
            d = (ys[1] - ys[2]) * (xs[0] - xs[2]) + (xs[2] - xs[1]) * (ys[0] - ys[2])
            if abs(d) < 1e-9:
                continue
            w0 = ((ys[1] - ys[2]) * (gx - xs[2]) + (xs[2] - xs[1]) * (gy - ys[2])) / d
            w1 = ((ys[2] - ys[0]) * (gx - xs[2]) + (xs[0] - xs[2]) * (gy - ys[2])) / d
            ins = (w0 >= 0) & (w1 >= 0) & (1 - w0 - w1 >= 0)
            n = Nn[a] + Nn[b] + Nn[c]
            N[y0:y1, x0:x1][ins] = n / (np.linalg.norm(n) + 1e-9)
    return N


def hsv_classes(c):
    mx, mn = c.max(-1), c.min(-1)
    sat = (mx - mn) / (mx + 1e-6)
    r, g, b = c[..., 0], c[..., 1], c[..., 2]
    blue = (b >= r) & (b >= g * 0.95) & (sat > 0.18)
    red = (r > g * 1.25) & (r > b * 1.1) & (sat > 0.25)
    yellow = (r > b * 1.25) & (g > b * 1.15) & (g > r * 0.6) & (sat > 0.2)
    return blue, red, yellow


def scan(key, kit, goal, side_axis=0, seeds=range(0, 1001), res=256):
    """Classe les graines : goal = 'blue' (blue gem, face visible) ou 'fireice' (rouge + bleu, sans jaune)."""
    global RES
    m = model(key)
    tris = load_mesh(m['glb'], m['mesh'])
    N = uv_normals(tris, res)
    keep = RES
    RES = res
    m2 = dict(m)
    for f in ('color', 'masks'):
        m2[f] = np.asarray(Image.fromarray((m[f] * 255).astype(np.uint8)).resize((res, res), Image.BILINEAR), np.float32) / 255
    for f in ('rough', 'metal'):
        m2[f] = np.asarray(Image.fromarray((m[f] * 255).astype(np.uint8)).resize((res, res), Image.BILINEAR), np.float32) / 255
    if m['pos'] is not None:
        idx = (np.arange(res) * m['pos'].shape[0] / res).astype(int)
        m2['pos'] = m['pos'][idx][:, idx]
    k0 = paint(kit)
    blade = m2['masks'][..., 0] > 0.5
    out = []
    for sd in seeds:
        c, _, _ = bake(m2, apply_seed(k0, sd))
        bl, rd, ye = hsv_classes(c)
        for side in (1, -1):
            sel = blade & (N[..., side_axis] * side > 0.3)
            n = max(1, sel.sum())
            if goal == 'blue':
                sc = bl[sel].sum() / n
            else:
                sc = (rd[sel].sum() + bl[sel].sum()) / n - 2.5 * ye[sel].sum() / n
            out.append((round(float(sc), 3), sd, side))
    RES = keep
    return sorted(out, reverse=True)


# ───────────────────────────────────────────── les cartes 6★ (variante la plus recherchée de chaque skin, 11/11)
MODEL_OF = {'Butterfly Knife': 'butterfly', 'Karambit': 'karambit', 'M9 Bayonet': 'm9', 'Talon Knife': 'talon', 'AWP': 'awp', 'M4A4': 'm4a4',
            'Specialist Gloves': 'specialist', 'Sport Gloves': 'sporty'}
FINISH = {  # finition → (peinture, graine) ; None = graine par défaut de la peinture
    'Doppler': ('am_sapphire_marbleized', None),
    'Gamma Doppler': ('am_emerald_marbleized', None),
}
SEEDS = {  # (modèle, finition) → graine
    ('karambit', 'Case Hardened'): 778, ('butterfly', 'Case Hardened'): 556, ('m9', 'Case Hardened'): 348,
    ('karambit', 'Marble Fade'): 412, ('m9', 'Marble Fade'): 763, ('butterfly', 'Marble Fade'): 897,
}


def cards():
    import csv
    # carte → peinture de base (relevé de ByMykel/CSGO-API, figé dans scripts/data/cs3d-peintures.json)
    kits = json.load(open(os.path.join(ROOT, 'scripts', 'data', 'cs3d-peintures.json'), encoding='utf-8'))
    out = []
    for r in csv.DictReader(open(os.path.join(ROOT, 'donnees', 'suivi', 'cs-3d-5-6-etoiles.csv'), encoding='utf-8-sig'), delimiter=';'):
        if r['etoiles'] == '6' and r['id'] in STICKERS:  # sticker : objet plat, pas de modèle (bake_sticker)
            out.append(dict(card='cs-' + r['id'], name=r['nom_marche_steam'], model='sticker', kit=None, seed=None))
            continue
        if r['etoiles'] != '6' or r['modele'] not in MODEL_OF:
            continue
        key = MODEL_OF[r['modele']]
        name = r['nom_marche_steam']
        finish = name.split(' | ')[1] if ' | ' in name else None
        kit = kits.get(r['id']) if finish else None
        seed = None
        if finish in FINISH:
            kit, seed = FINISH[finish]
            if key == 'butterfly' and kit == 'am_sapphire_marbleized':
                kit = 'am_sapphire_marbleized_b'
        seed = SEEDS.get((key, finish), seed)
        out.append(dict(card='cs-' + r['id'], name=name, model=key, kit=kit, seed=seed))
    return out


if __name__ == '__main__':
    args = sys.argv[1:]
    only = args[args.index('--only') + 1] if '--only' in args else None
    os.makedirs(OUT, exist_ok=True)
    models = {}
    done = []
    for c in cards():
        if only and only not in (c['model'], c['card'], c['kit']):
            continue
        if c['model'] == 'sticker':  # sticker holo sur sa feuille ; « orm » = holo, rugosité, motif
            col, orm3, nrm = bake_sticker(c['card'])
            Image.fromarray((col * 255 + 0.5).astype(np.uint8)).save(os.path.join(OUT, c['card'] + '-color.png'))
            Image.fromarray((orm3 * 255 + 0.5).astype(np.uint8)).save(os.path.join(OUT, c['card'] + '-orm.png'))
            Image.fromarray((nrm * 255 + 0.5).astype(np.uint8)).save(os.path.join(OUT, c['card'] + '-normal.png'))
            done.append(c)
            print(c['name'], '→ sticker')
            continue
        if c['model'] in GLOVES:  # gants : autre shader (csgo_customglove), normale en plus
            col, rough, metal, nrm = bake_glove(glove_paint(c['kit']))
            Image.fromarray((nrm * 255 + 0.5).astype(np.uint8)).save(os.path.join(OUT, c['card'] + '-normal.png'))
        else:
            m = models.get(c['model']) or models.setdefault(c['model'], model(c['model']))
            k = apply_seed(paint(c['kit']), c['seed']) if c['kit'] else None
            col, rough, metal = bake(m, k)
        Image.fromarray((col * 255 + 0.5).astype(np.uint8)).save(os.path.join(OUT, c['card'] + '-color.png'))
        orm = np.stack([np.ones_like(rough), rough, metal], -1)
        Image.fromarray((orm * 255 + 0.5).astype(np.uint8)).save(os.path.join(OUT, c['card'] + '-orm.png'))
        done.append(c)
        print(c['name'], '→', c['kit'], c['seed'])
    # la liste complète (même avec --only : les autres cartes gardent leurs textures déjà cuites)
    json.dump(cards(), open(os.path.join(OUT, 'cartes.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
