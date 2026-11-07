"""
ARTISTE des cartes Album / Chanson du Pop Culture Pack (demande « SCRAPING — ARTISTE DES ALBUMS/SINGLES », 07/11).

Récolte brute, relançable (reprend où elle s'est arrêtée) — la décision est prise par scripts/build-music-artists.py.
  python scripts/harvest-music-artists.py itunes  [secondes]   # API iTunes Search (≈ 20 requêtes / min max)
  python scripts/harvest-music-artists.py mb      [secondes]   # MusicBrainz (1 requête / s), recoupement
  python scripts/harvest-music-artists.py deezer  [secondes]   # Deezer (popularité), relève d'iTunes quand Apple bride

Entrée : scripts/data/music-cards.json (id, num, name, rarity, sub, label — extrait de src/core/sets/popculture.ts)
Sorties : scripts/data/music-artists-itunes.json · scripts/data/music-artists-mb.json
Pour chaque carte : liste des correspondances EXACTES du titre (ordre de pertinence de la source) [artiste, poids].
iTunes est trié par popularité : la 1re correspondance est en général l'interprète le plus connu.
Ordre de passage : les plus rares d'abord (ce sont les plus vues), puis le reste.
"""
import json, os, re, sys, time, unicodedata, urllib.parse, urllib.request

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
SRC = sys.argv[1] if len(sys.argv) > 1 else 'itunes'
BUDGET = time.time() + float(sys.argv[2] if len(sys.argv) > 2 else 600)
cards = json.load(open(f'{D}/music-cards.json', encoding='utf-8'))
OUT = f'{D}/music-artists-{SRC}.json'
res = json.load(open(OUT, encoding='utf-8')) if os.path.exists(OUT) else {}
TIER = {'m': 0, 'l': 1, 'e': 2, 'r': 3, 'u': 4, 'c': 5}
cards.sort(key=lambda c: (TIER[c['rarity']], c['num']))
# relance ciblée : scripts/data/music-priority.json (liste d'ids, ex. les douteux de build-music-artists.py) passe devant
PRIO = set(json.load(open(f'{D}/music-priority.json', encoding='utf-8'))) if os.path.exists(f'{D}/music-priority.json') else set()
cards.sort(key=lambda c: c['id'] not in PRIO)
# MusicBrainz seulement : « k/n » = n récoltes en parallèle (≤ 1 requête / s au total), chacune dans son fichier,
# fusionnées dans le fichier principal à la fin de chacune
SHARD = sys.argv[3] if len(sys.argv) > 3 else ''
if SHARD:
    k, nsh = map(int, SHARD.split('/'))
    cards = [c for i, c in enumerate(cards) if i % nsh == k]
    MAIN, OUT = OUT, OUT.replace('.json', f'.part{k}.json')
    res = {**res, **(json.load(open(OUT, encoding='utf-8')) if os.path.exists(OUT) else {})}
UA = {'User-Agent': 'BebouCard/1.0 (private card game among friends; music metadata lookup)'}


def fold(s):
    return re.sub(r'[^a-z0-9]', '', unicodedata.normalize('NFKD', s.lower()).encode('ascii', 'ignore').decode())


def core(title):
    """Titre sans les suffixes d'édition : « (Remastered 2011) », « [Deluxe] », « - Single », « - EP »…"""
    t = re.sub(r'\s*[\(\[].*?[\)\]]', '', title)
    t = re.sub(r'\s+-\s+(single|ep|remaster.*|deluxe.*|live.*|radio edit.*|version.*|edit)$', '', t, flags=re.I)
    return t.strip()


def same(a, b):
    fa, fb = fold(core(a)), fold(b)
    return bool(fb) and (fa == fb or fold(a) == fb)


def get(url, headers=None):
    for i in range(6):
        try:
            req = urllib.request.Request(url, headers=headers or UA)
            with urllib.request.urlopen(req, timeout=20) as r:
                return json.load(r)
        except Exception as e:
            s = str(e)
            print('  ', url.split('?')[0].split('/')[2], s[:60], file=sys.stderr, flush=True)
            time.sleep((60 if '403' in s else 25) if ('403' in s or '429' in s or '503' in s) else 3)
    return None


def itunes(c):
    album = c['label'] == 'Album'
    p = {'term': c['name'], 'country': 'FR', 'limit': 50,
         'entity': 'album' if album else 'song', 'attribute': 'albumTerm' if album else 'songTerm'}
    d = get('https://itunes.apple.com/search?' + urllib.parse.urlencode(p))
    if d is None:
        return None
    out = []
    for r in d.get('results', []):
        t = r.get('collectionName' if album else 'trackName', '')
        if same(t, c['name']):
            out.append([r.get('artistName', ''), 1])
    return out


def mb(c):
    album = c['label'] == 'Album'
    q = c['name'].replace('\\', ' ').replace('"', ' ')
    if album:
        url = 'https://musicbrainz.org/ws/2/release-group?' + urllib.parse.urlencode({'query': f'releasegroup:"{q}" AND primarytype:album', 'fmt': 'json', 'limit': 40})
    else:
        url = 'https://musicbrainz.org/ws/2/recording?' + urllib.parse.urlencode({'query': f'recording:"{q}" AND video:false', 'fmt': 'json', 'limit': 100})
    d = get(url)
    if d is None:
        return None
    w = {}
    for r in d.get('release-groups' if album else 'recordings', []):
        if not same(r.get('title', ''), c['name']):
            continue
        credit = ''.join(a.get('name', '') + a.get('joinphrase', '') for a in r.get('artist-credit', []))
        if not credit or credit.lower() in ('various artists', '[unknown]'):
            continue
        # poids = nombre de sorties qui portent ce titre (un original est réédité partout, une reprise rarement)
        w[credit] = w.get(credit, 0) + max(1, len(r.get('releases', [])))
    return sorted(([k, v] for k, v in w.items()), key=lambda x: -x[1])


def deezer(c):
    """Deezer : morceaux classés par popularité (rank). Chanson : titre exact ; Album : morceaux dont l'album porte ce titre.
    Poids d'un artiste = somme des rangs de ses versions (l'original, réédité partout, l'emporte sur une reprise récente)."""
    album = c['label'] == 'Album'
    q = c['name'].replace('"', ' ')
    d = get('https://api.deezer.com/search/track?' + urllib.parse.urlencode({'q': f'{"album" if album else "track"}:"{q}"', 'order': 'RANKING', 'limit': 100}))
    if d is None or 'error' in d:
        return None
    w = {}
    for r in d.get('data', []):
        t = (r.get('album') or {}).get('title', '') if album else r.get('title', '')
        if same(t, c['name']):
            a = (r.get('artist') or {}).get('name', '')
            if a:
                w[a] = w.get(a, 0) + int(r.get('rank') or 0)
    return sorted(([k, v] for k, v in w.items()), key=lambda x: -x[1])


fn, pause = {'itunes': (itunes, 4.0), 'deezer': (deezer, 0.15), 'mb': (mb, 1.05 * (nsh if SHARD else 1))}[SRC]
n = 0
for c in cards:
    if c['id'] in res:
        continue
    if time.time() > BUDGET:
        break
    r = fn(c)
    if r is None:
        print('source injoignable, arrêt', file=sys.stderr)
        break
    res[c['id']] = r
    n += 1
    if n % 20 == 0:
        json.dump(res, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False)
        print(SRC, len(res), '/', len(cards), flush=True)
    time.sleep(pause)
json.dump(res, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False)
print('fini', SRC, '+', n, 'total', len(res), '/', len(cards), 'avec résultat', sum(1 for v in res.values() if v))
