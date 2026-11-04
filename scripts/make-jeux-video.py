"""
Sous-thème(s) « JEUX VIDÉO » du thème GAMING : 3 396 cartes, 177 familles (1 famille = 1 sous-thème).
Source : Tri-etoiles-jeux-video.xlsx (feuille « Tri étoiles », colonne « Étoiles » = rareté VALIDÉE, à ne pas retoucher).

  python scripts/make-jeux-video.py harvest donnees/tri-etoiles/Tri-etoiles-jeux-video.xlsx [--budget 170] [--only famille] [--retry]
  python scripts/make-jeux-video.py gen     donnees/tri-etoiles/Tri-etoiles-jeux-video.xlsx

harvest : cherche une illustration par carte, télécharge une fois dans public/art/jv/ (jamais de hotlink), fait la
  miniature WebP (public/art/jv/thumbs/), et note la source dans scripts/data/jv-harvest.json (reprend là où il s'est
  arrêté : relancer tant qu'il reste des cartes ; --budget = secondes max par lancement ; --retry = retente les échecs).
    - jaquettes : Steam (couverture portrait 600×900), sinon Wikipédia (image de l'infobox, page anglaise) ;
    - personnages / objets : wiki communautaire indépendant de la franchise (Super Mario Wiki, Zelda Wiki, wiki.gg…),
      sinon Wikipédia (seulement si la page est bien celle d'un personnage / d'un jeu, pas un homonyme) ;
    - rien de fiable : pas d'image → la carte reçoit un design typographique (src/core/art/jvTitle.ts).
gen : regénère src/core/sets/jeuxvideo.ts (données pures) à partir de l'Excel et du journal de récolte.
Besoin : pip install openpyxl pillow requests
"""
import sys, os, re, io, json, time, threading, unicodedata, difflib, collections, concurrent.futures as cf
import requests, openpyxl
from urllib.parse import unquote
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'art', 'jv')
THUMBS = os.path.join(OUT, 'thumbs')
LOG = os.path.join(ROOT, 'scripts', 'data', 'jv-harvest.json')
TS = os.path.join(ROOT, 'src', 'core', 'sets', 'jeuxvideo.ts')
UA = 'BebouCard/1.0 (https://cardgamepriv.pages.dev; private card game, one-time image harvest)'
R = {1: 'c', 2: 'u', 3: 'r', 4: 'e', 5: 'l', 6: 'm'}
TYPE = {'Jaquette': 'j', 'Personnage': 'p', 'Objet': 'o'}

S = requests.Session()
S.headers['User-Agent'] = UA
_lock = threading.Lock()


def slug(s):
    s = unicodedata.normalize('NFKD', str(s)).encode('ascii', 'ignore').decode().lower()
    s = s.replace('&', ' and ').replace('+', ' plus ')
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-') or 'x'


def norm(s):
    s = unicodedata.normalize('NFKD', str(s)).encode('ascii', 'ignore').decode().lower()
    s = re.sub(r'\(.*?\)', ' ', s).replace('&', ' and ')
    s = re.sub(r'^(the|a|an|le|la|les)\s+', '', s.strip())
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()


def close(a, b, th=0.86):
    a, b = norm(a), norm(b)
    if not a or not b:
        return False
    return a == b or difflib.SequenceMatcher(None, a, b).ratio() >= th


def title_ok(title, c):
    """Titre de page acceptable pour la carte : même nom, ou nom court complété par la franchise
    (« A Link to the Past » → « The Legend of Zelda: A Link to the Past »)."""
    if close(title, c['name'], 0.84):
        return True
    n, t = norm(c['name']), norm(title)
    fam = norm(c['fam'].split(' (')[0].split(' / ')[0])
    return len(n) >= 6 and t.endswith(n) and (not fam or any(w in t for w in fam.split() if len(w) > 3))


# ───────────────────────────────────────────── données
def read_rows(xlsx):
    ws = openpyxl.load_workbook(xlsx, read_only=True, data_only=True)['Tri étoiles']
    rows = []
    for r in ws.iter_rows(min_row=2, values_only=True):
        if not r or not r[1] or not r[2]:
            continue
        rows.append({'fam': str(r[1]).strip(), 'name': str(r[2]).strip(), 'type': str(r[3]).strip(), 'stars': int(r[4]), 'year': int(r[6]) if r[6] else 0})
    assert len(rows) == 3396, f'{len(rows)} lignes (3 396 attendues)'
    fams = collections.OrderedDict()
    for r in rows:
        fams.setdefault(r['fam'], []).append(r)
    assert len(fams) == 177, f'{len(fams)} familles (177 attendues)'
    out = []
    for fam, cards in fams.items():
        fs = slug(fam)
        seen = set()
        for i, c in enumerate(cards, 1):
            cs = slug(c['name'])
            base, k = cs, 2
            while cs in seen:  # même nom après « slug » (rare) : suffixe stable
                cs, k = f'{base}-{k}', k + 1
            seen.add(cs)
            c.update(famSlug=fs, num=i, id=f'jv-{fs}-{cs}', file=f'{fs}--{cs}')
            out.append(c)
    return out, fams


# ───────────────────────────────────────────── réseau
_last = collections.defaultdict(float)
_host_lock = collections.defaultdict(threading.Lock)


def get(url, params=None, tries=4, binary=False):
    """GET poli : au plus ~4 requêtes/s par site (Wikipédia limite le débit), on respecte Retry-After."""
    host = url.split('/')[2]
    for i in range(tries):
        with _host_lock[host]:
            wait = _last[host] + 0.25 - time.time()
            if wait > 0:
                time.sleep(wait)
            _last[host] = time.time()
        try:
            r = S.get(url, params=params, timeout=25)
            if r.status_code == 429 or r.status_code >= 500:
                time.sleep(min(20, float(r.headers.get('retry-after') or 2 * (i + 1))))
                continue
            if r.status_code != 200:
                return None
            if binary:
                return r.content
            j = r.json()
            return None if isinstance(j, dict) and 'error' in j else j
        except Exception:
            time.sleep(1.5 * (i + 1))
    return None


# Steam : couverture portrait officielle (PC)
def steam(c):
    q = c['name']
    data = get('https://store.steampowered.com/api/storesearch/', {'term': q, 'l': 'english', 'cc': 'US'})
    items = [it for it in (data or {}).get('items', []) if it.get('type') == 'app']
    for it in items[:5]:
        if close(it['name'], q, 0.9) or norm(it['name']).replace(' ', '') == norm(q).replace(' ', ''):
            for u in (f'https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/{it["id"]}/library_600x900_2x.jpg',
                      f'https://cdn.cloudflare.steamstatic.com/steam/apps/{it["id"]}/library_600x900.jpg',
                      f'https://cdn.cloudflare.steamstatic.com/steam/apps/{it["id"]}/header.jpg'):
                b = get(u, binary=True, tries=2)
                if b and len(b) > 4000:
                    return b, f'steam:{it["id"]}'
    return None


# Wikipédia (anglais) : image de l'infobox (les jaquettes sont « non libres » : pilicense=any)
WIKI = 'https://en.wikipedia.org/w/api.php'
WIKI_FR = 'https://fr.wikipedia.org/w/api.php'


def wiki_image(api, title):
    wp = 'wikipedia.org' in api  # Fandom ne connaît ni `description` ni `pilicense`
    params = {'action': 'query', 'titles': title, 'redirects': 1, 'prop': 'pageimages|description' if wp else 'pageimages', 'piprop': 'thumbnail', 'pithumbsize': 900, 'format': 'json'}
    if wp:
        params['pilicense'] = 'any'
    d = get(api, params)
    for p in ((d or {}).get('query', {}).get('pages', {}) or {}).values():
        th = p.get('thumbnail', {}).get('source')
        if th:
            return th, p.get('description', ''), p.get('title', title)
    return None


GAME_WORDS = ('video game', 'game', 'jeu vidéo', 'jeu video', 'videogame')
# homonymes à écarter (« Assassin's Creed Unity » ≠ « Unity (game engine) »)
BAD_WORDS = ('engine', 'software', 'company', 'developer', 'publisher', 'film', 'album', 'song', 'band', 'television',
             'tv series', 'novel', 'comic', 'magazine', 'website', 'console', 'person', 'politician', 'footballer', 'actor')
CHAR_WORDS = ('character', 'fictional', 'mascot', 'protagonist', 'antagonist', 'personnage', 'creature', 'species', 'pokémon', 'operator')


def wikipedia(c):
    fam = c['fam']
    kind = c['type']
    want = GAME_WORDS if kind == 'Jaquette' else CHAR_WORDS + GAME_WORDS
    hint = '' if norm(fam.split(' (')[0]) in norm(c['name']) or 'divers' in fam or '&' in fam else fam.split(' (')[0]
    queries = [f'{c["name"]} {hint} video game'.strip() if kind == 'Jaquette' else f'{c["name"]} {hint} character'.strip(), c['name']]
    for api in (WIKI, WIKI_FR):
        for q in queries:
            d = get(api, {'action': 'query', 'list': 'search', 'srsearch': q, 'srlimit': 5, 'format': 'json'})
            for hit in (d or {}).get('query', {}).get('search', []):
                t = hit['title']
                if not title_ok(t, c):
                    continue
                target_api, target = api, t
                if api == WIKI_FR:  # pas d'images « non libres » sur la version française : on passe par la page anglaise
                    ll = get(WIKI_FR, {'action': 'query', 'titles': t, 'prop': 'langlinks', 'lllang': 'en', 'format': 'json'})
                    pg = next(iter(((ll or {}).get('query', {}).get('pages', {}) or {}).values()), {})
                    en = (pg.get('langlinks') or [{}])[0].get('*')
                    if en:
                        target_api, target = WIKI, en
                img = wiki_image(target_api, target)
                if not img:
                    continue
                url, desc, title = img
                dl = (desc or '').lower()
                if not any(w in dl for w in want) and kind != 'Objet':
                    continue
                if any(w in dl for w in BAD_WORDS) and 'video game' not in dl.replace('video game console', ''):
                    continue
                b = get(url, binary=True, tries=3)
                if b and len(b) > 3000:
                    return b, f'wiki:{title}'
    return None


# Wikis communautaires INDÉPENDANTS (NIWA, wiki.gg, …) : artworks officiels, souvent détourés. (Les wikis Fandom
# refusent le téléchargement automatisé de leurs images : on ne les utilise pas.)
MARIO = 'https://www.mariowiki.com/api.php'
WIKIS = {
    'Mario': MARIO, 'Mario Kart': MARIO, 'Mario Party': MARIO, 'Mario RPG & spin-offs': MARIO, 'Donkey Kong': MARIO, 'Wario': MARIO,
    'Yoshi': MARIO, 'Nintendo divers': MARIO, 'Zelda': 'https://zeldawiki.wiki/w/api.php', 'Minecraft': 'https://minecraft.wiki/api.php',
    'Kirby': 'https://wikirby.com/api.php', 'Metroid': 'https://www.metroidwiki.org/w/api.php', 'Pikmin': 'https://www.pikminwiki.com/api.php',
    'Fire Emblem': 'https://fireemblemwiki.org/w/api.php', 'Super Smash Bros.': 'https://www.ssbwiki.com/api.php',
    'Splatoon': 'https://splatoonwiki.org/w/api.php', 'Animal Crossing': 'https://nookipedia.com/w/api.php',
    'Dragon Quest': 'https://dragon-quest.org/api.php', 'Xenoblade': 'https://www.xenoserieswiki.org/w/api.php',
    'Mother / EarthBound': 'https://wikibound.info/w/api.php', 'Sonic': 'https://info.sonicretro.org/api.php',
    'Palworld': 'https://palworld.wiki.gg/api.php', 'Apex Legends': 'https://apexlegends.wiki.gg/api.php',
    'Titanfall / Apex': 'https://apexlegends.wiki.gg/api.php', 'Undertale / Deltarune': 'https://undertale.wiki.gg/api.php',
    'Hollow Knight': 'https://hollowknight.wiki/w/api.php', 'Half-Life': 'https://combineoverwiki.net/api.php',
    'Valve divers': 'https://combineoverwiki.net/api.php', 'Portal': 'https://theportalwiki.com/w/api.php',
    'Warcraft': 'https://warcraft.wiki.gg/api.php', 'Digimon': 'https://wikimon.net/api.php',
    'Kingdom Hearts': 'https://www.khwiki.com/api.php', 'Terraria': 'https://terraria.wiki.gg/api.php',
    'Hades (persos)': 'https://hades.wiki.gg/api.php', 'Isaac (persos)': 'https://bindingofisaacrebirth.wiki.gg/api.php',
    'Fortnite': 'https://fortnite.wiki.gg/api.php', 'Genshin Impact': 'https://genshin-impact.wiki.gg/api.php',
    'Diablo': 'https://diablo.wiki.gg/api.php', 'Borderlands': 'https://borderlands.wiki.gg/api.php',
}
_wiki_ok = {}


def wiki_api(fam):
    api = WIKIS.get(fam)
    if not api:
        return None
    with _lock:
        if api in _wiki_ok:
            return _wiki_ok[api]
    d = get(api, {'action': 'query', 'meta': 'siteinfo', 'format': 'json'}, tries=2)
    ok = api if d and d.get('query', {}).get('general') else None
    with _lock:
        _wiki_ok[api] = ok
    return ok


IMG_RE = re.compile(r'<img[^>]+?src="([^"]+?\.(?:png|jpe?g|webp)[^"]*)"[^>]*?(?:width="(\d+)")?', re.I)


def mw_image(api, title):
    """Image principale d'une page : PageImages si le wiki l'a, sinon la 1re grande image de l'infobox (section 0)."""
    img = wiki_image(api, title)
    if img:
        return img
    d = get(api, {'action': 'parse', 'page': title, 'redirects': 1, 'prop': 'text', 'section': 0, 'format': 'json', 'formatversion': 2})
    html = ((d or {}).get('parse') or {}).get('text') or ''
    tokens = [t for t in norm(title).split() if len(t) >= 3]
    for m in IMG_RE.finditer(html):
        src, w = m.group(1), int(m.group(2) or 0)
        if w and w < 120:
            continue
        # la 1re image de la page n'est pas forcément le personnage (décor, bannière) : son nom de fichier doit le citer
        fname = norm(unquote(src.split('/')[-1]).replace('_', ' '))
        if tokens and not any(t in fname for t in tokens):
            continue
        if src.startswith('//'):
            src = 'https:' + src
        elif src.startswith('/'):
            src = '/'.join(api.split('/')[:3]) + src
        return src.replace('&amp;', '&'), '', d['parse'].get('title', title)
    return None


def fanwiki(c):
    api = wiki_api(c['fam'])
    if not api:
        return None
    name = c['name']
    cands = [name]
    m = re.match(r'^(.*?)\s*\((.*?)\)\s*$', name)
    if m:
        cands.append(m.group(1))
    for t in cands:
        img = mw_image(api, t)
        if not img:
            d = get(api, {'action': 'opensearch', 'search': t, 'limit': 4, 'format': 'json'})
            for h in (d[1] if isinstance(d, list) and len(d) > 1 else []):
                if close(h, t, 0.84):
                    img = mw_image(api, h)
                    if img:
                        break
        if img:
            b = get(img[0], binary=True, tries=3)
            if b and len(b) > 3000:
                return b, f'wiki:{api.split("/")[2]}:{img[2]}'
    return None


# ───────────────────────────────────────────── images
def save(c, blob):
    try:
        im = Image.open(io.BytesIO(blob))
        im.load()
    except Exception:
        return None
    if min(im.size) < 110:
        return None
    if im.mode in ('P', 'LA', 'PA'):
        im = im.convert('RGBA')
    cutout = False
    if im.mode == 'RGBA':
        a = im.getchannel('A')
        hist = a.histogram()
        transparent = sum(hist[:16]) / (im.size[0] * im.size[1])
        cutout = transparent > 0.06
        if not cutout:
            bg = Image.new('RGB', im.size, (255, 255, 255))  # fond blanc : le jeu sait le détourer (noir : non)
            bg.paste(im, mask=a)
            im = bg
    elif im.mode != 'RGB':
        im = im.convert('RGB')
    # personnage / objet sur fond blanc uni (render de wiki) : à détourer en jeu plutôt qu'à cadrer bord à bord
    if not cutout and c['type'] != 'Jaquette' and white_border(im):
        cutout = None  # « i » sans transparence : le jeu retire le blanc à la volée
    im.thumbnail((900, 900), Image.LANCZOS)
    if cutout is None:
        name = c['file'] + '.jpg'
        im.convert('RGB').save(os.path.join(OUT, name), quality=88, optimize=True, progressive=True)
        th = im.copy()
        th.thumbnail((256, 256), Image.LANCZOS)
        th.save(os.path.join(THUMBS, c['file'] + '.webp'), quality=80, method=5)
        return name, 'i'
    if cutout:
        name = c['file'] + '.png'
        im.save(os.path.join(OUT, name), optimize=True)
    else:
        name = c['file'] + '.jpg'
        im.save(os.path.join(OUT, name), quality=86, optimize=True, progressive=True)
    th = im.copy()
    th.thumbnail((256, 256), Image.LANCZOS)
    th.save(os.path.join(THUMBS, c['file'] + '.webp'), quality=80, method=5)
    return name, ('i' if cutout else 'c')


def border_stats(im):
    """Part des pixels du pourtour quasi blancs / quasi noirs."""
    rgb = im.convert('RGB')
    w, h = rgb.size
    px = rgb.load()
    pts = [(x, y) for x in range(0, w, max(1, w // 60)) for y in (0, 1, h - 2, h - 1)] + [(x, y) for y in range(0, h, max(1, h // 60)) for x in (0, 1, w - 2, w - 1)]
    white = sum(1 for p in pts if min(px[p]) > 232) / len(pts)
    black = sum(1 for p in pts if max(px[p]) < 18) / len(pts)
    return white, black


def white_border(im):
    return border_stats(im)[0] > 0.85


def fixart(xlsx, budget):
    """Images déjà récoltées : personnage / objet sur fond blanc → détouré en jeu (« i ») ; sur fond noir (ancienne
    version du script, transparence aplatie sur du noir) → retéléchargé avec la version actuelle."""
    cards, _ = read_rows(xlsx)
    log = load_log()
    t0, white, redo, n = time.time(), 0, 0, 0
    for c in cards:
        v = log.get(c['id'], {})
        if v.get('art') != 'c' or c['type'] == 'Jaquette' or v.get('fx'):
            continue
        if time.time() - t0 > budget:
            break
        n += 1
        try:
            im = Image.open(os.path.join(OUT, v['file']))
            wb, bb = border_stats(im)
        except Exception:
            continue
        if wb > 0.85:
            v.update(art='i', fx=1)
            white += 1
        elif bb > 0.85:
            res = harvest_one(c)
            log[c['id']] = {**res, 't': int(time.time()), 'fx': 1}
            redo += 1
        else:
            v['fx'] = 1
        if n % 40 == 0:
            write_log(log)
    write_log(log)
    left = sum(1 for c in cards if log.get(c['id'], {}).get('art') == 'c' and c['type'] != 'Jaquette' and not log[c['id']].get('fx'))
    print(f'{n} vues · {white} passées en détouré · {redo} retéléchargées · reste {left}', flush=True)


def harvest_one(c):
    order = (steam, wikipedia, fanwiki) if c['type'] == 'Jaquette' else (fanwiki, wikipedia)
    for fn in order:
        try:
            res = fn(c)
        except Exception as e:  # une source qui plante ne bloque pas les autres
            res = None
        if res:
            saved = save(c, res[0])
            if saved:
                return {'file': saved[0], 'art': saved[1], 'src': res[1]}
    return {'file': '', 'art': '', 'src': ''}


def load_log():
    try:
        with open(LOG, encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}


def write_log(log):
    tmp = LOG + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(log, f, ensure_ascii=False, indent=0, sort_keys=True)
    os.replace(tmp, LOG)


def harvest(xlsx, budget, only, retry):
    os.makedirs(THUMBS, exist_ok=True)
    os.makedirs(os.path.dirname(LOG), exist_ok=True)
    cards, _ = read_rows(xlsx)
    log = load_log()
    todo = [c for c in cards if (c['id'] not in log or (retry and not log[c['id']].get('file'))) and (not only or c['fam'] == only)]
    t0 = time.time()
    done = 0
    print(f'{len(todo)} cartes à chercher ({len(cards) - len(todo)} déjà traitées)', flush=True)
    with cf.ThreadPoolExecutor(6) as ex:
        it = iter(todo)
        running = {}
        def submit():
            c = next(it, None)
            if c and time.time() - t0 < budget:
                running[ex.submit(harvest_one, c)] = c
        for _ in range(12):
            submit()
        while running:
            fin, _ = cf.wait(list(running), return_when=cf.FIRST_COMPLETED)
            for f in fin:
                c = running.pop(f)
                log[c['id']] = {**f.result(), 't': int(time.time())}
                done += 1
                if done % 25 == 0:
                    write_log(log)
                submit()
    write_log(log)
    found = sum(1 for c in cards if log.get(c['id'], {}).get('file'))
    left = sum(1 for c in cards if c['id'] not in log)
    print(f'+{done} traitées en {time.time() - t0:.0f} s · images : {found}/{len(cards)} · reste {left}', flush=True)


def recheck(xlsx, budget):
    """Revalide les images déjà trouvées sur Wikipédia (description de la page) et refait celles des wikis de
    franchise avec les règles actuelles. Une image écartée n'est plus utilisée (la carte passe au design typographique)."""
    cards, _ = read_rows(xlsx)
    by_id = {c['id']: c for c in cards}
    log = load_log()
    todo = [k for k, v in log.items() if v.get('file') and v.get('src', '').startswith('wiki:') and not v.get('ok2')]
    t0, n, dropped = time.time(), 0, 0
    print(f'{len(todo)} images à revérifier', flush=True)

    def one(k):
        v, c = log[k], by_id.get(k)
        src = v['src'][5:]
        if c is None:
            return k, None
        if ':' in src and '.' in src.split(':')[0]:  # wiki de franchise : on refait la recherche avec les règles actuelles
            res = fanwiki(c)
            saved = res and save(c, res[0])  # même carte, image choisie avec les règles actuelles (réécrite)
            if saved:
                log[k].update(file=saved[0], art=saved[1], src=res[1])
                return k, True
            return k, False
        img = wiki_image(WIKI, src)
        if not img:
            return k, True  # page introuvable maintenant : on garde l'image déjà validée à la récolte
        dl = (img[1] or '').lower()
        bad = any(w in dl for w in BAD_WORDS) and 'video game' not in dl.replace('video game console', '')
        return k, not bad

    with cf.ThreadPoolExecutor(4) as ex:
        it = iter(todo)
        running = set()
        def submit():
            k = next(it, None)
            if k and time.time() - t0 < budget:
                running.add(ex.submit(one, k))
        for _ in range(8):
            submit()
        while running:
            fin, _ = cf.wait(list(running), return_when=cf.FIRST_COMPLETED)
            for f in fin:
                running.discard(f)
                k, ok = f.result()
                n += 1
                if ok is False:
                    log[k].update(file='', art='', src='', dropped=log[k]['src'])
                    dropped += 1
                else:
                    log[k]['ok2'] = 1
                if n % 50 == 0:
                    write_log(log)
                submit()
    write_log(log)
    left = sum(1 for v in log.values() if v.get('file') and v.get('src', '').startswith('wiki:') and not v.get('ok2'))
    print(f'{n} revérifiées, {dropped} écartées · reste {left}', flush=True)


# ───────────────────────────────────────────── données TypeScript
def _purged():
    import json as _j, os as _o
    return set(_j.load(open(_o.path.join(_o.path.dirname(_o.path.abspath(__file__)), 'data', 'purged-ids.json'), encoding='utf-8')))


def gen(xlsx):
    cards, fams = read_rows(xlsx)
    # purge du 04/11/2026 : les cartes 1★-3★ restées sans illustration sont supprimées du jeu (scripts/data/purged-ids.json)
    _p = _purged()
    cards = [c for c in cards if c['id'] not in _p]
    log = load_log()
    codes, used = {}, set()
    for fam in fams:
        words = [w for w in re.findall(r'[A-Za-z0-9]+', unicodedata.normalize('NFKD', fam).encode('ascii', 'ignore').decode()) if w.lower() not in ('the', 'of', 'and', 'divers', 'persos')]
        base = (''.join(w[0] for w in words[:3]) if len(words) >= 3 else (words[0][:2] + (words[1][0] if len(words) > 1 else words[0][2:3])) if words else 'JV').upper()[:3]
        code, k = base, 2
        while code in used:
            code, k = base[:2] + str(k), k + 1
        used.add(code)
        codes[fam] = code
    q = lambda s: json.dumps(s, ensure_ascii=False)
    lines = []
    lines.append('/**')
    lines.append(' * Sous-thèmes « JEUX VIDÉO » (thème GAMING) — données pures, AUCUN import (partagé avec convex/cardsCatalog.ts).')
    lines.append(' * GÉNÉRÉ par scripts/make-jeux-video.py (ne pas éditer à la main) depuis Tri-etoiles-jeux-video.xlsx (feuille « Tri étoiles »,')
    lines.append(' * colonne « Étoiles » = rareté validée par le groupe) et le journal de récolte des images (scripts/data/jv-harvest.json).')
    lines.append(f' * {len(cards)} cartes · {len(fams)} familles = {len(fams)} sous-thèmes (décision du 2 nov.) · clé métier (famille, carte) : 8 homonymes de')
    lines.append(' * champions LoL (Jax, Ashe, Morgana…) sont des personnages DIFFÉRENTS, d\'où l\'identifiant `jv-<famille>-<carte>`.')
    lines.append(' * Illustrations : public/art/jv/<famille>--<carte>.(jpg|png) ; sans image → design typographique (src/core/art/jvTitle.ts).')
    lines.append(' */')
    lines.append("export type JvRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';")
    lines.append("export type JvKind = 'cover' | 'character' | 'object';")
    lines.append('')
    lines.append('export interface JvFamily {')
    lines.append('  /** identifiant du sous-thème (`jv-<famille>`) — stable */')
    lines.append('  id: string;')
    lines.append('  label: string;')
    lines.append('  /** code court sur la carte (« MAR 012/58 ») */')
    lines.append('  code: string;')
    lines.append('}')
    lines.append('')
    lines.append('export interface JvEntry {')
    lines.append('  /** identifiant de carte (`jv-<famille>-<carte>`) — ne JAMAIS le changer */')
    lines.append('  id: string;')
    lines.append('  family: string;')
    lines.append('  /** numéro dans la famille (1..taille) */')
    lines.append('  num: number;')
    lines.append('  name: string;')
    lines.append('  kind: JvKind;')
    lines.append('  rarity: JvRarity;')
    lines.append('  /** année de sortie (0 = inconnue) */')
    lines.append('  year: number;')
    lines.append("  /** illustration (dans art/jv), '' = aucune (design typographique) */")
    lines.append('  file: string;')
    lines.append("  /** 'c' image pleine (jaquette, capture) · 'i' artwork détouré · '' aucune */")
    lines.append("  art: '' | 'c' | 'i';")
    lines.append('}')
    lines.append('')
    lines.append("export const JV_INFO = { label: 'Jeux vidéo', artDir: 'art/jv', size: %d } as const;" % len(cards))
    lines.append('')
    lines.append('export const JV_FAMILIES: JvFamily[] = [')
    for fam in fams:
        lines.append(f"  {{ id: {q('jv-' + slug(fam))}, label: {q(fam)}, code: {q(codes[fam])} }},")
    lines.append('];')
    lines.append('')
    lines.append("const R = { c: 'common', u: 'uncommon', r: 'rare', e: 'epic', l: 'legendary', m: 'mythic' } as const;")
    lines.append("const K = { j: 'cover', p: 'character', o: 'object' } as const;")
    lines.append('')
    lines.append('// [famille (index), slug de carte, nom, type (j jaquette · p personnage · o objet), rareté, année, fichier, art]')
    lines.append("const RAW: Array<[number, string, string, keyof typeof K, keyof typeof R, number, string, '' | 'c' | 'i']> = [")
    fam_index = {f: i for i, f in enumerate(fams)}
    for c in cards:
        h = log.get(c['id'], {})
        lines.append(f"  [{fam_index[c['fam']]}, {q(c['id'][len('jv-' + c['famSlug']) + 1:])}, {q(c['name'])}, '{TYPE[c['type']]}', '{R[c['stars']]}', {c['year']}, {q(h.get('file', ''))}, {q(h.get('art', ''))}],")
    lines.append('];')
    lines.append('')
    lines.append('const counters: number[] = [];')
    lines.append('export const JV: JvEntry[] = RAW.map(([f, s, name, k, r, year, file, art]) => {')
    lines.append('  const fam = JV_FAMILIES[f];')
    lines.append('  counters[f] = (counters[f] ?? 0) + 1;')
    lines.append('  return { id: `${fam.id}-${s}`, family: fam.id, num: counters[f], name, kind: K[k], rarity: R[r], year, file, art };')
    lines.append('});')
    lines.append('')
    with open(TS, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(lines))
    found = sum(1 for c in cards if log.get(c['id'], {}).get('file'))
    print(f'{TS} : {len(cards)} cartes, {len(fams)} familles, {found} avec illustration')


if __name__ == '__main__':
    a = sys.argv[1:]
    if len(a) < 2 or a[0] not in ('harvest', 'gen', 'recheck', 'fixart'):
        print(__doc__)
        sys.exit(1)
    opt = lambda k, d=None: a[a.index(k) + 1] if k in a else d
    if a[0] == 'harvest':
        harvest(a[1], float(opt('--budget', 1e9)), opt('--only'), '--retry' in a)
    elif a[0] == 'fixart':
        fixart(a[1], float(opt('--budget', 1e9)))
    elif a[0] == 'recheck':
        recheck(a[1], float(opt('--budget', 1e9)))
    else:
        gen(a[1])
