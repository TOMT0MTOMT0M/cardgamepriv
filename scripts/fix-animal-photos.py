"""
World Pack — PHOTOS D'ANIMAUX (retours live 02, bug 5).

Beaucoup de cartes animaux affichaient la carte de répartition de l'espèce (ou une planche d'article scientifique) au lieu
d'une photo : les URL de l'Excel pointent souvent vers des figures d'articles (zenodo.org « figure.png », pensoft.net).
Ce script remplace ces images par une PHOTO de l'animal :

  1. Wikidata : l'espèce (libellé français exact, description « espèce / taxon… ») → image principale P18 (Commons) ;
  2. iNaturalist : le taxon (nom français) → sa photo par défaut ;
  jamais une carte : tout fichier dont le nom évoque une carte / une répartition / une figure est refusé.
  Rien trouvé : l'image est retirée (design typographique) plutôt que de garder une carte.

  python scripts/fix-animal-photos.py [--budget 150] [--all]
    --budget : secondes de travail max par lancement (relancer jusqu'à « reste 0 ») ;
    --all    : retraite aussi les animaux déjà corrigés.
Puis : python scripts/make-monde-v2.py gen donnees/tri-etoiles/Tri-etoiles-monde_2.xlsx (le site lit le journal) — fait automatiquement en fin
de traitement — et la mise en ligne envoie les nouvelles images sur R2 (scripts/r2-sync.mjs).

Journal : scripts/data/monde-harvest.json (champ src = « photo:wikidata:Q…:P18 », « photo:inat:… » ou « photo:none »).
"""
import os, re, sys, json, time, importlib.util, urllib.parse, concurrent.futures as cf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location('mm', os.path.join(ROOT, 'scripts', 'make-monde-v2.py'))
mm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mm)

XLSX = os.path.join(ROOT, 'donnees', 'tri-etoiles', 'Tri-etoiles-monde_2.xlsx')
WD = 'https://www.wikidata.org/w/api.php'
INAT = 'https://api.inaturalist.org/v1/taxa'
# hôtes de figures d'articles (cartes, planches, crânes…) : jamais gardés pour un animal
FIGURE_HOSTS = ('zenodo.org', 'pensoft.net', 'projects.biodiversity.be')
NOT_PHOTO = re.compile(
    r'(map|carte|range|distribution|r[ée]partition|repartition|locator|location|aire[_ -]|area|verbreitung|areal|'
    r'figure|fig[._ -]?\d|plate|planche|skull|cr[âa]ne|skeleton|squelette|drawing|dessin|illustration|diagram|\.svg)',
    re.I,
)
ANIMAL_DESC = ('espèce', 'species', 'taxon', 'genre', 'famille', 'sous-espèce', 'animal', 'dinosaure', 'mammif', 'oiseau', 'poisson',
               'reptile', 'amphibien', 'insecte', 'araignée', 'serpent', 'requin', 'baleine')


def is_figure(c):
    u = c.get('url', '')
    return any(h in u.split('/')[2] for h in FIGURE_HOSTS) if u.startswith('http') else False


def wikidata_photo(c):
    q = re.sub(r'\(.*?\)', '', c['name']).replace('?', '').strip()
    for search in dict.fromkeys([c['name'].replace('?', '').strip(), q]):
        d = mm.get(WD, {'action': 'wbsearchentities', 'search': search, 'language': 'fr', 'uselang': 'fr', 'type': 'item', 'limit': 6, 'format': 'json'})
        for hit in (d or {}).get('search', []):
            label = (hit.get('match') or {}).get('text') or hit.get('label') or ''
            if mm.norm(label) != mm.norm(search):
                continue
            desc = (hit.get('description') or '').lower()
            if not any(w in desc for w in ANIMAL_DESC):
                continue
            e = mm.get(WD, {'action': 'wbgetentities', 'ids': hit['id'], 'props': 'claims', 'format': 'json'})
            claims = ((e or {}).get('entities', {}).get(hit['id'], {}) or {}).get('claims', {})
            for st in claims.get('P18') or []:
                v = st.get('mainsnak', {}).get('datavalue', {}).get('value')
                if not v or NOT_PHOTO.search(v):
                    continue
                b = mm.get('https://commons.wikimedia.org/wiki/Special:FilePath/' + urllib.parse.quote(v.replace(' ', '_')) + '?width=900', binary=True, tries=3)
                if b and len(b) > 3000:
                    return b, f'photo:wikidata:{hit["id"]}:P18'
    return None


def inat_photo(c):
    q = re.sub(r'\(.*?\)', '', c['name']).replace('?', '').strip()
    d = mm.get(INAT, {'q': q, 'locale': 'fr', 'per_page': 5, 'is_active': 'true'})
    for t in (d or {}).get('results', []):
        names = {mm.norm(t.get('preferred_common_name') or ''), mm.norm(t.get('matched_term') or ''), mm.norm(t.get('name') or '')}
        if mm.norm(q) not in names:
            continue
        ph = t.get('default_photo') or {}
        url = ph.get('medium_url') or ph.get('url') or ''
        url = re.sub(r'/(square|small|thumb)\.', '/large.', url)
        if not url:
            continue
        b = mm.get(url, binary=True, tries=3)
        if b and len(b) > 3000:
            return b, f'photo:inat:{t.get("id")}'
    return None


def fix_one(c):
    for fn in (wikidata_photo, inat_photo):
        try:
            res = fn(c)
        except Exception:
            res = None
        if res:
            saved = mm.save(c, res[0])
            if saved:
                return {'file': saved[0], 'art': saved[1], 'src': res[1]}
    return {'file': '', 'art': '', 'src': 'photo:none'}


def main():
    budget = float(sys.argv[sys.argv.index('--budget') + 1]) if '--budget' in sys.argv else 150
    redo = '--all' in sys.argv
    cards, _ = mm.build(XLSX)
    log = mm.load_log()
    todo = []
    for c in cards:
        if not c['id'].startswith('zoo-'):
            continue
        src = log.get(c['id'], {}).get('src', '')
        if src.startswith('photo:') and not redo:
            continue
        # figure d'article, ou nom de fichier d'URL qui annonce une carte
        if (src == 'url' and (is_figure(c) or NOT_PHOTO.search(c['url'].split('/')[-1]))) or (redo and src.startswith('photo:')):
            todo.append(c)
    print(f'{len(todo)} animaux à corriger', flush=True)
    t0, done, found = time.time(), 0, 0
    with cf.ThreadPoolExecutor(6) as ex:
        it = iter(todo)
        running = {}

        def submit():
            c = next(it, None)
            if c and time.time() - t0 < budget:
                running[ex.submit(fix_one, c)] = c

        for _ in range(12):
            submit()
        while running:
            fin, _ = cf.wait(list(running), return_when=cf.FIRST_COMPLETED)
            for f in fin:
                c = running.pop(f)
                r = f.result()
                log[c['id']] = {**r, 't': int(time.time())}
                done += 1
                found += bool(r['file'])
                if done % 25 == 0:
                    mm.write_log(log)
                submit()
    mm.write_log(log)
    left = len(todo) - done
    print(f'+{done} traités en {time.time() - t0:.0f} s · photos trouvées {found} · reste {left}', flush=True)
    if left == 0:
        mm.gen(XLSX)
        print('src/core/sets/monde.ts régénéré', flush=True)


if __name__ == '__main__':
    main()
