import json, os, sys, time, unicodedata, urllib.parse, urllib.request, re
# entrée : data/music6.json (cartes Musique 6★ : id, sub, name, label) · sortie : data/music-previews.json
# (iTunes limite à ~20 requêtes / min : 3 s entre deux ; relançable, reprend où il s'est arrêté)
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
cards = json.load(open(f'{D}/music6.json', encoding='utf-8'))
OUT = f'{D}/music-previews.json'
res = json.load(open(OUT, encoding='utf-8')) if os.path.exists(OUT) else {}
def fold(s): return re.sub(r'[^a-z0-9]', '', unicodedata.normalize('NFKD', s.lower()).encode('ascii', 'ignore').decode())
def q(params):
    url = 'https://itunes.apple.com/search?' + urllib.parse.urlencode(params)
    for i in range(4):
        try:
            with urllib.request.urlopen(url, timeout=12) as r: return json.load(r).get('results', [])
        except Exception as e:
            if '403' in str(e) or '429' in str(e): time.sleep(20)
            else: time.sleep(3)
    return None
budget = time.time() + float(sys.argv[1] if len(sys.argv) > 1 else 160)
n = 0
for c in cards:
    if c['id'] in res: continue
    if time.time() > budget: break
    name, kind = c['name'], c['label']
    pick = None
    if kind == 'Artiste':
        rs = q({'term': name, 'entity': 'song', 'attribute': 'artistTerm', 'limit': 15, 'country': 'FR'})
        if rs is None: break
        ok = [r for r in rs if r.get('previewUrl') and fold(r.get('artistName', '')) == fold(name)]
        ok = ok or [r for r in rs if r.get('previewUrl') and fold(name) and fold(r.get('artistName', '')).startswith(fold(name))]
        pick = ok[0] if ok else None
    elif kind == 'Chanson':
        rs = q({'term': name, 'entity': 'song', 'attribute': 'songTerm', 'limit': 25, 'country': 'FR'})
        if rs is None: break
        ok = [r for r in rs if r.get('previewUrl') and fold(re.sub(r'\s*[\(\[].*$', '', r.get('trackName', ''))) == fold(name)]
        pick = ok[0] if ok else None
    else:
        rs = q({'term': name, 'entity': 'song', 'attribute': 'albumTerm', 'limit': 25, 'country': 'FR'})
        if rs is None: break
        ok = [r for r in rs if r.get('previewUrl') and fold(re.sub(r'\s*[\(\[].*$', '', r.get('collectionName', ''))) == fold(name)]
        pick = ok[0] if ok else None
    res[c['id']] = {'url': pick['previewUrl'], 'track': pick['trackName'], 'artist': pick['artistName'], 'link': pick.get('trackViewUrl', '')} if pick else None
    n += 1
    json.dump(res, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    time.sleep(3.1)
print('done', n, 'total', len(res), 'found', sum(1 for v in res.values() if v), 'of', len(cards))
