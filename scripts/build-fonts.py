from fontTools.ttLib import TTFont
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
import os
os.makedirs('out', exist_ok=True)
def accentize(src, dst, family):
    t = TTFont(src)
    gs = t.getGlyphSet(); glyf = t['glyf']; hmtx = t['hmtx']; cm = t.getBestCmap()
    order = t.getGlyphOrder()
    def bounds(n):
        bp = BoundsPen(gs); gs[n].draw(bp); return bp.bounds
    MARK = {  # nom de glyphe source, échelle x, échelle y, ancrage
        'grave': ('grave', 0.42, 0.42, 'top'), 'acute': ('grave', -0.42, 0.42, 'top'),
        'circ': ('asciicircum', 0.42, 0.40, 'top'), 'dier': ('period', 0.42, 0.42, 'top2'), 'ced': ('comma', 0.5, 0.5, 'bottom'),
    }
    COMBO = {'À':('A','grave'),'Â':('A','circ'),'Ä':('A','dier'),'Ç':('C','ced'),'È':('E','grave'),'É':('E','acute'),'Ê':('E','circ'),'Ë':('E','dier'),
             'Î':('I','circ'),'Ï':('I','dier'),'Ô':('O','circ'),'Ö':('O','dier'),'Ù':('U','grave'),'Û':('U','circ'),'Ü':('U','dier'),'Ÿ':('Y','dier'),
             'Á':('A','acute'),'Í':('I','acute'),'Ó':('O','acute'),'Ú':('U','acute'),'Ñ':('N','circ')}
    for k, v in list(COMBO.items()):
        COMBO[k.lower() if k != 'Ÿ' else 'ÿ'] = (v[0].lower(), v[1])
    added = []
    for ch, (base, mk) in COMBO.items():
        if ord(ch) in cm or ord(base) not in cm: continue
        bn = cm[ord(base)]; src_n, sx, sy, anchor = MARK[mk]
        if src_n not in gs: continue
        bx0, by0, bx1, by1 = bounds(bn); mx0, my0, mx1, my1 = bounds(src_n)
        mw = (mx1 - mx0) * abs(sx); mh = (my1 - my0) * sy
        cx = (bx0 + bx1) / 2
        pen = TTGlyphPen(gs)
        gs[bn].draw(pen)
        def place(dx_center, y_bottom):
            # transformée : met le centre x de la marque en dx_center, son bas en y_bottom
            mcx = (mx0 + mx1) / 2
            tx = dx_center - mcx * sx
            ty = y_bottom - my0 * sy
            gs[src_n].draw(TransformPen(pen, (sx, 0, 0, sy, tx, ty)))
        if anchor == 'top': place(cx, by1 + 40)
        elif anchor == 'top2':
            gap = mw * 0.75
            place(cx - gap, by1 + 40); place(cx + gap, by1 + 40)
        else: place(cx, by0 - mh + 30)
        name = f'uni{ord(ch):04X}'
        g = pen.glyph()
        glyf[name] = g
        hmtx[name] = hmtx[bn]

        for tb in t['cmap'].tables:
            if tb.isUnicode(): tb.cmap[ord(ch)] = name
        added.append(ch)
    # point médian « · » (séparateur partout dans l'interface) : un point réduit, centré
    if 0xB7 not in cm and 'period' in gs:
        pen = TTGlyphPen(gs); x0, y0, x1, y1 = bounds('period'); s = 0.62
        gs['period'].draw(TransformPen(pen, (s, 0, 0, s, -x0 * s + 40, 300 - y0 * s)))
        glyf['uni00B7'] = pen.glyph(); hmtx['uni00B7'] = (int((x1 - x0) * s + 80), 40)
        for tb in t['cmap'].tables:
            if tb.isUnicode(): tb.cmap[0xB7] = 'uni00B7'
        added.append('·')

    if 'maxp' in t: t['maxp'].numGlyphs = len(order)
    # nom de famille propre
    for rec in t['name'].names:
        if rec.nameID in (1, 4, 16): rec.string = family
    t.flavor = 'woff2'
    t.save(dst)
    print(dst, 'ajoutés :', ''.join(added))
# (V2, 08/11) gros titres : Atsuka Montreal (graissée, casse du jeu) → scripts/build-display-font.py
# ancienne police des gros titres (V1) : accentize('b/Matcha World.ttf', 'out/matcha-world.woff2', 'Matcha World')
for src, dst in [('a/Bold Frame.ttf', 'out/bold-frame.woff2'), ('a/Bold Frame One.ttf', 'out/bold-frame-one.woff2'), ('a/Bold Frame Two.ttf', 'out/bold-frame-two.woff2')]:
    accentize(src, dst, os.path.basename(src)[:-4])
