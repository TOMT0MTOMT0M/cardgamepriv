"""
SPORT PACK (thème « sport ») : 7 708 cartes (sport + esport), 114 sous-thèmes regroupés à l'affichage en 10
(Football · Esport · Sports collectifs · Raquettes · Combat · Sports mécaniques · Olympiques & athlétisme ·
Glisse & montagne · Précision & stratégie · Coulisses & légendes).
Source : Tri-etoiles-sport.xlsx (SPEC-THEME-SPORT v5.1, feuille « Tri étoiles », colonne « Étoiles finales »).

  python scripts/make-sport.py gen     donnees/tri-etoiles/Tri-etoiles-sport.xlsx
  python scripts/make-sport.py harvest donnees/tri-etoiles/Tri-etoiles-sport.xlsx [--budget 150] [--retry] [--threads 8]
  python scripts/make-sport.py wikifill donnees/tri-etoiles/Tri-etoiles-sport.xlsx      (secours : page Wikipédia au nom exact, vérifiée par Wikidata)

Import en REMPLACEMENT : le fichier src/core/sets/sport.ts est réécrit en entier à chaque « gen ».
Identifiants STABLES « spt-<nom> » : figés la première fois dans scripts/data/sport-ids.json (clé = nom + type), réutilisés
ensuite même si une future version du tri renumérote ou ré-étiquette les sous-thèmes (une carte ne change jamais d'id).
Numéro affiché = colonne « N° » de l'Excel, sur 7 708 (« n° 0123 / 7708 », règle métier de la spec).
harvest : image de la colonne « Image URL » (Wikimedia Commons, Liquipedia, cache web) téléchargée une fois dans
  public/art/sport/ + miniature WebP ; pas d'URL / image inutilisable → design typographique (placeholder standard).
  Journal : scripts/data/sport-harvest.json (reprend là où il s'est arrêté).
gen : écrit src/core/sets/sport.ts (données pures, aucun import : partagé avec convex/).
Besoin : pip install openpyxl pillow requests
"""
import sys, os, re, io, json, time, threading, unicodedata, collections, urllib.parse, concurrent.futures as cf
import requests, openpyxl
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SETS = os.path.join(ROOT, 'src', 'core', 'sets')
OUT = os.path.join(ROOT, 'public', 'art', 'sport')
THUMBS = os.path.join(OUT, 'thumbs')
IDS = os.path.join(ROOT, 'scripts', 'data', 'sport-ids.json')
LOG = os.path.join(ROOT, 'scripts', 'data', 'sport-harvest.json')
TS = os.path.join(SETS, 'sport.ts')
UA = 'BebouCard/1.0 (https://cardgamepriv.pages.dev; private card game, one-time image harvest)'
R = {1: 'c', 2: 'u', 3: 'r', 4: 'e', 5: 'l', 6: 'm'}
TOTAL = 7708

# groupe d'affichage → (libellé, sous-thèmes dans l'ordre d'affichage). Chaque sous-thème reste un vrai sous-thème
# (filtres, contrats, libellé imprimé en grand sur la carte) ; le groupe ne sert qu'à l'affichage (boutique, albums).
GROUPS = {
    'foot': ('Football', ['Football — Premier League', 'Football — Ligue 1', 'Football — La Liga', 'Football — Serie A', 'Football — Bundesliga',
                          'Football — Autres championnats', 'Football — Clubs', 'Football — Sélections', 'Football — Compétitions']),
    # « esport » : id de l'ancien sous-thème vide du même nom (liens d'avant)
    'esport': ('Esport', ['Esport — LoL', 'Esport — CS', 'Esport — Valorant', 'Esport — Rocket League', 'Esport — Jeux de combat', 'Esport — Dota 2',
                          'Esport — Smash', 'Esport — Fortnite', 'Esport — StarCraft', 'Esport — R6 Siege', 'Esport — CoD', 'Esport — Trackmania',
                          'Esport — Overwatch', 'Esport — Apex', 'Esport — Hearthstone', 'Esport — Clubs', 'Esport — Tournois']),
    'collectifs': ('Sports collectifs', ['Basketball', 'Rugby', 'Handball', 'Volleyball', 'Beach-volley', 'Hand/Volley', 'Football américain', 'Baseball',
                                         'Hockey sur glace', 'Hockey sur gazon', 'Water-polo', 'Cricket', 'Sports US', 'Équipes nationales']),
    'raquettes': ('Raquettes', ['Tennis', 'Badminton', 'Tennis de table', 'Squash']),
    'combat': ('Combat', ['Boxe', 'MMA', 'Boxe/MMA', 'Catch', 'Judo', 'Karaté', 'Taekwondo', 'Escrime', 'Sumo']),
    'meca': ('Sports mécaniques', ['Formule 1', 'Rallye', 'Moto', 'Motocross', 'Auto/Moto', 'Circuits']),
    'olympiques': ('Olympiques & athlétisme', ['Athlétisme', 'Natation', 'Cyclisme', 'Gymnastique', 'Gymnastique rythmique', 'Natation artistique', 'Plongeon',
                                               'Haltérophilie', 'Triathlon', 'Aviron', 'Canoë-kayak', 'Voile', 'Tir sportif', "Tir à l'arc", 'Pentathlon moderne',
                                               'Équitation', 'Hippisme', 'Breaking', 'Jeux olympiques', 'Multisport/JO', 'Paralympiques']),
    'glisse': ('Glisse & montagne', ['Ski alpin', 'Ski de fond', 'Biathlon', 'Ski freestyle', 'Snowboard', 'Saut à ski', 'Bobsleigh', 'Luge', 'Skeleton', 'Curling',
                                     'Patinage artistique', 'Patinage de vitesse', "Sports d'hiver", 'Surf', 'Skateboard', 'BMX & VTT', 'Escalade', 'Alpinisme',
                                     'Sports extrêmes']),
    'precision': ('Précision & stratégie', ['Golf', 'Échecs', 'Billard & Snooker', 'Fléchettes', 'Pétanque']),
    'coulisses': ('Coulisses & légendes', ['Entraîneurs', 'Arbitres & officiels', 'Présidents & dirigeants', 'Agents', 'Pundits & consultants', 'Commentateurs',
                                           'Stades & enceintes', 'Trophées', 'Ballons', 'Mascottes']),
}
SUB_GROUP = {s: g for g, (_, subs) in GROUPS.items() for s in subs}
ORDER = [s for _, (_, subs) in GROUPS.items() for s in subs]

TYPE_FR = {
    'Athlete': 'Athlète', 'Club': 'Club', 'Competition': 'Compétition', 'JoueurEsport': 'Joueur esport', 'Stade': 'Stade',
    'EquipeNationale': 'Équipe nationale', 'Arbitre': 'Arbitre', 'Dirigeant': 'Dirigeant', 'ClubEsport': 'Club esport',
    'Commentateur': 'Commentateur', 'Cheval': 'Cheval', 'EditionJO': 'Édition des JO', 'Equipe': 'Équipe', 'Circuit': 'Circuit',
    'TournoiEsport': 'Tournoi esport', 'Entraineur': 'Entraîneur', 'Consultant': 'Consultant', 'Jockey': 'Jockey', 'Mascotte': 'Mascotte',
    'Ecurie': 'Écurie', 'Trophee': 'Trophée', 'Agent': 'Agent', 'Ballon': 'Ballon',
}


def slug(s):
    s = unicodedata.normalize('NFKD', str(s).replace('œ', 'oe').replace('Œ', 'oe').replace('æ', 'ae').replace('ø', 'o').replace('Ø', 'o')
                              .replace('ß', 'ss').replace('ł', 'l').replace('Ł', 'l').replace('đ', 'd').replace('Đ', 'd')).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-') or 'x'


def norm(s):
    return slug(str(s).replace('’', "'")).replace('-', ' ')


def existing(pattern):
    """Valeurs déjà prises dans les autres sets (ids de sous-thèmes, codes) : on n'y touche pas."""
    out = set()
    for f in os.listdir(SETS):
        if f.endswith('.ts') and f != 'sport.ts':
            with open(os.path.join(SETS, f), encoding='utf-8') as fh:
                out.update(re.findall(pattern, fh.read()))
    return out


# ───────────────────────────────────────────── Excel
def read_rows(xlsx):
    ws = openpyxl.load_workbook(xlsx, read_only=True, data_only=True)['Tri étoiles']
    rows = []
    head = None
    for r in ws.iter_rows(values_only=True):
        if head is None:
            if r and r[0] == 'N°':
                head = [str(x or '').strip() for x in r]
            continue
        if not r or r[0] is None or not r[2]:
            continue
        col = lambda k: r[head.index(k)]
        sub = str(col('Sous-thème')).strip()
        assert sub in SUB_GROUP, f'sous-thème sans groupe : {sub!r}'
        t = str(col('Type') or '').strip()
        rows.append({'n': int(col('N°')), 'sub': sub, 'group': SUB_GROUP[sub], 'name': str(col('Carte')).strip(), 'type': t,
                     'label': TYPE_FR.get(t, t), 'stars': int(col('Étoiles finales')), 'url': str(col('Image URL') or '').strip()})
    assert len(rows) == TOTAL, f'{len(rows)} lignes ({TOTAL} attendues)'
    assert sorted(r['n'] for r in rows) == list(range(1, TOTAL + 1)), 'colonne N° : 1 → 7708 attendu'
    assert all(1 <= r['stars'] <= 6 for r in rows)
    return rows


def build(xlsx):
    rows = read_rows(xlsx)
    try:
        with open(IDS, encoding='utf-8') as f:
            ids = json.load(f)
    except Exception:
        ids = {}
    key = lambda r: f"{norm(r['name'])}|{r['type']}"
    by_name = collections.defaultdict(list)
    for k, v in ids.items():
        by_name[k.split('|')[0]].append(k)
    used_keys, used_ids, all_keys = set(), set(ids.values()), {key(r) for r in rows}
    changed = False
    for r in rows:
        k = key(r)
        if k not in ids:
            # même nom, type changé (retypage v5 : Athlete → Arbitre…) : même carte, même id
            cand = [c for c in by_name.get(norm(r['name']), []) if c not in used_keys and c not in all_keys]
            if len(cand) == 1:
                ids[k] = ids.pop(cand[0])
            else:
                base = f"spt-{slug(r['name'])}"
                cid = base if base not in used_ids else f"{base}-{slug(r['label'])}"
                n = 2
                while cid in used_ids:
                    cid, n = f'{base}-{n}', n + 1
                ids[k] = cid
                used_ids.add(cid)
            changed = True
        used_keys.add(k)
        r['id'] = ids[k]
        r['file'] = ids[k][4:]
    if changed:
        os.makedirs(os.path.dirname(IDS), exist_ok=True)
        with open(IDS, 'w', encoding='utf-8') as f:
            json.dump(ids, f, ensure_ascii=False, indent=0, sort_keys=True)
    assert len({r['id'] for r in rows}) == len(rows)
    return rows


# ───────────────────────────────────────────── réseau + images
S = requests.Session()
S.headers['User-Agent'] = UA
_last = collections.defaultdict(float)
_host_lock = collections.defaultdict(threading.Lock)
GAP = {'liquipedia.net': 1.0, 'www.wikidata.org': 0.3, 'commons.wikimedia.org': 0.25, 'fr.wikipedia.org': 0.25, 'en.wikipedia.org': 0.25, 'thumb.wikimedia.org': 0.04, 'upload.wikimedia.org': 0.45}


def get(url, tries=4):
    host = url.split('/')[2]
    for i in range(tries):
        with _host_lock[host]:
            wait = _last[host] + GAP.get(host, 0.2) - time.time()
            if wait > 0:
                time.sleep(wait)
            _last[host] = time.time()
        try:
            r = S.get(url, timeout=40)
            if r.status_code == 429 or r.status_code >= 500:
                if i == tries - 1:
                    return None
                time.sleep(min(30, float(r.headers.get('retry-after') or 3 * (i + 1))))
                continue
            return r.content if r.status_code == 200 else None
        except Exception:
            time.sleep(1.5 * (i + 1))
    return None


def sources(url):
    """URL de l'Excel → [(URL, essais)]. Commons : d'abord la miniature standard 960 px (plus nette sur la carte), un seul
    essai — Wikimedia limite la fabrication des grandes miniatures (429) —, sinon celle de l'Excel (330 px, déjà en cache).
    Les logos non libres (clubs, sélections, compétitions) que DBpedia range sous Commons sont en fait sur Wikipédia fr ou
    en : on les y cherche ensuite."""
    u = re.sub(r'^http://', 'https://', url)
    if 'commons.wikimedia.org/wiki/Special:FilePath' in u:
        big = re.sub(r'width=\d+', 'width=960', u)
        out = [(big, 1), (u, 3)]
        for w in ('fr', 'en'):
            out += [(big.replace('commons.wikimedia.org', f'{w}.wikipedia.org'), 1), (u.replace('commons.wikimedia.org', f'{w}.wikipedia.org'), 2)]
        return out
    return [(u, 3)]


RESOLVED = os.path.join(ROOT, 'scripts', 'data', 'sport-resolve.json')


def file_title(url):
    """« …/Special:FilePath/Felix_Brych.jpg?width=300 » → « File:Felix Brych.jpg » (None si ce n'est pas une URL FilePath)."""
    m = re.search(r'Special:FilePath/([^?#]+)', url)
    return 'File:' + urllib.parse.unquote(m.group(1)).replace('_', ' ') if m else None


def resolve_all(titles, budget_end):
    """Adresse directe des miniatures 960 px, par lots de 50 titres via l'API (Wikipédia fr, qui voit aussi Commons, puis
    en pour les logos locaux). Bien plus rapide que Special:FilePath, que Wikimedia limite fortement (429).
    Cache : scripts/data/sport-resolve.json (titre → URL, ou '' si introuvable)."""
    try:
        with open(RESOLVED, encoding='utf-8') as f:
            cache = json.load(f)
    except Exception:
        cache = {}
    todo = [t for t in dict.fromkeys(titles) if t not in cache]
    for wiki in ('fr', 'en'):
        miss = []
        for i in range(0, len(todo), 50):
            if time.time() > budget_end:
                miss += todo[i:]
                break
            batch = todo[i:i + 50]
            j = None
            for k in range(4):
                try:
                    r = S.post(f'https://{wiki}.wikipedia.org/w/api.php', data={'action': 'query', 'titles': '|'.join(batch), 'prop': 'imageinfo',
                                                                              'iiprop': 'url', 'iiurlwidth': 960, 'format': 'json', 'formatversion': 2}, timeout=40)
                    if r.status_code == 200:
                        j = r.json()
                        break
                    time.sleep(float(r.headers.get('retry-after') or 3 * (k + 1)))
                except Exception:
                    time.sleep(2 * (k + 1))
            if not j:
                miss += batch
                continue
            q = j.get('query', {})
            alias = {n['from']: n['to'] for n in q.get('normalized', [])}
            alias.update({n['from']: n['to'] for n in q.get('redirects', [])})
            pages = {p['title']: p for p in q.get('pages', [])}
            for t in batch:
                tt = alias.get(t, t)
                tt = alias.get(tt, tt)
                info = (pages.get(tt) or {}).get('imageinfo')
                if info:
                    cache[t] = info[0].get('thumburl') or info[0].get('url') or ''
                else:
                    miss.append(t)
        todo = miss
        if wiki == 'en':
            for t in miss:
                if time.time() <= budget_end:
                    cache[t] = ''
    with open(RESOLVED + '.tmp', 'w', encoding='utf-8') as f:
        json.dump(cache, f, ensure_ascii=False, indent=0, sort_keys=True)
    os.replace(RESOLVED + '.tmp', RESOLVED)
    return cache


def save(c, blob):
    try:
        im = Image.open(io.BytesIO(blob))
        im.load()
    except Exception:
        return None
    if min(im.size) < 48 or max(im.size) < 140:
        return None
    if im.mode in ('P', 'LA', 'PA', 'L') and 'transparency' in im.info or im.mode in ('LA', 'PA'):
        im = im.convert('RGBA')
    cutout = False
    if im.mode == 'RGBA':
        a = im.getchannel('A')
        cutout = sum(a.histogram()[:16]) / (im.size[0] * im.size[1]) > 0.06
        if not cutout:
            bg = Image.new('RGB', im.size, (255, 255, 255))
            bg.paste(im, mask=a)
            im = bg
    elif im.mode != 'RGB':
        im = im.convert('RGB')
    im.thumbnail((800, 800), Image.LANCZOS)
    name = c['file'] + ('.png' if cutout else '.jpg')
    if cutout:
        im.save(os.path.join(OUT, name), optimize=True)
    else:
        im.save(os.path.join(OUT, name), quality=85, optimize=True, progressive=True)
    th = im.copy()
    th.thumbnail((256, 256), Image.LANCZOS)
    th.save(os.path.join(THUMBS, c['file'] + '.webp'), quality=80, method=5)
    return name, ('i' if cutout else 'c')


def harvest_one(c, direct=None):
    if not c['url'].startswith('http'):
        return {'file': '', 'art': '', 'src': ''}
    srcs = sources(c['url'])
    if direct is not None:
        # adresse résolue par l'API : miniature 960 px, sinon la 330 px standard (même fichier) ; '' = introuvable
        srcs = [(direct, 2), (re.sub(r'/960px-', '/330px-', direct), 3)] if direct else []
    for u, tries in srcs:
        b = get(u, tries=tries)
        if b and len(b) > 2500:
            saved = save(c, b)
            if saved:
                return {'file': saved[0], 'art': saved[1], 'src': u.split('/')[2]}
    return {'file': '', 'art': '', 'src': 'echec'}


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


def harvest(xlsx, budget, retry, threads=8):
    os.makedirs(THUMBS, exist_ok=True)
    cards = build(xlsx)
    log = load_log()
    # les ≥4★ d'abord : si le temps manque, ce sont elles qui ont leur image
    todo = sorted((c for c in cards if c['id'] not in log or (retry and not log[c['id']].get('file') and c['url'])), key=lambda c: (-c['stars'], c['n']))
    print(f'{len(todo)} images à chercher', flush=True)
    t0, done = time.time(), 0
    direct = resolve_all([file_title(c['url']) for c in todo if file_title(c['url'])], t0 + budget * 0.5)
    print(f'{sum(1 for c in todo if direct.get(file_title(c["url"]) or "") is not None)} adresses résolues en {time.time() - t0:.0f} s', flush=True)
    with cf.ThreadPoolExecutor(threads) as ex:
        it = iter(todo)
        running = {}

        def submit():
            while time.time() - t0 < budget:
                c = next(it, None)
                if not c:
                    return
                ft = file_title(c['url'])
                if ft and ft not in direct:
                    continue  # adresse pas encore résolue (temps écoulé) : à la prochaine passe
                running[ex.submit(harvest_one, c, direct.get(ft) if ft else None)] = c
                return

        for _ in range(threads * 2):
            submit()
        while running:
            fin, _ = cf.wait(list(running), return_when=cf.FIRST_COMPLETED)
            for f in fin:
                c = running.pop(f)
                log[c['id']] = {**f.result(), 't': int(time.time())}
                done += 1
                if done % 50 == 0:
                    write_log(log)
                submit()
    write_log(log)
    found = sum(1 for c in cards if log.get(c['id'], {}).get('file'))
    left = sum(1 for c in cards if c['id'] not in log)
    print(f'+{done} traitées en {time.time() - t0:.0f} s · images : {found}/{len(cards)} · reste {left}', flush=True)


# ───────────────────────────────────────────── secours Wikipédia (fichier de l'Excel supprimé / absent)
SPORTY = re.compile(r'foot|soccer|basket|tennis|rugby|hand|volley|hockey|baseball|cricket|golf|box|boxe|mma|martial|lutte|catch|wrestl|judo|karat|taekwon|escrim|fenc|'
                    r'cycl|ski|snowboard|biathl|patin|skat|bobsl|luge|skelet|curling|natation|nage|swim|plong|diver|athl|sprint|marath|décath|decath|'
                    r'gymnas|haltéro|weightlift|aviron|rowing|canoë|canoe|kayak|voile|sail|shoot|archer|tir à l|triath|pentath|équit|equest|jockey|'
                    r'cheval|horse|hippi|racing|pilote|driver|rally|rallye|moto|f1|formule|formula|nascar|circuit|stade|stadium|arena|enceinte|'
                    r'club|équipe|team|sélection|sport|olymp|jeux|games|champion|coupe|cup|trophée|trophy|ligue|league|tournoi|tournament|'
                    r'arbitre|referee|umpire|entraîn|coach|manager|dirigeant|président|agent|consultant|comment|journalist|pundit|'
                    r'esport|e-sport|joueur|player|gamer|streamer|counter-strike|league of legends|dota|valorant|overwatch|fortnite|starcraft|'
                    r'échecs|chess|billard|snooker|fléchett|darts|pétanque|surf|escalade|climb|alpin|mountaineer|breaking|mascot|ballon|ball', re.I)


def wiki_batch(wiki, titles):
    """Pages Wikipédia au nom exact des cartes : miniature 960 px + élément Wikidata (pages d'homonymie exclues)."""
    out = {}
    for i in range(0, len(titles), 50):
        batch = titles[i:i + 50]
        j = None
        for k in range(4):
            try:
                r = S.post(f'https://{wiki}.wikipedia.org/w/api.php', data={'action': 'query', 'titles': '|'.join(batch), 'redirects': 1, 'prop': 'pageimages|pageprops',
                                                                          'piprop': 'thumbnail', 'pithumbsize': 960, 'pilimit': 50, 'ppprop': 'wikibase_item|disambiguation',
                                                                          'format': 'json', 'formatversion': 2}, timeout=40)
                if r.status_code == 200:
                    j = r.json()
                    break
                time.sleep(float(r.headers.get('retry-after') or 3 * (k + 1)))
            except Exception:
                time.sleep(2 * (k + 1))
        if not j:
            continue
        q = j.get('query', {})
        alias = {n['from']: n['to'] for n in q.get('normalized', [])}
        red = {n['from']: n['to'] for n in q.get('redirects', [])}
        pages = {p['title']: p for p in q.get('pages', [])}
        for t in batch:
            tt = alias.get(t, t)
            tt = red.get(tt, tt)
            p = pages.get(tt) or {}
            pp = p.get('pageprops', {})
            th = p.get('thumbnail', {}).get('source')
            if th and 'disambiguation' not in pp and pp.get('wikibase_item'):
                out[t] = (th, pp['wikibase_item'], tt)
    return out


def wd_descriptions(qids):
    out = {}
    qids = list(dict.fromkeys(qids))
    for i in range(0, len(qids), 50):
        d = None
        for k in range(4):
            try:
                r = S.get('https://www.wikidata.org/w/api.php', params={'action': 'wbgetentities', 'ids': '|'.join(qids[i:i + 50]), 'props': 'descriptions',
                                                                       'languages': 'fr|en', 'format': 'json'}, timeout=40)
                if r.status_code == 200:
                    d = r.json()
                    break
                time.sleep(float(r.headers.get('retry-after') or 3 * (k + 1)))
            except Exception:
                time.sleep(2 * (k + 1))
        for q, e in ((d or {}).get('entities') or {}).items():
            out[q] = ' · '.join(v.get('value', '') for v in (e.get('descriptions') or {}).values())
    return out


def wikifill(xlsx, budget):
    """Cartes sans image après la récolte (fichier de l'Excel supprimé de Wikimedia, ou pas d'URL) : image principale de la
    page Wikipédia (fr puis en) qui porte EXACTEMENT le nom de la carte — gardée seulement si la description Wikidata de la
    page parle de sport (évite « zen » → le bouddhisme). Rien de sûr → design typographique."""
    t0 = time.time()
    cards = build(xlsx)
    log = load_log()
    todo = [c for c in cards if not log.get(c['id'], {}).get('file') and log.get(c['id'], {}).get('src') not in ('wiki-non', 'wiki-echec')]
    print(f'{len(todo)} cartes sans image', flush=True)
    cache_path = os.path.join(ROOT, 'scripts', 'data', 'sport-wikifill.json')
    try:
        with open(cache_path, encoding='utf-8') as f:
            found = {k: tuple(v) for k, v in json.load(f).items()}
    except Exception:
        found = None
    if found is None:
        found = {}
        for wiki in ('fr', 'en'):
            rest = [c for c in todo if c['id'] not in found]
            hits = wiki_batch(wiki, list(dict.fromkeys(c['name'] for c in rest)))
            desc = wd_descriptions([h[1] for h in hits.values()])
            for c in rest:
                h = hits.get(c['name'])
                if h and SPORTY.search(desc.get(h[1], '')):
                    found[c['id']] = (h[0], f'{wiki}:{h[2]}')
            print(f'  {wiki} : {sum(1 for v in found.values() if v[1].startswith(wiki))} pages sûres', flush=True)
        with open(cache_path, 'w', encoding='utf-8') as f:
            json.dump(found, f, ensure_ascii=False, indent=0, sort_keys=True)
    found = {k: v for k, v in found.items() if k in {c['id'] for c in todo}}
    by_id = {c['id']: c for c in todo}

    def one(cid):
        c = by_id[cid]
        u, src = found[cid]
        for uu, tries in ((u, 2), (re.sub(r'/960px-', '/330px-', u), 3)):
            b = get(uu, tries=tries)
            if b and len(b) > 2500:
                saved = save(c, b)
                if saved:
                    return {'file': saved[0], 'art': saved[1], 'src': src}
        return None

    done = 0
    with cf.ThreadPoolExecutor(8) as ex:
        it = iter(sorted(found, key=lambda k: -by_id[k]['stars']))
        running = {}

        def submit():
            cid = next(it, None)
            if cid and time.time() - t0 < budget:
                running[ex.submit(one, cid)] = cid

        for _ in range(16):
            submit()
        while running:
            fin, _ = cf.wait(list(running), return_when=cf.FIRST_COMPLETED)
            for f in fin:
                cid = running.pop(f)
                r = f.result()
                log[cid] = {**r, 't': int(time.time())} if r else {'file': '', 'art': '', 'src': 'wiki-echec', 't': int(time.time())}
                done += 1 if r else 0
                if done % 50 == 0:
                    write_log(log)
                submit()
    if time.time() - t0 >= budget:
        write_log(log)
        print(f'+{done} images Wikipédia (temps écoulé, relancer pour la suite)', flush=True)
        return
    for c in todo:  # pas de page sûre : on ne recherche plus (design typographique)
        if c['id'] not in found and not log.get(c['id'], {}).get('file'):
            log[c['id']] = {**log.get(c['id'], {'file': '', 'art': ''}), 'src': 'wiki-non'}
    write_log(log)
    print(f'+{done} images Wikipédia en {time.time() - t0:.0f} s · images : {sum(1 for c in cards if log.get(c["id"], {}).get("file"))}/{len(cards)}', flush=True)


# ───────────────────────────────────────────── corrections à la main (relecture des 6★)
# Image de l'Excel fausse (homonyme DBpedia : « Uzi » → le pistolet-mitrailleur, « David Beckham » → une rue…) ou absente :
# on prend l'image principale de cette page Wikipédia. Relancer : python scripts/make-sport.py fix donnees/tri-etoiles/Tri-etoiles-sport.xlsx
OVERRIDES = {
    'Uzi': ('en', 'Uzi (gamer)'),
    'zen': ('fr', 'Zen (joueur)'),
    'David Beckham': ('fr', 'David Beckham'),
    'Mario Lemieux': ('fr', 'Mario Lemieux'),
    'Équipe de Argentine': ('fr', "Équipe d'Argentine de football"),
}


def fix(xlsx):
    cards = build(xlsx)
    log = load_log()
    for c in cards:
        o = OVERRIDES.get(c['name'])
        if not o:
            continue
        wiki, title = o
        j = None
        try:
            j = S.get(f'https://{wiki}.wikipedia.org/w/api.php', params={'action': 'query', 'titles': title, 'redirects': 1, 'prop': 'pageimages',
                                                                      'piprop': 'thumbnail', 'pithumbsize': 960, 'format': 'json', 'formatversion': 2}, timeout=40).json()
        except Exception:
            pass
        th = (((j or {}).get('query', {}).get('pages') or [{}])[0].get('thumbnail') or {}).get('source')
        b = get(th, tries=3) if th else None
        saved = save(c, b) if b else None
        log[c['id']] = {'file': saved[0], 'art': saved[1], 'src': f'{wiki}:{title}', 't': int(time.time())} if saved else {'file': '', 'art': '', 'src': 'fix-echec'}
        print(f"  {c['name']} → {log[c['id']]['file'] or 'aucune image'}")
    write_log(log)


# ───────────────────────────────────────────── données TypeScript
def code_of(sub, used):
    head, _, tail = sub.partition(' — ')
    words = lambda s: [w for w in re.findall(r'[A-Za-z0-9]+', unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode()) if w.lower() not in ('des', 'les', 'and', 'de', 'du', 'la', 'le', 'a', 'l')]
    if tail:  # « Football — Premier League » → FPL · « Esport — LoL » → ELO
        w = words(tail)
        rest = ''.join(x[0] for x in w[:2]) if len(w) >= 2 else w[0][:2]
        cands = [(head[0] + rest).upper(), (head[0] + w[0][:2]).upper()]
    else:
        w = words(sub)
        cands = [(''.join(x[0] for x in w[:3]) if len(w) >= 3 else w[0][:2] + (w[1][0] if len(w) > 1 else w[0][2:3])).upper(), w[0][:3].upper()]
    for c in cands:
        if len(c) >= 2 and c not in used:
            used.add(c)
            return c
    base, k = cands[0][:2], 2
    while f'{base}{k}' in used:
        k += 1
    used.add(f'{base}{k}')
    return f'{base}{k}'


def gen(xlsx):
    cards = build(xlsx)
    log = load_log()
    q = lambda s: json.dumps(s, ensure_ascii=False)
    subs = [s for s in ORDER if any(c['sub'] == s for c in cards)]
    missing = [s for s in ORDER if s not in subs]
    taken_ids = existing(r'\bid: ["\']([a-z0-9-]+)["\']') - {'sport', 'esport'}
    sub_ids, codes = {}, {}
    used_codes = existing(r'\bcode: ["\']([A-Z0-9]+)["\']') | {'SPT', 'ESP'}
    for s in subs:
        sid = slug(s.replace(' — ', ' '))
        sub_ids[s] = sid if sid not in taken_ids and sid not in GROUPS else f'sport-{sid}'
        codes[s] = code_of(s, used_codes)
    assert not set(GROUPS) & taken_ids, 'id de groupe déjà pris'

    L = []
    L.append('/**')
    L.append(' * SPORT PACK (thème « sport », sport + esport) — données pures, AUCUN import (partagé avec convex/cardsCatalog.ts).')
    L.append(' * GÉNÉRÉ par scripts/make-sport.py (ne pas éditer à la main) depuis Tri-etoiles-sport.xlsx (SPEC-THEME-SPORT v5.1, « Étoiles finales »).')
    L.append(f' * {len(cards)} cartes · {len(subs)} sous-thèmes (libellé imprimé en grand sur la carte), regroupés à l\'affichage en {len(GROUPS)}.')
    L.append(' * Numéro = « N° » de l\'Excel, sur 7 708. Ids « spt-… » figés dans scripts/data/sport-ids.json (ne JAMAIS les changer).')
    L.append(' */')
    L.append("export type SportRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';")
    L.append('')
    L.append('export interface SportSub {')
    L.append('  id: string;')
    L.append('  label: string;')
    L.append('  code: string;')
    L.append('  /** groupe d\'affichage (football, esport, combat…) */')
    L.append('  group: string;')
    L.append('}')
    L.append('')
    L.append('export interface SportEntry {')
    L.append('  /** identifiant de carte — ne JAMAIS le changer */')
    L.append('  id: string;')
    L.append('  sub: string;')
    L.append('  /** n° de la carte dans tout le thème (1 → 7 708) */')
    L.append('  num: number;')
    L.append('  name: string;')
    L.append('  rarity: SportRarity;')
    L.append("  /** fichier dans art/sport ('' = aucune illustration : design typographique) */")
    L.append('  file: string;')
    L.append("  /** 'c' photo pleine · 'i' logo / détouré · '' aucune */")
    L.append("  art: '' | 'c' | 'i';")
    L.append('  /** type affiché (« Athlète », « Club », « Joueur esport »…) */')
    L.append('  label: string;')
    L.append('}')
    L.append('')
    L.append(f'export const SPORT_SIZE = {TOTAL};')
    L.append('export const SPORT_GROUPS: Record<string, string> = {')
    for g, (lab, _) in GROUPS.items():
        L.append(f'  {g}: {q(lab)},')
    L.append('};')
    L.append('')
    L.append('export const SPORT_SUBS: SportSub[] = [')
    for s in subs:
        L.append(f"  {{ id: {q(sub_ids[s])}, label: {q(s)}, code: {q(codes[s])}, group: {q(SUB_GROUP[s])} }},")
    L.append('];')
    L.append('')
    L.append("const R = { c: 'common', u: 'uncommon', r: 'rare', e: 'epic', l: 'legendary', m: 'mythic' } as const;")
    labels = sorted({c['label'] for c in cards})
    L.append(f'const LABELS = {q(labels)};')
    L.append('')
    L.append('// [sous-thème (index), n°, id, nom, rareté, fichier, art, type (index)]')
    L.append("const RAW: Array<[number, number, string, string, keyof typeof R, string, '' | 'c' | 'i', number]> = [")
    si = {s: i for i, s in enumerate(subs)}
    with_art = 0
    for c in sorted(cards, key=lambda c: (si[c['sub']], c['n'])):
        h = log.get(c['id'], {})
        f = h.get('file', '')
        art = h.get('art', '') if f else ''
        with_art += 1 if f else 0
        L.append(f"  [{si[c['sub']]}, {c['n']}, {q(c['id'])}, {q(c['name'])}, '{R[c['stars']]}', {q(f)}, {q(art)}, {labels.index(c['label'])}],")
    L.append('];')
    L.append('')
    L.append('export const SPORT: SportEntry[] = RAW.map(([s, num, id, name, r, file, art, l]) => ({ id, sub: SPORT_SUBS[s].id, num, name, rarity: R[r], file, art, label: LABELS[l] }));')
    L.append('')
    with open(TS, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write('\n'.join(L))
    st = collections.Counter(c['stars'] for c in cards)
    print(f'{TS} : {len(cards)} cartes, {len(subs)} sous-thèmes, {with_art} avec illustration · étoiles {dict(sorted(st.items()))}')
    if missing:
        print('  sous-thèmes de la liste absents de l’Excel :', ', '.join(missing))


if __name__ == '__main__':
    a = sys.argv[1:]
    if len(a) < 2 or a[0] not in ('harvest', 'gen', 'wikifill', 'fix'):
        print(__doc__)
        sys.exit(1)
    opt = lambda k, d=None: a[a.index(k) + 1] if k in a else d
    if a[0] == 'fix':
        fix(a[1])
    elif a[0] == 'wikifill':
        wikifill(a[1], float(opt('--budget', 1e9)))
    elif a[0] == 'harvest':
        harvest(a[1], float(opt('--budget', 1e9)), '--retry' in a, int(opt('--threads', 8)))
    else:
        gen(a[1])
