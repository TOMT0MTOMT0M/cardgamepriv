"""
WORLD PACK V2 (thème « monde ») : 5 236 cartes, 34 sous-thèmes regroupés à l'affichage en 6
(Les 14 Merveilles · Ardèche · Lieux & pays · Animaux · Nourriture · Voitures).
Source : Tri-etoiles-monde_2.xlsx (feuille « Tri des étoiles », colonne « Étoiles finales (VALIDÉ) »).

  python scripts/make-monde-v2.py gen     donnees/tri-etoiles/Tri-etoiles-monde_2.xlsx
  python scripts/make-monde-v2.py harvest donnees/tri-etoiles/Tri-etoiles-monde_2.xlsx [--budget 170] [--retry]

PATCHS (liste PATCHES, appliqués dans l'ordre par-dessus le tri de base, à chaque gen / harvest) :
  Patch-monde-V7.xlsx — boissons énergisantes : (1) INSERT des cartes de « Nouvelles cartes » (N° 5237 → 5342, sous-thèmes
  Monster et Red Bull, groupe Nourriture) ; (2) UPDATE complet des « Rebrands » (N° 4264 Red Bull → Red Bull Original 6★,
  4418 Monster Energy → Monster Original Green 6★ : MÊME id de carte, nouveau nom / sous-thème / étoiles / image) ;
  (3) resynchronisation des étoiles de chaque N° 1 → 5236 (« Étoiles à jour »). Contrôles : 5 342 cartes,
  1652/1267/1101/606/496/220, Monster = 60, Red Bull = 48.
  Patch-monde-V8-tri.xlsx (11/11) — nouveau tri complet du thème : seule la feuille « Étoiles » (75 cartes), même N°, même id.
  Les cartes déjà tombées suivent à la mise en ligne (migrations:resyncRarities + resyncRaritiesOpen).

Identifiants STABLES : les 924 cartes de la V1 (déjà tombées chez les joueurs) gardent leur id (geo-…, zoo-…, miam-…,
auto-…, ard-…, mrv-…) et leur illustration (public/art/<ancien dossier>/). La correspondance est figée la première fois
dans scripts/data/monde-ids.json ; les relances la réutilisent (une carte ne change jamais d'id).
Les 14 Merveilles restent des cartes SECRÈTES (diorama 3D, 1 World Pack sur <nb de cartes du thème>).
harvest : nouvelles cartes → image de la colonne « Image URL » (Wikimedia, GBIF…), sinon Wikipédia (fr puis en) ;
  téléchargée une fois dans public/art/monde/ + miniature WebP ; rien de fiable → design typographique.
  Journal : scripts/data/monde-harvest.json (reprend là où il s'est arrêté).
gen : écrit src/core/sets/monde.ts (données pures, aucun import).
Besoin : pip install openpyxl pillow requests
"""
import sys, os, re, io, json, time, threading, unicodedata, difflib, collections, concurrent.futures as cf
import requests, openpyxl
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SETS = os.path.join(ROOT, 'src', 'core', 'sets')
ART = os.path.join(ROOT, 'public', 'art')
OUT = os.path.join(ART, 'monde')
THUMBS = os.path.join(OUT, 'thumbs')
IDS = os.path.join(ROOT, 'scripts', 'data', 'monde-ids.json')
LOG = os.path.join(ROOT, 'scripts', 'data', 'monde-harvest.json')
TS = os.path.join(SETS, 'monde.ts')
UA = 'BebouCard/1.0 (https://cardgamepriv.pages.dev; private card game, one-time image harvest)'
R = {1: 'c', 2: 'u', 3: 'r', 4: 'e', 5: 'l', 6: 'm'}

# sous-thème V2 → groupe d'affichage (= ancien sous-thème V1, mêmes ids : « lieux », « animaux »…)
GROUPS = {
    'lieux': ('Lieux & pays', ['Pays', 'Capitales', 'Départements', 'Régions', "Villes d'Asie & d'Océanie", "Villes d'Afrique", "Villes d'Amérique du Nord",
                               "Villes d'Amérique du Sud", "Villes d'Europe", 'Monuments & patrimoine', 'Sites naturels', 'Mers, fleuves & lacs',
                               'Montagnes & volcans', "Parcs d'attractions"]),
    'animaux': ('Animaux', ['Mammifères', 'Vie marine', 'Oiseaux', 'Insectes & arachnides', 'Reptiles & amphibiens', 'Dinosaures & préhistoire']),
    'nourriture': ('Nourriture', ['Plats français', 'Snacks, marques & fast food', 'Plats du monde', 'Desserts & pâtisseries', 'Boissons', 'Monster', 'Red Bull',
                                   'Fromages', 'Chefs']),
    'voitures': ('Voitures', ['Modèles iconiques', 'Voitures françaises', 'Supercars & hypercars', 'Sportives japonaises', 'Muscle cars']),
}
ALONE = {'Les 14 Merveilles': 'merveilles', 'Ardèche': 'ardeche'}
# renommages V1 → V2 que la ressemblance des noms ne suffit pas à retrouver
ALIASES = {'Acropole d’Athènes (Parthénon)': 'Acropole & Parthénon'}
SUB_GROUP = {s: g for g, (_, subs) in GROUPS.items() for s in subs}
# patchs du tri, appliqués dans l'ordre (fichiers à la racine du projet)
PATCHES = ['Patch-monde-V7.xlsx', 'Patch-monde-V8-tri.xlsx']
PATCH_CHECK = {
    'Patch-monde-V7.xlsx': {'count': 5342, 'stars': {1: 1652, 2: 1267, 3: 1101, 4: 606, 5: 496, 6: 220}, 'subs': {'Monster': 60, 'Red Bull': 48}},
    # (11/11) nouveau tri du thème (« Tri__toiles_monde.xlsx », 5 342 cartes, mêmes N° / noms / sous-thèmes) : 75 cartes changent d'étoiles
    'Patch-monde-V8-tri.xlsx': {'count': 5342, 'stars': {1: 1630, 2: 1264, 3: 1092, 4: 625, 5: 487, 6: 244}, 'subs': {'Monster': 60, 'Red Bull': 48}},
}
OLD = {'lieux': ('geo', 'lieux'), 'animaux': ('zoo', 'animaux'), 'nourriture': ('miam', 'nourriture'), 'voitures': ('auto', 'voitures'),
       'ardeche': ('ard', 'ardeche'), 'merveilles': ('mrv', 'merveilles')}
# illustrations V1 remplacées (nouveau nom : le cache des cartes peintes, indexé par le fichier, est ainsi renouvelé)
FILE_OVERRIDE = {'ard-citroen-c15-des-cevennes': '005-citroen-c15-des-cevennes-v2.jpg'}  # photo du vrai C15 (04/11)
PREFIX = {'lieux': 'geo', 'animaux': 'zoo', 'nourriture': 'miam', 'voitures': 'auto', 'ardeche': 'ard', 'merveilles': 'mrv'}
TAKEN_SUB_IDS = {'pokemon', 'valorant', 'yugioh', 'lol', 'cs', 'films', 'series', 'anime', 'marvel', 'musique', 'youtubeurs', 'sport', 'esport', 'bebous', 'kcdq',
                 'lieux', 'animaux', 'nourriture', 'voitures'}


def slug(s):
    s = unicodedata.normalize('NFKD', str(s).replace('œ', 'oe').replace('Œ', 'oe').replace('æ', 'ae')).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-') or 'x'


def norm(s):
    s = unicodedata.normalize('NFKD', str(s).replace('’', "'")).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()


def core(s):
    """Nom sans parenthèses (« Acropole d'Athènes (Parthénon) » → « acropole d athenes »)."""
    return norm(re.sub(r'\(.*?\)', ' ', str(s)))


# ───────────────────────────────────────────── V1 (cartes déjà en jeu)
RAW_RE = re.compile(r"""^\s*\[(\d+),\s*(['"])(.*?)(?<!\\)\2,\s*(['"])(.*?)(?<!\\)\4,\s*'(\w)'\]""")


def read_v1():
    out = []
    for grp, (prefix, name) in OLD.items():
        path = os.path.join(SETS, f'{name}.ts')
        with open(path, encoding='utf-8') as f:
            for line in f:
                m = RAW_RE.match(line)
                if not m:
                    continue
                num, sl, nm = int(m.group(1)), m.group(3), m.group(5).replace("\\'", "'").replace('\\"', '"')
                cid = f'{prefix}-{sl}'
                out.append({'group': grp, 'id': cid, 'name': nm, 'dir': f'art/{name}', 'file': FILE_OVERRIDE.get(cid, f'{num:03d}-{sl}.png'), 'r': m.group(6)})
    return out


# ───────────────────────────────────────────── V2
def read_v2(xlsx):
    ws = openpyxl.load_workbook(xlsx, read_only=True, data_only=True)['Tri des étoiles']
    rows = []
    for r in list(ws.iter_rows(values_only=True))[2:]:
        if not r or not r[1]:
            continue
        rows.append(row_of(r))
    assert len(rows) == 5236, f'{len(rows)} lignes (5 236 attendues)'
    assert [r['n'] for r in rows] == list(range(1, 5237)), 'colonne N° : 1 → 5236 attendu'
    return apply_patches(rows)


def row_of(r):
    sub = str(r[2]).strip()
    grp = ALONE.get(sub) or SUB_GROUP.get(sub)
    assert grp, f'sous-thème inconnu : {sub}'
    return {'n': int(r[0]), 'name': str(r[1]).strip(), 'sub': sub, 'group': grp, 'type': str(r[3] or '').strip(), 'cat': str(r[4] or '').strip(),
            'region': str(r[5] or '').strip(), 'stars': int(r[7]), 'url': str(r[8] or '').strip()}


def patch_rows(ws):
    """Lignes d'une feuille de patch (sous l'en-tête « N° »)."""
    out, head = [], False
    for r in ws.iter_rows(values_only=True):
        if not head:
            head = bool(r) and r[0] == 'N°'
            continue
        if r and isinstance(r[0], (int, float)):
            out.append(r)
    return out


def apply_patches(rows):
    """Patchs du tri, par opérations (jamais de ré-import complet) : INSERT, UPDATE complet (rebrand), resync des étoiles."""
    by_n = {r['n']: r for r in rows}
    for name in PATCHES:
        wb = openpyxl.load_workbook(os.path.join(ROOT, 'donnees', 'patchs', name), read_only=True, data_only=True)
        sheet = lambda start: wb[next(s for s in wb.sheetnames if s.startswith(start))]
        for r in patch_rows(sheet('Nouvelles cartes')):  # OP 1 — INSERT
            row = row_of(r)
            assert row['n'] not in by_n, f"{name} : N° {row['n']} existe déjà"
            by_n[row['n']] = row
        for r in patch_rows(sheet('Rebrands')):  # OP 2 — UPDATE complet (même carte, même id)
            row, old = row_of(r), by_n[int(r[0])]
            row['was'], row['was_url'] = f"{old['sub']}|{old['name']}", old.get('was_url', old['url'])
            by_n[row['n']] = row
        for n, e in patch_rows(sheet('Étoiles')):  # OP 3 — resync des étoiles (idempotent)
            by_n[int(n)]['stars'] = int(e)
        chk = PATCH_CHECK.get(name)
        if chk:
            cur = list(by_n.values())
            assert len(cur) == chk['count'], f"{name} : {len(cur)} cartes ({chk['count']} attendues)"
            st = collections.Counter(r['stars'] for r in cur)
            assert dict(st) == chk['stars'], f'{name} : étoiles {dict(sorted(st.items()))}'
            for sub, n in chk['subs'].items():
                assert sum(1 for r in cur if r['sub'] == sub) == n, f'{name} : sous-thème {sub}'
    return [by_n[n] for n in sorted(by_n)]


def sub_id(sub):
    if sub in ALONE:
        return ALONE[sub]
    s = slug(sub)
    return s if s not in TAKEN_SUB_IDS else f'monde-{s}'


def build(xlsx, verbose=False):
    """Cartes V2 avec leur id définitif (stables d'une relance à l'autre)."""
    rows = read_v2(xlsx)
    try:
        with open(IDS, encoding='utf-8') as f:
            ids = json.load(f)
    except Exception:
        ids = {}
    key = lambda r: f"{r['sub']}|{r['name']}"
    if not ids:
        # 1re fois : on retrouve chaque carte V1 dans la V2 (même nom ; sinon nom proche dans le même groupe)
        v1 = read_v1()
        free = {key(r): r for r in rows}
        by_norm = collections.defaultdict(list)
        for r in rows:
            by_norm[norm(r['name'])].append(r)
        report = []
        for o in v1:
            cands = [r for r in by_norm.get(norm(ALIASES.get(o['name'], o['name'])), []) if key(r) in free]
            if len(cands) > 1:
                cands = [r for r in cands if r['group'] == o['group']] or cands
            if not cands:
                pool = [r for r in free.values() if r['group'] == o['group']]
                best = max(pool, key=lambda r: difflib.SequenceMatcher(None, core(r['name']), core(o['name'])).ratio(), default=None)
                score = difflib.SequenceMatcher(None, core(best['name']), core(o['name'])).ratio() if best else 0
                if best and (score >= 0.8 or (core(o['name']) and (core(o['name']) in norm(best['name']) or core(best['name']) in norm(o['name'])))):
                    cands = [best]
                    report.append(f"  ~ {o['name']} → {best['name']} ({best['sub']})")
            if not cands:
                report.append(f"  + {o['name']} ({o['id']}) : absente de la V2 — gardée (des joueurs l'ont peut-être déjà)")
                ids[f"__v1__|{o['id']}"] = {'id': o['id'], 'dir': o['dir'], 'file': o['file'], 'name': o['name'], 'group': o['group'], 'r': o['r']}
                continue
            r = cands[0]
            free.pop(key(r))
            ids[key(r)] = {'id': o['id'], 'dir': o['dir'], 'file': o['file']}
        used = {v['id'] for v in ids.values()}
        for r in rows:
            k = key(r)
            if k in ids:
                continue
            base = f"{PREFIX[r['group']]}-{slug(r['name'])}"
            cid, n = base, 2
            while cid in used:
                cid, n = f'{base}-{n}', n + 1
            used.add(cid)
            ids[k] = {'id': cid, 'dir': 'art/monde', 'file': ''}
        os.makedirs(os.path.dirname(IDS), exist_ok=True)
        with open(IDS, 'w', encoding='utf-8') as f:
            json.dump(ids, f, ensure_ascii=False, indent=0, sort_keys=True)
        if verbose:
            print(f'correspondance V1 → V2 figée ({len(v1)} cartes V1) :')
            print('\n'.join(report) or '  (toutes retrouvées à l’identique)')
    # patchs : un rebrand garde l'id de la carte (des joueurs l'ont peut-être) ; une image nouvelle sera récoltée
    changed = False
    for r in rows:
        if r.get('was') and key(r) not in ids and r['was'] in ids:
            meta = ids.pop(r['was'])
            if r['url'] and r['url'] != r['was_url']:
                meta = {**meta, 'dir': 'art/monde', 'file': '', 'reimage': True}
            ids[key(r)] = meta
            changed = True
    used = {v['id'] for v in ids.values()}
    for r in rows:  # cartes insérées par un patch
        if key(r) not in ids:
            base = f"{PREFIX[r['group']]}-{slug(r['name'])}"
            cid, n = base, 2
            while cid in used:
                cid, n = f'{base}-{n}', n + 1
            used.add(cid)
            ids[key(r)] = {'id': cid, 'dir': 'art/monde', 'file': ''}
            changed = True
    if changed:
        with open(IDS, 'w', encoding='utf-8') as f:
            json.dump(ids, f, ensure_ascii=False, indent=0, sort_keys=True)
    cards, nums = [], collections.Counter()
    for r in rows:
        meta = ids[key(r)]
        nums[r['sub']] += 1
        cards.append({**r, 'subId': sub_id(r['sub']), 'num': nums[r['sub']], 'id': meta['id'], 'dir': meta['dir'],
                      'file': meta['file'] or f"{sub_id(r['sub'])}--{meta['id'].split('-', 1)[1]}", 'v1': meta['dir'] != 'art/monde',
                      'reimage': bool(meta.get('reimage'))})
    # cartes V1 absentes de la V2 : gardées (jamais d'inventaire orphelin), dans leur sous-thème d'origine ou le 1er du groupe
    kept = [v for k, v in ids.items() if k.startswith('__v1__|')]
    for v in kept:
        sub = next((s for s, g in ALONE.items() if g == v['group']), None) or GROUPS[v['group']][1][0]
        nums[sub] += 1
        stars = {'c': 1, 'u': 2, 'r': 3, 'e': 4, 'l': 5, 'm': 6}.get(v['r'], 1)
        cards.append({'name': v['name'], 'sub': sub, 'group': v['group'], 'type': '', 'cat': '', 'region': '', 'stars': stars, 'url': '',
                      'subId': sub_id(sub), 'num': nums[sub], 'id': v['id'], 'dir': v['dir'], 'file': v['file'], 'v1': True})
    return cards, kept


# ───────────────────────────────────────────── réseau + images (même politique que make-jeux-video.py)
S = requests.Session()
S.headers['User-Agent'] = UA
_last = collections.defaultdict(float)
_host_lock = collections.defaultdict(threading.Lock)


def get(url, params=None, tries=4, binary=False):
    host = url.split('/')[2]
    for i in range(tries):
        with _host_lock[host]:
            wait = _last[host] + 0.2 - time.time()
            if wait > 0:
                time.sleep(wait)
            _last[host] = time.time()
        try:
            r = S.get(url, params=params, timeout=30)
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


def wiki(c):
    """Wikipédia (fr puis en) : page au même nom, image principale (photos libres)."""
    q = re.sub(r'^Pays\s*:\s*', '', c['name'])
    for api in ('https://fr.wikipedia.org/w/api.php', 'https://en.wikipedia.org/w/api.php'):
        d = get(api, {'action': 'query', 'list': 'search', 'srsearch': q, 'srlimit': 4, 'format': 'json'})
        for hit in (d or {}).get('query', {}).get('search', []):
            t = hit['title']
            if not (core(t) == core(q) or difflib.SequenceMatcher(None, core(t), core(q)).ratio() >= 0.86):
                continue
            # homonymes : « Chihuahua (chien) », « Phoenix (groupe) »… — une précision entre parenthèses n'est acceptée
            # que pour une voiture (génération), un aliment / une marque, ou si elle cite le pays de la carte
            m = re.search(r'\((.*?)\)\s*$', t)
            if m and '(' not in c['name']:
                qual = norm(m.group(1))
                food = ('cocktail', 'fromage', 'dessert', 'patisserie', 'plat', 'gastronomie', 'marque', 'brand', 'confiserie', 'bonbon', 'cereales',
                        'sauce', 'cuisine', 'cuisinier', 'glacee', 'restauration', 'restaurant', 'bakery', 'brasserie', 'chocolate', 'saucisse', 'entreprise')
                ok = c['group'] == 'voitures' or (c['group'] == 'nourriture' and any(w in qual for w in food)) or qual in ('ville', 'municipalite', 'city')
                if not ok:
                    continue
            p = get(api, {'action': 'query', 'titles': t, 'redirects': 1, 'prop': 'pageimages', 'piprop': 'thumbnail', 'pithumbsize': 900, 'format': 'json'})
            for pg in ((p or {}).get('query', {}).get('pages', {}) or {}).values():
                th = pg.get('thumbnail', {}).get('source')
                if th:
                    b = get(th, binary=True, tries=3)
                    if b and len(b) > 3000:
                        return b, f'wiki:{t}'
    return None


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
        cutout = sum(a.histogram()[:16]) / (im.size[0] * im.size[1]) > 0.06
        if not cutout:
            bg = Image.new('RGB', im.size, (255, 255, 255))
            bg.paste(im, mask=a)
            im = bg
    elif im.mode != 'RGB':
        im = im.convert('RGB')
    im.thumbnail((900, 900), Image.LANCZOS)
    name = c['file'] + ('.png' if cutout else '.jpg')
    if cutout:
        im.save(os.path.join(OUT, name), optimize=True)
    else:
        im.save(os.path.join(OUT, name), quality=86, optimize=True, progressive=True)
    th = im.copy()
    th.thumbnail((256, 256), Image.LANCZOS)
    th.save(os.path.join(THUMBS, c['file'] + '.webp'), quality=80, method=5)
    return name, ('i' if cutout else 'c')


def harvest_one(c):
    srcs = []
    if c['url'].startswith('http'):
        srcs.append(('url', lambda: (lambda b: (b, 'url') if b and len(b) > 3000 else None)(get(c['url'], binary=True, tries=3))))
    srcs.append(('wiki', lambda: wiki(c)))
    for _, fn in srcs:
        try:
            res = fn()
        except Exception:
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


def v1_art(c):
    """Illustration V1 déjà sur le disque : pleine (« c ») ou détourée (« i ») ?"""
    try:
        im = Image.open(os.path.join(ROOT, 'public', c['dir'], c['file']))
        if im.mode in ('RGBA', 'LA', 'P'):
            a = im.convert('RGBA').getchannel('A')
            if sum(a.histogram()[:16]) / (im.size[0] * im.size[1]) > 0.06:
                return 'i'
        return 'c'
    except Exception:
        return ''


def harvest(xlsx, budget, retry):
    os.makedirs(THUMBS, exist_ok=True)
    cards, _ = build(xlsx, verbose=True)
    log = load_log()
    for c in cards:  # rebrand avec une nouvelle image : l'image V1 notée au journal ne vaut plus
        if c.get('reimage') and log.get(c['id'], {}).get('src') == 'v1':
            del log[c['id']]
    for c in cards:  # cartes V1 : on garde leur image, on note seulement son type
        if c['v1'] and c['id'] not in log:
            log[c['id']] = {'file': c['file'], 'art': v1_art(c), 'src': 'v1'}
    todo = [c for c in cards if not c['v1'] and (c['id'] not in log or (retry and not log[c['id']].get('file')))]
    print(f'{len(todo)} images à chercher', flush=True)
    t0, done = time.time(), 0
    with cf.ThreadPoolExecutor(8) as ex:
        it = iter(todo)
        running = {}

        def submit():
            c = next(it, None)
            if c and time.time() - t0 < budget:
                running[ex.submit(harvest_one, c)] = c

        for _ in range(16):
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


# ───────────────────────────────────────────── données TypeScript
def _purged():
    import json as _j, os as _o
    return set(_j.load(open(_o.path.join(_o.path.dirname(_o.path.abspath(__file__)), 'data', 'purged-ids.json'), encoding='utf-8')))


def gen(xlsx):
    cards, kept = build(xlsx, verbose=True)
    # purge du 04/11/2026 : les cartes 1★-3★ restées sans illustration sont supprimées du jeu (scripts/data/purged-ids.json)
    _p = _purged()
    cards = [c for c in cards if c['id'] not in _p]
    log = load_log()
    q = lambda s: json.dumps(s, ensure_ascii=False)
    order = ['merveilles', 'ardeche', 'lieux', 'animaux', 'nourriture', 'voitures']
    # ordre d'affichage : Merveilles, Ardèche, puis chaque groupe dans l'ordre choisi par le groupe d'amis
    subs = sorted(dict.fromkeys(c['sub'] for c in cards), key=lambda s: (order.index(ALONE.get(s) or SUB_GROUP[s]), 0 if s in ALONE else GROUPS[SUB_GROUP[s]][1].index(s)))
    codes, used = {}, {'GEO', 'ZOO', 'FOD', 'CAR', 'ARD', 'MRV'}
    for s in subs:
        if s in ALONE:
            codes[s] = {'merveilles': 'MRV', 'ardeche': 'ARD'}[ALONE[s]]
            continue
        words = [w for w in re.findall(r'[A-Za-z]+', unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode()) if len(w) > 2 and w.lower() not in ('des', 'les', 'and')]
        base = (''.join(w[0] for w in words[:3]) if len(words) >= 3 else words[0][:2] + (words[1][0] if len(words) > 1 else words[0][2:3])).upper()
        alt = words[0][:3].upper()
        code, k = (base if base not in used else alt), 2
        while code in used:
            code, k = base[:2] + str(k), k + 1
        used.add(code)
        codes[s] = code
    order = ['merveilles', 'ardeche', 'lieux', 'animaux', 'nourriture', 'voitures']

    L = []
    L.append('/**')
    L.append(' * WORLD PACK V2 (thème « monde ») — données pures, AUCUN import (partagé avec convex/cardsCatalog.ts).')
    L.append(' * GÉNÉRÉ par scripts/make-monde-v2.py (ne pas éditer à la main) depuis Tri-etoiles-monde_2.xlsx (« Étoiles finales (VALIDÉ) »).')
    L.append(f' * {len(cards)} cartes · {len(subs)} sous-thèmes, regroupés à l\'affichage en 6 (14 Merveilles · Ardèche · Lieux & pays · Animaux ·')
    L.append(' * Nourriture · Voitures). Les cartes de la V1 gardent leur identifiant et leur illustration (scripts/data/monde-ids.json).')
    L.append(' * Les 14 Merveilles restent SECRÈTES (diorama 3D).')
    L.append(' */')
    L.append("export type MondeRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic' | 'secret';")
    L.append('')
    L.append('export interface MondeSub {')
    L.append('  id: string;')
    L.append('  label: string;')
    L.append('  code: string;')
    L.append('  /** groupe d\'affichage (lieux, animaux, nourriture, voitures) ; absent = sous-thème seul (Merveilles, Ardèche) */')
    L.append('  group?: string;')
    L.append('}')
    L.append('')
    L.append('export interface MondeEntry {')
    L.append('  /** identifiant de carte — ne JAMAIS le changer */')
    L.append('  id: string;')
    L.append('  sub: string;')
    L.append('  num: number;')
    L.append('  name: string;')
    L.append('  rarity: MondeRarity;')
    L.append('  /** dossier de l\'illustration (art/monde, ou l\'ancien dossier V1) */')
    L.append('  dir: string;')
    L.append("  /** fichier dans `dir` ('' = aucune illustration : design typographique) */")
    L.append('  file: string;')
    L.append("  /** 'c' image pleine · 'i' détourée · '' aucune */")
    L.append("  art: '' | 'c' | 'i';")
    L.append('  /** type affiché (« Mammifère », « Capitale / Métropole »…) */')
    L.append('  label: string;')
    L.append('}')
    L.append('')
    L.append("export const MONDE_GROUPS: Record<string, string> = { lieux: 'Lieux & pays', animaux: 'Animaux', nourriture: 'Nourriture', voitures: 'Voitures' };")
    L.append('')
    L.append('export const MONDE_SUBS: MondeSub[] = [')
    for s in subs:
        g = SUB_GROUP.get(s)
        L.append(f"  {{ id: {q(sub_id(s))}, label: {q(s)}, code: {q(codes[s])}{', group: ' + q(g) if g else ''} }},")
    L.append('];')
    L.append('')
    L.append("const R = { c: 'common', u: 'uncommon', r: 'rare', e: 'epic', l: 'legendary', m: 'mythic', s: 'secret' } as const;")
    L.append('const DIRS = ["art/monde", "art/lieux", "art/animaux", "art/nourriture", "art/voitures", "art/ardeche", "art/merveilles"];')
    L.append('')
    L.append('// [sous-thème (index), id, nom, rareté, dossier (index), fichier, art, type]')
    L.append("const RAW: Array<[number, string, string, keyof typeof R, number, string, '' | 'c' | 'i', string]> = [")
    dirs = ['art/monde', 'art/lieux', 'art/animaux', 'art/nourriture', 'art/voitures', 'art/ardeche', 'art/merveilles']
    sub_index = {s: i for i, s in enumerate(subs)}
    with_art = 0
    for c in sorted(cards, key=lambda c: (sub_index[c['sub']], c['num'])):
        h = log.get(c['id'], {})
        f = h.get('file', '') if not c['v1'] else (c['file'] if h.get('art', 'c') else c['file'])
        art = h.get('art', '') if f else ''
        if c['v1'] and not art:
            art = 'c'
        with_art += 1 if f else 0
        r = 's' if c['sub'] == 'Les 14 Merveilles' else R[c['stars']]
        L.append(f"  [{sub_index[c['sub']]}, {q(c['id'])}, {q(c['name'])}, '{r}', {dirs.index(c['dir'])}, {q(f)}, {q(art)}, {q(c['type'])}],")
    L.append('];')
    L.append('')
    L.append('const counters: number[] = [];')
    L.append('export const MONDE: MondeEntry[] = RAW.map(([s, id, name, r, d, file, art, label]) => {')
    L.append('  counters[s] = (counters[s] ?? 0) + 1;')
    L.append('  return { id, sub: MONDE_SUBS[s].id, num: counters[s], name, rarity: R[r], dir: DIRS[d], file, art, label };')
    L.append('});')
    L.append('')
    with open(TS, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write('\n'.join(L))
    print(f'{TS} : {len(cards)} cartes, {len(subs)} sous-thèmes, {with_art} avec illustration')
    if kept:
        print('  cartes V1 absentes de la V2, gardées en plus :', ', '.join(v['name'] for v in kept))


if __name__ == '__main__':
    a = sys.argv[1:]
    if len(a) < 2 or a[0] not in ('harvest', 'gen'):
        print(__doc__)
        sys.exit(1)
    opt = lambda k, d=None: a[a.index(k) + 1] if k in a else d
    if a[0] == 'harvest':
        harvest(a[1], float(opt('--budget', 1e9)), '--retry' in a)
    else:
        gen(a[1])
