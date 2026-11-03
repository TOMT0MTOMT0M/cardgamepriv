"""
Sous-thèmes d'affichage de « League of Legends » (correctif du 3 nov.) → src/core/sets/lolLines.ts

  python scripts/make-lol-lines.py Tri-etoiles-lol-skins.xlsx

Lit la colonne « Sous-thème » (K) de la feuille « Tri étoiles » : la lane éditoriale pour les 173 champions
(Top / Jungle / Mid / ADC / Support), la ligne de skins pour les 1 947 skins (Star Guardian, K/DA…, « Classiques &
uniques » pour les hors-ligne). Jointure sur l'id Data Dragon de l'image (« Ezreal_0 ») = le slug de lol.ts.
Rien d'autre ne change (étoiles, ids, noms, images). Fichier séparé de lol.ts : relancer make-gaming-skins.py ne l'écrase pas.
"""
import sys, os, re, json, collections, unicodedata
import openpyxl

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOL_TS = os.path.join(ROOT, 'src', 'core', 'sets', 'lol.ts')
OUT = os.path.join(ROOT, 'src', 'core', 'sets', 'lolLines.ts')
LANES = ['Top', 'Jungle', 'Mid', 'ADC', 'Support']
CATCHALL = 'Classiques & uniques'


def slug(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


def main(xlsx):
    ws = openpyxl.load_workbook(xlsx, read_only=True, data_only=True)['Tri étoiles']
    rows = list(ws.iter_rows(values_only=True))
    head = next(i for i, r in enumerate(rows) if r and r[0] == 'N°')
    cols = rows[head]
    ci, ki, ti = cols.index('Image URL'), cols.index('Sous-thème'), cols.index('Type')
    sub_of = {}
    for r in rows[head + 1:]:
        if not r or not r[0]:
            continue
        m = re.search(r'/([^/]+)\.jpg', r[ci] or '')
        assert m and r[ki], f'ligne sans image ou sans sous-thème : {r[:3]}'
        sub_of[m.group(1)] = str(r[ki]).strip()
        if r[ti] == 'Champion':
            assert sub_of[m.group(1)] in LANES, f'champion sans lane : {r[:3]}'
    slugs = re.findall(r"^  \[\d+, '([^']+)'", open(LOL_TS, encoding='utf-8').read(), re.M)
    assert len(slugs) == 2120 and set(slugs) == set(sub_of), f'{len(slugs)} cartes lol.ts / {len(sub_of)} lignes Excel, différences : {sorted(set(slugs) ^ set(sub_of))[:10]}'
    count = collections.Counter(sub_of.values())
    lines = sorted((k for k in count if k not in LANES and k != CATCHALL), key=lambda k: (-count[k], k))
    order = LANES + lines + ([CATCHALL] if CATCHALL in count else [])
    ids, seen = [], set()
    for k in order:
        i = 'lol-' + (k.lower() if k in LANES else 'l-' + slug(k))
        assert i not in seen, i
        seen.add(i)
        ids.append(i)
    idx = {k: n for n, k in enumerate(order)}
    body = ',\n'.join(f'  {{ id: {json.dumps(i)}, label: {json.dumps(k, ensure_ascii=False)} }}' for i, k in zip(ids, order))
    per = ''.join(f'{idx[sub_of[s]]},' for s in slugs)
    ts = f'''/**
 * Sous-thèmes d'affichage « League of Legends » (correctif du 3 nov.) — GÉNÉRÉ par scripts/make-lol-lines.py depuis
 * Tri-etoiles-lol-skins.xlsx (colonne « Sous-thème »). Ne pas modifier à la main. Données pures, AUCUN import.
 * {len(LANES)} lanes (cartes champion) + {len(lines)} lignes de skins + « {CATCHALL} » = {len(order)} sous-thèmes.
 */
export const LOL_LINES = [
{body},
] as const;

/** Sous-thème de chaque carte, dans l'ordre des cartes de lol.ts (index dans LOL_LINES). */
const BY_NUM = [{per.rstrip(',')}];

/** Sous-thème d'une carte LoL (par son numéro 1..{len(slugs)}). */
export const lolLine = (e: {{ num: number }}) => LOL_LINES[BY_NUM[e.num - 1]];
'''
    with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write(ts)
    print(f'{OUT} : {len(order)} sous-thèmes · champions {sum(count[l] for l in LANES)} ({", ".join(f"{l} {count[l]}" for l in LANES)}) · {CATCHALL} {count.get(CATCHALL, 0)}')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'Tri-etoiles-lol-skins.xlsx'))
