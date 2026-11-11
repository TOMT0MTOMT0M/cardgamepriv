"""
POP CULTURE PACK (thème « pop ») : 17 471 cartes (personnages, acteurs, musique, youtubeurs), 856 sous-thèmes (= franchises,
œuvres ou pools, imprimés en grand sur la carte), regroupés à l'affichage en 7 : Mangas & anime · Films · Séries TV ·
Dessins animés · Musique · Acteurs & actrices · YouTube.
Source : Tri-etoiles-popculture.xlsx (SPEC-THEME-POP-CULTURE v5, feuille « Tri étoiles », colonne « Étoiles finales »).

  python scripts/make-pop.py gen     donnees/tri-etoiles/Tri-etoiles-popculture.xlsx
  python scripts/make-pop.py harvest donnees/tri-etoiles/Tri-etoiles-popculture.xlsx [--budget 3000] [--retry] [--threads 8]

Import en REMPLACEMENT : src/core/sets/popculture.ts est réécrit en entier à chaque « gen ».
Identifiants STABLES « pop-<nom> » : figés la première fois dans scripts/data/pop-ids.json (clé = nom + type), réutilisés
ensuite même si une future version du tri renumérote ou ré-étiquette les sous-thèmes (une carte ne change jamais d'id).
Numéro affiché = colonne « N° » de l'Excel (+ patchs), sur 17 477.
Bloc d'affichage d'un sous-thème : déduit du type des cartes (Artiste, Chanson, Album, Acteur, Youtubeur, Yu-Gi-Oh) ;
pour les personnages : AniList → Mangas & anime, sinon listes DA / SERIE ci-dessous (tout le reste = Films).
harvest : image de la colonne « Image URL » (AniList, Wikimedia Commons via l'API, cache web) téléchargée une fois dans
  public/art/pop/ + miniature WebP ; pas d'URL / image inutilisable → design typographique (placeholder standard).
  Journal : scripts/data/pop-harvest.json (reprend là où il s'est arrêté).
gen : écrit src/core/sets/popculture.ts (données pures, aucun import : partagé avec convex/).
Besoin : pip install openpyxl pillow requests
"""
import sys, os, re, io, json, hashlib, time, threading, unicodedata, collections, urllib.parse, concurrent.futures as cf
import requests, openpyxl
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SETS = os.path.join(ROOT, 'src', 'core', 'sets')
OUT = os.path.join(ROOT, 'public', 'art', 'pop')
THUMBS = os.path.join(OUT, 'thumbs')
IDS = os.path.join(ROOT, 'scripts', 'data', 'pop-ids.json')
LOG = os.path.join(ROOT, 'scripts', 'data', 'pop-harvest.json')
TS = os.path.join(SETS, 'popculture.ts')
UA = 'BebouCard/1.0 (https://cardgamepriv.pages.dev; private card game, one-time image harvest)'
R = {1: 'c', 2: 'u', 3: 'r', 4: 'e', 5: 'l', 6: 'm'}
BASE = 17471  # lignes du tri de base (Tri-etoiles-popculture.xlsx)
# patchs du tri (donnees/patchs/), appliqués dans l'ordre à chaque gen / harvest — INSERT seulement, après le N° 17471
#   Patch-pop-berserk.xlsx (10/11/2026) : 6 cartes Berserk 5★/6★ hors Âge d'or (N° 17472 → 17477)
#   Patch-pop-chansons-11-11.xlsx (11/11/2026) : 56 chansons 6★ + Finn l'Humain (Adventure Time) 6★ (N° 17478 → 17534)
PATCHES = ['Patch-pop-berserk.xlsx', 'Patch-pop-chansons-11-11.xlsx']
TOTAL = 17534  # BASE + patchs

# ── blocs d'affichage. Ids de groupe : ceux des anciens sous-thèmes vides du thème (films, series, anime, musique,
# youtubeurs) pour garder les liens d'avant, + dessins / stars.
GROUP_LABELS = {'anime': 'Mangas & anime', 'films': 'Films', 'series': 'Séries TV', 'dessins': 'Dessins animés',
                'musique': 'Musique', 'stars': 'Acteurs & actrices', 'youtubeurs': 'YouTube'}
TYPE_GROUP = {'Artiste': 'musique', 'Chanson': 'musique', 'Album': 'musique', 'Acteur': 'stars', 'Youtubeur': 'youtubeurs',
              'Monstre Yu-Gi-Oh': 'anime', 'Carte Yu-Gi-Oh': 'anime'}
MUSIC_ORDER = ['Musique FR', 'Musique Monde', 'Chansons', 'Albums']
DA = """Adventure Time|Albator|American Dad!|Amphibia|Avatar : Le Dernier Maître de l'Air|Babar|Barbapapa|Ben 10|Big City Greens|Bluey|BoJack Horseman|Bob l'éponge|Bob le bricoleur|Capitaine Flam|Castlevania (Netflix)|CatDog|Code Lyoko|Cobra|Courage, le chien froussard|Danny Fantôme|Dexter (DA)|Dora l'exploratrice|Doug|Foot 2 Rue|Franklin|Futurama|Galactik Football|Garfield|Gaston Lagaffe|Gravity Falls|Grizzy et les Lemmings|Hé Arnold!|Heidi|Il était une fois... la Vie|Inspecteur Gadget|Invincible|Jayce|Jimmy Neutron|Johnny Bravo|Kaeloo|Kim Possible|La Cour de récré|Le Bus magique|Le Monde magique de Disney|Les Animaniacs|Les Griffin|Les Maîtres de l'univers|Les Mystérieuses Cités d'or|Les Pierrafeu|Les Razmoket|Les Schtroumpfs|Les Simpson|Les Sisters|Les Supers Nanas|Les Télétubbies|Les Zinzins de l'espace|Looney Tunes|Lucky Luke|Martin Mystère|Masha et Michka|Maya l'abeille|Miraculous|Molang|Oggy et les Cafards|Oui-Oui|Pat'Patrouille|Peanuts|Peppa Pig|Phinéas et Ferb|Princesse Sarah|Regular Show|Rick et Morty|Rémi sans famille|Sam le pompier|Samurai Jack|Scooby-Doo|South Park|Spirou|Steven Universe|T'choupi|Teen Titans|The Owl House|Tintin|Titeuf|Tom et Jerry|Tortues Ninja|Totally Spies!|Ulysse 31|Wakfu|Zig et Sharko""".split('|')
SERIE = """13 Reasons Why|24|7 à la maison|ALF|Adolescence|Alerte à Malibu|Alice in Borderland|All of Us Are Dead|American Horror Story|Arabesque|Arnold et Willy|Arrested Development|Arrowverse|Astrid et Raphaëlle|Babylon Berlin|Band of Brothers|Baron Noir|Battlestar Galactica|Berlin|Better Call Saul|Beverly Hills 90210|Big Little Lies|Billions|Black Mirror|Black Sails|Blacklist|Boardwalk Empire|Bones|Braquo|Breaking Bad|Bref|Bridgerton|Broadchurch|Bron|Brooklyn Nine-Nine|Buffy|Californication|Caméra Café|Candice Renoir|Capitaine Marleau|Castle|Charmed|Chernobyl|Clem|Cobra Kai|Code Quantum|Columbo|Commissaire Moulin|Community|Crash Landing on You|Dallas|Dark|Dawson|Designated Survivor|Desperate Housewives|Dexter|Dix pour cent|Doc Martin|Doctor Who|Downton Abbey|Dr House|Dr Quinn, femme médecin|Drake et Josh|Dynastie|Emily in Paris|En Place|Engrenages|Entourage|Esprits criminels|Euphoria|Extraordinary Attorney Woo|FBI : Duo très spécial|Fais pas ci, fais pas ça|Fallout|Family Business|Fargo|Fiasco|Firefly|Fleabag|Friends|Fringe|Game of Thrones|Gilmore Girls|Glee|Goblin|Gomorra|Good Omens|Gossip Girl|Gotham|Grey's Anatomy|Grimm|H|H2O|HPI|Hannah Montana|Hannibal|Heartstopper|Hero Corp|Heroes|Highlander (série)|Homeland|House of Cards|House of the Dragon|How I Met Your Mother|Hélène et les Garçons|Incorrigible Cory|Inspecteur Derrick|Jessie|Joséphine, ange gardien|Julie Lescaut|K2000|Kaamelott|Kaboul Kitchen|Killing Eve|Kingdom (série coréenne)|L'Agence tous risques|La Casa de Papel|La Fête à la maison|La Petite Maison dans la prairie|La Roue du temps|La Vie de famille|La Vie de palace de Zack et Cody|Le Bureau des légendes|Le Jeu de la dame|Le Mentalist|Le Prince de Bel-Air|Le Visiteur du futur|Les Anneaux de pouvoir|Les Borgia|Les Cordier, juge et flic|Les Experts|Les Frères Scott|Les Petits Meurtres d'Agatha Christie|Les Revenants|Les Soprano|Les Sorciers de Waverly Place|Les Tudors|Lizzie McGuire|Lost|Lucifer|Lupin (série)|Luther|Ma famille d'abord|MacGyver|Mad Men|Madame est servie|Mafiosa|Magnum|Maigret|Malcolm|Mare of Easttown|Mariés, deux enfants|Mercredi|Merlin (BBC)|Miami Vice|Mindhunter|Modern Family|Monk|Mr. Robot|Murder|NCIS|Narcos|Narcos: Mexico|Navarro|New Girl|New York, unité spéciale|Newport Beach|Noob|Notre belle famille|Off Campus|Once Upon a Time|Only Murders in the Building|Outer Banks|Outlander|Ozark|Parks and Recreation|Peaky Blinders|Person of Interest|Petite merveille|Phénomène Raven|Plus belle la vie|Poirot|Power Rangers|Premiers baisers|Pretty Little Liars|Prison Break|Profilage|Psych|Queen of Tears|Reacher|Revenge|Riverdale|Rome|SKAM France|Sabrina, l'apprentie sorcière|Sauvés par le gong|Scandal|Scrubs|Scènes de ménages|Seinfeld|Severance|Sex Education|Sex and the City|Shadow and Bone|Shameless|Sherlock|Shérif, fais-moi peur|Shōgun|Silicon Valley|Silo|Skins|Slow Horses|Smallville|Sons of Anarchy|Sous le soleil|Spartacus|Squid Game|Star Trek|Stargate Atlantis|Stargate SG-1|Starsky et Hutch|Stranger Things|Succession|Suits|Supercopter|Supernatural|Sweet Home|Ted Lasso|Teen Wolf|That '70s Show|The 100|The Bear|The Big Bang Theory|The Boys|The Crown|The End of the F***ing World|The Expanse|The Glory|The Good Doctor|The Good Place|The Handmaid's Tale|The Last Kingdom|The Mandalorian|The Night Agent|The Office (US)|The Pitt|The Rookie|The Sandman|The Umbrella Academy|The Walking Dead|The White Lotus|The Wire|The Witcher|This Is Us|Tout le monde déteste Chris|True Blood|True Detective|Twin Peaks|Ugly Betty|Un gars, une fille|Un village français|Une famille formidable|Une nounou d'enfer|Urgences|Validé|Vampire Diaries|Versailles|Victorious|Vikings|Vis à vis|Weeds|Westworld|X-Files|Xena, la guerrière|Yellowstone|You|Zoey 101|iCarly|Élite""".split('|')
ANIME_EXTRA = ['Pokémon (animé)']

TYPE_FR = {'Personnage': 'Personnage', 'Artiste': 'Artiste', 'Chanson': 'Chanson', 'Acteur': 'Acteur / actrice', 'Album': 'Album',
           'Youtubeur': 'Youtubeur', 'Monstre Yu-Gi-Oh': 'Monstre', 'Carte Yu-Gi-Oh': 'Carte magie / piège'}


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
        if f.endswith('.ts') and f != 'popculture.ts':
            with open(os.path.join(SETS, f), encoding='utf-8') as fh:
                out.update(re.findall(pattern, fh.read()))
    return out


# ───────────────────────────────────────────── Excel
def patch_rows():
    """Nouvelles cartes des patchs (feuille « Nouvelles cartes », sous l'en-tête « N° », mêmes colonnes que le tri)."""
    out = []
    for name in PATCHES:
        ws = openpyxl.load_workbook(os.path.join(ROOT, 'donnees', 'patchs', name), read_only=True, data_only=True)['Nouvelles cartes']
        head = None
        for r in ws.iter_rows(values_only=True):
            if head is None:
                if r and r[0] == 'N°':
                    head = [str(x or '').strip() for x in r]
                continue
            if not r or not isinstance(r[0], (int, float)) or not r[2]:
                continue
            col = lambda k: r[head.index(k)]
            t = str(col('Type') or '').strip()
            n = int(col('N°'))
            assert n > BASE, f'{name} : N° {n} déjà dans le tri de base'
            out.append({'n': n, 'sub': str(col('Sous-thème')).strip(), 'name': str(col('Carte')).strip(), 'type': t,
                        'label': TYPE_FR.get(t, t), 'stars': int(col('Étoiles finales')), 'url': str(col('Image URL') or '').strip()})
    return out


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
        col = lambda k: r[head.index(k)] if head.index(k) < len(r) else None  # lignes sans « Image URL » : cellule absente
        sub = str(col('Sous-thème')).strip()
        t = str(col('Type') or '').strip()
        rows.append({'n': int(col('N°')), 'sub': sub, 'name': str(col('Carte')).strip(), 'type': t,
                     'label': TYPE_FR.get(t, t), 'stars': int(col('Étoiles finales')), 'url': str(col('Image URL') or '').strip()})
    assert len(rows) == BASE, f'{len(rows)} lignes ({BASE} attendues)'
    rows += patch_rows()
    assert len(rows) == TOTAL, f'{len(rows)} lignes avec les patchs ({TOTAL} attendues)'
    assert sorted(r['n'] for r in rows) == list(range(1, TOTAL + 1)), f'colonne N° : 1 → {TOTAL} attendu'
    assert all(1 <= r['stars'] <= 6 for r in rows)
    # bloc de chaque sous-thème
    by_sub = collections.defaultdict(list)
    for r in rows:
        by_sub[r['sub']].append(r)
    groups = {}
    for s, L in by_sub.items():
        types = collections.Counter(r['type'] for r in L)
        non_perso = [t for t in types if t != 'Personnage']
        anilist = sum(1 for r in L if 'anilist.co' in r['url'])
        if s.startswith('Yu-Gi-Oh') or s in ANIME_EXTRA or anilist >= max(1, len(L) * 0.5):
            g = 'anime'
        elif non_perso:
            g = TYPE_GROUP[non_perso[0]]
        elif s in DA:
            g = 'dessins'
        elif s in SERIE:
            g = 'series'
        else:
            g = 'films'
        groups[s] = g
    for r in rows:
        r['group'] = groups[r['sub']]
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
                base = f"pop-{slug(r['name'])}"
                cid = base if base not in used_ids else f"{base}-{slug(r['sub'])}"
                n = 2
                while cid in used_ids:
                    cid, n = f'{base}-{n}', n + 1
                ids[k] = cid
                used_ids.add(cid)
            changed = True
        used_keys.add(k)
        r['id'] = ids[k]
        r['file'] = ids[k][4:]
        r['label'] = TYPE_FR.get(r['type'], r['type'])
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
# Wikimedia limite les rafales (429 + retry-after) : une image par seconde, et toute l'hôte en pause quand il le demande
GAP = {'www.wikidata.org': 0.3, 'commons.wikimedia.org': 0.5, 'fr.wikipedia.org': 0.25, 'en.wikipedia.org': 0.25, 'thumb.wikimedia.org': 0.5, 'upload.wikimedia.org': 0.5, 's4.anilist.co': 0.15}


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
                pause = min(60, float(r.headers.get('retry-after') or 3 * (i + 1)))
                with _host_lock[host]:
                    # pause pour TOUS les fils sur cet hôte (sinon les autres continuent la rafale)
                    _last[host] = max(_last[host], time.time() + pause)
                if i == tries - 1:
                    return None
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


RESOLVED = os.path.join(ROOT, 'scripts', 'data', 'pop-resolve.json')


def file_title(url):
    """« …/Special:FilePath/Felix_Brych.jpg?width=300 » → « File:Felix Brych.jpg » (None si ce n'est pas une URL FilePath)."""
    m = re.search(r'Special:FilePath/([^?#]+)', url)
    return 'File:' + urllib.parse.unquote(m.group(1)).replace('_', ' ') if m else None


def resolve_all(titles, budget_end):
    """Adresse directe des miniatures 960 px, par lots de 50 titres via l'API (Wikipédia fr, qui voit aussi Commons, puis
    en pour les logos locaux). Bien plus rapide que Special:FilePath, que Wikimedia limite fortement (429).
    Cache : scripts/data/pop-resolve.json (titre → URL, ou '' si introuvable)."""
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
        small = re.sub(r'/960px-', '/330px-', direct) if direct else ''
        # 1★–3★ : la miniature standard 330 px (déjà en cache chez Wikimedia) d'abord — la 960 px, fabriquée à la demande,
        # est très souvent refusée (429) en rafale ; les 4★+ gardent la 960 px (plus nette en grand)
        srcs = ([(small, 3), (direct, 1)] if c['stars'] <= 3 else [(direct, 2), (small, 3)]) if direct else []  # introuvable via l'API (fichier supprimé de Commons : 404 vérifié) → design typographique
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


def harvest(xlsx, budget, retry, threads=8, part=None):
    os.makedirs(THUMBS, exist_ok=True)
    cards = build(xlsx)
    log = load_log()
    # les ≥4★ d'abord : si le temps manque, ce sont elles qui ont leur image
    # AniList / cache web d'abord (pas de limite), Wikimedia ensuite (limité : une image par seconde, pauses 429) — sinon
    # tous les fils attendent Wikimedia ; dans chaque groupe, les plus hautes raretés d'abord
    wm = lambda c: 1 if 'wikimedia.org' in c['url'] else 0
    todo = sorted((c for c in cards if c['id'] not in log or (retry and not log[c['id']].get('file') and c['url'])), key=lambda c: (wm(c), -c['stars'], c['n']))
    if part:  # « --part k/n » : seulement 1 carte sur n (deux machines en parallèle, sur des cartes différentes)
        k, n = map(int, part.split('/'))
        todo = [c for c in todo if int(hashlib.md5(c['id'].encode()).hexdigest(), 16) % n == k]
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


def _purged():
    import json as _j, os as _o
    return set(_j.load(open(_o.path.join(_o.path.dirname(_o.path.abspath(__file__)), 'data', 'purged-ids.json'), encoding='utf-8')))


def gen(xlsx):
    cards = build(xlsx)
    # purge du 04/11/2026 : les cartes 1★-3★ restées sans illustration sont supprimées du jeu (scripts/data/purged-ids.json)
    _p = _purged()
    cards = [c for c in cards if c['id'] not in _p]
    log = load_log()
    q = lambda s: json.dumps(s, ensure_ascii=False)
    gorder = list(GROUP_LABELS)
    by_sub = collections.defaultdict(list)
    for c in cards:
        by_sub[c['sub']].append(c)
    # ordre d'affichage : bloc, puis (musique : FR, Monde, Chansons, Albums) alphabétique
    def sub_key(s):
        g = by_sub[s][0]['group']
        return (gorder.index(g), MUSIC_ORDER.index(s) if s in MUSIC_ORDER else 99, norm(s))
    subs = sorted(by_sub, key=sub_key)
    taken_ids = existing(r'\bid: ["\']([a-z0-9-]+)["\']') - set(GROUP_LABELS) - {'marvel', 'yugioh'}
    sub_ids, codes = {}, {}
    used_codes = existing(r'\bcode: ["\']([A-Z0-9]+)["\']') | {'POP'}
    seen = set()
    prev_codes = {}
    if os.path.exists(TS):
        for lab, cd in re.findall(r'label: ("(?:[^"\\]|\\.)*"), code: "([A-Z0-9]+)"', open(TS, encoding='utf-8').read()):
            prev_codes[json.loads(lab)] = cd
    taken_codes = set()
    used_codes |= set(prev_codes.values())
    for s in subs:
        sid = slug(s)
        if s == 'Marvel MCU':
            sid = 'marvel'  # id de l'ancien sous-thème vide « Marvel (MCU) »
        if sid in taken_ids or sid in GROUP_LABELS or sid in seen:
            sid = f'pop-{sid}'
        seen.add(sid)
        sub_ids[s] = sid
        # codes STABLES (imprimés sur les cartes) : un sous-thème garde le code qu'il a déjà dans le fichier généré, même si
        # un autre disparaît (purge du 04/11 : « Lucy » retiré ne doit pas faire passer « Lucifer » de LU3 à LU2)
        codes[s] = prev_codes[s] if prev_codes.get(s) and prev_codes[s] not in taken_codes else code_of(s, used_codes)
        taken_codes.add(codes[s])

    L = []
    L.append('/**')
    L.append(' * POP CULTURE PACK (thème « pop ») — données pures, AUCUN import (partagé avec convex/cardsCatalog.ts).')
    L.append(' * GÉNÉRÉ par scripts/make-pop.py (ne pas éditer à la main) depuis Tri-etoiles-popculture.xlsx (SPEC-THEME-POP-CULTURE v5).')
    L.append(f' * {len(cards)} cartes · {len(subs)} sous-thèmes (libellé imprimé en grand sur la carte), regroupés à l\'affichage en {len(GROUP_LABELS)}.')
    L.append(f' * Numéro = « N° » de l\'Excel, sur {TOTAL}. Ids « pop-… » figés dans scripts/data/pop-ids.json (ne JAMAIS les changer).')
    L.append(' */')
    L.append("export type PopRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';")
    L.append('')
    L.append('export interface PopSub {')
    L.append('  id: string;')
    L.append('  label: string;')
    L.append('  code: string;')
    L.append("  /** groupe d'affichage (mangas & anime, films, séries…) */")
    L.append('  group: string;')
    L.append('}')
    L.append('')
    L.append('export interface PopEntry {')
    L.append('  /** identifiant de carte — ne JAMAIS le changer */')
    L.append('  id: string;')
    L.append('  sub: string;')
    L.append(f'  /** n° de la carte dans tout le thème (1 → {TOTAL}) */')
    L.append('  num: number;')
    L.append('  name: string;')
    L.append('  rarity: PopRarity;')
    L.append("  /** fichier dans art/pop ('' = aucune illustration : design typographique) */")
    L.append('  file: string;')
    L.append("  /** 'c' image pleine · 'i' détourée · '' aucune */")
    L.append("  art: '' | 'c' | 'i';")
    L.append('  /** type affiché (« Personnage », « Artiste », « Chanson »…) */')
    L.append('  label: string;')
    L.append('}')
    L.append('')
    L.append(f'export const POP_SIZE = {TOTAL};')
    L.append('export const POP_GROUPS: Record<string, string> = {')
    for g, lab in GROUP_LABELS.items():
        L.append(f'  {g}: {q(lab)},')
    L.append('};')
    L.append('')
    L.append('export const POP_SUBS: PopSub[] = [')
    for s in subs:
        L.append(f"  {{ id: {q(sub_ids[s])}, label: {q(s)}, code: {q(codes[s])}, group: {q(by_sub[s][0]['group'])} }},")
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
    L.append('export const POP: PopEntry[] = RAW.map(([s, num, id, name, r, file, art, l]) => ({ id, sub: POP_SUBS[s].id, num, name, rarity: R[r], file, art, label: LABELS[l] }));')
    L.append('')
    with open(TS, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write('\n'.join(L))
    st = collections.Counter(c['stars'] for c in cards)
    gc = collections.Counter(c['group'] for c in cards)
    gs = collections.Counter(by_sub[s][0]['group'] for s in subs)
    print(f'{TS} : {len(cards)} cartes, {len(subs)} sous-thèmes, {with_art} avec illustration · étoiles {dict(sorted(st.items()))}')
    print('  blocs :', ', '.join(f'{GROUP_LABELS[g]} {gs[g]} sous-thèmes / {gc[g]} cartes' for g in GROUP_LABELS))


if __name__ == '__main__':
    a = sys.argv[1:]
    if len(a) < 2 or a[0] not in ('harvest', 'gen'):
        print(__doc__)
        sys.exit(1)
    opt = lambda k, d=None: a[a.index(k) + 1] if k in a else d
    if a[0] == 'harvest':
        harvest(a[1], float(opt('--budget', 1e9)), '--retry' in a, int(opt('--threads', 8)), opt('--part'))
    else:
        gen(a[1])
