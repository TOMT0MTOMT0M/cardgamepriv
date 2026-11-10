import type { Shell } from '../shell';
import { esc, h } from '../ui';
import { UPDATES } from '../updates.data';
import { PACK_CAP, PACK_REGEN_MS } from '../../core/packRegen';
import { PACK_BUY_DAILY, PACK_PRICE, fmtCoins } from '../../core/economy';
import { CONTRACT_COST } from '../../core/contracts';
import { PITY_LIMIT } from '../../core/pity';
import { GUARANTEED_WEIGHTS, SLOT_WEIGHTS } from '../../core/dropRates';
import { BEBOU_SECRETS_LOCKED, GAME_CARD_COUNT, THEMES, fmtCount } from '../../core/sets/themes';

/**
 * Deux pages d'information (retours 06/11) :
 *  - MISES À JOUR (#/maj) : le journal des nouveautés, mois par mois (src/game/updates.data.ts) ;
 *  - TUTORIEL (#/tuto) : les grandes règles du site, chiffres lus dans le code (ils suivent tout seuls).
 */
export interface InfoView {
  el: HTMLElement;
  enter(): void;
  leave(): void;
}

const TAG_LABEL = { nouveau: 'Nouveau', amélioré: 'Amélioré', corrigé: 'Corrigé' } as const;

/**
 * Un point « Libellé : texte » → libellé en titre court + texte lisible dessous (retours 11/11 : « pas lisible »).
 * Seulement si le libellé est court (sinon c'est une phrase qui contient « : »).
 */
function point(p: string): string {
  const i = p.indexOf(' : ');
  if (i > 0 && i <= 32) {
    const t = p.slice(i + 3);
    return `<li class="if-p"><b class="if-p-k">${esc(nbsp(p.slice(0, i)))}</b><span class="if-p-t">${esc(nbsp(t.charAt(0).toUpperCase() + t.slice(1)))}</span></li>`;
  }
  return `<li class="if-p"><span class="if-p-t">${esc(nbsp(p))}</span></li>`;
}
/** espaces insécables de la typo française : jamais un « ou un ! seul en début de ligne */
const nbsp = (s: string) => s.replace(/« /g, '«\u00a0').replace(/ ([»!?:;])/g, '\u00a0$1');

/** Les entrées les plus récentes sont dépliées ; les autres se lisent d'un toucher (le titre suffit pour s'y retrouver). */
const OPEN_ENTRIES = 2;

export function createUpdatesView(shell: Shell): InfoView {
  const el = h('section', 'view infos');
  let n = 0;
  el.innerHTML = `<div class="if-wrap if-maj">
    <header class="if-head"><span class="kicker">MISES À JOUR</span><h1>Quoi de neuf</h1><p class="muted">Tout ce qui change sur le site. Le plus récent en haut.</p></header>
    ${UPDATES.map((m) => `<section class="if-month"><h2>${esc(m.month)}</h2>${m.intro ? `<p class="if-intro">${esc(m.intro)}</p>` : ''}
      ${m.entries
        .map((e) => {
          const tag = e.tag === 'amélioré' ? 'up' : e.tag === 'corrigé' ? 'fix' : 'new';
          const nb = e.points.length;
          return `<details class="if-entry"${n++ < OPEN_ENTRIES ? ' open' : ''}>
            <summary><span class="if-e-h"><span class="if-date">${esc(e.date)}</span><span class="if-tag t-${tag}">${TAG_LABEL[e.tag]}</span></span>
              <span class="if-e-t"><h3>${esc(e.title)}</h3><span class="if-e-n">${nb} ${nb > 1 ? 'nouveautés' : 'nouveauté'}</span></span></summary>
            <ul class="if-points">${e.points.map(point).join('')}</ul>
          </details>`;
        })
        .join('')}
    </section>`).join('')}
  </div>`;
  return { el, enter: () => (shell.show(null), shell.setDimmed(true)), leave() {} };
}

export function createTutorialView(shell: Shell): InfoView {
  const el = h('section', 'view infos');
  const pct = (v: number) => `${String(v).replace('.', ',')} %`;
  const rows = (['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'] as const)
    .map((r, i) => `<tr><td>${'★'.repeat(i + 1)}</td><td>${pct(SLOT_WEIGHTS[r])}</td><td>${GUARANTEED_WEIGHTS[r] ? pct(GUARANTEED_WEIGHTS[r]) : '—'}</td></tr>`)
    .join('');
  const sec = (id: string, title: string, body: string) => `<section class="if-sec" id="tuto-${id}"><h2>${title}</h2>${body}</section>`;
  const toc: Array<[string, string]> = [
    ['principe', 'Le principe'], ['boosters', 'Les boosters'], ['rarete', 'Les raretés'], ['pieces', 'Les pièces'],
    ['collection', 'La collection'], ['contrats', 'Contrats et forge'], ['echanges', 'Les échanges'], ['jeux', 'Les jeux'], ['profil', 'Ton profil'], ['aide', 'Un souci ?'],
  ];
  el.innerHTML = `<div class="if-wrap">
    <header class="if-head"><span class="kicker">TUTORIEL</span><h1>Comment ça marche</h1><p class="muted">Les grandes règles du site, en deux minutes de lecture.</p></header>
    <nav class="if-toc" aria-label="Sommaire">${toc.map(([id, t]) => `<a href="#/tuto" data-to="${id}">${t}</a>`).join('')}</nav>
    ${sec('principe', 'Le principe', `<p>Bébou Cartes, c’est notre jeu de cartes à collectionner, entre nous. On ouvre des boosters, on complète sa collection et on s’échange les doublons. Pas de combat : tout est dans l’ouverture et la collection. Il y a aujourd’hui <b>${fmtCount(GAME_CARD_COUNT)}</b> cartes à trouver.</p>`)}
    ${sec('boosters', 'Les boosters', `<ul>
      <li><b>5 packs</b> : le <b>Bebou Pack</b> (toutes les cartes des 4 thèmes) et ${THEMES.map((t) => `le <b>${esc(t.label)} Pack</b>`).join(', ')}.</li>
      <li>Un booster = <b>5 cartes</b>, dont au moins une <b>3★</b> ou mieux.</li>
      <li>Ta réserve se recharge toute seule : <b>1 booster toutes les ${PACK_REGEN_MS / 60000} minutes</b>, jusqu’à <b>${PACK_CAP}</b>.</li>
      <li>Tu peux aussi en <b>acheter</b> dans la fiche du booster : ${fmtCoins(PACK_PRICE)} pièces l’unité, ${PACK_BUY_DAILY} par jour au maximum.</li>
      <li><b>5 ou 10 boosters d’un coup</b> : un seul gros booster de 25 ou 50 cartes, avec exactement les mêmes chances.</li>
      <li>« <b>Tout révéler</b> » retourne les cartes tout seul ; « <b>4★ et plus</b> » ne s’arrête que sur les belles.</li>
      <li><b>Pity</b> : après ${PITY_LIMIT - 1} boosters sans 6★, le suivant en contient une à coup sûr.</li>
    </ul>`)}
    ${sec('rarete', 'Les raretés', `<p>Chaque carte a de <b>1★ à 6★</b>. Les chances, pour chaque carte d’un booster :</p>
      <table class="if-table"><thead><tr><th>Étoiles</th><th>Cartes 1 à 4</th><th>Carte 5 (garantie)</th></tr></thead><tbody>${rows}</tbody></table>
      <p>Dans la fiche d’un booster, la chance exacte de <b>chaque carte</b> est écrite sous elle. Au-dessus de tout : les cartes <b>secrètes</b> (les Merveilles du monde dans le World Pack${BEBOU_SECRETS_LOCKED ? ', et les Bébous, verrouillées pour l’instant' : ', et les Bébous dans le Bebou Pack'}).</p>`)}
    ${sec('pieces', 'Les pièces', `<ul>
      <li>Chaque booster ouvert rapporte quelques pièces.</li>
      <li>Le <b>calendrier</b> (la flamme en haut) : un cadeau par jour de connexion, de plus en plus gros sur 30 jours. <b>10 boosters</b> chaque semaine d’affilée, et <b>50 boosters</b> en plus pour un mois parfait.</li>
      <li>Les <b>missions</b> du jour et de la semaine, les <b>succès</b>, et les <b>primes de complétion</b> (5 pièces par carte d’un album bouclé).</li>
      <li>On les dépense en boosters, en mises dans l’espace Jeux et dans les échanges.</li>
    </ul>`)}
    ${sec('collection', 'La collection', `<ul>
      <li><b>Cartes</b> : toutes tes cartes, les plus rares d’abord. <b>Albums</b> : un thème, puis ses familles (Pokémon, Jeux vidéo…), puis les albums et leurs cartes.</li>
      <li>Touche une carte pour la voir en grand ; ♥ l’ajoute à tes <b>envies</b>.</li>
      <li>Les <b>classeurs</b> rangent tes cartes comme tu veux ; épingles-en un sur ton profil.</li>
    </ul>`)}
    ${sec('contrats', 'Contrats et forge', `<ul>
      <li><b>Contrat</b> : brûle des doublons d’une même étoile contre <b>une carte de l’étoile au-dessus</b> — 1★ et 2★ : ${CONTRACT_COST.common} cartes · 3★ et 4★ : ${CONTRACT_COST.rare} · 5★ : ${CONTRACT_COST.legendary}. Elle vient des mêmes familles que les cartes brûlées, et c’est une nouvelle carte si tu peux en avoir une.</li>
      <li><b>Forge</b> : brûle des doublons contre des pièces.</li>
      <li>On ne perd jamais le dernier exemplaire d’une carte.</li>
    </ul>`)}
    ${sec('echanges', 'Les échanges', `<ul>
      <li>Le <b>tableau d’offres</b> (en haut) : publie des cartes, les autres te font leurs offres ; tu acceptes, refuses ou fais une contre-offre.</li>
      <li>Les <b>échanges directs</b> (en dessous) : choisis un ami, le jeu croise vos collections et propose les « matchs parfaits ».</li>
      <li>Une carte engagée dans une annonce ou un échange en cours est <b>verrouillée</b> 🔒 jusqu’à la fin.</li>
    </ul>`)}
    ${sec('jeux', 'Les jeux', `<ul>
      <li><b>1v1 Pack Battle</b> : chacun mise le même nombre de boosters ; on ouvre côte à côte, le plus gros total d’étoiles rafle toutes les cartes.</li>
      <li><b>Battle Royale</b> : de 3 à 8 joueurs, un booster chacun, le meilleur total gagne tout.</li>
      <li><b>Roulette</b> : mise sur des numéros, deux tirages par jour.</li>
    </ul>`)}
    ${sec('profil', 'Ton profil', `<p>« <b>Personnaliser</b> » : bannière, cadre, couleur, vitrine, titre et badges. Une palette de couleurs commune à tout, plus la couleur libre ; certaines couleurs se débloquent avec les <b>succès</b>. La vitrine montre tes plus belles cartes.</p>`)}
    ${sec('aide', 'Un souci ?', `<p>Un bug, une carte à refaire, une idée : l’onglet <a href="#/suggestions">Suggestions</a>. Hugo et Tom les reçoivent et te répondent là-bas. Les nouveautés sont dans <a href="#/maj">Mises à jour</a>.</p>`)}
  </div>`;
  el.querySelectorAll<HTMLAnchorElement>('.if-toc a').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      el.querySelector(`#tuto-${a.dataset.to}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }),
  );
  return { el, enter: () => (shell.show(null), shell.setDimmed(true)), leave() {} };
}
