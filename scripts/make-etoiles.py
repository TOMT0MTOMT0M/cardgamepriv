"""(24/11) BASE « ETOILES » DE HUGO → couche de catalogue src/core/sets/etoiles.ts (GÉNÉRÉ, ne pas éditer à la main).

La base maître de Hugo (donnees/base/Etoiles-8.xlsx, feuille « Cartes » : Nom | Étoiles | Thème | Sous-thème | Id) est
comparée au catalogue INSTALLÉ sans cette couche (scripts/dump-catalogue.mts --raw). Ce qui diffère devient la couche,
appliquée en dernier par installCatalog (themesCore.ts) — partout à la fois : jeu, serveur, tests, labo :
  - étoiles, noms, sous-thèmes (déplacements, fusions d'albums) des cartes existantes — ids inchangés ;
  - nouveaux sous-thèmes (Ghibli, Singles, Yu-Gi-Oh, foot par poste, voitures par origine, lieux, Dofus, Wakfu) ;
  - nouvelles cartes (ids de la base) et leur illustration (scripts/data/etoiles-images.json, récolte) ;
  - cartes absentes de la base = retirées (doublons / alias) ; celles qui ont un double gardé à une étoile égale ou
    inférieure sont TRANSFÉRÉES à ce double chez les joueurs (migrations:remapCards), les autres purgées.
Le thème « voitures » de la base reste le groupe Voitures du World Pack (pas de 6e booster).
Les Bébous / KCDQ (sets écrits à la main) ne sont pas pris ici.

  npx esbuild scripts/dump-catalogue.mts --bundle --platform=node --format=esm --outfile=.cache/dump-catalogue.mjs
  node .cache/dump-catalogue.mjs .cache/catalogue-brut.json --raw
  python scripts/make-etoiles.py .cache/catalogue-brut.json
"""
import json, os, re, sys, unicodedata, collections, openpyxl
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = os.path.join(ROOT, 'donnees', 'base', 'Etoiles-8.xlsx')
IMAGES = os.path.join(ROOT, 'scripts', 'data', 'etoiles-images.json')
OUT = os.path.join(ROOT, 'src', 'core', 'sets', 'etoiles.ts')
R = ['', 'common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'secret']
THEME = {'voitures': 'monde'}
# nouveaux sous-thèmes : libellé, code, groupe, libellé anglais
NEW_SUBS = {
    'ghibli': ('Studio Ghibli', 'GHI', 'films', 'Studio Ghibli'),
    'single': ('Singles', 'SGL', 'musique', 'Singles'),
    'yugioh': ('Yu-Gi-Oh', 'YGO', 'anime', 'Yu-Gi-Oh'),
    'football-attaquants': ('Football — Attaquants', 'FAT', 'foot', 'Football — Forwards'),
    'football-milieux': ('Football — Milieux', 'FMI', 'foot', 'Football — Midfielders'),
    'football-defenseurs': ('Football — Défenseurs', 'FDE', 'foot', 'Football — Defenders'),
    'football-gardiens': ('Football — Gardiens', 'FGA', 'foot', 'Football — Goalkeepers'),
    'football-entraineurs': ('Football — Entraîneurs', 'FEN', 'foot', 'Football — Managers'),
    'lieux': ('Pays, régions & départements', 'PAY', 'lieux', 'Countries & French regions'),
    'voitures-europeennes': ('Voitures européennes', 'VOE', 'voitures', 'European cars'),
    'voitures-americaines': ('Voitures américaines', 'VOA', 'voitures', 'American cars'),
    'voitures-asiatiques': ('Voitures asiatiques', 'VAS', 'voitures', 'Asian cars'),
    'jv-dofus': ('Dofus', 'DOF', 'jeux-video', 'Dofus'),
    'jv-wakfu': ('Wakfu', 'WAK', 'jeux-video', 'Wakfu'),
}
# doublons sans nom commun (journal de Hugo, vérifiés à la main)
MANUAL_REMAP = {
    'spt-fc-barcelona': 'spt-fc-barcelone', 'pop-majin-boo': 'pop-boo', 'pop-shen-long': 'pop-shenron',
    'jv-genshin-impact-aether-lumine': 'jv-genshin-impact-voyageur-aether', 'jv-genshin-impact-childe-tartaglia': 'jv-genshin-impact-tartaglia',
    'jv-genshin-impact-wanderer-genshin': 'jv-genshin-impact-nomade-wanderer',
}


def fold(s):
    return re.sub(r'[^a-z0-9]+', ' ', unicodedata.normalize('NFKD', str(s).lower()).encode('ascii', 'ignore').decode()).strip()


base = lambda n: fold(re.sub(r'\s*\(.*?\)', '', n))


def main():
    raw = json.load(open(sys.argv[1], encoding='utf-8'))
    A = {c['id']: c for c in raw['cards'] if c['theme'] != 'bebous'}
    subs = {s['id']: s for s in raw['subs']}
    wb = openpyxl.load_workbook(BASE, read_only=True)
    B = {}
    for r in list(wb['Cartes'].iter_rows(values_only=True))[1:]:
        if not r[4] or r[2] == 'bebous':
            continue
        assert r[4] not in B, f'id en double dans la base : {r[4]}'
        B[r[4]] = (str(r[0]).strip(), int(r[1]), THEME.get(r[2], r[2]), r[3])
    log = [r for r in wb['Mise à jour'].iter_rows(values_only=True) if r[0] and 'SUPPRESSION' in str(r[0]).upper()]
    imgs = json.load(open(IMAGES, encoding='utf-8')) if os.path.exists(IMAGES) else {}
    # contrôles : sous-thèmes connus, thème cohérent
    for k, (n, st, th, sb) in B.items():
        assert sb in subs or sb in NEW_SUBS, f'sous-thème inconnu {sb} ({k})'
        want = subs[sb]['theme'] if sb in subs else None
        if want and k in A:
            assert want == th, f'{k} : thème {th} ≠ {want}'
    rerate, rename, resub, add = {}, {}, {}, []
    for k, (n, st, th, sb) in B.items():
        if k in A:
            a = A[k]
            # (v2.1.17, Hugo) les Merveilles ne sont plus secrètes : la base les note 6★, elles le deviennent
            if R[st] != a['rarity']:
                rerate[k] = R[st]
            if n != a['name']:
                rename[k] = n
            if sb != a['sub']:
                resub[k] = sb
        else:
            im = imgs.get(k) or {}
            add.append((sb, k, n, st, im.get('file', ''), im.get('art', '')))
    gone = [k for k in A if k not in B]
    # albums déplacés EN ENTIER (Chansons → Singles, Pays / Régions / Départements → lieux…) : une ligne par album au lieu
    # d'une par carte (catalogue plus léger : ~3 500 lignes de moins)
    by_sub = collections.defaultdict(set)
    for k in A:
        if k in B:
            by_sub[A[k]['sub']].add(B[k][3])
    submove = {o: next(iter(d)) for o, d in by_sub.items() if len(d) == 1 and next(iter(d)) != o}
    resub = {k: v for k, v in resub.items() if submove.get(A[k]['sub']) != v}
    # doublons gardés : journal (« doublon de X »), même nom (même album si le nom porte une précision), à la main
    byfull, bybase = collections.defaultdict(list), collections.defaultdict(list)
    for k, (n, *_rest) in B.items():
        byfull[fold(n)].append(k)
        bybase[base(n)].append(k)
    remap, purge = {}, []
    for k in gone:
        a = A[k]
        c = []
        if k in MANUAL_REMAP:
            c = [MANUAL_REMAP[k]]
        for r in log:
            if not c and r[3] == k:
                m = re.search(r'doublon de (.+?) \d★', str(r[1]))
                if m:
                    c = byfull.get(fold(m.group(1))) or bybase.get(base(m.group(1)), [])
                elif 'gard' in str(r[1]):
                    c = [x for x in bybase.get(base(a['name']), []) if B[x][3] == 'paralympiques']
        if not c:
            c = [x for x in bybase.get(base(a['name']), []) if x != k]
            if '(' in a['name']:
                c = [x for x in c if B[x][3] == a['sub']]
            if len(c) > 1:
                c = [x for x in c if B[x][2] == a['theme']] or c
        # transfert seulement vers une carte d'étoiles égales ou inférieures (jamais un cadeau d'étoiles)
        if len(c) == 1 and B[c[0]][1] <= R.index(a['rarity']):
            remap[k] = c[0]
        purge.append(k)
    # nouveaux sous-thèmes : à la place du sous-thème qui leur donne le plus de cartes, sinon dans l'ordre alphabétique
    origin = collections.defaultdict(collections.Counter)
    for k, sb in resub.items():
        origin[sb][A[k]['sub']] += 1
    order = [s['id'] for s in raw['subs']]
    new_subs = []
    for sid, (label, code, group, en) in NEW_SUBS.items():
        if sid in subs:
            continue
        th = next(B[k][2] for k in B if B[k][3] == sid)
        if origin[sid]:
            at = min((o for o in origin[sid]), key=order.index)
        else:
            same = [s for s in raw['subs'] if s['theme'] == th and s['group'] == group and fold(s['label']) > fold(label)]
            at = same[0]['id'] if same else ''
        new_subs.append((th, sid, label, code, group, at, en))
    # albums vidés par la base (fusions) : retirés de l'affichage
    left = collections.Counter(B[k][3] for k in B)
    emptied = sorted(s for s in {A[k]['sub'] for k in A} if not left.get(s))
    js = lambda v: json.dumps(v, ensure_ascii=False)
    o = ['/**',
         ' * COUCHE « ETOILES » (base maître de Hugo) — GÉNÉRÉ par scripts/make-etoiles.py depuis donnees/base/Etoiles-8.xlsx.',
         ' * Ne pas éditer à la main : modifier la base, relancer le script. Appliquée en dernier par installCatalog (themesCore.ts).',
         f' * {len(rerate)} étoiles · {len(rename)} noms · {len(submove)} albums déplacés · {len(resub)} cartes déplacées · {len(add)} nouvelles cartes · {len(purge)} retirées ({len(remap)} transférées à leur double)',
         ' */',
         "import type { CatalogRarity } from './themesCore';",
         '',
         "export type EtoilesTheme = 'gaming' | 'pop' | 'sport' | 'monde';",
         '/** [thème, id, libellé, code, groupe, inséré avant ce sous-thème (\'\' : à la fin), libellé anglais] */',
         'export const ETOILES_SUBS: ReadonlyArray<readonly [EtoilesTheme, string, string, string, string, string, string]> = [']
    o += [f'  {js(list(s))},' for s in new_subs]
    o += ['];', '/** albums vidés par les fusions : retirés de l\'affichage */', f'export const ETOILES_EMPTIED: readonly string[] = {js(emptied)};', '']
    o += ['export const ETOILES_RERATE: Readonly<Record<string, CatalogRarity>> = {']
    o += [f'  {js(k)}: {js(v)},' for k, v in sorted(rerate.items())]
    o += ['};', '', 'export const ETOILES_RENAME: Readonly<Record<string, string>> = {']
    o += [f'  {js(k)}: {js(v)},' for k, v in sorted(rename.items())]
    o += ['};', '', '/** albums déplacés en entier : toutes leurs cartes vont dans ce sous-thème */', 'export const ETOILES_SUBMOVE: Readonly<Record<string, string>> = {']
    o += [f'  {js(k)}: {js(v)},' for k, v in sorted(submove.items())]
    o += ['};', '', '/** cartes déplacées une à une (en plus des albums entiers) */', 'export const ETOILES_RESUB: Readonly<Record<string, string>> = {']
    o += [f'  {js(k)}: {js(v)},' for k, v in sorted(resub.items())]
    o += ['};', '', '/** cartes retirées (doublons / alias) : catalogue, et collections par migrations:purgeCards */',
          f'export const ETOILES_PURGE: readonly string[] = {js(sorted(purge))};', '',
          '/** doublons : la carte retirée → la carte gardée, transférée chez les joueurs AVANT la purge (migrations:remapCards) */',
          'export const ETOILES_REMAP: Readonly<Record<string, string>> = {']
    o += [f'  {js(k)}: {js(v)},' for k, v in sorted(remap.items())]
    o += ['};', '', "/** nouvelles cartes : [sous-thème, id, nom, étoiles 1-6, fichier ('' = design typographique), 'c' | 'i' | ''] */",
          "export const ETOILES_ADD: ReadonlyArray<readonly [string, string, string, number, string, '' | 'c' | 'i']> = ["]
    o += [f'  {js(list(r))},' for r in add]
    o += ['];', '']
    open(OUT, 'w', encoding='utf-8', newline='\n').write('\n'.join(o))
    print(f'{OUT} : {len(rerate)} étoiles, {len(rename)} noms, {len(submove)} albums déplacés en entier, {len(resub)} cartes déplacées une à une, {len(add)} ajouts '
          f'({sum(1 for r in add if r[4])} avec image), {len(purge)} retirées dont {len(remap)} transférées, '
          f'{len(new_subs)} nouveaux albums, {len(emptied)} albums vidés')


if __name__ == '__main__':
    main()
