#!/usr/bin/env python3
"""
(version anglaise, lot 5) CATALOGUE EN ANGLAIS — génère src/core/sets/*.en.ts (noms anglais des cartes, sous-thèmes,
groupes et types), chargés par le jeu SEULEMENT en anglais. Les identifiants ne changent jamais : on ne fait qu'associer
un nom anglais à un id existant. Une carte absente des tables garde son nom actuel.

  python3 scripts/make-catalogue-en.py fetch    → scripts/data/en/*.json (sources officielles, une fois)
  python3 scripts/make-catalogue-en.py build    → src/core/sets/*.en.ts + donnees/suivi/traduction-a-verifier.xlsx

Sources (`fetch`) :
  - Pokémon : noms officiels anglais (PokéAPI, pokemon_species_names.csv sur GitHub), par n° de Pokédex ;
  - League of Legends : Data Dragon en_US (championFull.json : champions et skins), par `<IdDataDragon>_<n>` ;
  - Valorant : valorant-api.com en-US (agents, skins), par uuid ;
  - Pop Culture / Sport : titre de l'article anglais de Wikipédia lié à l'article français du même nom (langlinks),
    sinon le nom actuel ; chansons, albums et artistes gardent leur nom d'origine ;
  - CS : rien (noms anglais du marché Steam).
Traductions faites à la main (`build`) : scripts/data/en/manuel-*.json (Monde, sous-thèmes, groupes, types).
"""
import csv, io, json, os, re, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'scripts', 'data', 'en')
SETS = os.path.join(ROOT, 'src', 'core', 'sets')
UA = {'User-Agent': 'bebou-card-game/1.0 (catalogue en anglais)'}


def get(url, as_json=True, tries=8):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                b = r.read()
            return json.loads(b) if as_json else b.decode('utf-8')
        except Exception as e:  # (réseau capricieux, ou « trop de requêtes » : on attend et on réessaie)
            if i == tries - 1:
                raise
            wait = int(getattr(e, 'headers', {}).get('Retry-After', 0) or 0) if hasattr(e, 'headers') and e.headers else 0
            time.sleep(max(wait, 5 * (i + 1) ** 2))


def save(name, obj):
    os.makedirs(DATA, exist_ok=True)
    with open(os.path.join(DATA, name), 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, indent=0, sort_keys=True)
    print(f'{name} : {len(obj)} entrées')


def ts_rows(path, pattern):
    """Lignes RAW d'un catalogue généré (lecture seule)."""
    return re.findall(pattern, open(os.path.join(SETS, path), encoding='utf-8').read())


def fetch_pokemon():
    txt = get('https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon_species_names.csv', as_json=False)
    en = {}
    for row in csv.DictReader(io.StringIO(txt)):
        if row['local_language_id'] == '9':
            en[int(row['pokemon_species_id'])] = row['name']
    out = {}
    for dex, slug in ts_rows('pokemon151.ts', r"\[(\d+), '([^']+)', "):
        if int(dex) in en:
            out[f'pkm-{slug}'] = en[int(dex)]
    save('pokemon.json', out)


def fetch_lol():
    ver = get('https://ddragon.leagueoflegends.com/api/versions.json')[0]
    full = get(f'https://ddragon.leagueoflegends.com/cdn/{ver}/data/en_US/championFull.json')['data']
    out = {}
    for cid, c in full.items():
        for s in c['skins']:
            out[f"lol-{cid}_{s['num']}"] = c['name'] if s['num'] == 0 or s['name'] == 'default' else s['name']
    # (le catalogue écrit « <skin> » : on ne garde que les ids qui existent)
    ids = {f'lol-{slug}' for slug in ts_rows('lol.ts', r"\[\d+, '([^']+)'")}
    save('lol.json', {k: v for k, v in out.items() if k in ids})


def fetch_valorant():
    out = {}
    for a in get('https://valorant-api.com/v1/agents?language=en-US&isPlayableCharacter=true')['data']:
        out[f"val-{a['uuid']}"] = a['displayName']
    for s in get('https://valorant-api.com/v1/weapons/skins?language=en-US')['data']:
        out[f"val-{s['uuid']}"] = s['displayName'].strip()
    ids = {f'val-{u}' for u in ts_rows('valorant.ts', r"\[\d+, '([0-9a-f-]{36})'")}
    save('valorant.json', {k: v for k, v in out.items() if k in ids})


def wiki_langlinks(names, on_batch=None):
    """(voir fetch_wiki)"""
    """titre français → titre anglais (Wikipédia, articles liés), par lots de 50 ; les pages d'homonymie sont ignorées."""
    out = {}
    names = sorted(set(names))
    for i in range(0, len(names), 50):
        chunk = names[i:i + 50]
        q = urllib.parse.urlencode({'action': 'query', 'format': 'json', 'redirects': 1, 'prop': 'langlinks|pageprops', 'lllang': 'en',
                                    'ppprop': 'disambiguation', 'lllimit': 'max', 'titles': '|'.join(chunk)})
        d = get('https://fr.wikipedia.org/w/api.php?' + q)['query']
        back = {}  # titre de page → nom(s) demandé(s)
        norm = {n['to']: n['from'] for n in d.get('normalized', [])}
        red = {r['to']: r['from'] for r in d.get('redirects', [])}
        for pg in d.get('pages', {}).values():
            if 'missing' in pg or 'disambiguation' in pg.get('pageprops', {}):
                continue
            ll = pg.get('langlinks')
            if not ll:
                continue
            t = pg['title']
            src = red.get(t, t)
            src = norm.get(src, src)
            en = ll[0]['*']
            out[src] = en
        if on_batch:
            on_batch(chunk, out)
        if i % 1000 == 0:
            print(f'  wikipédia : {i + len(chunk)} / {len(names)}', flush=True)
        time.sleep(2.5)
    return out


def fetch_wiki(path, skip_groups=()):
    src = open(os.path.join(SETS, path), encoding='utf-8').read()
    subs = re.findall(r'\{ id: "([^"]+)", label: "[^"]*", code: "[^"]*", group: "([^"]+)" \}', src)
    rows = re.findall(r'^  \[(\d+), \d+, "([^"]+)", "((?:[^"\\]|\\.)*)",', src, re.M)
    keep = [(cid, json.loads(f'"{name}"')) for s, cid, name in rows if subs[int(s)][1] not in skip_groups]
    tag = os.path.splitext(path)[0]
    cache_p = os.path.join(DATA, f'wiki-{tag}.json')
    cache = json.load(open(cache_p, encoding='utf-8')) if os.path.exists(cache_p) else {}
    todo = [n for _, n in keep if n not in cache]
    print(f'{path} : {len(keep)} cartes, {len(todo)} noms à demander')
    def on_batch(chunk, found):  # (cache écrit à chaque lot : on reprend où on s'est arrêté)
        for n in chunk:
            cache[n] = found.get(n, '')
        with open(cache_p, 'w', encoding='utf-8') as f:
            json.dump(cache, f, ensure_ascii=False, indent=0, sort_keys=True)
    if todo:
        wiki_langlinks(todo, on_batch)
    save(f'wiki-{tag}.json', cache)


FRW = re.compile(r"(\b(le|la|les|de|du|des|et|un|une|au|aux|en|sur|dans|pour|avec|sans|équipe|coupe|championnat|tour|jeux|grand|petit|roi|reine|prince|princesse|monsieur|madame|capitaine|docteur|professeur)\b|\bl’|\bd’|\bl'|\bd'|tch|ï|ë|[àâçéèêîôûùüÿœæ])", re.I)


def wiki_candidates(cat):
    """Noms à demander à Wikipédia : titres des sous-thèmes Pop et Sport (films, séries, clubs…) et cartes Sport qui ont
    l'air françaises (accents, articles, « tch »…). Les personnages francisés de la Pop (« Dark Vador ») sont traduits à
    la main (manuel-cartes-*.json). Musique : jamais (titres et artistes d'origine)."""
    subs = cat['subs']
    out = set()
    for c in cat['cards'].values():
        g = subs.get(c['sub'], {}).get('group')
        if c['theme'] == 'sport' and FRW.search(c['name']):
            out.add(c['name'])
    for s in subs.values():  # (titres des sous-thèmes Pop et Sport : films, séries, clubs…)
        if s['theme'] in ('pop', 'sport') and s.get('group') != 'musique':
            out.add(s['label'])
    return sorted(out)


def fetch_wiki():
    cat = json.load(open(os.path.join(ROOT, '.claude-tmp', 'catalogue-fr.json'), encoding='utf-8'))
    cache_p = os.path.join(DATA, 'wikipedia.json')
    cache = json.load(open(cache_p, encoding='utf-8')) if os.path.exists(cache_p) else {}
    for old in ('wiki-sport.json', 'wiki-popculture.json'):  # (premiers essais)
        if os.path.exists(os.path.join(DATA, old)):
            cache.update({k: v for k, v in json.load(open(os.path.join(DATA, old), encoding='utf-8')).items() if k not in cache})
    todo = [n for n in wiki_candidates(cat) if n not in cache]
    print(f'wikipédia : {len(todo)} noms à demander ({len(cache)} déjà connus)', flush=True)
    def on_batch(chunk, found):
        for n in chunk:
            cache[n] = found.get(n, '')
        with open(cache_p, 'w', encoding='utf-8') as f:
            json.dump(cache, f, ensure_ascii=False, indent=0, sort_keys=True)
    if todo:
        wiki_langlinks(todo, on_batch)
    save('wikipedia.json', cache)


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'build'
    if cmd == 'fetch':
        only = sys.argv[2:] or ['pokemon', 'lol', 'valorant']
        for k in only:
            globals()[f'fetch_{k}']()
    elif cmd == 'build':
        build()
    else:
        sys.exit(__doc__)


def fold(x):
    import unicodedata
    x = unicodedata.normalize('NFD', x)
    x = ''.join(ch for ch in x if unicodedata.category(ch) != 'Mn').lower()
    return re.sub(r'[^a-z0-9]+', ' ', x).strip()


def wiki_pick(fr, en, is_title):
    """Titre Wikipédia anglais → (nom retenu | None, raison si à vérifier)."""
    import difflib
    if not en:
        return None, None
    e = re.sub(r'\s*\([^)]*\)$', '', en).strip()  # (« Naruto (TV series) » → « Naruto »)
    if not e or fold(e) == fold(fr):
        return None, None
    if len(fr) <= 3 or re.match(r'^(AD|BC) \d', e):
        return None, f'Wikipédia : « {en} » (nom trop court ou ambigu)'
    if difflib.SequenceMatcher(None, fold(fr), fold(e)).ratio() >= 0.6 or (is_title and FRW.search(fr)):
        return e, None
    return None, f'Wikipédia propose « {en} » (très différent du français : non appliqué)'


SET_OF = [  # (fichier généré, test sur l'id ou le thème)
    ('pokemon151', lambda k, c: k.startswith('pkm-')),
    ('lol', lambda k, c: k.startswith('lol-')),
    ('valorant', lambda k, c: k.startswith('val-')),
    ('jeuxvideo', lambda k, c: k.startswith('jv-')),
    ('monde', lambda k, c: c['theme'] == 'monde'),
    ('popculture', lambda k, c: c['theme'] == 'pop'),
    ('sport', lambda k, c: c['theme'] == 'sport'),
]


def ts_obj(d):
    return '{\n' + ''.join(f'  {json.dumps(k, ensure_ascii=False)}: {json.dumps(v, ensure_ascii=False)},\n' for k, v in sorted(d.items())) + '}'


def build():
    import subprocess
    tmp = os.path.join(ROOT, '.claude-tmp')
    os.makedirs(tmp, exist_ok=True)
    subprocess.run(['npx', 'esbuild', 'scripts/i18n/dump-catalogue.ts', '--bundle', '--platform=node', '--log-level=warning',
                    f'--outfile={tmp}/dump.cjs'], cwd=ROOT, check=True)
    cat = json.loads(subprocess.run(['node', f'{tmp}/dump.cjs'], cwd=ROOT, check=True, capture_output=True).stdout)
    cards, subs = cat['cards'], cat['subs']
    en, check = {}, []  # id → anglais ; (id, FR, EN proposé, raison)

    def put(k, v, src):
        if v and k in cards and v.strip() != cards[k]['name']:
            en[k] = v.strip()

    for f in ('pokemon.json', 'lol.json', 'valorant.json'):
        for k, v in json.load(open(os.path.join(DATA, f), encoding='utf-8')).items():
            put(k, v, f)
    wiki = json.load(open(os.path.join(DATA, 'wikipedia.json'), encoding='utf-8')) if os.path.exists(os.path.join(DATA, 'wikipedia.json')) else {}
    for k, c in cards.items():
        if c['theme'] == 'sport' and c['name'] in wiki:
            v, why = wiki_pick(c['name'], wiki[c['name']], False)
            if v:
                put(k, v, 'wiki')
            elif why:
                check.append((k, c['name'], re.sub(r'\s*\([^)]*\)$', '', wiki[c['name']]), why))
    manual = sorted(f for f in os.listdir(DATA) if f.startswith('manuel-cartes-'))
    for f in manual:
        m = json.load(open(os.path.join(DATA, f), encoding='utf-8'))
        for k, v in m['names'].items():
            put(k, v, f)
        for k, why in m.get('uncertain', {}).items():
            if k in cards:
                check.append((k, cards[k]['name'], m['names'].get(k, ''), why))
    lab = json.load(open(os.path.join(DATA, 'manuel-libelles.json'), encoding='utf-8'))
    sub_en = {k: v for k, v in lab['subs'].items() if v}
    for k, s in subs.items():
        if s['theme'] in ('pop', 'sport') and s.get('group') != 'musique' and k not in sub_en and s['label'] in wiki:
            v, why = wiki_pick(s['label'], wiki[s['label']], True)
            if v:
                sub_en[k] = v
            elif why:
                check.append((k, s['label'], re.sub(r'\s*\([^)]*\)$', '', wiki[s['label']]), why))
    for k, why in lab.get('uncertain', {}).items():
        check.append((k, subs.get(k, {}).get('label', k), sub_en.get(k, ''), why))
    sub_en = {k: v for k, v in sub_en.items() if k in subs and v != subs[k]['label']}

    # ── fichiers générés ──
    head = '/**\n * {what} — GÉNÉRÉ par scripts/make-catalogue-en.py (ne pas éditer à la main). Chargé par le jeu SEULEMENT en\n * anglais (src/core/sets/catalog.en.ts). Id de carte → nom anglais, seulement quand il diffère du nom actuel.\n */\n'
    total = 0
    for name, test in SET_OF:
        part = {k: v for k, v in en.items() if test(k, cards[k])}
        total += len(part)
        with open(os.path.join(SETS, f'{name}.en.ts'), 'w', encoding='utf-8') as f:
            f.write(head.format(what=f'Noms anglais des cartes ({name}.ts, {len(part)} cartes)') + f'export const EN: Record<string, string> = {ts_obj(part)};\n')
    with open(os.path.join(SETS, 'themes.en.ts'), 'w', encoding='utf-8') as f:
        f.write(head.format(what='Libellés anglais des sous-thèmes, groupes et types') +
                f'export const SUBS: Record<string, string> = {ts_obj(sub_en)};\n\n'
                f'export const GROUPS: Record<string, string> = {ts_obj(lab["groups"])};\n\n'
                f'/** type imprimé sur la carte (en français) → anglais */\nexport const TYPES: Record<string, string> = {ts_obj(lab["types"])};\n')
    imports = ''.join(f"import {{ EN as {n} }} from './{n}.en';\n" for n, _ in SET_OF)
    with open(os.path.join(SETS, 'catalog.en.ts'), 'w', encoding='utf-8') as f:
        f.write(head.format(what='CATALOGUE EN ANGLAIS (tout)') + "import type { CatalogLang } from './themesCore';\n" + imports +
                "import { GROUPS, SUBS, TYPES } from './themes.en';\n\n"
                f"export const CATALOG_EN: CatalogLang = {{ cards: {{ {', '.join('...' + n for n, _ in SET_OF)} }}, subs: SUBS, groups: GROUPS, types: TYPES }};\n")
    # ── à vérifier ──
    import openpyxl
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = 'À vérifier'
    ws.append(['id', 'FR', 'EN proposé', 'raison'])
    for row in sorted(check):
        ws.append(list(row))
    for col, w in zip('ABCD', (44, 40, 40, 70)):
        ws.column_dimensions[col].width = w
    out = os.path.join(ROOT, 'donnees', 'suivi', 'traduction-a-verifier.xlsx')
    wb.save(out)
    print(f'{total} cartes en anglais · {len(sub_en)} sous-thèmes · {len(lab["groups"])} groupes · {len(lab["types"])} types · {len(check)} à vérifier → {os.path.relpath(out, ROOT)}')


if __name__ == '__main__':
    main()
