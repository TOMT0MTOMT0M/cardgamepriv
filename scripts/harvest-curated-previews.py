"""(retours Hugo 10/11 ; génériques de dessins animés 15/11) Résout les extraits choisis à la main (scripts/data/previews-curated.json) en aperçus de 30 s :
iTunes d'abord (adresse fixe, comme harvest-music-previews.py), sinon Deezer (on garde l'id du morceau : son adresse
d'aperçu est signée et expire, le jeu la redemande au moment de jouer — src/game/musicPreview.ts).
Sortie : scripts/data/previews-curated-resolved.json. Relançable : reprend où il s'est arrêté (argument = budget en s).
Puis : python scripts/make-music-previews.py"""
import json, os, re, sys, time, unicodedata, urllib.parse, urllib.request
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
SRC = json.load(open(f'{D}/previews-curated.json', encoding='utf-8'))
OUT = f'{D}/previews-curated-resolved.json'
res = json.load(open(OUT, encoding='utf-8')) if os.path.exists(OUT) else {}
def fold(s): return re.sub(r'[^a-z0-9]', '', unicodedata.normalize('NFKD', (s or '').lower()).encode('ascii', 'ignore').decode())
def get(url):
    for i in range(3):
        try:
            with urllib.request.urlopen(url, timeout=12) as r: return json.load(r)
        except Exception as e:
            time.sleep(15 if ('403' in str(e) or '429' in str(e)) else 3)
    return None
def good(track, artist, t, a):
    ft, fa = fold(t), fold(a)
    fr = fold(artist)
    return bool(ft) and (fold(track).startswith(ft) or ft in fold(track)) and (not fa or (bool(fr) and (fa in fr or fr in fa)))
def itunes(t, a):
    d = get('https://itunes.apple.com/search?' + urllib.parse.urlencode({'term': f'{a} {t}'.strip(), 'entity': 'song', 'limit': 25, 'country': 'FR'}))
    if d is None: return None
    rs = [r for r in d.get('results', []) if r.get('previewUrl') and good(r.get('trackName'), r.get('artistName'), t, a)]
    # l'interprète exact d'abord (sinon « Coda Piano Trio » passait avant « Coda »), puis la version studio
    rs.sort(key=lambda r: (fold(r.get('artistName')) != fold(a), not fold(r.get('trackName')).startswith(fold(t)), bool(re.search(r'live|cover|remix|acoustic|ver\.|version|instrumental|karaoke|music box', (r.get('trackName') or '').lower()))))
    if rs:
        r = rs[0]
        return {'url': r['previewUrl'], 'track': r['trackName'], 'artist': r['artistName'], 'link': r.get('trackViewUrl', '')}
    return False
def deezer(t, a):
    qs = [f'artist:"{a}" track:"{t}"', f'{a} {t}'] if a else [f'track:"{t}"', t]
    for q in qs:
        d = get('https://api.deezer.com/search?' + urllib.parse.urlencode({'q': q, 'limit': 25}))
        if d is None: return None
        rs = [r for r in d.get('data', []) if r.get('preview') and (good(r.get('title'), r.get('artist', {}).get('name'), t, a) or (not a and fold(r.get('title')) == fold(t)))]
        rs.sort(key=lambda r: (fold(r['artist']['name']) != fold(a), not fold(r['title']).startswith(fold(t)), bool(re.search(r'live|cover|remix|acoustic|ver\.|version|instrumental|karaoke|music box', r['title'].lower()))))
        if rs:
            r = rs[0]
            return {'deezer': r['id'], 'track': r['title'], 'artist': r['artist']['name'], 'link': r.get('link', '')}
        time.sleep(0.4)
    return False
def exact(ref):
    """(15/11) morceau choisi à la main : « itunes:<id> » (adresse fixe ; boutique FR, sinon US), « deezer:<id> » ou « file:<chemin dans public/> »."""
    src, _, i = ref.partition(':')
    if src == 'file':  # (15/11) extrait fourni par Tom, dans public/ (servi par Pages, même origine)
        return {'url': i, 'track': '', 'artist': '', 'link': ''} if os.path.exists(os.path.join(os.path.dirname(D), '..', 'public', i)) else False
    if src == 'deezer':
        r = get(f'https://api.deezer.com/track/{int(i)}')
        if r is None: return None
        return {'deezer': r['id'], 'track': r['title'], 'artist': r['artist']['name'], 'link': r.get('link', '')} if r.get('preview') else False
    for cc in ('FR', 'US', 'JP'):  # (15/11) JP : openings et bandes originales d'animés
        d = get(f'https://itunes.apple.com/lookup?id={int(i)}&country={cc}')
        if d is None: return None
        rs = [r for r in d.get('results', []) if r.get('previewUrl')]
        if rs: return {'url': rs[0]['previewUrl'], 'track': rs[0]['trackName'], 'artist': rs[0]['artistName'], 'link': rs[0].get('trackViewUrl', '')}
        time.sleep(3.1)
    return False
budget = time.time() + float(sys.argv[1] if len(sys.argv) > 1 else 160)
KINDS = ('cards', 'anime', 'cartoon', 'cartoon-en', 'ambience')
for kind in KINDS:
    for key, (t, a, *ref) in SRC.get(kind, {}).items():
        k = f'{kind}:{key}'
        if k in res or time.time() > budget: continue
        if ref:
            p = exact(ref[0])
            if p is None: continue  # réseau : on réessaiera à la prochaine passe
            p = p or None
        else:
            p = itunes(t, a)
            if not p: p = deezer(t, a) or None
        time.sleep(3.1)
        res[k] = p
        json.dump(res, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
        print(k, '→', (p or {}).get('track'), '—', (p or {}).get('artist'), '(deezer)' if p and 'deezer' in p else '')
total = sum(len(SRC.get(k, {})) for k in KINDS)
print('fait', len(res), '/', total, 'trouvés', sum(1 for v in res.values() if v))
