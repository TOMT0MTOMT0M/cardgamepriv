"""Écrit src/game/musicPreviews.data.ts (GÉNÉRÉ — ne pas éditer à la main) depuis :
 - scripts/data/music-previews.json : récolte iTunes automatique (harvest-music-previews.py) ;
 - scripts/data/previews-curated-resolved.json : extraits choisis à la main (harvest-curated-previews.py, retours
   Hugo 10/11) — cartes Musique 6★ que la récolte n'a pas trouvées, et openings d'animés par sous-thème."""
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(ROOT, 'scripts', 'data')
auto = json.load(open(f'{D}/music-previews.json', encoding='utf-8'))
cur = json.load(open(f'{D}/previews-curated-resolved.json', encoding='utf-8'))
js = lambda s: json.dumps(s, ensure_ascii=False)
def entry(k, p):
    parts = [f'url: {js(p.get("url", ""))}']
    if p.get('deezer'): parts.append(f'deezer: {int(p["deezer"])}')
    parts += [f'track: {js(p["track"])}', f'artist: {js(p["artist"])}', f'link: {js(p.get("link", ""))}']
    return f'  {js(k)}: {{ {", ".join(parts)} }},'
cards = [(k, v) for k, v in auto.items() if v]
cards += [(k.split(':', 1)[1], v) for k, v in cur.items() if k.startswith('cards:') and v and not auto.get(k.split(':', 1)[1])]
anime = [(k.split(':', 1)[1], v) for k, v in cur.items() if k.startswith('anime:') and v]
out = ['/**',
 ' * EXTRAITS MUSICAUX des 6★ — aperçus officiels de 30 s (lus en streaming, rien n’est stocké chez nous).',
 ' * GÉNÉRÉ par scripts/make-music-previews.py (ne pas éditer à la main) depuis la récolte iTunes',
 ' * (harvest-music-previews.py) et les choix faits à la main (data/previews-curated.json → harvest-curated-previews.py).',
 ' * `deezer` : morceau trouvé seulement chez Deezer — son adresse d’aperçu est signée et expire, le jeu la redemande',
 ' * au moment de jouer (musicPreview.ts). Carte absente = pas d’extrait trouvé.',
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
out += ['};', '']
open(os.path.join(ROOT, 'src', 'game', 'musicPreviews.data.ts'), 'w', encoding='utf-8', newline='\n').write('\n'.join(out))
print('cartes', len(cards), '· animés', len(anime))
