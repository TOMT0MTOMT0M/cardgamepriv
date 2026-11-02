"""
Récolte du sous-thème Valorant (une fois, puis à chaque mise à jour décidée par le groupe).
  python scripts/make-valorant.py chemin/vers/Tri-etoiles-valorant.xlsx
1. lit l'Excel validé (Nom, Type, Arme, Collection, Tier, Icône, « Étoiles finales (VALIDÉ) ») ;
2. retrouve l'uuid Riot de chaque carte via valorant-api.com (fr-FR) ; agents → portrait en pied ;
3. télécharge les images dans public/art/valorant/<uuid>.png (recadrées, armes larges pivotées de 32°) ;
4. regénère src/core/sets/valorant.ts. Puis : npm run thumbs.
Besoin : pip install openpyxl pillow
"""
import json, sys, os, io, collections, urllib.request, concurrent.futures as cf
import openpyxl
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public/art/valorant')
os.makedirs(OUT, exist_ok=True)
def api(path):
    return json.load(urllib.request.urlopen('https://valorant-api.com/v1/' + path, timeout=60))['data']
sk = api('weapons/skins?language=fr-FR'); ag = api('agents?language=fr-FR&isPlayableCharacter=true')
byname = {s['displayName'].strip(): s for s in sk}; agn = {a['displayName']: a for a in ag}
rows = [r for r in openpyxl.load_workbook(sys.argv[1], read_only=True)['Tri étoiles'].iter_rows(min_row=4, values_only=True) if r[0]]
cards = []
for r in rows:
    n, nom, typ, arme, coll, tier, score, sugg, url, stars = r[:10]
    if typ == 'Agent':
        a = agn[nom]
        cards.append(dict(uuid=a['uuid'], name=nom, kind='agent', weapon='', collection=coll, tier='Agent', stars=int(stars), url=a['fullPortrait'] or a['displayIcon']))
    else:
        s = byname[nom.strip()]
        cards.append(dict(uuid=s['uuid'], name=nom.strip(), kind='knife' if arme == 'Mêlée' else 'skin', weapon=arme, collection=coll, tier=tier, stars=int(stars), url=url))
def get(c):
    dst = f"{OUT}/{c['uuid']}.png"
    if os.path.exists(dst): return 'déjà là'
    im = Image.open(io.BytesIO(urllib.request.urlopen(c['url'], timeout=40).read())).convert('RGBA')
    im = im.crop(im.getbbox())
    im.thumbnail((900, 900) if c['kind'] == 'agent' else (1024, 1024), Image.LANCZOS)
    if c['kind'] != 'agent' and im.width > 1.8 * im.height:
        im = im.rotate(-32, resample=Image.BICUBIC, expand=True); im = im.crop(im.getbbox())
    im.save(dst, optimize=True)
    return 'téléchargée'
with cf.ThreadPoolExecutor(12) as ex:
    print(collections.Counter(ex.map(get, cards)))

# ───── génération de src/core/sets/valorant.ts
WORDER = ['Classic','Shorty','Frenzy','Ghost','Bandit','Sheriff','Stinger','Spectre','Bucky','Judge','Bulldog','Guardian','Phantom','Vandal','Marshal','Outlaw','Operator','Ares','Odin','Mêlée']
R = {1:'c',2:'u',3:'r',4:'e',5:'l',6:'m'}; K = {'agent':'a','skin':'s','knife':'k'}
agents = sorted([x for x in cards if x['kind']=='agent'], key=lambda x: x['name'])
weap = sorted([x for x in cards if x['kind']!='agent'], key=lambda x: (x['collection'].lower(), WORDER.index(x['weapon']) if x['weapon'] in WORDER else 99, x['name']))
order = agents + weap
q = lambda s: json.dumps(s, ensure_ascii=False)
lines = [f"  [{i}, '{x['uuid']}', {q(x['name'])}, '{R[x['stars']]}', '{K[x['kind']]}', {q(x['collection'] if x['kind']=='agent' else x['weapon'])}, {q('' if x['kind']=='agent' else x['collection'])}, {q(x['tier'])}]," for i, x in enumerate(order, 1)]
path = os.path.join(ROOT, 'src/core/sets/valorant.ts')
src = open(path, encoding='utf-8').read()
head, _, rest = src.partition('const RAW')
tail = rest[rest.index('];') + 2:]
size = f"size: {len(order)},"
import re
head = re.sub(r'size: \d+,', size, head)
open(path, 'w', encoding='utf-8').write(head + "const RAW: Array<[number, string, string, keyof typeof R, keyof typeof K, string, string, string]> = [\n" + "\n".join(lines) + "\n];" + tail)
print(f'{len(order)} cartes écrites dans src/core/sets/valorant.ts', collections.Counter(x['stars'] for x in cards))
