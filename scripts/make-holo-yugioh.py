"""
Hologrammes Yu-Gi-Oh (6★) : détourage + carte de profondeur, une fois pour toutes (hors du jeu).

Pour chaque illustration de `public/art/pop/` listée dans CARDS :
  - `public/fx/yugioh/<nom>.webp`   : RGBA, couleur + masque du sujet (détourage rembg, modèle choisi à l'œil) ;
  - `public/fx/yugioh/<nom>-z.webp` : niveaux de gris 256 px, relief (Depth Anything V2 small, ONNX) mêlé à un
    « gonflement » du masque (distance au bord) — sert à déplacer le maillage de l'hologramme (parallaxe, volume).

Dépendances (machine de dev uniquement) : pip install rembg onnxruntime scipy pillow numpy
Modèle de profondeur : https://huggingface.co/onnx-community/depth-anything-v2-small (onnx/model.onnx), chemin en
argument (`python scripts/make-holo-yugioh.py chemin/vers/model.onnx`).
"""
import os
import sys

import numpy as np
from PIL import Image, ImageFilter
from rembg import new_session, remove
from scipy.ndimage import distance_transform_edt, gaussian_filter
import onnxruntime as ort

ROOT = os.path.join(os.path.dirname(__file__), '..', 'public', 'art', 'pop')
# hors de art/ : servi par le site lui-même (art/ vit dans R2, cf. functions/art)
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'fx', 'yugioh')
# fichier → modèle de détourage qui donne le meilleur sujet (comparés à l'œil, planche du 04/11)
CARDS = {
    'blue-eyes-white-dragon': 'isnet-general-use',
    'dark-magician': 'isnet-general-use',
    'dark-magician-girl': 'isnet-anime',
    'exodia-the-forbidden-one': 'isnet-general-use',
    'obelisk-the-tormentor': 'isnet-general-use',
    'red-eyes-black-dragon': 'isnet-anime',
    'slifer-the-sky-dragon': 'u2net',
    'yami-yugi': 'isnet-anime',
    'seto-kaiba': 'isnet-anime',
    'jaden-yuki': 'isnet-anime',
}


def depth(sess: ort.InferenceSession, im: Image.Image) -> np.ndarray:
    side = 518
    x = np.asarray(im.convert('RGB').resize((side, side), Image.BICUBIC), dtype=np.float32) / 255.0
    x = (x - np.array([0.485, 0.456, 0.406], dtype=np.float32)) / np.array([0.229, 0.224, 0.225], dtype=np.float32)
    x = x.transpose(2, 0, 1)[None]
    d = sess.run(None, {'pixel_values': x})[0][0]
    return np.asarray(Image.fromarray(d.astype(np.float32)).resize(im.size, Image.BICUBIC))


def main():
    model = sys.argv[1] if len(sys.argv) > 1 else 'da2.onnx'
    os.makedirs(OUT, exist_ok=True)
    dsess = ort.InferenceSession(model)
    sessions = {}
    for name, seg in CARDS.items():
        src = Image.open(os.path.join(ROOT, name + '.jpg')).convert('RGB')
        if seg not in sessions:
            sessions[seg] = new_session(seg)
        cut = remove(src, session=sessions[seg])
        a = np.asarray(cut)[..., 3].astype(np.float32) / 255.0
        # masque : on écrase le voile très faible (restes de fond), on garde les bords doux
        a = np.clip((a - 0.08) / 0.84, 0, 1)
        rgba = np.dstack([np.asarray(src), (a * 255).astype(np.uint8)])
        Image.fromarray(rgba, 'RGBA').save(os.path.join(OUT, name + '.webp'), quality=88, alpha_quality=90, method=6)
        # relief : profondeur relative (proche = clair) normalisée dans le sujet + gonflement du masque
        d = depth(dsess, src)
        m = a > 0.5
        if m.any():
            lo, hi = np.percentile(d[m], 3), np.percentile(d[m], 99)
        else:
            lo, hi = d.min(), d.max()
        dn = np.clip((d - lo) / max(1e-6, hi - lo), 0, 1)
        inflate = distance_transform_edt(m)
        inflate = np.sqrt(np.clip(inflate / max(1.0, np.percentile(inflate[m], 98) if m.any() else 1), 0, 1))
        z = (0.65 * dn + 0.35 * inflate) * gaussian_filter(a, 1.5)
        z = gaussian_filter(z, 1.2)
        zi = Image.fromarray((np.clip(z, 0, 1) * 255).astype(np.uint8), 'L').resize((256, 256), Image.LANCZOS)
        zi.filter(ImageFilter.GaussianBlur(0.6)).save(os.path.join(OUT, name + '-z.webp'), quality=90, method=6)
        print(name, seg, src.size)


if __name__ == '__main__':
    main()
