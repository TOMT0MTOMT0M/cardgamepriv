"""Écrit src/game/musicPreviews.data.ts (GÉNÉRÉ — ne pas éditer à la main) depuis :
 - scripts/data/music-previews.json : récolte iTunes automatique (harvest-music-previews.py) ;
 - scripts/data/previews-curated-resolved.json : extraits choisis à la main (harvest-curated-previews.py, retours
   Hugo 10/11) — cartes Musique 6★ que la récolte n'a pas trouvées, openings d'animés par sous-thème, génériques de
   dessins animés par sous-thème (15/11), musiques d'ambiance ;
 - scripts/data/previews-overrides.json : corrections à la main (12/11), appliquées en dernier — elles remplacent la récolte.
   Avant le 15/11 elles étaient faites dans le fichier généré : le régénérer les effaçait."""
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(ROOT, 'scripts', 'data')
auto = json.load(open(f'{D}/music-previews.json', encoding='utf-8'))
cur = json.load(open(f'{D}/previews-curated-resolved.json', encoding='utf-8'))
src = json.load(open(f'{D}/previews-curated.json', encoding='utf-8'))
fix = {k: v for k, v in json.load(open(f'{D}/previews-overrides.json', encoding='utf-8')).items() if not k.startswith('_')}
def fixed(kind, rows):
    """corrections à la main : remplacent l'entrée à sa place, ou s'ajoutent à la fin"""
    rows = [(k, fix.get(f'{kind}:{k}', v)) for k, v in rows]
    have = {k for k, _ in rows}
    return rows + [(k.split(':', 1)[1], v) for k, v in fix.items() if k.startswith(kind + ':') and k.split(':', 1)[1] not in have]
js = lambda s: json.dumps(s, ensure_ascii=False)
def entry(k, p):
    parts = [f'url: {js(p.get("url", ""))}']
    if p.get('deezer'): parts.append(f'deezer: {int(p["deezer"])}')
    parts += [f'track: {js(p["track"])}', f'artist: {js(p["artist"])}', f'link: {js(p.get("link", ""))}']
    return f'  {js(k)}: {{ {", ".join(parts)} }},'
cards = [(k, v) for k, v in auto.items() if v]
cards += [(k.split(':', 1)[1], v) for k, v in cur.items() if k.startswith('cards:') and v and not auto.get(k.split(':', 1)[1])]
cards = fixed('cards', cards)
anime = fixed('anime', [(k.split(':', 1)[1], v) for k, v in cur.items() if k.startswith('anime:') and v])
# dessins animés : titre et interprète tels qu'écrits à la main (ceux des boutiques débordent de l'étiquette : 9 interprètes pour les Barbapapa)
def hand(kind):
    return fixed(kind, [(k.split(':', 1)[1], {**v, 'track': src[kind][k.split(':', 1)[1]][0], 'artist': src[kind][k.split(':', 1)[1]][1]})
                        for k, v in cur.items() if k.startswith(kind + ':') and v and k.split(':', 1)[1] in src.get(kind, {})])
cartoon, cartoon_en = hand('cartoon'), hand('cartoon-en')
out = ['/**',
 ' * EXTRAITS MUSICAUX des 6★ — aperçus officiels de 30 s (lus en streaming, rien n’est stocké chez nous).',
 ' * GÉNÉRÉ par scripts/make-music-previews.py (ne pas éditer à la main) depuis la récolte iTunes',
 ' * (harvest-music-previews.py) et les choix faits à la main (data/previews-curated.json → harvest-curated-previews.py).',
 ' * `deezer` : morceau trouvé seulement chez Deezer — son adresse d’aperçu est signée et expire, le jeu la redemande',
 ' * au moment de jouer (musicPreview.ts). Carte absente = pas d’extrait trouvé.',
 ' * Corrections à la main (12/11 : American Idiot, Pump It, Bande organisée, Francis Poulenc) : data/previews-overrides.json.',
 ' */',
 'export interface MusicPreview {',
 '  url: string;',
 '  /** id du morceau chez Deezer (l’adresse `url` est alors vide : résolue à la lecture) */',
 '  deezer?: number;',
 '  track: string;',
 '  artist: string;',
 '  link: string;',
 '}',
 '',
 '/** cartes Musique 6★ (artistes, chansons, albums), par id de carte */',
 'export const MUSIC_PREVIEWS: Record<string, MusicPreview> = {']
out += [entry(k, v) for k, v in cards]
out += ['};', '', '/** (retours Hugo 10/11) opening de l’animé, par sous-thème : joué en fond quand une 6★ de cet animé tombe */',
        'export const ANIME_OPENINGS: Record<string, MusicPreview> = {']
out += [entry(k, v) for k, v in anime]
out += ['};', '', '/** (15/11) générique du dessin animé, par sous-thème du bloc Dessins animés : joué en fond quand une 6★ de ce dessin animé tombe */',
        'export const CARTOON_THEMES: Record<string, MusicPreview> = {']
out += [entry(k, v) for k, v in cartoon]
out += ['};', '', '/** (15/11) version anglaise du générique, jouée à la place dans le jeu en anglais — seulement quand elle diffère */',
        'export const CARTOON_THEMES_EN: Record<string, MusicPreview> = {']
out += [entry(k, v) for k, v in cartoon_en]
amb = fixed('ambience', [(k.split(':', 1)[1], v) for k, v in cur.items() if k.startswith('ambience:') and v])
out += ['};', '', '/** musique d’une ambiance d’ouverture (eclipse : Berserk 5★ / 6★ — game/eclipse.ts), par nom d’ambiance */',
        'export const AMBIENCE_PREVIEWS: Record<string, MusicPreview> = {']
out += [entry(k, v) for k, v in amb]
out += ['};', '']
open(os.path.join(ROOT, 'src', 'game', 'musicPreviews.data.ts'), 'w', encoding='utf-8', newline='\n').write('\n'.join(out))
print('cartes', len(cards), '· animés', len(anime), '· dessins animés', len(cartoon), '(+', len(cartoon_en), 'en anglais)', '· ambiances', len(amb))
