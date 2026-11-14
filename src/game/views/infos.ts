import { lang, t as tr } from '../../core/i18n';
import '../../core/i18n/fr/game.views.infos'; // (textes de ce module, version anglaise)
import type { Shell } from '../shell';
import { esc, fmtN, h } from '../ui';
import { CARDS_TOKEN, UPDATES, type UpdateMonth } from '../updates.data';
import { PACK_CAP, PACK_REGEN_MS } from '../../core/packRegen';
import { PACK_PRICE, fmtCoins } from '../../core/economy';
import { CONTRACT_COST } from '../../core/contracts';
import { PITY_LIMIT } from '../../core/pity';
import { GUARANTEED_WEIGHTS, SLOT_WEIGHTS } from '../../core/dropRates';
import { BEBOU_SECRETS_LOCKED, GAME_CARD_COUNT, PUBLIC_CARD_COUNT, THEMES } from '../../core/sets/themes';

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

const TAG_LABEL = () => ({ nouveau: tr('if.tagNew'), amélioré: tr('if.tagUp'), corrigé: tr('if.tagFix') }) as const;

/**
 * Un point « Libellé : texte » → libellé en titre court + texte lisible dessous (retours 11/11 : « pas lisible »).
 * Seulement si le libellé est court (sinon c'est une phrase qui contient « : »).
 */
function point(p: string): string {
  const sep = lang() === 'fr' ? ' : ' : ': '; // (anglais : « Market: … »)
  const i = p.indexOf(sep);
  if (i > 0 && i <= 32) {
    const t = p.slice(i + sep.length);
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
  // (version anglaise, lot 7) notes en anglais : fichier à part (updates.en.ts), téléchargé seulement en anglais
  const render = (list: UpdateMonth[]) => {
  let n = 0;
  el.innerHTML = `<div class="if-wrap if-maj">
    <header class="if-head"><span class="kicker">${tr('if.updKicker')}</span><h1>${tr('if.whatsNew')}</h1><p class="muted">${tr('if.updSub')}</p></header>
    ${list.map((m) => `<section class="if-month"><h2>${esc(m.month)}</h2>${m.intro ? `<p class="if-intro">${esc(m.intro)}</p>` : ''}
      ${m.entries
        .map((e) => {
          const tag = e.tag === 'amélioré' ? 'up' : e.tag === 'corrigé' ? 'fix' : 'new'; // i18n-ok (valeurs de données)
          const nb = e.points.length;
          return `<details class="if-entry"${n++ < OPEN_ENTRIES ? ' open' : ''}>
            <summary><span class="if-e-h"><span class="if-date">${esc(e.date)}</span><span class="if-tag t-${tag}">${TAG_LABEL()[e.tag]}</span></span>
              <span class="if-e-t"><h3>${esc(e.title)}</h3><span class="if-e-n">${nb} ${tr('if.changeWord', { n: nb })}</span></span></summary>
            <ul class="if-points">${e.points.map((x) => point(x.split(CARDS_TOKEN).join(fmtN(PUBLIC_CARD_COUNT)))).join('')}</ul>
          </details>`;
        })
        .join('')}
    </section>`).join('')}
  </div>`;
  };
  render(UPDATES);
  if (lang() === 'en') void import('../updates.en').then((m) => lang() === 'en' && render(m.UPDATES_EN));
  return { el, enter: () => (shell.show(null), shell.setDimmed(true)), leave() {} };
}

export function createTutorialView(shell: Shell): InfoView {
  const el = h('section', 'view infos');
  const pct = (v: number) => (lang() === 'fr' ? `${String(v).replace('.', ',')} %` : `${v}%`);
  const rows = (['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'] as const)
    .map((r, i) => `<tr><td>${'★'.repeat(i + 1)}</td><td>${pct(SLOT_WEIGHTS[r])}</td><td>${GUARANTEED_WEIGHTS[r] ? pct(GUARANTEED_WEIGHTS[r]) : '—'}</td></tr>`)
    .join('');
  const sec = (id: string, title: string, body: string) => `<section class="if-sec" id="tuto-${id}"><h2>${title}</h2>${body}</section>`;
  const toc: Array<[string, string]> = [
    ['principe', tr('if.principle')], ['boosters', tr('if.boosters')], ['rarete', tr('if.rarities')], ['pieces', tr('if.coins')],
    ['collection', tr('if.collection')], ['contrats', tr('if.contractsForge')], ['echanges', tr('if.trades')], ['jeux', tr('if.games')], ['profil', tr('if.profile')], ['aide', tr('if.help')],
  ];
  el.innerHTML = `<div class="if-wrap">
    <header class="if-head"><span class="kicker">${tr('if.tutoKicker')}</span><h1>${tr('if.tutoTitle')}</h1><p class="muted">${tr('if.tutoSub')}</p></header>
    <nav class="if-toc" aria-label="${tr('if.toc')}">${toc.map(([id, t]) => `<a href="#/tuto" data-to="${id}">${t}</a>`).join('')}</nav>
    ${sec('principe', tr('if.principle'), `<p>${tr('if.principleBody')} <b>${fmtN(BEBOU_SECRETS_LOCKED ? PUBLIC_CARD_COUNT : GAME_CARD_COUNT)}</b> ${tr('if.cardsToFind')}</p>`)}
    ${sec('boosters', tr('if.boosters'), `<ul>
      <li><b>5 packs</b>${tr('if.packsA')} <b>Bebou Pack</b> ${tr('if.packsB', { list: THEMES.map((t) => `${tr('if.the')} <b>${tr('if.packName', { n: esc(t.label) })}</b>`).join(', ') })}</li>
      <li>${tr('if.boosterEq')} <b>${tr('if.fiveCards')}</b>${tr('if.atLeastOne')} <b>3★</b> ${tr('if.orBetter')}</li>
      <li>${tr('if.reserveRefill')} <b>${tr('if.reserveRate', { m: PACK_REGEN_MS / 60000 })}</b>${tr('if.upTo')} <b>${PACK_CAP}</b>.</li>
      <li>${tr('if.canAlso')} <b>${tr('if.buy')}</b> ${tr('if.buyBody', { p: fmtCoins(PACK_PRICE) })}</li>
      <li><b>${tr('if.bulk')}</b>${tr('if.bulkBody')}</li>
      <li>${tr('if.lq')}<b>${tr('if.revealAll')}</b>${tr('if.revealMid')} <b>${tr('if.fourUp')}</b>${tr('if.revealEnd')}</li>
      <li><b>${tr('if.pity')}</b>${tr('if.pityBody', { n: PITY_LIMIT - 1 })}</li>
    </ul>`)}
    ${sec('rarete', tr('if.rarities'), `<p>${tr('if.rarA')} <b>${tr('if.starRange')}</b>${tr('if.rarB')}</p>
      <table class="if-table"><thead><tr><th>${tr('if.stars')}</th><th>${tr('if.cards14')}</th><th>${tr('if.card5')}</th></tr></thead><tbody>${rows}</tbody></table>
      <p>${tr('if.exactA')} <b>${tr('if.eachCard')}</b> ${tr('if.exactB')} <b>${tr('if.secret')}</b> ${tr('if.secretBody', { x: BEBOU_SECRETS_LOCKED ? tr('if.bebouLocked') : tr('if.bebouPack') })}</p>`)}
    ${sec('pieces', tr('if.coins'), `<ul>
      <li>${tr('if.coinsOpen')}</li>
      <li>${tr('if.theCap')} <b>${tr('if.calendar')}</b> ${tr('if.calendarBody')} <b>10 boosters</b> ${tr('if.weekly')} <b>50 boosters</b> ${tr('if.monthly')}</li>
      <li>${tr('if.missionsA')} <b>${tr('if.missions')}</b> ${tr('if.missionsB')} <b>${tr('if.achievements')}</b>${tr('if.andThe')} <b>${tr('if.completion')}</b> ${tr('if.completionBody')}</li>
      <li>${tr('if.spend')}</li>
    </ul>`)}
    ${sec('collection', tr('if.collection'), `<ul>
      <li><b>${tr('if.cardsTab')}</b>${tr('if.cardsTabBody')} <b>${tr('if.albums')}</b>${tr('if.albumsBody')}</li>
      <li>${tr('if.tapCard')} <b>${tr('if.wishlist')}</b>.</li>
      <li>${tr('if.binderA')} <b>${tr('if.binders')}</b> ${tr('if.binderB')}</li>
    </ul>`)}
    ${sec('contrats', tr('if.contractsForge'), `<ul>
      <li><b>${tr('if.contract')}</b>${tr('if.contractA')} <b>${tr('if.contractNext')}</b> ${tr('if.contractBody', { a: CONTRACT_COST.common ?? 0, b: CONTRACT_COST.rare ?? 0, c: CONTRACT_COST.legendary ?? 0 })}</li>
      <li><b>${tr('if.forge')}</b>${tr('if.forgeBody')}</li>
      <li>${tr('if.neverLast')}</li>
    </ul>`)}
    ${sec('echanges', tr('if.trades'), `<ul>
      <li><b>${tr('if.forYou')}</b>${tr('if.forYouBody')}</li>
      <li>${tr('if.yourA')} <b>${tr('if.duplicates')}</b> ${tr('if.dupBody')}</li>
      <li>${tr('if.request')} <b>${tr('if.accept')}</b>, <b>${tr('if.chooseElse')}</b> ${tr('if.fromTheirDups')} <b>${tr('if.decline')}</b>.</li>
      <li><b>${tr('if.search')}</b>${tr('if.searchBody')} <b>${tr('if.compose')}</b> ${tr('if.composeBody')}</li>
      <li>${tr('if.lockedA')} <b>${tr('if.locked')}</b> ${tr('if.lockedB')}</li>
    </ul>`)}
    ${sec('jeux', tr('if.games'), `<ul>
      <li><b>1v1 Pack Battle</b>${tr('if.battleBody')}</li>
      <li><b>Battle Royale</b>${tr('if.royaleBody')}</li>
      <li><b>${tr('if.roulette')}</b>${tr('if.rouletteBody')}</li>
    </ul>`)}
    ${sec('profil', tr('if.profile'), `<p>${tr('if.lq')}<b>${tr('if.customise')}</b>${tr('if.customiseBody')} <b>${tr('if.achievements')}</b>${tr('if.showcaseBody')}</p>`)}
    ${sec('aide', tr('if.help'), `<p>${tr('if.helpA')} <a href="#/suggestions">${tr('if.suggestions')}</a>${tr('if.helpB')} <a href="#/maj">${tr('if.updates')}</a>.</p>`)}
  </div>`;
  el.querySelectorAll<HTMLAnchorElement>('.if-toc a').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      el.querySelector(`#tuto-${a.dataset.to}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }),
  );
  return { el, enter: () => (shell.show(null), shell.setDimmed(true)), leave() {} };
}
