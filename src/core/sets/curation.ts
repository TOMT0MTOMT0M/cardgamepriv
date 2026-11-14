import type { CatalogRarity } from './themesCore';

/**
 * CURATION DU CATALOGUE (08/11/2026) — appliquée à l'installation du catalogue (themesCore.installCatalog), donc
 * partout à la fois : jeu, labo, serveur Convex et tests. Les fichiers générés (src/core/sets/*.ts) ne sont pas touchés.
 *
 * 1. PURGE_08_11 : cartes 1★–4★ qui n'affichaient pas une vraie illustration mais un PLACEHOLDER (« NO IMAGE »,
 *    « IMAGE MANQUANTE », icône de personne, croix, aplat gris, anneaux olympiques / drapeau / médaille génériques à la
 *    place de l'athlète). Repérées par un scan des 37 088 miniatures (fichiers identiques partagés + sosies + aplats).
 *    Les 5★ et 6★ concernées sont GARDÉES le temps de leur trouver une image. Retirées des collections par
 *    migrations:purgeCards (la liste est ajoutée à convex/purgedCards.ts). Ne pas réutiliser ces ids.
 * 2. RERATE_08_11 : renotation au PRISME OCCIDENTAL — artistes, acteurs, sportifs et villes dont la notoriété est
 *    surtout locale hors Occident (cinéma et musique indiens, J-pop / K-pop de niche, cricket, badminton, tennis de table,
 *    sumo, mégapoles chinoises…) : un nom énorme en Inde mais peu connu en France / Europe / US ne reste pas 5★ ou 6★.
 *    Les inventaires suivent par migrations:resyncRarities (lancée à chaque mise en ligne).
 */
export const PURGE_08_11: readonly string[] = ["jv-battlefield-battlefield-6", "pop-ad", "pop-announcer", "pop-assistant-producer", "pop-bandman", "pop-basket-bu-buchou", "pop-biu-yuen", "pop-buin-a", "pop-buin-b", "pop-buin-c", "pop-buin-d", "pop-buin-e", "pop-couple-onna", "pop-couple-otoko", "pop-dansei-kyaku", "pop-danshi-seito", "pop-danshi-seito-a", "pop-dansi-seito-a", "pop-dansi-seito-b", "pop-doukyuusei", "pop-drone-taiin", "pop-eki-kounai-announcer", "pop-eugene-bigot", "pop-gakushoku-no-oba-chan", "pop-game-onsei", "pop-haha", "pop-haruichi-no-yuujin", "pop-hiyori-no-papa", "pop-hugo-marchand", "pop-john-titor", "pop-josei-announcer", "pop-josei-kyoushi", "pop-joshi-b", "pop-joshi-gakusei", "pop-kantoku", "pop-keno", "pop-kinuyo", "pop-koshimoto", "pop-kurofuku-a", "pop-kurofuku-b", "pop-kurofuku-c", "pop-kurofuku-d", "pop-kurofuku-e", "pop-kurofuku-f", "pop-kurtis-blow", "pop-laundry-machine-ai", "pop-man-in-the-car", "pop-momo-no-yuujin-a", "pop-momo-no-yuujin-b", "pop-onnanoko", "pop-onnanoko-a", "pop-otokonoko-b", "pop-otonoko-c", "pop-perfect-day-chansons", "pop-redtron", "pop-salamander", "pop-seito", "pop-shikisho-taiin", "pop-shinatisou-bu-komon", "pop-shinbun-kisha", "pop-shougakusei-danshi-a", "pop-shougakusei-danshi-b", "pop-sonohokasei", "pop-taiiku-kyoushi", "pop-taku", "pop-tannin-kyoushi", "pop-trauma-team", "pop-tv-announcer", "pop-tv-kyoku-producer", "pop-wakai-onna", "pop-yatazaki", "spt-amy-frazier", "spt-anna-karin-kammerling", "spt-ariarne-titmus", "spt-arlen-lopez", "spt-astrid-bard", "spt-beryl-gastaldello", "spt-championnats-du-monde-d-escrime", "spt-championnats-du-monde-d-halterophilie", "spt-championnats-du-monde-de-bmx", "spt-championnats-du-monde-de-luge", "spt-championnats-du-monde-de-water-polo", "spt-darryn-binder", "spt-david-wise", "spt-equipe-de-norvege-de-handball", "spt-esther-baron", "spt-gabriel-rodrigo", "spt-gary-hall-jr", "spt-guillaume-samica", "spt-hocine-soltani", "spt-isaac-vinales", "spt-john-mcphee", "spt-jorge-martin", "spt-julie-halard", "spt-karim-bennani", "spt-kyle-chalmers", "spt-lang-ping", "spt-matt-biondi", "spt-michelle-gisin", "spt-miklos-ungvari", "spt-mitch-richmond", "spt-mohamed-henni", "spt-mykola-kuksenkov", "spt-nur-tatar", "spt-nurcan-taylan", "spt-olivier-marceau", "spt-om-yun-chol", "spt-pernell-whitaker", "spt-petria-thomas", "spt-pierre-mazeaud", "spt-remy-gardner", "spt-roland-mark-schoeman", "spt-roland-schoeman", "spt-silvia-farina", "spt-stephane-ferrara", "spt-tamas-kasas", "spt-tamas-molnar", "spt-tamerlan-tmenov", "spt-tatsuki-suzuki", "spt-tibor-benedek", "val-2a049f35-4bcd-af25-21fd-ec942e2d5007", "val-5211efa8-4efd-09bb-6cee-72b86a8a5972", "val-7122d78b-4e60-eb4d-5f65-738d7c1ce9ae"];

/**
 * (08/11, demande de Tom) tout ce qui touche à Patrick Bruel est retiré du jeu : l'artiste (5★), ses 4 chansons, et
 * Vincent Larchet (son rôle dans « Le Prénom », avec sa photo). Même traitement que la purge : catalogue + collections.
 * + (10/11) Pierre Ménès (Commentateurs, 5★).
 * + (11/11) Gérard Depardieu (Acteurs).
 * + (12/11, demande de Tom) Norman fait des vidéos (YouTube FR, 6★).
 */
export const PURGE_BRUEL: readonly string[] = ['pop-patrick-bruel', 'pop-casser-la-voix', 'pop-alors-regarde', 'pop-place-des-grands-hommes', 'pop-qui-a-le-droit', 'pop-vincent-larchet', 'spt-pierre-menes', 'pop-gerard-depardieu', 'pop-norman-fait-des-videos'];

export const RERATE_08_11: Readonly<Record<string, CatalogRarity>> = {"pop-asha-bhosle": "rare", "pop-k-j-yesudas": "uncommon", "pop-p-susheela": "uncommon", "pop-s-janaki": "uncommon", "pop-s-p-balasubrahmanyam": "uncommon", "pop-a-r-rahman": "rare", "pop-alka-yagnik": "uncommon", "pop-amitabh-bachchan": "rare", "pop-hariharan": "uncommon", "pop-ilaiyaraaja": "uncommon", "pop-kamal-haasan": "uncommon", "pop-karthik": "common", "pop-kishore-kumar": "uncommon", "pop-lata-mangeshkar": "rare", "pop-mano": "common", "pop-mohammed-rafi": "uncommon", "pop-sonu-nigam": "uncommon", "pop-sunidhi-chauhan": "uncommon", "pop-udit-narayan": "uncommon", "pop-anuradha-sriram": "common", "pop-jagathy-sreekumar": "common", "pop-kumar-sanu": "uncommon", "pop-m-s-viswanathan": "common", "pop-malaysia-vasudevan": "common", "pop-p-jayachandran": "common", "pop-sadhana-sargam": "common", "pop-shaan": "common", "pop-sujatha-mohan": "common", "pop-swarnalatha": "common", "pop-t-m-soundararajan": "common", "pop-tippu": "common", "pop-vani-jairam": "common", "pop-yuvan-shankar-raja": "common", "pop-priyanka-chopra": "rare", "pop-akb48": "uncommon", "pop-super-junior": "uncommon", "pop-girls-generation-musique-monde": "uncommon", "pop-boa": "uncommon", "pop-akshay-kumar": "uncommon", "pop-mammootty": "uncommon", "pop-mohanlal": "uncommon", "pop-rajinikanth": "rare", "pop-salman-khan": "uncommon", "pop-shah-rukh-khan": "rare", "pop-aamir-khan": "uncommon", "pop-andy-lau": "rare", "pop-anil-kapoor": "rare", "pop-anupam-kher": "uncommon", "pop-ayumi-hamasaki": "uncommon", "pop-brahmanandam": "common", "pop-chiranjeevi": "common", "pop-deva": "common", "pop-dharmendra": "common", "pop-m-g-ramachandran": "common", "pop-manorama": "common", "pop-mithun-chakraborty": "uncommon", "pop-naseeruddin-shah": "uncommon", "pop-nassar": "common", "pop-nedumudi-venu": "common", "pop-prakash-raj": "common", "pop-prem-nazir": "common", "pop-shakti-kapoor": "common", "pop-sivaji-ganesan": "common", "pop-sridevi": "uncommon", "pop-sukumari": "common", "pop-abhishek-bachchan": "common", "pop-akkineni-nageswara-rao": "common", "pop-ashok-kumar": "common", "pop-jackie-shroff": "common", "pop-jacky-cheung": "uncommon", "pop-javed-akhtar": "common", "pop-karan-johar": "common", "pop-kolkata-knight-riders": "common", "pop-kota-srinivasa-rao": "common", "pop-nagesh": "common", "pop-om-puri": "uncommon", "pop-sankaradi": "common", "pop-sathyaraj": "common", "pop-tanikella-bharani": "common", "pop-namie-amuro": "uncommon", "pop-madhubala-ek-ishq-ek-junoon": "common", "pop-green": "uncommon", "pop-wonder-boy": "uncommon", "pop-san": "uncommon", "pop-felipe-neto": "uncommon", "pop-whindersson-nunes": "uncommon", "spt-sachin-tendulkar": "epic", "spt-virat-kohli": "rare", "spt-kumar-sangakkara": "rare", "spt-rahul-dravid": "uncommon", "spt-muttiah-muralitharan": "uncommon", "spt-shahid-afridi": "uncommon", "geo-chongqing": "rare", "geo-chengdu": "rare", "geo-canton": "epic", "geo-shenzhen": "epic", "geo-tianjin": "rare", "geo-wuhan": "rare", "geo-xian": "epic", "geo-hangzhou": "rare", "geo-harbin": "rare", "geo-dongguan": "uncommon", "geo-hefei": "uncommon", "geo-weifang": "uncommon", "geo-nankin": "rare", "geo-shenyang": "uncommon", "geo-foshan": "uncommon", "geo-lahore": "rare", "geo-karachi": "rare", "geo-ho-chi-minh-ville": "epic", "geo-bombay-mumbai": "epic", "geo-delhi": "epic", "spt-saina-nehwal": "rare", "spt-hendra-setiawan": "rare", "spt-lee-yong-dae": "rare", "spt-greysia-polii": "uncommon", "spt-feng-tianwei": "rare", "spt-kasumi-ishikawa": "rare", "spt-ding-ning": "rare", "spt-xu-xin": "rare", "spt-kakuryu-rikisaburo": "rare", "spt-raiden-tameimon": "rare", "spt-tanikaze-kajinosuke": "uncommon"};

/**
 * (11/11, demande de Tom) chansons passées en 6★ (les nouvelles 6★ du même lot sont dans le patch
 * donnees/patchs/Patch-pop-chansons-11-11.xlsx). Les inventaires suivent par migrations:resyncRarities.
 */
export const RERATE_11_11: Readonly<Record<string, CatalogRarity>> = {
  'pop-locked-out-of-heaven': 'mythic',
  'pop-running-up-that-hill': 'mythic',
  'pop-take-on-me': 'mythic',
  'pop-wonderwall': 'mythic',
  'pop-in-the-end': 'mythic',
  'pop-californication': 'mythic',
  'pop-uprising': 'mythic',
  'pop-dream-on': 'mythic',
  'pop-every-breath-you-take': 'mythic',
  'pop-l-aziza': 'mythic',
  'pop-face-a-la-mer': 'mythic',
  'pop-petite-marie': 'mythic',
  'pop-cette-annee-la': 'mythic',
  'pop-ne-me-quitte-pas': 'mythic',
  'pop-la-boulette': 'mythic',
};

/** (13/11, demande de Tom) Oner et ShowMaker (LoL esport) passent 6★. Inventaires : migrations:resyncRarities. */
export const RERATE_13_11: Readonly<Record<string, CatalogRarity>> = {
  'spt-oner': 'mythic',
  'spt-showmaker': 'mythic',
};

/**
 * (13/11, demande de Tom) Star Wars et The Mandalorian sont deux univers distincts : les personnages nés dans la série
 * (Grogu, le Mandalorien, Cobb Vanth, Koska Reeves) quittent l'album Star Wars pour The Mandalorian. Ids, numéros et
 * images inchangés ; seul l'album (et donc la complétion) change.
 */
export const RESUB_13_11: Readonly<Record<string, string>> = {
  'pop-grogu': 'the-mandalorian',
  'pop-le-mandalorien': 'the-mandalorian',
  'pop-cobb-vanth': 'the-mandalorian',
  'pop-koska-reeves': 'the-mandalorian',
};
