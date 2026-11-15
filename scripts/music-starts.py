"""(15/11, Tom) DÉPART AU REFRAIN des extraits Musique (artistes, chansons, albums) — pas des openings ni des génériques,
qui partent du début. L'extrait officiel ne fait que 30 s : on y cherche le passage le plus fort et soutenu (le refrain,
le plus souvent), et l'extrait démarre une seconde avant. Approximation : sonie momentanée (EBU R128) lissée sur 2 s ;
1er instant à moins de 2 LU du haut de l'extrait et qui tient 3 s. Départ plafonné à 15 s ; < 2 s = du début.

  python scripts/music-starts.py   (les extraits des cartes Musique 6★ téléchargés avant dans .cache/previews/<id>.audio)

Sortie : scripts/data/music-starts.json { id de carte: secondes }, lu par make-music-previews.py (champ `start`)."""
import json, os, re, subprocess, sys, concurrent.futures as cf
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, '.cache', 'previews')
OUT = os.path.join(ROOT, 'scripts', 'data', 'music-starts.json')
def loud(f):
    p = subprocess.run(['ffmpeg', '-v', 'info', '-nostats', '-i', f, '-af', 'ebur128=metadata=1,ametadata=print:key=lavfi.r128.M', '-f', 'null', '-'],
                       capture_output=True, text=True)
    t, out = None, []
    for line in p.stderr.splitlines():
        m = re.search(r'pts_time:([\d.]+)', line)
        if m: t = float(m.group(1)); continue
        m = re.search(r'lavfi\.r128\.M=(-?[\d.]+|-inf)', line)
        if m and t is not None:
            v = float(m.group(1)) if m.group(1) != '-inf' else -70.0
            out.append((t, max(v, -70.0)))
    return out
def start_of(f):
    s = loud(f)
    if len(s) < 50: return 0.0
    ts = [t for t, _ in s]; vs = [v for _, v in s]
    step = (ts[-1] - ts[0]) / max(1, len(ts) - 1) or 0.1
    w = max(1, int(round(2.0 / step)))
    sm = [sum(vs[max(0, i - w + 1):i + 1]) / (i - max(0, i - w + 1) + 1) for i in range(len(vs))]
    top = sorted(sm)[int(len(sm) * 0.9)]
    hold = int(round(3.0 / step))
    for i in range(len(sm) - hold):
        if sm[i] >= top - 2 and min(sm[i:i + hold]) >= top - 4:
            st = max(0.0, ts[i] - 2.0 - 1.0)  # le lissage retarde d'environ 2 s ; une seconde d'élan avant le refrain
            return 0.0 if st < 2 else round(min(st, 15.0), 1)
    return 0.0
files = sorted(f for f in os.listdir(SRC) if f.endswith('.audio'))
with cf.ThreadPoolExecutor(4) as ex:
    res = dict(zip([f[:-6] for f in files], ex.map(lambda f: start_of(os.path.join(SRC, f)), files)))
old = json.load(open(OUT, encoding='utf-8')) if os.path.exists(OUT) else {}
old.update({k: v for k, v in res.items() if v > 0})
for k, v in res.items():
    if v == 0: old.pop(k, None)
json.dump(dict(sorted(old.items())), open(OUT, 'w', encoding='utf-8', newline='\n'), indent=0)
vals = list(res.values())
print('extraits', len(vals), '· décalés', sum(1 for v in vals if v > 0), '· moyenne', round(sum(vals) / max(1, len(vals)), 1), 's')
