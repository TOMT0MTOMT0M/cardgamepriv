#!/usr/bin/env python3
"""
(version anglaise) Outil d'extraction des textes vers t() — pour les lots suivants.

  python3 scripts/i18n/outil.py list FICHIER            → textes français numérotés (N|ligne|genre|texte), ${i} = paramètre i
  python3 scripts/i18n/outil.py apply FICHIER CARTE.txt → remplace dans le code, ajoute les clés à fr.ts / en.ts

Genres : S chaîne, T gabarit sans HTML, G texte entre balises d'un gabarit HTML, A attribut (title, aria-label,
placeholder, alt) d'un gabarit HTML. Format de CARTE.txt, une ligne par texte :
  N clé | anglais                       (sans paramètre)
  N clé [a,b] | anglais avec {a} {b}    (${0} → {a}, ${1} → {b} ; même ordre que dans le texte)
  N clé [n] | fr=one:{n} carte||other:{n} cartes | en=one:{n} card||other:{n} cards   (pluriel ; le français est donné)
  N clé [a] | fr=… | en=…               (français réécrit à la main : ${i} de la source jamais repris tel quel)
  N -                                    (laissé tel quel)
  N =clé                                 (clé déjà existante, mêmes paramètres)
Un paramètre peut prendre une autre expression que celle de la source : [n=list.length]. Les autres ${…} du texte
(ex. `${n > 1 ? 's' : ''}`) disparaissent alors, remplacés par le pluriel.
"""
import json, os, re, sys

ACCENT = re.compile(r"[àâçéèêëîïôûùüÿœæÀÂÇÉÈÊËÎÏÔÛÙÜŸŒ’«»]")
WORDS = re.compile(r"\b(le|la|les|des|une|du|au|aux|et|ou|est|sont|pas|plus|avec|pour|dans|sur|ton|ta|tes|tu|toi|vous|votre|il|elle|on|ce|cette|ces|qui|que|ne|ici|rien|tout|tous|encore|jamais|aucun|aucune|carte|cartes|joueur|joueurs|ami|amis|échange|pièces|ouvrir|voir|fermer|retour|chargement|connexion|réseau|mise|jeu|jeux|demain|aujourd|hier|minutes?|secondes?|heures?|jours?|se|mon|ma|mes|son|sa|ses|leur|leurs|nos|notre|par|sans|chez|depuis|avant|après|oui|non|fois|semaine|mois|ans|niveau|saison|ton|annuler|valider|envoyer|refuser|accepter|retirer|ajouter|supprimer|modifier|enregistrer|partager|copier|suivant|nouveau|nouvelle|nouvelles|recharger|couper|activer|réessayer|terminer|garder|vendre|acheter|donner|choisir|chercher|trier|profil|boutique|classement|envies|doublons|vitrine|cadre|titre|gagné|perdu|offre|offres|tirage|tirages|collectionner|bébous?)\b", re.I)
IGNORE_BEFORE = re.compile(r"(console\.\w+\(|import\s|from\s*$|querySelector(All)?(<[^>]*>)?\(|closest(<[^>]*>)?\(|perfMark\(|trip\(|matches\(|\bt\(|i18n-ok|classList\.\w+\(|className\s*=\s*|getElementById\(|dataset\.|addEventListener\(|setAttribute\('(class|data-|id)|new Error\(|throw new \w+\()\s*[^'\"`]*$")
ATTRS = ('title', 'aria-label', 'placeholder', 'alt', 'data-tip')

LONE = re.compile(r"^(oui|non|annuler|valider|envoyer|refuser|accepter|retirer|ajouter|supprimer|modifier|enregistrer|partager|copier|suivant|nouveau|nouvelle|recharger|couper|activer|réessayer|terminer|ouvrir|garder|vendre|acheter|donner|choisir|chercher|trier|fermer|retour|profil|boutique|classement|envies|doublons|vitrine|bientôt|connexion|amis|jeux|tirages|gagnant|perdant|semaine|mois|aujourd’hui|demain|hier|rejouer|parier|miser|jouer|quitter|continuer|commencer|confirmer|voir|plus|moins|tout|tous|aucun|aucune|rien|son|langue|vibrations|succès|saison|niveau|rang|offre|pari|mise|gains|vendu|acheté|reçu|envoyé|refusé|accepté|annulé|terminé|expiré|attente|libre|plein|pleine|vide|tutoriel|chargement|relancer|portefeuille|réglages|paramètres)[.!…:]?$", re.I)
def french(txt):
    t = re.sub(r"<[^>]*>", " ", txt)
    t = re.sub(r"\$\{\d+\}", " ", t)
    t = re.sub(r"&[a-z]+;", " ", t).strip()
    if not re.search(r"[A-Za-zÀ-ÿ]{2}", t): return False
    if not re.search(r"\s", t): return bool(ACCENT.search(t) or LONE.match(t))
    return bool(ACCENT.search(t) or WORDS.search(t))

class Lit:
    """Littéral : start/end (guillemets compris), kind 'q' ou 'tpl', parts = [(texte, debut, fin) | ('$', expr, debut, fin)]"""
    def __init__(s, **k): s.__dict__.update(k)

def scan(src):
    lits = []; i = 0; n = len(src)
    def string_lit():
        nonlocal i
        q = src[i]; st = i; i += 1; buf = ''
        while i < n and src[i] != q and src[i] != '\n':
            if src[i] == '\\': buf += src[i]; i += 1
            buf += src[i]; i += 1
        i += 1
        lits.append(Lit(kind='q', start=st, end=i, quote=q, text=buf))
    def tpl():
        nonlocal i
        st = i; i += 1; parts = []; tst = i
        while i < n and src[i] != '`':
            if src[i] == '\\': i += 2; continue
            if src[i] == '$' and i + 1 < n and src[i+1] == '{':
                parts.append((src[tst:i], tst, i)); es = i; i += 2
                code(True)
                parts.append(('$', src[es+2:i-1], es, i)); tst = i
                continue
            i += 1
        parts.append((src[tst:i], tst, i)); i += 1
        lits.append(Lit(kind='tpl', start=st, end=i, parts=parts))
    def code(stop):
        nonlocal i
        depth = 0
        while i < n:
            c = src[i]
            if c == '/' and src[i+1:i+2] == '/':
                while i < n and src[i] != '\n': i += 1
            elif c == '/' and src[i+1:i+2] == '*':
                j = src.find('*/', i+2); i = n if j < 0 else j + 2
            elif c in "'\"": string_lit()
            elif c == '`': tpl()
            elif c == '/' and re.search(r"[=(,:;!&|?{}\[\n]\s*$", src[max(0, i-20):i]):
                i += 1; cls = False
                while i < n and (src[i] != '/' or cls) and src[i] != '\n':
                    if src[i] == '\\': i += 1
                    elif src[i] == '[': cls = True
                    elif src[i] == ']': cls = False
                    i += 1
                i += 1
            elif stop and c == '{': depth += 1; i += 1
            elif stop and c == '}':
                i += 1
                if depth == 0: return
                depth -= 1
            else: i += 1
    code(False)
    return lits

def lineno(src, pos): return src.count('\n', 0, pos) + 1

def items(src):
    """Textes français : dict(id, kind, line, start, end, text (avec ${i}), exprs, lit)"""
    out = []
    for L in scan(src):
        before = src[src.rfind('\n', 0, L.start) + 1:L.start]
        line = src[src.rfind('\n', 0, L.start) + 1: (src.find('\n', L.start) if src.find('\n', L.start) >= 0 else len(src))]
        if IGNORE_BEFORE.search(before) or 'i18n-ok' in line: continue
        if L.kind == 'q':
            if not french(L.text): continue
            if not re.search(r"<[a-zA-Z/!][^>]*>", L.text):
                if re.match(r"^[a-z][a-z-]*$", L.text.strip()): continue  # (clé, route : « profil », « amis »)
                out.append(dict(kind='S', start=L.start, end=L.end, text=L.text, exprs=[], before=before)); continue
            # chaîne avec du HTML : seulement ses textes, recollés par « ' + t(…) + ' »
            pos = 0; flat = L.text; base = L.start + 1
            for m in re.finditer(r"<[^>]*>|$", flat):
                seg = flat[pos:m.start()]
                if french(seg):
                    lead = len(seg) - len(seg.lstrip()); trail = len(seg) - len(seg.rstrip())
                    out.append(dict(kind='G', start=base + pos + lead, end=base + pos + len(seg) - trail, text=seg.strip(), exprs=[], before=before, inner='concat', quote=L.quote))
                if m.group(0) == '': break
                pos = m.end()
            continue
        # gabarit : texte plat (avec ${i}) + positions
        flat = ''; exprs = []; spans = []  # spans : (pos_flat, pos_src) pour remapper
        for p in L.parts:
            if p[0] == '$':
                tok = '${%d}' % len(exprs); exprs.append(p[1]); spans.append((len(flat), p[2], p[3], tok)); flat += tok
            else:
                spans.append((len(flat), p[1], p[2], None)); flat += p[0]
        def src_pos(fp):
            for (f0, s0, s1, tok) in reversed(spans):
                if fp >= f0:
                    if tok: return s0 if fp == f0 else s1
                    return s0 + (fp - f0)
            return L.start + 1
        if not re.search(r"<[a-zA-Z/!][^>]*>", flat):
            if not french(flat): continue
            out.append(dict(kind='T', start=L.start, end=L.end, text=flat, exprs=exprs, before=before)); continue
        # HTML : balises et textes
        pos = 0
        for m in re.finditer(r"<[^>]*>", flat):
            seg = flat[pos:m.start()]
            add_seg(out, flat, pos, seg, exprs, src_pos, before)
            tag = m.group(0)
            for a in re.finditer(r"\b(%s)=\"([^\"]*)\"" % '|'.join(ATTRS), tag):
                v = a.group(2)
                if french(v):
                    fs = m.start() + a.start(2); fe = m.start() + a.end(2)
                    out.append(dict(kind='A', start=src_pos(fs), end=src_pos(fe), text=v, exprs=sub_exprs(v, exprs), before=before, inner=True))
            pos = m.end()
        add_seg(out, flat, pos, flat[pos:], exprs, src_pos, before)
    out.sort(key=lambda d: d['start'])
    for k, d in enumerate(out):
        d['id'] = k + 1; d['line'] = lineno(src, d['start'])
    return out

def sub_exprs(text, exprs):
    return [exprs[int(m)] for m in re.findall(r"\$\{(\d+)\}", text)]

def add_seg(out, flat, pos, seg, exprs, src_pos, before):
    if not french(seg): return
    lead = len(seg) - len(seg.lstrip()); trail = len(seg) - len(seg.rstrip())
    core = seg.strip()
    fs = pos + lead; fe = pos + len(seg) - trail
    out.append(dict(kind='G', start=src_pos(fs), end=src_pos(fe), text=core, exprs=sub_exprs(core, exprs), before=before, inner=True))

def renum(text):
    """${7} ${9} → ${0} ${1} (numérotation locale au texte)"""
    k = [0]
    def r(m):
        v = '${%d}' % k[0]; k[0] += 1; return v
    return re.sub(r"\$\{\d+\}", r, text)

def cmd_list(f):
    src = open(f, encoding='utf8').read()
    for d in items(src):
        t = renum(d['text']).replace('\n', '⏎')
        ex = ' ‖ ' + ' ‖ '.join(e.replace('\n', ' ')[:70] for e in d['exprs']) if d['exprs'] else ''
        print(f"{d['id']}|{d['line']}|{d['kind']}|{t}{ex}")

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FR = os.path.join(ROOT, 'src/core/i18n/fr.ts'); EN = os.path.join(ROOT, 'src/core/i18n/en.ts')

def ts_str(s):
    # (texte repris du code : ses échappements `\u00a0` sont déjà du JS valide — on n'échappe que les apostrophes droites nues)
    return "'" + re.sub(r"(?<!\\)'", "\\'", s) + "'"
def msg_ts(v):
    if isinstance(v, dict): return '{ ' + ', '.join(f"{k}: {ts_str(x)}" for k, x in v.items()) + ' }'
    return ts_str(v)
def parse_msg(s):
    s = s.strip()
    if '||' in s and re.match(r"^(zero|one|two|few|many|other):", s):
        d = {}
        for part in s.split('||'):
            k, v = part.split(':', 1); d[k.strip()] = v.strip()
        return d
    return s

def reach_static():
    """Fichiers du premier téléchargement : atteints depuis src/game/main.ts par imports statiques."""
    seen = set(); todo = [os.path.join(ROOT, 'src/game/main.ts')]
    while todo:
        f = todo.pop()
        if f in seen: continue
        seen.add(f)
        if f.endswith('.css'): continue
        src = re.sub(r"//[^\n]*|/\*.*?\*/", "", open(f, encoding='utf8').read(), flags=re.S)
        for m in re.finditer(r"^\s*import\s+(?!type\b)(?:[^'\"]*?\s+from\s+)?['\"](\.{1,2}/[^'\"]+)['\"]", src, re.M):
            base = os.path.normpath(os.path.join(os.path.dirname(f), m.group(1)))
            for c in (base, base + '.ts', os.path.join(base, 'index.ts')):
                if os.path.isfile(c): todo.append(c); break
    return seen

def slug_of(f):
    return os.path.relpath(os.path.abspath(f), os.path.join(ROOT, 'src'))[:-3].replace(os.sep, '.').replace('/', '.')

def ensure_part(f, src):
    """Partie fr/en du fichier (module chargé à la demande) ; renvoie (fr_path, en_path, src avec l'import)."""
    slug = slug_of(f); ident = 'p_' + re.sub(r'\W', '_', slug)
    frp = os.path.join(ROOT, 'src/core/i18n/fr', slug + '.ts'); enp = os.path.join(ROOT, 'src/core/i18n/en', slug + '.ts')
    if not os.path.exists(frp):
        os.makedirs(os.path.dirname(frp), exist_ok=True); os.makedirs(os.path.dirname(enp), exist_ok=True)
        open(frp, 'w', encoding='utf8').write(f"""/** Textes de src/{slug.replace('.', '/')}.ts : chargés avec lui (module à la demande), enregistrés par addFr. */
import {{ addFr }} from '../../i18n';

export const fr = {{
}} as const satisfies Record<string, string | {{ one?: string; other: string }}>;
addFr(fr);
""")
        open(enp, 'w', encoding='utf8').write(f"""/** English texts of src/{slug.replace('.', '/')}.ts (keys: ../fr/{slug}.ts). */
import type {{ PartOf }} from '../../i18n';
import type {{ fr }} from '../fr/{slug}';

export const en: PartOf<typeof fr> = {{
}};
""")
        k = os.path.join(ROOT, 'src/core/i18n/keys.ts'); ks = open(k, encoding='utf8').read()
        ks = ks.replace('// <imports>', f"import type {{ fr as {ident} }} from './fr/{slug}';\n// <imports>").replace('// <parts>', f"typeof {ident} &\n  // <parts>")
        open(k, 'w', encoding='utf8').write(ks)
        e = EN; es = open(e, encoding='utf8').read()
        es = es.replace('// <imports>', f"import {{ en as {ident} }} from './en/{slug}';\n// <imports>").replace('  // <parts>', f"  ...{ident},\n  // <parts>")
        open(e, 'w', encoding='utf8').write(es)
    rel = os.path.relpath(frp[:-3], os.path.dirname(os.path.abspath(f))).replace(os.sep, '/')
    if not rel.startswith('.'): rel = './' + rel
    if f"import '{rel}';" not in src:
        mm = re.search(r"^import ", src, re.M); at = mm.start() if mm else 0
        src = src[:at] + f"import '{rel}'; // (textes de ce module, version anglaise)\n" + src[at:]
    return frp, enp, src

def existing_keys(path):
    return dict(re.findall(r"^  '([^']+)': (.*),$", open(path, encoding='utf8').read(), re.M))

def split_top(s):
    """« a,b=f(x, y),c » → ['a', 'b=f(x, y)', 'c'] (virgules du premier niveau seulement)"""
    out = []; depth = 0; cur = ''; q = None
    for ch in s:
        if q:
            cur += ch
            if ch == q: q = None
            continue
        if ch in '\'"`': q = ch
        elif ch in '([{': depth += 1
        elif ch in ')]}': depth -= 1
        elif ch == ',' and depth == 0: out.append(cur); cur = ''; continue
        cur += ch
    out.append(cur)
    return out

def cmd_apply(f, mapf):
    src = open(f, encoding='utf8').read()
    its = {d['id']: d for d in items(src)}
    # une variable locale `t` (temps, élément…) masquerait t() : on importe alors `t as tr`
    shadow = re.search(r"\b(const|let|var)\s+t\b|[(,]\s*t\s*[,):=]|\bt\s*=>", src) is not None
    already = re.search(r"import \{[^}]*\bt as tr\b", src)
    T = 'tr' if (shadow or already) else 't'
    static = os.path.abspath(f) in reach_static()
    if static: FRT, ENT = FR, EN
    else: FRT, ENT, src = ensure_part(f, src)
    core_keys = existing_keys(FR)
    fr_keys = dict(core_keys); fr_keys.update(existing_keys(FRT))
    its = {d['id']: d for d in items(src)}  # (positions recalculées : l'import de la partie a pu décaler le texte)
    new_fr = []; new_en = []; edits = []; okl = set()
    for raw in open(mapf, encoding='utf8'):
        raw = raw.rstrip('\n')
        if not raw.strip() or raw.startswith('#'): continue
        m = re.match(r"^(\d+)\s+(.*)$", raw)
        if not m: sys.exit(f"ligne illisible : {raw}")
        d = its.get(int(m.group(1)))
        if not d: sys.exit(f"texte {m.group(1)} introuvable ({f})")
        rest = m.group(2).strip()
        if rest == '-': continue
        if rest == '!':  # texte voulu en français (console, rapport technique) : marqué pour check:i18n
            okl.add(d['line']); continue
        reuse = rest.startswith('=')
        if reuse:
            if rest[1:].split('[')[0].strip() not in fr_keys: sys.exit(f"{m.group(1)} : clé {rest[1:]} inconnue ici (dans une autre partie ? la mettre dans fr.ts)")
            key = rest[1:].split('[')[0].strip(); pm = re.search(r"\[(.*)\]", rest); params = pm.group(1) if pm else ''
            en = None; frm = None
        else:
            head, _, tail = rest.partition(' | ')
            pm = re.search(r"\[(.*)\]", head); params = pm.group(1) if pm else ''
            key = head.split('[')[0].strip()
            tail = tail.strip()
            if tail.startswith('fr='):
                frp, _, enp = tail.partition('| en=')
                frm = parse_msg(frp[3:]); en = parse_msg(enp)
            else:
                frm = None; en = parse_msg(tail)
        names = []; exprs = list(d['exprs'])
        explicit = {}
        for k, p in enumerate([x.strip() for x in split_top(params) if x.strip()]):
            if '=' in p:
                nm, ex = p.split('=', 1); explicit[nm.strip()] = ex.strip(); names.append(nm.strip())
            else: names.append(p)
        if frm is None and not reuse:
            txt = renum(d['text']); idx = [0]
            def rp(mm):
                k = idx[0]; idx[0] += 1
                if k >= len(names): sys.exit(f"{m.group(1)} : paramètre {k} sans nom ({txt})")
                return '{' + names[k] + '}'
            frm = re.sub(r"\$\{\d+\}", rp, txt)
            if '${' in frm: sys.exit(f"{m.group(1)} : reste un ${{}}")
        # arguments du code
        args = []
        for k, nm in enumerate(names):
            if nm in explicit: ex = explicit[nm]
            elif k < len(exprs): ex = exprs[k]
            else: sys.exit(f"{m.group(1)} : pas d'expression pour {nm}")
            ex = ex.strip()
            args.append(nm if ex == nm else f"{nm}: {ex}")
        call = f"{T}('{key}'" + (", { " + ', '.join(args) + " }" if args else '') + ")"
        rep = (d['quote'] + ' + ' + call + ' + ' + d['quote']) if d.get('inner') == 'concat' else ('${' + call + '}' if d.get('inner') else call)
        edits.append((d['start'], d['end'], rep))
        if not reuse:
            if key in fr_keys:
                if fr_keys[key] != msg_ts(frm): sys.exit(f"clé {key} déjà prise avec un autre texte : {fr_keys[key]}")
            else:
                if isinstance(frm, str) and isinstance(en, str):
                    lead = frm[:len(frm) - len(frm.lstrip())]
                    if en.strip()[:1] in ':;!?': lead = ''  # (« : » / « ! » français → pas d'espace en anglais)
                    en = lead + en.strip() + frm[len(frm.rstrip()):]  # (espaces de bord comme en français)
                fr_keys[key] = msg_ts(frm); new_fr.append(f"  '{key}': {msg_ts(frm)},"); new_en.append(f"  '{key}': {msg_ts(en)},")
    # un texte DANS l'expression d'un autre (ex. `${x ? 'Ton parrain' : …}`) : celui du dehors l'emporte (paramètre explicite)
    edits = [e for e in edits if not any(o is not e and o[0] <= e[0] and e[1] <= o[1] for o in edits)]
    if okl:
        ls = src.split('\n')
        for ln in okl:
            if 'i18n-ok' not in ls[ln - 1]: ls[ln - 1] += ' // i18n-ok'
        new = '\n'.join(ls)
        delta = []  # (les positions des remplacements suivent l'ajout des commentaires)
        for ln in sorted(okl):
            delta.append((sum(len(x) + 1 for x in src.split('\n')[:ln - 1]) + len(src.split('\n')[ln - 1]), len(' // i18n-ok')))
        def shift(p): return p + sum(dl for (at, dl) in delta if at <= p)
        edits = [(shift(a), shift(b), r) for (a, b, r) in edits]
        src = new
    for st, en_, rep in sorted(edits, reverse=True):
        src = src[:st] + rep + src[en_:]
    # import de t
    imp = 't as tr' if T == 'tr' else 't'
    has = re.search(r"import \{[^}]*\b%s\b[^}]*\} from '[./]*(core/)?(i18n|lang)'" % re.escape(imp), src)
    if not has and edits:
        rel = os.path.relpath(os.path.join(ROOT, 'src/core/i18n'), os.path.dirname(os.path.abspath(f)))
        if not rel.startswith('.'): rel = './' + rel
        mi = re.search(r"^import \{([^}]*)\} from '%s';$" % re.escape(rel), src, re.M)
        if mi: src = src[:mi.start(1)] + mi.group(1).rstrip() + ', ' + imp + ' ' + src[mi.end(1):]
        else:
            mm = re.search(r"^import ", src, re.M)
            at = mm.start() if mm else 0
            src = src[:at] + f"import {{ {imp} }} from '{rel}';\n" + src[at:]
    open(f, 'w', encoding='utf8').write(src)
    if new_fr:
        sect = os.path.relpath(os.path.abspath(f), ROOT)
        for path, lines in ((FRT, new_fr), (ENT, new_en)):
            s = open(path, encoding='utf8').read()
            close = s.rindex('}')
            # (en.ts finit par « }; », fr.ts par « } as const satisfies … ; »)
            close = s.rindex('\n}') + 1
            s = s[:close] + (f"\n  // ───── {sect} ─────\n" if path in (FR, EN) else '') + '\n'.join(lines) + '\n' + s[close:]
            open(path, 'w', encoding='utf8').write(s)
    print(f"{len(edits)} remplacements, {len(new_fr)} clés nouvelles")

if __name__ == '__main__':
    if sys.argv[1] == 'list': cmd_list(sys.argv[2])
    elif sys.argv[1] == 'apply': cmd_apply(sys.argv[2], sys.argv[3])
