"""
Récolte des sous-thèmes « League of Legends » (champions + skins) et « Skins CS » (thème GAMING).
  python scripts/make-gaming-skins.py lol chemin/Tri-etoiles-lol-skins.xlsx
  python scripts/make-gaming-skins.py cs  chemin/Tri-etoiles-csgo.xlsx
1. lit l'Excel validé (colonne « Étoiles finales (VALIDÉ) ») ;
2. télécharge les images une fois dans public/art/<lol|cs>/ (jamais de hotlink) :
   - LoL : splash « centré » de Community Dragon (1280×720), recadré en portrait au format de la carte
     (474×662 → ~515×720), point focal au centre : le champion remplit toute la carte ;
   - CS : image Steam (ByMykel/CSGO-API), recadrée sur son contenu, armes et couteaux larges pivotés de 32°
     (comme Valorant) ;
3. regénère src/core/sets/<lol|cs>.ts. Puis : npm run thumbs (ou node scripts/make-thumbs.mjs lol cs).
Besoin : pip install openpyxl pillow
"""
import json, sys, os, io, re, collections, urllib.request, concurrent.futures as cf
import openpyxl
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
R = {1: 'c', 2: 'u', 3: 'r', 4: 'e', 5: 'l', 6: 'm'}
q = lambda s: json.dumps(s, ensure_ascii=False)


def get(url, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'bebou-card/1.0'})
            return urllib.request.urlopen(req, timeout=60).read()
        except Exception:
            if i == tries - 1:
                raise


def getjson(url):
    return json.loads(get(url))


def rows_of(path, sheet, first):
    ws = openpyxl.load_workbook(path, read_only=True)[sheet]
    return [r for r in ws.iter_rows(min_row=first, values_only=True) if r[0] is not None and r[1]]


def write_ts(path, rows_ts, size):
    src = open(path, encoding='utf-8').read()
    head, _, rest = src.partition('const RAW')
    tail = rest[rest.index('\n];') + 3:]
    head = re.sub(r'size: \d+,', f'size: {size},', head)
    decl = rest[: rest.index('= [') + 3]
    open(path, 'w', encoding='utf-8').write(head + 'const RAW' + decl + '\n' + '\n'.join(rows_ts) + '\n];' + tail)


# ───────────────────────────────────────────── League of Legends
def lol(xlsx):
    out = os.path.join(ROOT, 'public/art/lol')
    os.makedirs(out, exist_ok=True)
    ver = getjson('https://ddragon.leagueoflegends.com/api/versions.json')[0]
    champs = getjson(f'https://ddragon.leagueoflegends.com/cdn/{ver}/data/fr_FR/champion.json')['data']
    cd = getjson('https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/skins.json')
    rows = rows_of(xlsx, 'Tri étoiles', 4)
    cards = []
    for r in rows:
        n, nom, typ, champ, nom_en, rar, tags, score, stars, url = r[:10]
        m = re.search(r'/splash/([A-Za-z0-9]+)_(\d+)\.jpg', url)
        cid, num = m.group(1), int(m.group(2))
        key = int(champs[cid]['key'])
        sid = key * 1000 + num
        c = cd.get(str(sid), {})
        sp = c.get('splashPath')
        src = ('https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/' + sp.replace('/lol-game-data/assets/', '').lower()) if sp else None
        cards.append(dict(slug=f'{cid}_{num}', cid=cid, num=num, name=str(nom).strip(), champion=champs[cid]['name'],
                          kind='champion' if typ == 'Champion' else 'skin', tier=str(rar or '-'), tags=str(tags or '-'),
                          stars=int(stars), src=src, fallback=url))

    RATIO = 474 / 662  # fenêtre visible du gabarit « Pleine illustration » (cf. designs/fullart.ts, art.k = 1.62)

    def fetch(c):
        dst = f"{out}/{c['slug']}.jpg"
        if os.path.exists(dst):
            return 'déjà là'
        try:
            im = Image.open(io.BytesIO(get(c['src']))) if c['src'] else None
        except Exception:
            im = None
        if im is None:
            try:
                im = Image.open(io.BytesIO(get(c['fallback'])))
            except Exception as e:
                return f"ÉCHEC {c['slug']} ({e})"
        im = im.convert('RGB')
        w = round(im.height * RATIO)
        x = (im.width - w) // 2
        im = im.crop((x, 0, x + w, im.height))
        im.save(dst, quality=86, optimize=True, progressive=True)
        return 'téléchargée' if c['src'] else 'secours ddragon'

    with cf.ThreadPoolExecutor(16) as ex:
        res = list(ex.map(fetch, cards))
    print(collections.Counter(r if not r.startswith('ÉCHEC') else 'échec' for r in res))
    for r in res:
        if r.startswith('ÉCHEC'):
            print(' ', r)

    # ordre : champions A→Z (nom FR), le champion puis ses skins dans l'ordre Riot
    by = collections.defaultdict(list)
    for c in cards:
        by[c['cid']].append(c)
    order = []
    for cid in sorted(by, key=lambda k: champs[k]['name'].lower()):
        order += sorted(by[cid], key=lambda c: c['num'])
    assert len({c['slug'] for c in order}) == len(order)
    lines = [f"  [{i}, '{c['slug']}', {q(c['name'])}, '{R[c['stars']]}', {q(c['champion'])}, {q(c['tier'])}]," for i, c in enumerate(order, 1)]
    write_ts(os.path.join(ROOT, 'src/core/sets/lol.ts'), lines, len(order))
    print(len(order), 'cartes LoL', collections.Counter(c['stars'] for c in cards), collections.Counter(c['kind'] for c in cards))


# ───────────────────────────────────────────── Counter-Strike
def cs(xlsx):
    out = os.path.join(ROOT, 'public/art/cs')
    os.makedirs(out, exist_ok=True)
    base = 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en'
    ids = {}
    for s in getjson(f'{base}/skins.json'):
        ids.setdefault(s['name'], s['id'])
    for s in getjson(f'{base}/stickers.json'):
        ids.setdefault(s['name'], s['id'])
    rows = rows_of(xlsx, 'Tri des étoiles', 3)
    KIND = {'Arme': 'w', 'Couteau': 'k', 'Gants': 'g', 'Sticker': 's'}
    cards = []
    for r in rows:
        n, nom, typ, arme, rar, prix, score, stars, url = r[:9]
        nom = str(nom).strip()
        cid = ids.get(nom) or ('x-' + re.sub(r'[^a-z0-9]+', '-', nom.lower()).strip('-'))
        name = re.sub(r'^★\s*', '', nom)
        name = re.sub(r'^Sticker \|\s*', '', name)
        cards.append(dict(id=cid, full=nom, name=name, kind=KIND[typ], weapon=str(arme or ''), grade=str(rar or ''),
                          stars=int(stars), url=url))
    assert len({c['id'] for c in cards}) == len(cards), 'ids CS en double'

    def fetch(c):
        dst = f"{out}/{c['id']}.webp"
        if os.path.exists(dst):
            return 'déjà là'
        im = Image.open(io.BytesIO(get(c['url']))).convert('RGBA')
        im = im.crop(im.getbbox())
        if c['kind'] in 'wk' and im.width > 1.8 * im.height:
            im = im.rotate(-32, resample=Image.BICUBIC, expand=True)
            im = im.crop(im.getbbox())
        im.save(dst, 'WEBP', quality=90, alpha_quality=100, method=6)
        return 'téléchargée'

    with cf.ThreadPoolExecutor(16) as ex:
        print(collections.Counter(ex.map(fetch, cards)))

    rank = {'w': 0, 'k': 1, 'g': 2, 's': 3}
    order = sorted(cards, key=lambda c: (rank[c['kind']], c['weapon'].lower() if c['kind'] != 's' else '', c['name'].lower()))
    lines = [f"  [{i}, '{c['id']}', {q(c['name'])}, '{R[c['stars']]}', '{c['kind']}', {q(c['weapon'] if c['kind'] != 's' else '')}, {q(c['grade'])}]," for i, c in enumerate(order, 1)]
    write_ts(os.path.join(ROOT, 'src/core/sets/cs.ts'), lines, len(order))
    print(len(order), 'cartes CS', collections.Counter(c['stars'] for c in cards), collections.Counter(c['kind'] for c in cards))


if __name__ == '__main__':
    {'lol': lol, 'cs': cs}[sys.argv[1]](sys.argv[2])
