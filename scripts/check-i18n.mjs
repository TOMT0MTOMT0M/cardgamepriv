/**
 * (version anglaise, lot 8) RE-SCANNE le code côté joueur et liste tout texte français resté en dur (au lieu de t()).
 *   npm run check:i18n            → liste fichier:ligne + texte, et le total ; code de sortie 1 s'il en reste
 *   npm run check:i18n -- --count → seulement les totaux par fichier
 * Côté joueur = tout ce que le jeu importe depuis src/game/main.ts (hors catalogues générés src/core/sets,
 * dictionnaires src/core/i18n, titres de musique, rapport technique diag.ts) : le labo et l'admin restent en français. Ignorés : commentaires, console.*, sélecteurs, imports, clés de t().
 * Un texte français VOULU (blague du club, nom propre) se marque en fin de ligne : `// i18n-ok`.
 * Repère le français par ses accents / apostrophes typographiques ou ses petits mots (le, des, ton, pas…).
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
// (musicPreviews.data.ts : titres et artistes, en version originale)
const SKIP = [/src[\\/]core[\\/]sets[\\/]/, /src[\\/]core[\\/]i18n[\\/]/, /src[\\/]core[\\/]i18n\.ts$/, /\.test\.ts$/, /\.d\.ts$/, /musicPreviews\.data\.ts$/, /src[\\/]game[\\/]diag\.ts$/];
const ONLY_COUNT = process.argv.includes('--count');

const ACCENT = /[àâçéèêëîïôûùüÿœæÀÂÇÉÈÊËÎÏÔÛÙÜŸŒ’«»]/;
const WORDS = /\b(le|la|les|des|une|du|au|aux|et|ou|est|sont|pas|plus|avec|pour|dans|sur|ton|ta|tes|tu|toi|vous|votre|il|elle|on|ce|cette|ces|qui|que|ne|ici|rien|tout|tous|encore|jamais|aucun|aucune|carte|cartes|joueur|joueurs|ami|amis|échange|pièces|ouvrir|voir|fermer|retour|chargement|connexion|réseau|mise|jeu|jeux|demain|aujourd|hier|minutes?|secondes?|heures?|jours?|se|mon|ma|mes|son|sa|ses|leur|leurs|nos|notre|par|sans|chez|depuis|avant|après|oui|non|fois|semaine|mois|ans|niveau|saison|ton|annuler|valider|envoyer|refuser|accepter|retirer|ajouter|supprimer|modifier|enregistrer|partager|copier|suivant|nouveau|nouvelle|nouvelles|recharger|couper|activer|réessayer|terminer|garder|vendre|acheter|donner|choisir|chercher|trier|profil|boutique|classement|envies|doublons|vitrine|cadre|titre|gagné|perdu|offre|offres|tirage|tirages|collectionner|bébous?)\b/i;
// mot seul en capitale (« Cadre », « Personnaliser ») : un libellé, sauf noms de touches et noms propres
const IDENT = /^(Escape|Enter|Tab|Space|Backspace|Delete|Home|End|PageUp|PageDown|Shift|Control|Meta|Alt|Arrow(Left|Right|Up|Down)|Bébou|BÉBOU|Discord|Chrome|Safari|Edge|Firefox|WebGPU|WebGL|Convex|Pokémon|Valorant|Mythic|Infinity|NaN|Error|Promise|Date|Math|Object|Array|String|Number|Boolean|JSON|Intl|Map|Set|Symbol|None|Auto|Inter)$/;
const CAP = /^[A-ZÀ-Ý][a-zà-ÿ]{2,}$/;
const LONE = /^(oui|non|annuler|valider|envoyer|refuser|accepter|retirer|ajouter|supprimer|modifier|enregistrer|partager|copier|suivant|nouveau|nouvelle|recharger|couper|activer|réessayer|terminer|ouvrir|garder|vendre|acheter|donner|choisir|chercher|trier|fermer|retour|profil|boutique|classement|envies|doublons|vitrine|bientôt|connexion|amis|jeux|tirages|gagnant|perdant|semaine|mois|aujourd’hui|demain|hier|rejouer|parier|miser|jouer|quitter|continuer|commencer|confirmer|voir|plus|moins|tout|tous|aucun|aucune|rien|son|langue|vibrations|succès|saison|niveau|rang|offre|pari|mise|gains|vendu|acheté|reçu|envoyé|refusé|accepté|annulé|terminé|expiré|attente|libre|plein|pleine|vide|tutoriel|chargement|relancer|portefeuille|réglages|paramètres)[.!…:]?$/i;
const looksFrench = (s) => {
  const txt = s.replace(/<[^>]*>/g, ' ').replace(/\$\{[^}]*\}/g, ' ').replace(/&[a-z]+;/g, ' ').trim();
  if (!/[A-Za-zÀ-ÿ]{2}/.test(txt)) return false;
  if (/^[\w.#:/@\-[\]=*'" ]+$/.test(txt) && !/\s/.test(txt.trim())) return ACCENT.test(txt) || LONE.test(txt.trim()) || (CAP.test(txt.trim()) && !IDENT.test(txt.trim())); // (un mot seul : accent, mot d'interface connu, ou libellé en capitale)
  if (/^(M|L|C|Q|A|Z|H|V)[\d .,\-]+/.test(txt)) return false; // (tracé SVG)
  return ACCENT.test(txt) || WORDS.test(txt);
};

/** Fichiers atteints depuis le jeu (src/game/main.ts, imports statiques et import()) : le labo et l'admin n'en font pas partie. */
function* files() {
  const seen = new Set();
  const todo = [join(ROOT, 'src/game/main.ts')];
  while (todo.length) {
    const f = todo.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    if (!f.endsWith('.css')) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/(?:from\s*|import\s*\(\s*|import\s+)['"](\.{1,2}\/[^'"]+)['"]/g)) {
        const base = resolve(dirname(f), m[1]);
        const hit = [base, `${base}.ts`, join(base, 'index.ts')].find((p) => existsSync(p) && /\.(ts|css)$/.test(p));
        if (hit) todo.push(hit);
      }
    }
    if (!SKIP.some((r) => r.test(f))) yield f;
  }
}

/** Chaînes d'un fichier TS (hors commentaires), avec leur ligne et ce qui les précède sur la ligne. */
function strings(src) {
  const out = [];
  let i = 0;
  let line = 1;
  const n = src.length;
  const push = (start, text, ln) => out.push({ text, line: ln, before: src.slice(src.lastIndexOf('\n', start) + 1, start) });
  const tpl = (depthStack) => {
    // lit un gabarit `…` à partir de src[i] === '`'
    const ln = line;
    const start = i;
    i++;
    let text = '';
    while (i < n && src[i] !== '`') {
      if (src[i] === '\\') {
        text += src[i] + src[i + 1];
        i += 2;
        continue;
      }
      if (src[i] === '$' && src[i + 1] === '{') {
        text += '${…}';
        i += 2;
        code(1);
        continue;
      }
      if (src[i] === '\n') line++;
      text += src[i++];
    }
    i++;
    push(start, text, ln);
  };
  const code = (stopAtBrace) => {
    let depth = 0;
    while (i < n) {
      const c = src[i];
      if (c === '\n') {
        line++;
        i++;
      } else if (c === '/' && src[i + 1] === '/') {
        while (i < n && src[i] !== '\n') i++;
      } else if (c === '/' && src[i + 1] === '*') {
        i += 2;
        while (i < n && !(src[i] === '*' && src[i + 1] === '/')) (src[i++] === '\n' ? line++ : 0);
        i += 2;
      } else if (c === "'" || c === '"') {
        const ln = line;
        const start = i;
        i++;
        let text = '';
        while (i < n && src[i] !== c && src[i] !== '\n') {
          if (src[i] === '\\') text += src[i++];
          text += src[i++];
        }
        i++;
        push(start, text, ln);
      } else if (c === '`') tpl();
      else if (c === '/' && /[=(,:;!&|?{}\[\n]\s*$/.test(src.slice(Math.max(0, i - 20), i))) {
        // expression régulière : sautée
        i++;
        let cls = false;
        while (i < n && (src[i] !== '/' || cls) && src[i] !== '\n') {
          if (src[i] === '\\') i++;
          else if (src[i] === '[') cls = true;
          else if (src[i] === ']') cls = false;
          i++;
        }
        i++;
      } else if (stopAtBrace && c === '{') {
        depth++;
        i++;
      } else if (stopAtBrace && c === '}') {
        i++;
        if (depth-- === 0) return;
      } else i++;
    }
  };
  code(0);
  return out;
}

const IGNORE_BEFORE = /(console\.\w+\(|import\s|from\s*$|querySelector(All)?(<[^>]*>)?\(|closest(<[^>]*>)?\(|perfMark\(|trip\(|matches\(|\bt\(|i18n-ok|classList\.\w+\(|className\s*=\s*|getElementById\(|dataset\.|addEventListener\(|setAttribute\('(class|data-|id)|new Error\(|throw new \w+\()\s*[^'"`]*$/;

let total = 0;
const per = [];
{
  for (const f of files()) {
    const src = readFileSync(f, 'utf8');
    const lines = src.split('\n');
    const rel = relative(ROOT, f).replace(/\\/g, '/');
    const hits = [];
    if (f.endsWith('.css')) {
      lines.forEach((l, k) => {
        const m = /content:\s*(['"])(.*?)\1/.exec(l);
        if (m && /[A-Za-zÀ-ÿ]{2}/.test(m[2]) && !l.includes('i18n-ok')) hits.push({ line: k + 1, text: m[2] });
      });
    } else {
      for (const s of strings(src)) {
        if (IGNORE_BEFORE.test(s.before)) continue;
        if ((lines[s.line - 1] ?? '').includes('i18n-ok')) continue;
        if (!/<[a-zA-Z/!][^>]*>/.test(s.text)) {
          // (un mot seul, sans accent, en minuscules : une clé ou une route — « profil », « amis » — pas un texte)
          if (looksFrench(s.text) && !(/^[a-z][a-z-]*$/.test(s.text.trim()))) hits.push(s);
          continue;
        }
        // HTML : chaque texte entre balises, et les attributs lus (title, aria-label, placeholder, alt)
        const parts = s.text.split(/<[^>]*>/);
        for (const m of s.text.matchAll(/\b(?:title|aria-label|placeholder|alt|data-tip)="([^"]*)"/g)) parts.push(m[1]);
        for (const p of parts) if (looksFrench(p.trim())) hits.push({ ...s, text: p.trim() });
      }
    }
    if (!hits.length) continue;
    total += hits.length;
    per.push([rel, hits.length]);
    if (!ONLY_COUNT) for (const h of hits) console.log(`${rel}:${h.line}: ${h.text.replace(/\s+/g, ' ').slice(0, 140)}`);
  }
}
if (ONLY_COUNT) for (const [f, c] of per.sort((a, b) => b[1] - a[1])) console.log(String(c).padStart(5), f);
console.log(`\n${total} texte(s) français en dur côté joueur dans ${per.length} fichier(s).`);
process.exit(total > 0 ? 1 : 0);
