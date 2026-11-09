"""
Police des gros titres (V2, 08/11) : Atsuka Montreal, retravaillée pour le jeu.
  1. GRAISSAGE : chaque contour est épaissi (FreeType FT_Outline_Embolden, en unités de la police) — la police
     d'origine n'a qu'une graisse, trop fine pour l'interface.
  2. CASSE DU JEU : dans la police, les capitales ont des volutes et les « minuscules » sont des petites capitales
     sans volute. Règle ajoutée : une capitale qui SUIT une autre lettre (dans le même mot) devient petite capitale
     (« BÉBOU PACK » → B à volutes, le reste simple ; vaut aussi après une espace). ccmp + rclt + calt (ccmp/rclt restent appliquées même quand le
     navigateur coupe les ligatures à cause d'un letter-spacing). Les navigateurs mettent en forme les toiles MOT PAR
     MOT : l'initiale unique d'un titre est donc posée par le code (fonts.ts displayCase, CSS .dsp::first-letter).
  3. Sous-ensemble woff2 : caractères codés, sans les ligatures décoratives (« LL » soudés…) ni les jeux ss01–ss19.
Usage : python build_display.py <Atsuka Montreal.otf> <sortie.woff2> [graissage, fraction du cadratin, défaut 0.035]
Dépendances : fonttools, brotli, freetype-py.
"""
import sys
import freetype
from fontTools.ttLib import TTFont
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.feaLib.builder import addOpenTypeFeaturesFromString
from fontTools import subset

src, dst = sys.argv[1], sys.argv[2]
EMB = float(sys.argv[3]) if len(sys.argv) > 3 else 0.035
FAMILY = 'Atsuka Montreal'

font = TTFont(src)
upem = font['head'].unitsPerEm
strength = round(EMB * upem)
order = font.getGlyphOrder()
cff = font['CFF '].cff
top = cff.topDictIndex[0]
cs = top.CharStrings
hmtx = font['hmtx']

# ── 1. graissage
face = freetype.Face(src)
for gid, name in enumerate(order):
    face.load_glyph(gid, freetype.FT_LOAD_NO_SCALE | freetype.FT_LOAD_NO_BITMAP)
    slot = face.glyph
    adv, lsb = hmtx[name]
    if slot.outline.n_points == 0:
        if adv: hmtx[name] = (adv + strength, lsb)  # espaces : même approche que les lettres
        continue
    freetype.FT_Outline_Embolden(freetype.byref(slot._FT_GlyphSlot.contents.outline), strength)
    dx = strength / 2  # garde l'approche gauche ; la chasse grandit du graissage
    pen = T2CharStringPen(adv + strength, None)
    st = {'open': False}

    def P(v):
        return (v.x + dx, v.y)

    def move_to(a, _):
        if st['open']: pen.closePath()
        pen.moveTo(P(a)); st['open'] = True

    def line_to(a, _): pen.lineTo(P(a))
    def conic_to(a, b, _): pen.qCurveTo(P(a), P(b))
    def cubic_to(a, b, c, _): pen.curveTo(P(a), P(b), P(c))

    slot.outline.decompose(None, move_to=move_to, line_to=line_to, conic_to=conic_to, cubic_to=cubic_to)
    if st['open']: pen.closePath()
    c = pen.getCharString(private=cs[name].private, globalSubrs=cs[name].globalSubrs)
    cs[name] = c
    bp = BoundsPen(None); c.draw(bp)
    hmtx[name] = (adv + strength, round(bp.bounds[0]) if bp.bounds else 0)
# les sous-routines d'origine ne servent plus (charstrings réécrits à plat) — elles sont retirées au sous-ensemble

# ── 2. casse du jeu
cmap = font.getBestCmap()
up2low = []
for cp, g in sorted(cmap.items()):
    ch = chr(cp)
    lo, hi = ch.lower(), ch.upper()
    if ch != lo and len(lo) == 1 and ord(lo) in cmap and cmap[ord(lo)] != g:
        up2low.append((g, cmap[ord(lo)]))
q = lambda gs: ' '.join(f'\\{n}' for n in gs)
any_ = sorted(set(order) - {'.notdef'})
fea = f"""
languagesystem DFLT dflt;
languagesystem latn dflt;
@TOUT = [{q(any_)}];
@CAP = [{q(a for a, _ in up2low)}];
@CAP_PETITE = [{q(b for _, b in up2low)}];
lookup SUITE {{
  ignore sub @CAP' ;
}} SUITE;
lookup SUITE_PETITES {{
  sub @TOUT @CAP' by @CAP_PETITE;
}} SUITE_PETITES;
feature ccmp {{ lookup SUITE_PETITES; }} ccmp;
feature rclt {{ lookup SUITE_PETITES; }} rclt;
feature calt {{ lookup SUITE_PETITES; }} calt;
"""
fea = fea.replace("lookup SUITE {\n  ignore sub @CAP' ;\n} SUITE;\n", '')
# la table GSUB d'origine (ligatures, jeux stylistiques) est remplacée par la nôtre
del font['GSUB']
addOpenTypeFeaturesFromString(font, fea, tables=['GSUB'])

# ── 3. sous-ensemble + woff2
o = subset.Options()
o.flavor = 'woff2'; o.name_IDs = ['*']; o.notdef_outline = True; o.desubroutinize = True
o.layout_features = ['ccmp', 'rclt', 'calt', 'kern', 'locl', 'mark', 'mkmk']
s = subset.Subsetter(o)
s.populate(unicodes=cmap.keys())
s.subset(font)
for rec in font['name'].names:
    if rec.nameID in (1, 4, 16): rec.string = FAMILY
font['OS/2'].usWeightClass = 700
font.save(dst)
print(dst, 'graissage', strength, '/', upem, '·', len(up2low), 'capitales → petites capitales après une lettre')
