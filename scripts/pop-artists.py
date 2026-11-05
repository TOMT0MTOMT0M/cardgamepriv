"""
Artiste (interprète) des cartes Album / Chanson du Pop Culture Pack, via Wikidata (SPARQL).
Entrées dans Q : albums.json (id, n, name, label, sub — cartes du catalogue) et alb_rows.json (lignes de l'Excel avec
Image URL). Sortie : artists.json, puis scripts/data/pop-artists.json et src/core/sets/popArtists.ts (voir la fin de
la session du 05/11). 1) par l'image Commons de l'Excel, 2) par le titre (type album / single / chanson), le plus connu.
"""
import json, time, urllib.parse, urllib.request, sys
Q='/tmp/claude-0/q'
cards=json.load(open(f'{Q}/albums.json')); rows={r['n']:r for r in json.load(open(f'{Q}/alb_rows.json'))}
OUT=f'{Q}/artists.json'
try: res=json.load(open(OUT))
except Exception: res={}
UA={'User-Agent':'BebouCard/1.0 (private card game; data lookup)','Accept':'application/sparql-results+json'}
def sparql(q):
    for i in range(4):
        try:
            req=urllib.request.Request('https://query.wikidata.org/sparql',data=urllib.parse.urlencode({'query':q}).encode(),headers=UA)
            with urllib.request.urlopen(req,timeout=60) as r: return json.load(r)['results']['bindings']
        except Exception as e:
            print('err',e,file=sys.stderr); time.sleep(5*(i+1))
    return []
def esc(s): return s.replace('\\','\\\\').replace('"','\\"')
# 1) par image
todo=[c for c in cards if c['id'] not in res and 'commons.wikimedia' in rows.get(c['n'],{}).get('url','')]
print('img todo',len(todo))
for i in range(0,len(todo),120):
    batch=todo[i:i+120]; m={}
    for c in batch:
        f=urllib.parse.unquote(rows[c['n']]['url'].split('FilePath/')[1].split('?')[0]).replace(' ','_')
        m['http://commons.wikimedia.org/wiki/Special:FilePath/'+urllib.parse.quote(f,safe='')]=c
    vals=' '.join(f'<{k}>' for k in m)
    q=f'''SELECT ?img ?perfLabel ?sl WHERE {{ VALUES ?img {{ {vals} }} ?item wdt:P18|wdt:P154|wdt:P3383|wdt:P4291 ?img . ?item wdt:P175 ?perf . ?item wikibase:sitelinks ?sl . SERVICE wikibase:label {{ bd:serviceParam wikibase:language "fr,en". }} }}'''
    b=sparql(q)
    best={}
    for x in b:
        k=x['img']['value']; sl=int(x['sl']['value']); p=x['perfLabel']['value']
        if k not in best or sl>best[k][0]: best[k]=(sl,p)
    # img values come back normalized; match by unquote
    norm={urllib.parse.unquote(k).replace(' ','_'):v for k,v in best.items()}
    for k,c in m.items():
        v=norm.get(urllib.parse.unquote(k))
        if v and not v[1].startswith('Q'): res[c['id']]={'artist':v[1],'via':'img'}
    json.dump(res,open(OUT,'w'),ensure_ascii=False); print(i,len(res)); time.sleep(1)
# 2) par nom
CLS='wd:Q482994 wd:Q208569 wd:Q209939 wd:Q222910 wd:Q134556 wd:Q7366 wd:Q105543609 wd:Q169930 wd:Q2188189 wd:Q55850593'
todo=[c for c in cards if c['id'] not in res]
print('name todo',len(todo))
for i in range(0,len(todo),40):
    batch=todo[i:i+40]
    vals=' '.join(f'"{esc(c["name"])}"@fr "{esc(c["name"])}"@en' for c in batch)
    q=f'''SELECT ?name ?perfLabel ?sl ?cls WHERE {{ VALUES ?name {{ {vals} }} VALUES ?cls {{ {CLS} }} ?item rdfs:label ?name ; wdt:P31 ?cls ; wdt:P175 ?perf ; wikibase:sitelinks ?sl . SERVICE wikibase:label {{ bd:serviceParam wikibase:language "fr,en". }} }}'''
    b=sparql(q); best={}
    album={'http://www.wikidata.org/entity/'+x for x in ['Q482994','Q208569','Q209939','Q222910','Q169930']}
    for x in b:
        k=x['name']['value']; sl=int(x['sl']['value']); p=x['perfLabel']['value']; isalb=x['cls']['value'] in album
        best.setdefault(k,[]).append((sl,p,isalb))
    for c in batch:
        L=best.get(c['name'],[])
        want=c['label']=='Album'
        L2=[t for t in L if t[2]==want] or L
        if L2 and not max(L2)[1].startswith('Q'): res[c['id']]={'artist':max(L2)[1],'via':'name','n':len(L2)}
        else: res[c['id']]=None
    json.dump(res,open(OUT,'w'),ensure_ascii=False); print('n',i,sum(1 for v in res.values() if v))
    time.sleep(1)
print('found',sum(1 for v in res.values() if v),'of',len(cards))
