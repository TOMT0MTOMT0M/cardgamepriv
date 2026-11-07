"""
ARTISTE des cartes Album / Chanson — décision + génération (demande « SCRAPING — ARTISTE DES ALBUMS/SINGLES », 07/11).

  python scripts/build-music-artists.py            # décide, écrit src/core/sets/popArtists.ts + l'Excel à vérifier
  python scripts/build-music-artists.py --import donnees/suivi/Artistes-albums-singles-a-verifier.xlsx
        # reprend la colonne « Artiste corrigé » remplie à la main → scripts/data/music-artists-manual.json, puis régénère

Sources (récoltées par scripts/harvest-music-artists.py, sauf Wikidata) :
  iTunes   scripts/data/music-artists-itunes.json  — trié par popularité : la 1re correspondance exacte du titre
  Deezer   scripts/data/music-artists-deezer.json — popularité (somme des rangs des versions) : relève d'iTunes, que
           Apple bride fortement depuis nos serveurs (403 en rafale)
  MusicBrainz scripts/data/music-artists-mb.json   — poids = nombre de sorties portant ce titre (l'original domine)
  Wikidata scripts/data/pop-artists.json           — interprète P175 (passe du 05/11, scripts/pop-artists.py)
  À la main scripts/data/music-artists-manual.json — PRIORITAIRE sur tout le reste ({ id: "Artiste" } ; "" = rien)

Confiance :
  sûr          au moins 2 sources d'accord, sans autre artiste soutenu par 2 sources
               (ou iTunes seul mais très net : ≥ 3 correspondances, ≥ 60 % pour le même artiste)
  douteux      une seule source, ou des sources en désaccord → imprimé (meilleure piste) mais à vérifier
  introuvable  rien nulle part → rien d'imprimé
"""
import json, os, re, sys, unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(ROOT, 'scripts', 'data')
TS = os.path.join(ROOT, 'src', 'core', 'sets', 'popArtists.ts')
XLSX = os.path.join(ROOT, 'donnees', 'suivi', 'Artistes-albums-singles-a-verifier.xlsx')
MANUAL = f'{D}/music-artists-manual.json'


def jl(p, default):
    return json.load(open(p, encoding='utf-8')) if os.path.exists(p) else default


def fold(s):
    s = unicodedata.normalize('NFKD', s.lower()).encode('ascii', 'ignore').decode()
    s = re.sub(r'^the\s+', '', s.strip())
    return re.sub(r'[^a-z0-9]', '', s)


SPLIT = re.compile(r'\s*(?:,|&|\+|/|\bet\b|\band\b|\bx\b|\bwith\b|\bduet with\b|\bfeat\.?|\bft\.?|\bfeaturing\b|\bavec\b|\bvs\.?)\s*', re.I)


def people(credit):
    """Ensemble des noms (repliés) d'un crédit : « Philip Bailey & Phil Collins » → {philipbailey, philcollins}"""
    return {fold(p) for p in SPLIT.split(credit or '') if fold(p)}


def clean(credit):
    """Artiste principal à imprimer : sans « feat. … », sans la liste des orchestres / solistes d'un enregistrement classique."""
    c = (credit or '').strip()
    c = re.sub(r'\s*[\(\[]\s*(feat|ft|with|avec)\b.*$', '', c, flags=re.I)
    c = re.sub(r'\s+(feat\.?|ft\.?|featuring)\s.*$', '', c, flags=re.I)
    c = re.sub(r'\s+duet with\s+', ' & ', c, flags=re.I)
    if ',' in c:
        c = c.split(',')[0]
    if c.count('&') >= 2:
        c = c.split('&')[0]
    c = c.strip(' -–')
    # MusicBrainz écrit les tirets et apostrophes typographiques (‐ ’) : on revient aux simples
    return c.replace('‐', '-').replace('’', "'")


def same(a, b):
    return bool(people(a) & people(b)) or fold(a) == fold(b)


# karaoké, reprises en série, compilations : jamais l'interprète d'une carte
JUNK = re.compile(r'karaok|tribute|backing track|made famous|originally perform|in the style of|hit crew|cover band|covers?\b|'
                  r'lullab|berceuse|music box|bo[iî]te [aà] musique|piano version|8-bit|instrumental|ringtone|workout|fitness|'
                  r'tubes du c|party hits|chart hits|top hits|hits? (?:of|des)|the backing|soundalike|sound-alike|various artists|'
                  r'orchestre de (?:bal|variet)|generation [0-9]|g[ée]n[ée]ration (?:tubes|hits)|kidz bop|starlite|twinkle', re.I)


def keep(lst):
    return [x for x in (lst or []) if x[0] and not JUNK.search(x[0])]


def decide(c, it, mb, wd, dz=None):
    """→ (artiste, confiance, raison, pistes)"""
    it, mb, dz = keep(it), keep(mb), keep(dz)
    if wd and JUNK.search(wd):
        wd = None
    votes = []  # (source, crédit, poids)
    it_top = None
    if it:
        it_top = it[0][0]
        n_same = sum(1 for a, _ in it if same(a, it_top))
        votes.append(('iTunes', it_top, 3 + min(2, n_same - 1)))
    mb_top = None
    if mb:
        tot = sum(w for _, w in mb)
        mb_top = mb[0][0]
        # albums : la recherche MusicBrainz ne connaît pas la popularité (« Blackstar » de Bowie s'y appelle « ★ ») → voix réduite
        votes.append(('MusicBrainz', mb_top, (1.5 if c['label'] == 'Album' else 2) + (1 if mb[0][1] / tot >= 0.5 else 0)))
        if len(mb) > 1 and mb[1][1] >= 0.6 * mb[0][1]:
            votes.append(('MusicBrainz (2e)', mb[1][0], 1))
    if dz:
        # voix selon la domination : un 1er à 20 % des écoutes (remix, reprise du moment) pèse moins qu'un 1er à 80 %
        tot = sum(w for _, w in dz) or 1
        votes.append(('Deezer', dz[0][0], 1.5 + 2.5 * dz[0][1] / tot))
        if len(dz) > 1 and dz[1][1] >= 0.6 * dz[0][1]:
            votes.append(('Deezer (2e)', dz[1][0], 1))
    if wd:
        votes.append(('Wikidata', wd, 2.5))
    # l'artiste désigné par une autre source a aussi ce titre sur Deezer, avec une vraie audience (≥ 25 % du 1er) :
    # c'est un appui (« Feel Good Inc. » : Gorillaz, même si un remix fait plus d'écoutes en ce moment)
    if dz:
        for name in {x for x in (wd, mb[0][0] if mb else None, it[0][0] if it else None) if x}:
            if same(name, dz[0][0]):
                continue
            hit = next((w for a, w in dz if same(a, name)), 0)
            if hit >= 0.25 * dz[0][1]:
                votes.append(('Deezer (présent)', name, 1.5))
    if not votes:
        return '', 'introuvable', 'aucune source', []
    # regroupe les votes qui désignent le même artiste
    groups = []
    for v in votes:
        for g in groups:
            if same(g[0][1], v[1]):
                g.append(v)
                break
        else:
            groups.append([v])
    # d'abord l'artiste soutenu par le plus de sources DIFFÉRENTES, puis le poids des voix
    groups.sort(key=lambda g: (-len({v[0].split(' ')[0] for v in g}), -sum(v[2] for v in g)))
    best = groups[0]
    srcs = {v[0].split(' ')[0] for v in best}
    # forme imprimée : iTunes, sauf si Wikidata écrit le même nom plus proprement (« JAŸ-Z » → « Jay-Z »)
    form = next((v[1] for v in best if v[0] == 'iTunes'), None) or next((v[1] for v in best if v[0] == 'Wikidata'), None) or next((v[1] for v in best if v[0] == 'Deezer'), None) or best[0][1]
    art = clean(form)
    if wd and fold(clean(wd)) == fold(art):
        art = clean(wd)
    pistes = [f'{clean(g[0][1])} ({", ".join(v[0] for v in g)})' for g in groups]
    # concurrent sérieux : un autre artiste désigné par 2 sources différentes
    strong_rival = any(len({v[0].split(' ')[0] for v in g}) >= 2 for g in groups[1:])
    if len(srcs) >= 2 and not strong_rival:
        return art, 'sûr', ' + '.join(sorted(srcs)), pistes
    if srcs == {'iTunes'} and len(groups) == 1:
        n = len(it)
        n_same = sum(1 for a, _ in it if same(a, it_top))
        if n_same >= 3 and n_same / n >= 0.6:
            return art, 'sûr', f'iTunes seul, net ({n_same}/{n})', pistes
    why = 'sources en désaccord' if len(groups) > 1 else f'une seule source ({", ".join(sorted(srcs))})'
    return art, 'douteux', why, pistes


def write_ts(out):
    lines = [
        '/**',
        ' * ARTISTE des cartes Album / Chanson du Pop Culture Pack (demande « SCRAPING — ARTISTE DES ALBUMS/SINGLES », 07/11) :',
        ' * champ `artist` du catalogue (CatalogEntry, themesCore.ts), imprimé sur la carte juste sous le titre.',
        ' * iTunes Search en priorité (le plus populaire), recoupé avec Wikidata (P175) et MusicBrainz ; les corrections à la',
        ' * main (scripts/data/music-artists-manual.json) passent avant tout. GÉNÉRÉ : scripts/build-music-artists.py',
        ' * (ne pas éditer à la main). Carte absente : artiste introuvable (rien n’est imprimé).',
        ' */',
        'export const POP_ARTISTS: Record<string, string> = {',
    ]
    for cid, a in out.items():
        lines.append(f'  {json.dumps(cid)}: {json.dumps(a, ensure_ascii=False)},')
    lines.append('};')
    open(TS, 'w', encoding='utf-8', newline='\n').write('\n'.join(lines) + '\n')


def write_xlsx(rows):
    import openpyxl
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.worksheet.datavalidation import DataValidation
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = 'À vérifier'
    head = ['N°', 'Carte', 'Type', 'Étoiles', 'Statut', 'Artiste imprimé (piste)', 'Artiste corrigé (à remplir)', 'Pourquoi', 'Pistes trouvées', 'id']
    ws.append(head)
    stars = {'c': 1, 'u': 2, 'r': 3, 'e': 4, 'l': 5, 'm': 6}
    for r in rows:
        ws.append([r['num'], r['name'], r['label'], stars[r['rarity']], r['conf'].upper(), r['artist'], '', r['why'], ' · '.join(r['pistes']), r['id']])
    bold = Font(bold=True, color='FFFFFF')
    for c in ws[1]:
        c.font = bold
        c.fill = PatternFill('solid', fgColor='2E2A26')
    yellow = PatternFill('solid', fgColor='FFF4C2')
    red = PatternFill('solid', fgColor='FBD9D3')
    for row in ws.iter_rows(min_row=2):
        row[6].fill = yellow
        if row[4].value == 'INTROUVABLE':
            row[4].fill = red
    for col, w in zip('ABCDEFGHIJ', [8, 42, 9, 8, 13, 30, 30, 26, 70, 30]):
        ws.column_dimensions[col].width = w
    ws.freeze_panes = 'C2'
    ws.auto_filter.ref = ws.dimensions
    for row in ws.iter_rows(min_row=2, max_col=9):
        for c in row:
            c.alignment = Alignment(vertical='top', wrap_text=c.column == 9)
    note = wb.create_sheet('Mode d’emploi')
    for line in [
        'Albums / singles dont l’artiste n’a pas été trouvé (INTROUVABLE) ou est incertain (DOUTEUX).',
        'Colonne G « Artiste corrigé » : écrire le bon artiste. Laisser vide = on garde la piste de la colonne F.',
        'Pour n’imprimer AUCUN artiste sur la carte : écrire un tiret « - » en colonne G.',
        'Les DOUTEUX sont déjà imprimés sur la carte avec la meilleure piste ; les INTROUVABLES n’ont rien.',
        'Renvoyer le fichier : python scripts/build-music-artists.py --import <ce fichier> (Claude s’en charge).',
    ]:
        note.append([line])
    note.column_dimensions['A'].width = 110
    os.makedirs(os.path.dirname(XLSX), exist_ok=True)
    wb.save(XLSX)


def import_xlsx(path):
    import openpyxl
    ws = openpyxl.load_workbook(path, read_only=True).active
    rows = list(ws.iter_rows(values_only=True))
    h = [str(x or '') for x in rows[0]]
    ci, cg = h.index('id'), next(i for i, x in enumerate(h) if x.startswith('Artiste corrigé'))
    manual = jl(MANUAL, {})
    n = 0
    for r in rows[1:]:
        v = r[cg]
        if r[ci] and v is not None and str(v).strip():
            v = str(v).strip()
            manual[r[ci]] = '' if v in ('-', '—', '–') else v
            n += 1
    json.dump(manual, open(MANUAL, 'w', encoding='utf-8'), ensure_ascii=False, indent=0, sort_keys=True)
    print(f'{n} corrections à la main reprises → {os.path.relpath(MANUAL, ROOT)}')


def main():
    if '--import' in sys.argv:
        import_xlsx(sys.argv[sys.argv.index('--import') + 1])
    cards = jl(f'{D}/music-cards.json', [])
    DZ = jl(f'{D}/music-artists-deezer.json', {})
    IT, MB, WD, MAN = jl(f'{D}/music-artists-itunes.json', {}), jl(f'{D}/music-artists-mb.json', {}), jl(f'{D}/pop-artists.json', {}), jl(MANUAL, {})
    # récoltes en parallèle (harvest … <source> <s> k/n) : fusionnées ici dans le fichier principal de la source
    for src, store in (('mb', MB), ('deezer', DZ), ('itunes', IT)):
        parts = sorted(f for f in os.listdir(D) if re.match(rf'music-artists-{src}\.part\d+\.json$', f))
        for f in parts:
            store.update(jl(f'{D}/{f}', {}))
        if parts:
            json.dump(store, open(f'{D}/music-artists-{src}.json', 'w', encoding='utf-8'), ensure_ascii=False)
    out, report, todo = {}, [], []
    stats = {}
    for c in sorted(cards, key=lambda c: c['num']):
        cid = c['id']
        if cid in MAN:
            art, conf, why, pistes = MAN[cid], 'main', 'corrigé à la main', []
        else:
            art, conf, why, pistes = decide(c, IT.get(cid), MB.get(cid), WD.get(cid), DZ.get(cid))
        stats[conf] = stats.get(conf, 0) + 1
        if art:
            out[cid] = art
        r = {**c, 'artist': art, 'conf': conf, 'why': why, 'pistes': pistes, 'itunes': cid in IT}
        report.append(r)
        if conf in ('douteux', 'introuvable'):
            todo.append(r)
    write_ts(out)
    json.dump({r['id']: {k: r[k] for k in ('artist', 'conf', 'why', 'pistes')} for r in report}, open(f'{D}/music-artists.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    order = {'introuvable': 0, 'douteux': 1}
    tier = {'m': 0, 'l': 1, 'e': 2, 'r': 3, 'u': 4, 'c': 5}
    write_xlsx(sorted(todo, key=lambda r: (order[r['conf']], tier[r['rarity']], r['num'])))
    print('cartes', len(cards), stats, '· imprimés', len(out), '· iTunes interrogé pour', sum(1 for c in cards if c['id'] in IT))


if __name__ == '__main__':
    main()
