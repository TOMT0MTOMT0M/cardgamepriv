"""(24/11, V3) ILLUSTRATIONS des nouvelles cartes de la base Etoiles (src/core/sets/etoiles.ts, ETOILES_ADD).

Récolte relançable (reprend où elle s'est arrêtée ; une carte tentée n'est pas retentée sauf --retry) :
  python scripts/etoiles-images.py [--budget 160] [--only <sous-thème>] [--retry]
puis : node .cache/dump-catalogue.mjs .cache/catalogue-brut.json --raw && python scripts/make-etoiles.py .cache/catalogue-brut.json

Chaque image passe par save() du script de son thème (même dossier, même miniature WebP, même détection détouré).
Journal : scripts/data/etoiles-images.json { id: {file, art, src} | {miss: [sources essayées]} }.
Sources (téléchargement automatique accepté, User-Agent identifié, rythme demandé respecté, rien de contourné) :
  - personnages d'animés : AniList (le personnage doit apparaître dans une œuvre de la franchise) ;
  - Genshin Impact : gi.yatta.moe (illustrations de vœux) ; Dofus : DofusDB (classes, monstres, objets) ;
  - esport : Liquipedia (photo de la page du joueur, ≥ 2 s entre deux requêtes) ;
  - Élite : TVmaze (photos de personnages) ;
  - le reste (catch, paralympiques, X-Men, Fast & Furious, voitures, Ghibli : personnes) : Wikipédia FR puis EN,
    titre exact, page non ambiguë dont le résumé cite le domaine attendu.
Summoners War : seules des icônes de 102 px existent (swarfarm) — design typographique.
"""
import gzip, importlib.util, json, os, re, sys, time, unicodedata, urllib.parse, urllib.request
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOG = os.path.join(ROOT, 'scripts', 'data', 'etoiles-images.json')
UA = 'cardgamepriv-harvest/1.0 (private card game among friends)'
T0 = time.time()
BUDGET = float(sys.argv[sys.argv.index('--budget') + 1]) if '--budget' in sys.argv else 160
ONLY = sys.argv[sys.argv.index('--only') + 1] if '--only' in sys.argv else None
RETRY = '--retry' in sys.argv


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, os.path.join(ROOT, 'scripts', file))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


MODS = {}
SCRIPT = {'pop': 'make-pop.py', 'spt': 'make-sport.py', 'jv': 'make-jeux-video.py', 'auto': 'make-monde-v2.py'}


def mod(cid):
    p = cid.split('-', 1)[0]
    if p not in MODS:
        MODS[p] = load('m_' + p, SCRIPT[p])
    return MODS[p]


def fold(s):
    return re.sub(r'[^a-z0-9]+', ' ', unicodedata.normalize('NFKD', str(s).lower()).encode('ascii', 'ignore').decode()).strip()


LAST = {}


def get(url, data=None, js=True, host_gap=0.0, headers=None):
    host = urllib.parse.urlparse(url).netloc
    if host_gap:
        w = LAST.get(host, 0) + host_gap - time.time()
        if w > 0:
            time.sleep(w)
    h = {'User-Agent': UA, 'Accept-Encoding': 'gzip', **(headers or {})}
    for i in range(2):
        try:
            req = urllib.request.Request(url, data=data, headers=h)
            with urllib.request.urlopen(req, timeout=20) as r:
                b = r.read()
                if r.headers.get('Content-Encoding') == 'gzip':
                    b = gzip.decompress(b)
            LAST[host] = time.time()
            return json.loads(b) if js else b
        except urllib.error.HTTPError as e:
            LAST[host] = time.time()
            if e.code in (429, 503):
                time.sleep(8)
                continue
            return None
        except Exception:
            time.sleep(2)
    return None


def cards():
    s = open(os.path.join(ROOT, 'src', 'core', 'sets', 'etoiles.ts'), encoding='utf-8').read()
    i = s.index('export const ETOILES_ADD')
    return [json.loads(l.strip().rstrip(',')) for l in s[i:].splitlines()[1:] if l.strip().startswith('[')]


bare = lambda n: re.sub(r'\s*\((Ghibli|Élite|Fairy Tail|X-Men|League of Legends|catch|Genshin|CS|Counter-Strike)\)\s*$', '', n).strip()

# ── AniList ─────────────────────────────────────────────────────────────────────────────────────────────────────────
FRANCHISE = {
    'ghibli': ['totoro', 'chihiro', 'spirited', 'mononoke', 'kiki', 'howl', 'hauru', 'nausica', 'ponyo', 'gake no ue', 'porco', 'kurenai no buta', 'arrietty', 'karigurashi', 'laputa', 'tenkuu no shiro', 'castle in the sky', 'fireflies', 'hotaru', 'kaguya', 'wind rises', 'kaze tachinu', 'marnie', 'kokuriko', 'poppy hill', 'heron', 'kimitachi', 'cagliostro', 'cat returns', 'neko no ongaeshi', 'whisper of the heart', 'mimi wo sumaseba', 'pompoko', 'yamada', 'ocean waves', 'umi ga kikoeru', 'earwig', 'aya to majo', 'earthsea', 'gedo senki', 'only yesterday', 'omoide poroporo', 'majo no takkyuubin', 'sen to chihiro', 'tonari no'],
    'fairy-tail': ['fairy tail'], 'dragon-ball': ['dragon ball'], 'naruto': ['naruto'], 'boruto': ['boruto', 'naruto'],
    'kuroko-no-basket': ['kuroko'], 'inazuma-eleven': ['inazuma'],
}
ALIAS = {'Vegeto': 'Vegetto', 'Obito Uchiha': 'Obito Uchiha', 'Bou': 'Boh', 'Chat-bus': 'Catbus', 'Dame Eboshi': 'Eboshi', 'La Sorcière des Landes': 'Witch of the Waste', 'Le Baron': 'Baron Humbert von Gikkingen',
         'Grand Prêtre': 'Daishinkan', 'Oub': 'Uub', 'C-16': 'Android 16', 'C-19': 'Android 19', 'Super C-17': 'Super 17', 'Oméga Shenron': 'Omega Shenron',
         'Brain / Zero': 'Brain', 'Haru (Ghibli)': 'Haru Yoshioka', 'Sophie': 'Sophie Hatter', 'Markl': 'Markl', 'Muska': 'Muska', 'Dola': 'Dola', 'Sosuke': 'Sousuke'}
Q = 'query($s:String){Page(perPage:20){characters(search:$s){name{full native alternative} image{large} media(perPage:12){nodes{title{romaji english}}}}}}'


def anilist(name, sub):
    q = ALIAS.get(name, bare(name))
    d = get('https://graphql.anilist.co', json.dumps({'query': Q, 'variables': {'s': q}}).encode(), host_gap=0.8, headers={'Content-Type': 'application/json', 'Accept': 'application/json'})
    if not d:
        return None
    keys = FRANCHISE.get(sub, [])
    chars = (d.get('data') or {}).get('Page', {}).get('characters', [])
    # le nom exact d'abord (« Nagato » avant « Yuki Nagato »)
    chars.sort(key=lambda ch: fold(ch['name']['full']) != fold(q))
    for ch in chars:
        titles = ' '.join(fold(t) for n in ch['media']['nodes'] for t in (n['title']['romaji'], n['title']['english']) if t)
        if keys and not any(fold(k) in titles for k in keys):
            continue
        img = (ch.get('image') or {}).get('large') or ''
        if img and 'default' not in img:
            return img, 'anilist'
    return None


# ── Wikipédia ───────────────────────────────────────────────────────────────────────────────────────────────────────
DOMAIN = {
    'catch': ['catch', 'lutte', 'wrestl', 'aew', 'wwe', 'njpw', 'puroresu'],
    'paralympiques': ['paralymp', 'handisport', 'para-', 'para '],
    'marvel': ['marvel', 'x-men', 'mutant', 'super-h', 'superh', 'comic'],
    'fast-furious': ['fast', 'furious', 'film', 'automobile', 'voiture', 'car '],
    'voitures-europeennes': ['automobile', 'voiture', 'car', 'coupé', 'berline', 'sport'], 'voitures-americaines': ['automobile', 'voiture', 'car', 'muscle', 'coupé'],
    'voitures-asiatiques': ['automobile', 'voiture', 'car', 'coupé', 'sport'], 'voitures-francaises': ['automobile', 'voiture', 'car', 'coupé', 'berline'],
    'ghibli': ['ghibli', 'réalisat', 'composit', 'animat', 'director', 'composer'],
    'asterix-obelix-films': ['astérix', 'asterix', 'chien', 'dog'], 'jv-gta': ['grand theft auto', 'jeu vidéo', 'video game'],
    'jv-wakfu': ['wakfu'], 'jv-dofus': ['dofus'],
}
FF = {'Fast and Furious': 'Fast and Furious (film)', 'Fast and Furious 4': 'Fast and Furious 4', 'Fast and Furious: Tokyo Drift': 'Fast and Furious: Tokyo Drift'}


def wiki(name, sub):
    keys = DOMAIN.get(sub)
    if keys is None:
        return None
    titles = [FF.get(name, name), bare(name)]
    if sub == 'catch':
        titles += [bare(name) + ' (catcheur)', bare(name) + ' (wrestler)', bare(name) + ' (catcheuse)']
    if sub == 'marvel':
        titles += [bare(name) + ' (comics)', bare(name) + ' (Marvel Comics)', bare(name) + ' (personnage)']
    if sub == 'fast-furious':
        titles += [bare(name) + ' (personnage)', bare(name) + ' (Fast and Furious)']
    seen = set()
    for lang in ('fr', 'en'):
        for t in titles:
            if (lang, t) in seen:
                continue
            seen.add((lang, t))
            u = f'https://{lang}.wikipedia.org/w/api.php?' + urllib.parse.urlencode({'action': 'query', 'titles': t, 'prop': 'pageimages|pageprops|extracts', 'piprop': 'original|thumbnail', 'pithumbsize': 900, 'exintro': 1, 'explaintext': 1, 'exchars': 600, 'redirects': 1, 'format': 'json'})
            d = get(u, host_gap=0.3)
            if not d:
                continue
            for p in (d.get('query') or {}).get('pages', {}).values():
                if 'missing' in p or 'disambiguation' in (p.get('pageprops') or {}):
                    continue
                txt = fold(p.get('extract', ''))
                if not any(fold(k) in txt for k in keys):
                    continue
                img = (p.get('thumbnail') or {}).get('source') or (p.get('original') or {}).get('source')
                if img and not img.lower().endswith(('.svg', '.svg.png')) and 'logo' not in img.lower():
                    return img, f'wikipedia-{lang}'
    return None


# ── Liquipedia ──────────────────────────────────────────────────────────────────────────────────────────────────────
def liquipedia(name, sub):
    wikis = {'esport-lol': ['leagueoflegends'], 'esport-cs': ['counterstrike', 'valorant']}.get(sub)
    if not wikis:
        return None
    for wikiname, t in [(w, t) for w in wikis for t in (bare(name), name)]:
        d = get(f'https://liquipedia.net/{wikiname}/api.php?' + urllib.parse.urlencode({'action': 'query', 'titles': t, 'prop': 'pageprops', 'redirects': 1, 'format': 'json'}), host_gap=2.2)
        for p in ((d or {}).get('query') or {}).get('pages', {}).values():
            pp = p.get('pageprops') or {}
            img = pp.get('metaimageurl', '')
            if img and 'Liquipedia_logo' not in img and 'default' not in img.lower() and 'logo' not in img.lower():
                return img, 'liquipedia'
    return None


# ── Genshin (gi.yatta.moe) ──────────────────────────────────────────────────────────────────────────────────────────
_gi = None


def genshin(name, sub):
    global _gi
    if sub != 'jv-genshin-impact':
        return None
    if _gi is None:
        _gi = {}
        for lang in ('fr', 'en'):
            d = get(f'https://gi.yatta.moe/api/v2/{lang}/avatar') or {}
            for it in (d.get('data') or {}).get('items', {}).values():
                _gi.setdefault(fold(it['name']), it['icon'])
    alias = {'nomade wanderer': 'le vagabond', 'colombina': 'columbina', 'shogun raiden': 'raiden shogun', 'tartaglia': 'tartaglia'}
    k = fold(bare(name))
    icon = _gi.get(alias.get(k, k)) or _gi.get(k) or next((v for n, v in _gi.items() if k and (n.endswith(' ' + k) or n.startswith(k + ' '))), None)
    if not icon:
        return None
    return f'https://gi.yatta.moe/assets/UI/{icon.replace("UI_AvatarIcon_", "UI_Gacha_AvatarImg_")}.png', 'gi.yatta.moe'


# ── Dofus (DofusDB) ─────────────────────────────────────────────────────────────────────────────────────────────────
def dofus(name, sub):
    if sub != 'jv-dofus':
        return None
    n = bare(name)
    CLASSES = {'Iop', 'Cra', 'Sacrieur', 'Sram', 'Eniripsa', 'Ecaflip', 'Xelor', 'Osamodas', 'Pandawa', 'Feca', 'Sadida', 'Enutrof', 'Roublard', 'Zobal', 'Steamer', 'Eliotrope', 'Huppermage', 'Ouginak', 'Forgelance'}
    alias = {'Xelor': 'Xélor', 'Feca': 'Féca', 'Kralamour Géant': 'Kralamoure Géant'}
    n = alias.get(n, n)
    order = [('breeds', 'shortName.fr')] if bare(name) in CLASSES else [('items', 'name.fr'), ('monsters', 'name.fr')] if 'dofus' in n.lower() or n in ('Dolmanax', 'Dofawa') else [('monsters', 'name.fr'), ('items', 'name.fr')]
    for ep, f in order:
        d = get(f'https://api.dofusdb.fr/{ep}?' + urllib.parse.urlencode({f: n, '$limit': 3}), host_gap=0.3)
        for it in (d or {}).get('data', []):
            img = it.get('img') or it.get('gfxUrl') or ''
            if ep == 'breeds':
                img = it.get('imgTransparent') or it.get('img') or ''
            if img:
                return img, f'dofusdb-{ep}'
    return None


# ── Élite (TVmaze) ──────────────────────────────────────────────────────────────────────────────────────────────────
_elite = None


def tvmaze(name, sub):
    global _elite
    if sub != 'elite':
        return None
    if _elite is None:
        _elite = {}
        s = get('https://api.tvmaze.com/singlesearch/shows?q=elite') or {}
        for c in get(f'https://api.tvmaze.com/shows/{s.get("id", 0)}/cast') or []:
            ch, pe = c.get('character') or {}, c.get('person') or {}
            img = (ch.get('image') or pe.get('image') or {}).get('original')
            if img:
                for part in [ch.get('name', '')] + ch.get('name', '').split():
                    _elite.setdefault(fold(part), img)
    k = fold(bare(name))
    img = _elite.get(k) or _elite.get(k.split()[0] if k else '')
    return (img, 'tvmaze') if img else None


ORDER = [anilist, genshin, dofus, liquipedia, tvmaze, wiki]
ANIME = set(FRANCHISE)


def main():
    log = json.load(open(LOG, encoding='utf-8')) if os.path.exists(LOG) else {}
    todo = [r for r in cards() if not r[4] and (not ONLY or r[0] == ONLY) and (r[1] not in log or (RETRY and 'miss' in log[r[1]]))]
    todo.sort(key=lambda r: -r[3])  # 6★ et 5★ d'abord
    done = 0
    for sub, cid, name, stars, _f, _a in todo:
        if time.time() - T0 > BUDGET:
            break
        if sub == 'jv-summoners-war' or (sub == 'jv-wakfu' and stars < 1):
            log[cid] = {'miss': ['aucune source (icônes 102 px)']}
            continue
        tried, got = [], None
        for fn in ORDER:
            if fn is anilist and sub not in ANIME:
                continue
            try:
                got = fn(name, sub)
            except Exception as e:
                got = None
            tried.append(fn.__name__)
            if got:
                break
        if got:
            url, src = got
            blob = get(url, js=False, host_gap=0.3)
            m = mod(cid)
            slug = re.sub(r'^(pop|spt|jv|auto)-', '', cid)
            base = slug
            out = getattr(m, 'OUT', None)
            if out and any(os.path.exists(os.path.join(out, base + e)) for e in ('.jpg', '.png')):
                base = slug + '-e8'
            saved = m.save({'file': base, 'type': 'Personnage', 'name': name}, blob) if blob else None
            if saved:
                log[cid] = {'file': saved[0], 'art': saved[1], 'src': f'{src}:{url}'}
                done += 1
                print(f'  ✓ {stars}★ {cid} ← {src}')
                json.dump(log, open(LOG, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
                continue
            tried.append(f'{src} (image refusée)')
        log[cid] = {'miss': tried}
        print(f'  ✗ {stars}★ {cid} ({", ".join(tried)})')
        json.dump(log, open(LOG, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    left = sum(1 for r in cards() if not r[4] and r[1] not in log)
    print(f'+{done} images · {sum(1 for v in log.values() if "file" in v)} trouvées · {sum(1 for v in log.values() if "miss" in v)} sans · {left} à tenter')


if __name__ == '__main__':
    main()
