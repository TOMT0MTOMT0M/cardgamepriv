"""
Importe les images trouvées pour les cartes SANS illustration (suivi : donnees/suivi/Cartes-sans-image*.xlsx) dans les
données du jeu : chaque image passe par la fonction save() du script de son thème (même dossier, même nommage, même
miniature WebP, même détection photo / détouré), puis la source est notée dans le journal de récolte du thème
(« fill »). Relancer ensuite le gen des quatre thèmes (fait par --gen).

  python scripts/fill-images.py <dossier>[,<dossier>…] [--only jv|pop|spt|monde] [--budget 150] [--gen]

<dossier> = un dossier de récolte : results.json (ou wiki.json) { id: {file, src} } + img/<fichier>.
Sources utilisées (voir LAB_NOTES « Images manquantes ») : Deezer, YGOPRODeck, wikis Fandom, TVmaze, YouTube,
iNaturalist, Wikipédia (titre exact), et en dernier recours une recherche d'images vérifiée à la main.
"""
import sys, os, json, time, importlib.util

T0 = time.time()
BUDGET = float(sys.argv[sys.argv.index('--budget') + 1]) if '--budget' in sys.argv else 1e9
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TRI = os.path.join(ROOT, 'donnees', 'tri-etoiles')


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, os.path.join(ROOT, 'scripts', file))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


THEMES = {  # préfixe d'id → (module, Excel du tri)
    'jv': ('make-jeux-video.py', 'Tri-etoiles-jeux-video.xlsx'),
    'pop': ('make-pop.py', 'Tri-etoiles-popculture.xlsx'),
    'spt': ('make-sport.py', 'Tri-etoiles-sport.xlsx'),
    'monde': ('make-monde-v2.py', 'Tri-etoiles-monde_2.xlsx'),
}
MONDE = ('zoo', 'miam', 'geo', 'auto', 'ard', 'mrv')


def theme_of(cid):
    p = cid.split('-', 1)[0]
    return 'monde' if p in MONDE else p


def cards_of(mod, xlsx):
    if hasattr(mod, 'build'):
        r = mod.build(xlsx)
    else:
        r = mod.read_rows(xlsx)
    cards = r[0] if isinstance(r, tuple) else r
    return {c['id']: c for c in cards}


def main():
    a = sys.argv[1:]
    dirs = a[0].split(',')
    found = {}
    for d in dirs:
        for jf in ('results.json', 'wiki.json', 'manual.json'):
            p = os.path.join(d, jf)
            if os.path.exists(p):
                j = json.load(open(p, encoding='utf-8'))
                j = j.get('res', j)
                for cid, v in j.items():
                    if v.get('file') and cid not in found and os.path.exists(os.path.join(d, 'img', v['file'])):
                        found[cid] = (os.path.join(d, 'img', v['file']), v.get('src', ''))
    print(f'{len(found)} images à importer')
    by = {}
    for cid in found:
        by.setdefault(theme_of(cid), []).append(cid)
    only = a[a.index('--only') + 1] if '--only' in a else None
    for th, ids in by.items():
        if only and th != only:
            continue
        if th not in THEMES:
            print(f'  thème inconnu pour {ids[:3]}…')
            continue
        mod = load(th, THEMES[th][0])
        xlsx = os.path.join(TRI, THEMES[th][1])
        cards = cards_of(mod, xlsx)
        log = mod.load_log()
        n = 0
        for cid in ids:
            c = cards.get(cid)
            if not c or (log.get(cid) or {}).get('file'):
                continue  # carte inconnue, ou image arrivée entre-temps
            path, src = found[cid]
            saved = mod.save(c, open(path, 'rb').read())
            if saved:
                log[cid] = {'file': saved[0], 'art': saved[1], 'src': f'fill:{src}', 't': int(time.time())}
                n += 1
                if n % 150 == 0:
                    mod.write_log(log)
            if time.time() - T0 > BUDGET:
                break
        mod.write_log(log)
        print(f'  {th} : {n} images importées')
        if '--gen' in a:
            mod.gen(xlsx)


if __name__ == '__main__':
    main()
