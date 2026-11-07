"""
RÉ-ILLUSTRATION de cartes déjà en jeu (suivi « Cartes à ré-illustrer », 07/11) : remplace l'illustration de chaque carte
par l'image fournie, puis regénère les thèmes touchés. Après : lanceurs\\push-et-mettre-en-ligne.cmd (r2-sync inclus).

  python scripts/reillustrer.py donnees/suivi/a-reillustrer [--dry] [--no-gen]

Le dossier contient les nouvelles images, nommées EXACTEMENT comme la carte (« Pikachu.png ») — même principe que le
dossier des 42 : si deux cartes portent le même nom, suffixe « — sous-thème » (« Lapis — Magic Knight.png »).
Un fichier nommé par l'id de la carte (« pop-thriller.jpg ») marche aussi, et un manifest.json { fichier: id } passe
avant tout (c'est ce que fournit le registre en ligne).

SOURCE UNIQUE (cf. bug du placeholder) : la nouvelle image reçoit un NOUVEAU nom de fichier (« …-r2611071830.jpg ») et sa
miniature aussi. Tout ce qui affiche la carte (collection, vitrine, détail, ouverture, échanges) lit le même champ `file`
du catalogue et le cache des cartes peintes a ce nom dans sa clé : l'ancienne image ne peut plus ressortir nulle part,
ni depuis le cache du navigateur, ni depuis le cache HTTP de 7 jours d'une image « même nom ».

Thèmes gérés : Jeux vidéo, Pop Culture, Sport, World (save() de leur script, comme scripts/fill-images.py).
Pokémon, LoL, Valorant, CS, Bébous : sets écrits à la main → listés « à faire à la main ».
Journal : donnees/suivi/reillustrees.json (id → fichier, image source, date) — sert à passer les lignes en « EN LIGNE ».
"""
import importlib.util, json, os, re, sys, time, unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TRI = os.path.join(ROOT, 'donnees', 'tri-etoiles')
JOURNAL = os.path.join(ROOT, 'donnees', 'suivi', 'reillustrees.json')
IMG = ('.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.bmp')


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, os.path.join(ROOT, 'scripts', file))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


FILL = load('fill_images', 'fill-images.py')  # THEMES, theme_of, cards_of : mêmes règles que l'import des images manquantes


def fold(s):
    s = unicodedata.normalize('NFKD', str(s).lower()).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()


def main():
    a = sys.argv[1:]
    if not a or a[0].startswith('--'):
        print(__doc__)
        sys.exit(1)
    src, dry, gen = a[0], '--dry' in a, '--no-gen' not in a
    files = sorted(f for f in os.listdir(src) if f.lower().endswith(IMG))
    manifest = json.load(open(os.path.join(src, 'manifest.json'), encoding='utf-8')) if os.path.exists(os.path.join(src, 'manifest.json')) else {}
    # catalogue des 4 gros thèmes : id → (thème, carte), nom replié → [ids]
    mods, cards, by_name = {}, {}, {}
    for th, (script, xlsx) in FILL.THEMES.items():
        mods[th] = (load(th, script), os.path.join(TRI, xlsx))
        for cid, c in FILL.cards_of(*mods[th]).items():
            cards[cid] = (th, c)
            by_name.setdefault(fold(c['name']), []).append(cid)
    plan, errors, manual = {}, [], []
    for f in files:
        stem = os.path.splitext(f)[0]
        cid = manifest.get(f) or (stem if stem in cards or re.match(r'^(pkm|lol|val|cs|bebou|kcdq)-', stem) else None)
        if not cid:
            ids = by_name.get(fold(stem), [])
            m = re.match(r'^(.*\S)\s+[—–-]{1,2}\s+([^—–-]+)$', stem)
            if not ids and m:
                ids = [i for i in by_name.get(fold(m.group(1)), []) if fold(m.group(2)) in fold(cards[i][1].get('sub', ''))]
            if len(ids) != 1:
                errors.append(f'{f} : {"aucune carte de ce nom en Jeux vidéo / Pop / Sport / World (Pokémon, LoL, Valorant, CS : à faire à la main, ou nommer le fichier par l\'id)" if not ids else f"{len(ids)} cartes de ce nom ({", ".join(ids[:4])}) — ajoute « — sous-thème »"}')
                continue
            cid = ids[0]
        if cid not in cards:
            manual.append(f'{f} → {cid}')
            continue
        plan[cid] = f
    print(f'{len(plan)} cartes à ré-illustrer · {len(errors)} fichiers non reconnus · {len(manual)} hors des 4 thèmes')
    for e in errors:
        print('  ✗', e)
    for m in manual:
        print('  ✋ à faire à la main :', m)
    if dry or not plan:
        return
    stamp = time.strftime('%y%m%d%H%M')
    journal = json.load(open(JOURNAL, encoding='utf-8')) if os.path.exists(JOURNAL) else {}
    touched = set()
    for th in mods:
        ids = [cid for cid in plan if cards[cid][0] == th]
        if not ids:
            continue
        mod, xlsx = mods[th]
        log = mod.load_log()
        for cid in ids:
            c = dict(cards[cid][1])
            base = re.sub(r'(-r\d{10})?(\.(png|jpe?g|webp))?$', '', c['file'], flags=re.I)
            c['file'] = f'{base}-r{stamp}'
            saved = mod.save(c, open(os.path.join(src, plan[cid]), 'rb').read())
            if not saved:
                print(f'  ✗ {plan[cid]} : image illisible ou trop petite (≥ 140 px)')
                continue
            log[cid] = {'file': saved[0], 'art': saved[1], 'src': f'reillustre:{plan[cid]}', 't': int(time.time())}
            journal[cid] = {'file': saved[0], 'image': plan[cid], 't': int(time.time())}
            touched.add(th)
            print(f'  ✓ {cid} ← {plan[cid]}')
        mod.write_log(log)
    os.makedirs(os.path.dirname(JOURNAL), exist_ok=True)
    json.dump(journal, open(JOURNAL, 'w', encoding='utf-8'), ensure_ascii=False, indent=1, sort_keys=True)
    if gen:
        for th in touched:
            mod, xlsx = mods[th]
            mod.gen(xlsx)
            print(f'  gen {th} OK')
    print('Suite : lanceurs\\push-et-mettre-en-ligne.cmd (envoie les images sur R2 et met en ligne).')


if __name__ == '__main__':
    main()
