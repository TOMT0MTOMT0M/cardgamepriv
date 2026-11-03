"""
Rattrapage des illustrations MANQUANTES (Jeux vidéo + World Pack V2) avec des sources que la 1re récolte n'utilisait pas.

  python scripts/scrap-manquantes.py [--budget 170] [--only jv|monde]

Ne touche qu'aux cartes encore sans image dans scripts/data/jv-harvest.json et scripts/data/monde-harvest.json
(même dossier, même nommage, même miniature que les scripts de récolte) ; une carte tentée n'est pas retentée (« s2 »).
Puis : python scripts/make-jeux-video.py gen Tri-etoiles-jeux-video.xlsx && python scripts/make-monde-v2.py gen Tri-etoiles-monde_2.xlsx

Sources (toutes acceptent le téléchargement automatique avec un User-Agent identifié ; aucune n'est contournée) :
  - jaquettes : abréviations développées (GTA → Grand Theft Auto, FNAF → Five Nights at Freddy's, MGS, FF, LOTR…),
    puis Steam et Wikipédia comme à la récolte ;
  - Fortnite : fortnite-api.com (API publique des skins, noms français) ;
  - Rainbow Six : Liquipedia (portraits des agents ; ≥ 2 s entre deux requêtes, comme le demandent ses conditions) ;
  - wikis de franchise indépendants : TOUTES les images de la page (pas seulement la principale), la plus grande dont
    le nom de fichier cite la carte et qui n'est pas une icône ;
  - World Pack : Wikidata (image P18 sur Wikimedia Commons, sinon logo P154 pour les marques), libellé français exact
    et description cohérente avec le sous-thème (« ville », « espèce », « marque »…) pour écarter les homonymes.
"""
import sys, os, re, json, time, importlib.util, collections, concurrent.futures as cf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, os.path.join(ROOT, 'scripts', file))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


JV = load('jv', 'make-jeux-video.py')
MO = load('mo', 'make-monde-v2.py')
get, norm, close = JV.get, JV.norm, JV.close

# ───────────────────────────────────────────── jaquettes : abréviations
ABBR = [(r'^GTA\b:?', 'Grand Theft Auto'), (r'^FNAF\b:?', "Five Nights at Freddy's"), (r'^MGS\b', 'Metal Gear Solid'), (r'^FFVII\b', 'Final Fantasy VII'),
        (r'^FF\b', 'Final Fantasy'), (r'^LOTR\b:?', 'The Lord of the Rings:'), (r'^DBZ\b:?', 'Dragon Ball Z:'), (r'^PES\b', 'Pro Evolution Soccer'),
        (r'KOTOR', 'Knights of the Old Republic'), (r'^TES\b', 'The Elder Scrolls'), (r'^COD\b', 'Call of Duty'), (r'^AC\b', "Assassin's Creed"),
        (r'^RDR\b', 'Red Dead Redemption'), (r'^SW\b', 'Star Wars'), (r'^NFS\b', 'Need for Speed')]
YEAR_GAME = re.compile(r'^(.*?)\s*\((\d{4})\)$')


def expansions(c):
    """Noms à essayer pour une jaquette : le nom, ses abréviations développées, la franchise devant un nom court."""
    n = c['name']
    out = [n]
    e = n
    for pat, rep in ABBR:
        e = re.sub(pat, rep, e)
    e = re.sub(r'\s+', ' ', e).strip()
    if e != n:
        out.append(e)
    m = YEAR_GAME.match(e)
    if m:  # « DOOM (2016) » → « Doom (2016 video game) »
        out.append(f'{m.group(1)} ({m.group(2)} video game)')
    m2 = re.match(r'^FIFA (\d{4})$', n)
    if m2:
        out.append(f'FIFA Football {m2.group(1)}')
    fam = c['fam'].split(' (')[0].split(' / ')[0]
    if len(n.split()) <= 3 and norm(fam) not in norm(e) and 'divers' not in fam and '&' not in fam:
        out.append(f'{fam} {e}')
    return list(dict.fromkeys(out))


def bare(t):
    return norm(re.sub(r'\(.*?\)', ' ', t))


def strict_ok(src, name):
    """Wikipédia doit renvoyer EXACTEMENT ce titre (sinon « GTA III » prenait la page de GTA VI : titres trop proches)."""
    if not src.startswith('wiki:'):
        return True
    return bare(src[5:]) == bare(name)


def jaquette(c):
    for name in expansions(c)[1:]:
        c2 = {**c, 'name': name}
        for fn in (JV.steam, JV.wikipedia):
            try:
                res = fn(c2)
            except Exception:
                res = None
            if res and strict_ok(res[1], name):
                return res[0], f'{res[1]}~{name}'
    for name in expansions(c):
        res = wd_game({**c, 'name': name})
        if res:
            return res
    return None


# ───────────────────────────────────────────── Fortnite
def fortnite(c):
    q = re.sub(r'\(.*?\)', '', c['name']).strip()
    for lang in ('fr', 'en'):
        d = get('https://fortnite-api.com/v2/cosmetics/br/search', {'name': q, 'language': lang, 'matchMethod': 'full'})
        data = (d or {}).get('data') if isinstance(d, dict) else None
        if data and (data.get('type') or {}).get('value') == 'outfit':
            imgs = data.get('images') or {}
            url = imgs.get('featured') or imgs.get('icon')
            if url:
                b = get(url, binary=True, tries=3)
                if b and len(b) > 3000:
                    return b, f'fortnite-api:{data.get("id")}'
    return None


# ───────────────────────────────────────────── wikis : la meilleure image de TOUTE la page
SKIP = re.compile(r'icon|logo|flag|sprite|emote|banner|map|symbol|badge|signature|button|thumb_?nail', re.I)
LIQUI = {'Rainbow Six': 'https://liquipedia.net/rainbowsix/api.php'}


import threading
_liq = threading.Lock()
_liq_last = [0.0]


def sget(slow, url, params=None, **kw):
    """Liquipedia : une requête toutes les 2 s maximum, tous fils confondus (ses conditions d'usage de l'API)."""
    if not slow:
        return get(url, params, **kw)
    with _liq:
        wait = _liq_last[0] + 2.1 - time.time()
        if wait > 0:
            time.sleep(wait)
        _liq_last[0] = time.time()
        return get(url, params, **kw)


def best_file(api, title, slow=False):
    d = sget(slow, api, {'action': 'query', 'titles': title, 'redirects': 1, 'prop': 'images', 'imlimit': 100, 'format': 'json'})
    pages = list(((d or {}).get('query', {}).get('pages', {}) or {}).values())
    if not pages or 'missing' in pages[0]:
        return None
    real = pages[0].get('title', title)
    tokens = [t for t in norm(re.sub(r'\(.*?\)', ' ', real)).split() if len(t) >= 3]
    files = [im['title'] for im in pages[0].get('images', [])]
    cand = [f for f in files if tokens and any(t in norm(f) for t in tokens) and not SKIP.search(f)]
    if not cand:
        return None
    info = sget(slow, api, {'action': 'query', 'titles': '|'.join(cand[:25]), 'prop': 'imageinfo', 'iiprop': 'url|size', 'iiurlwidth': 900, 'format': 'json'})
    best = None
    for p in ((info or {}).get('query', {}).get('pages', {}) or {}).values():
        ii = (p.get('imageinfo') or [{}])[0]
        w, h = ii.get('width', 0), ii.get('height', 0)
        if min(w, h) >= 200 and (not best or w * h > best[0]):
            best = (w * h, ii.get('thumburl') or ii.get('url'))
    if not best:
        return None
    url = best[1]
    if url.startswith('/'):
        url = '/'.join(api.split('/')[:3]) + url
    b = sget(slow, url, binary=True, tries=3)
    return (b, f'wikipage:{api.split("/")[2]}:{real}') if b and len(b) > 3000 else None


def franchise_page(c):
    api = LIQUI.get(c['fam']) or (None if 'wiki.gg' in (JV.WIKIS.get(c['fam']) or 'wiki.gg') else JV.wiki_api(c['fam']))
    if not api:  # wiki.gg répond « Not authorized » (401) aux robots : on ne l'utilise pas
        return None
    slow = 'liquipedia' in api
    name = c['name']
    cands = [name]
    m = re.match(r'^(.*?)\s*\((.*?)\)\s*$', name)
    if m:
        cands.append(m.group(1))
    cands += [x.strip() for x in re.sub(r'\(.*?\)', '', name).split('/') if '/' in name]
    en = wd_en_label(c)
    if en:
        cands.append(en)
    for t in dict.fromkeys(cands):
        res = best_file(api, t, slow)
        if res:
            return res
    return None


# ───────────────────────────────────────────── Jeux vidéo : Wikidata → page Wikipédia anglaise (image d'infobox)
WD = 'https://www.wikidata.org/w/api.php'
GAMEDESC = ('video game', 'jeu vidéo', 'jeu video', 'videogame', 'mobile game', 'jeu mobile')
CHARDESC = ('character', 'personnage', 'mascot', 'mascotte', 'protagonist', 'antagonist', 'boss', 'creature', 'créature')
_wd_cache = {}


def fam_tokens(fam):
    f = re.sub(r'\(.*?\)', ' ', fam)
    if 'divers' in f or 'autres' in f.lower() or 'classiques' in f.lower():
        return []
    return [t for t in norm(f).split() if len(t) >= 4 and t not in ('jeux', 'persos', 'online', 'mobile', 'casual', 'royale', 'battle')]


def wd_hits(c, want):
    """Entités Wikidata dont le libellé (fr ou en) est le nom de la carte et dont la description colle (jeu / personnage
    de la bonne franchise). Renvoie [(qid, label)]."""
    key = (c['id'], c['name'], want)
    if key in _wd_cache:
        return _wd_cache[key]
    names = [c['name'], re.sub(r'\(.*?\)', '', c['name']).strip()] + [x.strip() for x in re.sub(r'\(.*?\)', '', c['name']).split('/') if '/' in c['name']]
    toks = fam_tokens(c['fam'])
    out = []
    for name in dict.fromkeys(n for n in names if n):
        for lang in ('fr', 'en'):
            d = get(WD, {'action': 'wbsearchentities', 'search': name, 'language': lang, 'uselang': 'en', 'type': 'item', 'limit': 7, 'format': 'json'})
            for hit in (d or {}).get('search', []):
                label = (hit.get('match') or {}).get('text') or hit.get('label') or ''
                if bare(label) != bare(name) and not (want == 'char' and bare(name) in bare(label).split()[:1]):
                    continue
                desc = (hit.get('description') or '').lower()
                if not any(w in desc for w in (GAMEDESC if want == 'game' else CHARDESC)):
                    continue
                if want == 'char' and toks and not any(t in norm(desc) for t in toks):
                    continue
                if want == 'char' and not toks and not any(w in desc for w in GAMEDESC):
                    continue
                out.append((hit['id'], hit.get('label') or label))
            if out:
                break
        if out:
            break
    _wd_cache[key] = out
    return out


def wd_en_label(c):
    h = wd_hits(c, 'char' if c['type'] != 'Jaquette' else 'game')
    return h[0][1] if h else None


def wd_image(qid):
    e = get(WD, {'action': 'wbgetentities', 'ids': qid, 'props': 'sitelinks|claims', 'sitefilter': 'enwiki', 'format': 'json'})
    ent = ((e or {}).get('entities', {}).get(qid, {}) or {})
    en = (ent.get('sitelinks', {}).get('enwiki') or {}).get('title')
    if en:
        img = JV.wiki_image(JV.WIKI, en)
        if img and not re.search(r'logo|wordmark', img[0], re.I):
            b = get(img[0], binary=True, tries=3)
            if b and len(b) > 3000:
                return b, f'wikidata:{qid}:enwiki:{en}'
    v = (ent.get('claims', {}).get('P18') or [{}])[0].get('mainsnak', {}).get('datavalue', {}).get('value')
    if v:
        b = get('https://commons.wikimedia.org/wiki/Special:FilePath/' + v.replace(' ', '_') + '?width=900', binary=True, tries=3)
        if b and len(b) > 3000:
            return b, f'wikidata:{qid}:P18'
    return None


def wd_game(c):
    for qid, _ in wd_hits(c, 'game')[:2]:
        res = wd_image(qid)
        if res:
            return res
    return None


def wd_char(c):
    for qid, _ in wd_hits(c, 'char')[:2]:
        res = wd_image(qid)
        if res:
            return res
    return None


# ───────────────────────────────────────────── World Pack : Wikidata
DESC = {
    'villes': ('ville', 'city', 'commune', 'municip', 'capitale', 'capital', 'métropole', 'prefecture', 'préfecture', 'district', 'town', 'agglom', 'chef-lieu'),
    'animaux': ('espèce', 'species', 'taxon', 'genre', 'famille', 'sous-espèce', 'animal', 'dinosaure', 'race'),
    'nourriture': ('marque', 'brand', 'plat', 'dessert', 'confiserie', 'boisson', 'fromage', 'gâteau', 'sauce', 'produit', 'biscuit', 'céréale', 'bonbon',
                   'chocolat', 'aliment', 'food', 'dish', 'snack', 'entreprise', 'company', 'cuisin', 'chef', 'spécialité', 'pâtisserie', 'cocktail', 'bière',
                   'vin', 'soda', 'glace', 'restaurant', 'chaîne', 'recette', 'mets', 'charcuterie'),
    'voitures': ('automobile', 'voiture', 'car ', 'modèle', 'véhicule', 'coupé', 'berline', 'citadine', 'roadster', 'sportive', 'pick-up', 'supercar'),
    'departements': ('département',),
}


NOT_PLACE = ('film', 'album', 'chanson', 'single', 'groupe de musique', 'jeu vidéo', 'roman', 'série télévisée', 'épisode', 'personnage', 'homonymie',
             'nom de famille', 'prénom', 'footballeur', 'acteur', 'actrice', 'chanteur', 'navire', 'astéroïde', 'race de', 'station', 'métro', 'gare ',
             'école', 'écoles')
# sous-thèmes sans mot-clé de type : la description doit au moins dire ce que c'est (Serengeti ≠ race de chat, Murray ≠ ville de l'Utah)
SUBDESC = {
    'Mers, fleuves & lacs': ('fleuve', 'rivière', 'lac', 'mer ', 'mer.', 'océan', 'golfe', 'baie', 'détroit', "cours d'eau", 'river', 'lake', 'sea', 'estuaire', 'lagune'),
    'Montagnes & volcans': ('montagne', 'mont', 'volcan', 'sommet', 'massif', 'chaîne', 'pic', 'mountain', 'volcano', 'peak'),
    'Sites naturels': ('parc', 'montagne', 'désert', 'île', 'chute', 'cascade', 'canyon', 'forêt', 'grotte', 'plage', 'récif', 'glacier', 'lac', 'vallée',
                       'plateau', 'falaise', 'réserve', 'site', 'formation', 'écorégion', 'archipel', 'delta', 'volcan', 'gorge', 'mont', 'savane', 'région',
                       'baie', 'geyser', 'rocher', 'massif', 'dune', 'cratère', 'fjord', 'atoll', 'lagon', 'marais', 'zone humide', 'péninsule', 'cap '),
}


def wd_kind(c):
    if c['sub'] == 'Départements':
        return 'departements'
    if c['sub'].startswith('Villes') or c['sub'] == 'Capitales':
        return 'villes'
    return c['group'] if c['group'] in ('animaux', 'nourriture', 'voitures') else None


def wikidata(c):
    q = re.sub(r'^Pays\s*:\s*', '', c['name'])
    q = re.sub(r"^Département (de la |de l'|de l’|du |des |d'|d’|de )", '', q).replace('?', '').strip()
    q2 = re.sub(r'\(.*?\)', '', q).strip()
    kind = wd_kind(c)
    for search in dict.fromkeys([q, q2]):
        d = get(WD, {'action': 'wbsearchentities', 'search': search, 'language': 'fr', 'uselang': 'fr', 'type': 'item', 'limit': 6, 'format': 'json'})
        for hit in (d or {}).get('search', []):
            label = (hit.get('match') or {}).get('text') or hit.get('label') or ''
            if norm(label) != norm(search):
                continue
            desc = (hit.get('description') or '').lower()
            if kind and not any(w in desc for w in DESC[kind]):
                continue
            if not desc or any(w in desc for w in NOT_PLACE):
                continue
            if c['sub'] in SUBDESC and not any(w in desc + ' ' for w in SUBDESC[c['sub']]):
                continue
            e = get(WD, {'action': 'wbgetentities', 'ids': hit['id'], 'props': 'claims', 'format': 'json'})
            claims = ((e or {}).get('entities', {}).get(hit['id'], {}) or {}).get('claims', {})
            for prop in ('P18', 'P154'):
                v = (claims.get(prop) or [{}])[0].get('mainsnak', {}).get('datavalue', {}).get('value')
                if v:
                    url = 'https://commons.wikimedia.org/wiki/Special:FilePath/' + v.replace(' ', '_') + '?width=900'
                    b = get(url, binary=True, tries=3)
                    if b and len(b) > 3000:
                        return b, f'wikidata:{hit["id"]}:{prop}'
    return None


# ───────────────────────────────────────────── boucle
def run(budget, only):
    t0 = time.time()
    jv_cards, _ = JV.read_rows(os.path.join(ROOT, 'Tri-etoiles-jeux-video.xlsx'))
    mo_cards, _ = MO.build(os.path.join(ROOT, 'Tri-etoiles-monde_2.xlsx'))
    jv_log, mo_log = JV.load_log(), MO.load_log()
    todo = []
    if only in (None, 'jv'):
        for c in jv_cards:
            h = jv_log.get(c['id'], {})
            if not h.get('file') and not h.get('s2'):
                todo.append(('jv', c))
    if only in (None, 'monde'):
        for c in mo_cards:
            h = mo_log.get(c['id'], {})
            if not c['v1'] and not h.get('file') and not h.get('s2'):
                todo.append(('mo', c))
    print(f'{len(todo)} cartes sans image à retenter', flush=True)

    def flush():  # n'écrit que le journal traité (deux lancements --only jv / --only monde en parallèle)
        if only in (None, 'jv'):
            JV.write_log(jv_log)
        if only in (None, 'monde'):
            MO.write_log(mo_log)

    def one(kind, c):
        if kind == 'mo':
            fns = (wikidata,)
            mod = MO
        else:
            mod = JV
            fns = (jaquette,) if c['type'] == 'Jaquette' else ((fortnite,) if c['fam'] == 'Fortnite' else ()) + (franchise_page, wd_char)
        for fn in fns:
            try:
                res = fn(c)
            except Exception:
                res = None
            if res:
                saved = mod.save(c, res[0])
                if saved:
                    return {'file': saved[0], 'art': saved[1], 'src': res[1]}
        return None

    done = found = 0
    with cf.ThreadPoolExecutor(6) as ex:
        it = iter(todo)
        running = {}

        def submit():
            x = next(it, None)
            if x and time.time() - t0 < budget:
                running[ex.submit(one, *x)] = x

        for _ in range(12):
            submit()
        while running:
            fin, _ = cf.wait(list(running), return_when=cf.FIRST_COMPLETED)
            for f in fin:
                kind, c = running.pop(f)
                log = mo_log if kind == 'mo' else jv_log
                res = f.result()
                h = log.setdefault(c['id'], {'file': '', 'art': '', 'src': ''})
                h['s2'] = 1
                if res:
                    h.update(res)
                    found += 1
                done += 1
                if done % 20 == 0:
                    flush()
                submit()
    flush()
    left = sum(1 for k, c in todo if not ((mo_log if k == 'mo' else jv_log).get(c['id'], {}).get('s2')))
    print(f'+{done} retentées en {time.time() - t0:.0f} s · {found} images trouvées · reste {left}', flush=True)


if __name__ == '__main__':
    a = sys.argv[1:]
    opt = lambda k, d=None: a[a.index(k) + 1] if k in a else d
    run(float(opt('--budget', 1e9)), opt('--only'))
