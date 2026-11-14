#!/usr/bin/env python3
"""
(version anglaise, lot 4) Erreurs du serveur → CODES + paramètres.

Chaque texte français d'une erreur (`throw new ConvexError('…')` dans convex/, retours d'erreur des contrôles partagés de
src/core) devient `fe('code', { p0: … })`. `fe` (src/core/errors.ts) renvoie LE MÊME texte français, suivi d'un repère
`⟦code{json}⟧` : le serveur, les tests et le français ne changent pas ; le client (errMsg) enlève le repère et, en anglais,
affiche src/core/i18n/en/errors.ts. Codes : `<fichier>.<n>` (n dans l'ordre du fichier, au moment de la conversion).

  python3 scripts/i18n/erreurs.py FICHIER...
"""
import os, re, sys
sys.path.insert(0, os.path.dirname(__file__))
import outil as O

ROOT = O.ROOT
FR = os.path.join(ROOT, 'src/core/i18n/errFr.ts')

def lits_of(src):
    out = []
    for L in O.scan(src):
        if L.kind == 'q':
            if O.french(L.text) and not re.search(r"<[a-zA-Z/!]", L.text): out.append((L.start, L.end, L.text, []))
        else:
            flat = ''; exprs = []
            for p in L.parts:
                if p[0] == '$': flat += '${%d}' % len(exprs); exprs.append(p[1])
                else: flat += p[0]
            if O.french(flat) and not re.search(r"<[a-zA-Z/!]", flat): out.append((L.start, L.end, flat, exprs))
    return out

def is_target(src, start, mode):
    ls = src.rfind('\n', 0, start) + 1
    line = src[ls:src.find('\n', start)]
    prev = src[src.rfind('\n', 0, ls - 1) + 1:ls - 1]
    if 'i18n-ok' in line or 'console.' in line: return False
    if mode == 'convex': return 'ConvexError(' in line or prev.rstrip().endswith('ConvexError(')
    return True  # (src/core : fichiers d'erreurs choisis à la main, liste donnée par check:i18n)

def main(files, only_lines=None):
    fr_src = open(FR, encoding='utf8').read()
    known = dict(re.findall(r"^  '([^']+)': '((?:[^'\\]|\\.)*)',$", fr_src, re.M))
    added = []
    for f in files:
        mode = 'convex' if f.startswith('convex/') else 'core'
        p = os.path.join(ROOT, f); src = open(p, encoding='utf8').read()
        base = os.path.basename(f)[:-3]
        n = max([int(k.split('.')[-1]) for k in known if k.startswith(base + '.')] + [0])
        edits = []
        for (st, en, text, exprs) in lits_of(src):
            if not is_target(src, st, mode): continue
            if only_lines is not None and O.lineno(src, st) not in only_lines.get(f, set()): continue
            n += 1; code = f'{base}.{n}'
            k = [0]
            def rp(m):
                v = '{p%d}' % k[0]; k[0] += 1; return v
            tpl = re.sub(r"\$\{\d+\}", rp, text)
            args = ', '.join(f'p{i}: {e.strip()}' for i, e in enumerate(exprs))
            rep = f"fe('{code}'" + (f", {{ {args} }}" if exprs else '') + ')'
            edits.append((st, en, rep)); known[code] = tpl; added.append(f"  '{code}': {O.ts_str(tpl)},")
        if not edits: continue
        # un texte DANS l'expression d'un autre (« ?? 'cette carte' ») : celui du dehors l'emporte
        inner = [e for e in edits if any(o is not e and o[0] <= e[0] and e[1] <= o[1] for o in edits)]
        for e in inner:
            c = re.search(r"fe\('([^']+)'", e[2]).group(1); known.pop(c, None)
            added[:] = [a for a in added if not a.startswith(f"  '{c}':")]
        edits = [e for e in edits if e not in inner]
        for st, en, rep in sorted(edits, reverse=True): src = src[:st] + rep + src[en:]
        rel = os.path.relpath(os.path.join(ROOT, 'src/core/errors'), os.path.dirname(p)).replace(os.sep, '/')
        if not rel.startswith('.'): rel = './' + rel
        if not re.search(r"import \{[^}]*\bfe\b[^}]*\} from '[./a-z]*errors'", src):
            m = re.search(r"^import ", src, re.M); at = m.start() if m else 0
            src = src[:at] + f"import {{ fe }} from '{rel}';\n" + src[at:]
        open(p, 'w', encoding='utf8').write(src)
        print(f, len(edits))
    if added:
        s = open(FR, encoding='utf8').read(); c = s.rindex('\n}') + 1
        s = s[:c] + '\n'.join(added) + '\n' + s[c:]
        open(FR, 'w', encoding='utf8').write(s)

if __name__ == '__main__':
    main(sys.argv[1:])
