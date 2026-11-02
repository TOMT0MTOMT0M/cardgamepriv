/**
 * Scraper & Générateur du « WORLD PACK » (🌍 Le Monde)
 * Sources :
 *  - Wikidata SPARQL (tous les pays souverains, sitelinks, drapeaux/photos)
 *  - Wikipedia FR & EN MediaWiki Action API (pageimages 640px par lots de 50)
 *  - Wikimedia Commons Search API (fallback photos HD)
 *  - OpenFoodFacts API (fallback snacks & marques alimentaires)
 *  - Données maison pour l'Ardèche & les 14 Merveilles du Monde (Secrets 3D Diorama)
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const UA = 'CardGamePrivWorldScraper/1.0 (https://main.cardgamepriv.pages.dev; contact@cardgamepriv.local)';

function slugify(str) {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[œŒ]/g, 'oe')
    .replace(/[æÆ]/g, 'ae')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. LES 14 MERVEILLES DU MONDE (7 Antiques + 7 Nouvelles) -> SECRETS (Diorama 3D)
// ─────────────────────────────────────────────────────────────────────────────
const WONDERS_14 = [
  // 7 Merveilles du monde antique
  { name: 'Grande Pyramide de Khéops', wiki: 'Pyramide de Khéops', kind: 'antique', r: 's' },
  { name: 'Jardins suspendus de Babylone', wiki: 'Jardins suspendus de Babylone', kind: 'antique', r: 's' },
  { name: 'Statue de Zeus à Olympie', wiki: 'Statue chryséléphantine de Zeus à Olympie', kind: 'antique', r: 's' },
  { name: "Temple d'Artémis à Éphèse", wiki: "Temple d'Artémis à Éphèse", kind: 'antique', r: 's' },
  { name: "Mausolée d'Halicarnasse", wiki: "Mausolée d'Halicarnasse", kind: 'antique', r: 's' },
  { name: 'Colosse de Rhodes', wiki: 'Colosse de Rhodes', kind: 'antique', r: 's' },
  { name: "Phare d'Alexandrie", wiki: "Phare d'Alexandrie", kind: 'antique', r: 's' },
  // 7 Nouvelles merveilles du monde
  { name: 'Grande Muraille de Chine', wiki: 'Grande Muraille', kind: 'nouvelle', r: 's' },
  { name: 'Pétra (Khazneh)', wiki: 'Pétra', kind: 'nouvelle', r: 's' },
  { name: 'Christ Rédempteur (Rio)', wiki: 'Christ Rédempteur', kind: 'nouvelle', r: 's' },
  { name: 'Machu Picchu', wiki: 'Machu Picchu', kind: 'nouvelle', r: 's' },
  { name: 'Chichén Itzá', wiki: 'Chichén Itzá', kind: 'nouvelle', r: 's' },
  { name: 'Colisée de Rome', wiki: 'Colisée', kind: 'nouvelle', r: 's' },
  { name: 'Taj Mahal', wiki: 'Taj Mahal', kind: 'nouvelle', r: 's' },
];

// ─────────────────────────────────────────────────────────────────────────────
// 2. L'ARDÈCHE (Villages, Spécialités, Lieux Iconiques & Private Jokes)
// ─────────────────────────────────────────────────────────────────────────────
const ARDECHE_ITEMS = [
  // 6★ Mythiques
  { name: "Pont d'Arc", wiki: "Pont d'Arc", r: 'm' },
  { name: "Gorges de l'Ardèche", wiki: "Gorges de l'Ardèche", r: 'm' },
  { name: 'Grotte Chauvet 2', wiki: 'Grotte Chauvet', r: 'm' },
  { name: 'Crème de marrons Clément Faugier', wiki: 'Crème de marrons', commons: 'Clement Faugier creme de marrons', r: 'm' },
  { name: "Citroën C15 des Cévennes", wiki: 'Citroën C15', r: 'm' },
  // 5★ Légendaires
  { name: 'Mont Gerbier-de-Jonc', wiki: 'Mont Gerbier-de-Jonc', r: 'l' },
  { name: 'Mont Mézenc', wiki: 'Mont Mézenc', r: 'l' },
  { name: 'Cascade du Ray-Pic', wiki: 'Cascade du Ray-Pic', r: 'l' },
  { name: 'Balazuc', wiki: 'Balazuc', r: 'l' },
  { name: 'Vogüé', wiki: 'Vogüé', r: 'l' },
  { name: 'Labeaume', wiki: 'Labeaume (Ardèche)', r: 'l' },
  { name: 'Caillette ardéchoise', wiki: 'Caillette (pâté)', commons: 'Caillette ardechoise', r: 'l' },
  { name: 'Criques ardéchoises', wiki: 'Crique (cuisine)', commons: 'Crique pomme de terre', r: 'l' },
  { name: 'Picodon AOP', wiki: 'Picodon', r: 'l' },
  // 4★ Épiques
  { name: 'Antraigues-sur-Volcane', wiki: 'Antraigues-sur-Volcane', r: 'e' },
  { name: 'Bois de Païolive', wiki: 'Bois de Païolive', r: 'e' },
  { name: "Lac d'Issarlès", wiki: "Lac d'Issarlès", r: 'e' },
  { name: 'Aubenas & son Château', wiki: 'Aubenas', r: 'e' },
  { name: "Vallon-Pont-d'Arc", wiki: "Vallon-Pont-d'Arc", r: 'e' },
  { name: 'Défilés de Ruoms', wiki: 'Ruoms', r: 'e' },
  { name: 'Privas (Capitale du Marron Glacé)', wiki: 'Privas', r: 'e' },
  { name: 'Annonay (Berceau des Montgolfier)', wiki: 'Annonay', r: 'e' },
  { name: 'Bombine ardéchoise', wiki: 'Bombine', commons: 'Potato stew cast iron', r: 'e' },
  { name: "Marrons glacés d'Ardèche", wiki: 'Marron glacé', r: 'e' },
  { name: "Châtaigne d'Ardèche AOP", wiki: "Châtaigne d'Ardèche", r: 'e' },
  { name: 'Fin gras du Mézenc', wiki: 'Fin gras du Mézenc', r: 'e' },
  // 3★ Rares (Villages & Private Jokes)
  { name: 'Les Vans', wiki: 'Les Vans', r: 'r' },
  { name: 'Joyeuse', wiki: 'Joyeuse (Ardèche)', r: 'r' },
  { name: 'Pont du Diable de Thueyts', wiki: 'Thueyts', r: 'r' },
  { name: 'Alba-la-Romaine', wiki: 'Alba-la-Romaine', r: 'r' },
  { name: 'Vals-les-Bains & Eau de Vals', wiki: 'Vals-les-Bains', r: 'r' },
  { name: 'Train de l’Ardèche (Le Mastrou)', wiki: 'Chemin de fer du Vivarais', r: 'r' },
  { name: 'Maôche ardéchoise', wiki: 'Maôche', commons: 'Pork stomach cabbage', r: 'r' },
  { name: 'Myrtilles sauvages au peigne', wiki: 'Vaccinium myrtillus', r: 'r' },
  { name: 'Sanglier des Cévennes', wiki: 'Sanglier', r: 'r' },
  { name: 'Canoë & Bidon Jaune dans les Gorges', wiki: 'Canoë-kayak', commons: 'Canoeing Gorges de l Ardeche', r: 'r' },
];

// ─────────────────────────────────────────────────────────────────────────────
// 3. CAPITALES, GRANDES VILLES & LIEUX ICONIQUES (Complète les ~195 pays Wikidata)
// ─────────────────────────────────────────────────────────────────────────────
const CITIES_AND_LANDMARKS = [
  // Capitales & Grandes Villes Mondiales
  { name: 'Paris', wiki: 'Paris', r: 'm' },
  { name: 'Tokyo', wiki: 'Tokyo', r: 'm' },
  { name: 'New York', wiki: 'New York', r: 'm' },
  { name: 'Londres', wiki: 'Londres', r: 'l' },
  { name: 'Rome', wiki: 'Rome', r: 'l' },
  { name: 'Kyoto', wiki: 'Kyoto', r: 'l' },
  { name: 'Venise', wiki: 'Venise', r: 'l' },
  { name: 'Rio de Janeiro', wiki: 'Rio de Janeiro', r: 'l' },
  { name: 'Barcelone', wiki: 'Barcelone', r: 'l' },
  { name: 'Istanbul', wiki: 'Istanbul', r: 'l' },
  { name: 'Dubaï', wiki: 'Dubaï (ville)', r: 'l' },
  { name: 'Sydney', wiki: 'Sydney', r: 'l' },
  { name: 'Los Angeles', wiki: 'Los Angeles', r: 'e' },
  { name: 'San Francisco', wiki: 'San Francisco', r: 'e' },
  { name: 'Las Vegas', wiki: 'Las Vegas', r: 'e' },
  { name: 'Séoul', wiki: 'Séoul', r: 'e' },
  { name: 'Singapour', wiki: 'Singapour', r: 'e' },
  { name: 'Hong Kong', wiki: 'Hong Kong', r: 'e' },
  { name: 'Bangkok', wiki: 'Bangkok', r: 'e' },
  { name: 'Le Caire', wiki: 'Le Caire', r: 'e' },
  { name: 'Marrakech', wiki: 'Marrakech', r: 'e' },
  { name: 'Amsterdam', wiki: 'Amsterdam', r: 'e' },
  { name: 'Prague', wiki: 'Prague', r: 'e' },
  { name: 'Vienne', wiki: 'Vienne (Autriche)', r: 'e' },
  { name: 'Athènes', wiki: 'Athènes', r: 'e' },
  { name: 'Lisbonne', wiki: 'Lisbonne', r: 'e' },
  { name: 'Madrid', wiki: 'Madrid', r: 'r' },
  { name: 'Berlin', wiki: 'Berlin', r: 'r' },
  { name: 'Munich', wiki: 'Munich', r: 'r' },
  { name: 'Milan', wiki: 'Milan', r: 'r' },
  { name: 'Florence', wiki: 'Florence', r: 'r' },
  { name: 'Naples', wiki: 'Naples', r: 'r' },
  { name: 'Moscou', wiki: 'Moscou', r: 'r' },
  { name: 'Saint-Pétersbourg', wiki: 'Saint-Pétersbourg', r: 'r' },
  { name: 'Pékin', wiki: 'Pékin', r: 'r' },
  { name: 'Shanghai', wiki: 'Shanghai', r: 'r' },
  { name: 'Osaka', wiki: 'Osaka', r: 'r' },
  { name: 'Bombay (Mumbai)', wiki: 'Bombay', r: 'r' },
  { name: 'New Delhi', wiki: 'New Delhi', r: 'u' },
  { name: 'Buenos Aires', wiki: 'Buenos Aires', r: 'r' },
  { name: 'Mexico', wiki: 'Mexico', r: 'r' },
  { name: 'Montréal', wiki: 'Montréal', r: 'r' },
  { name: 'Québec', wiki: 'Québec (ville)', r: 'r' },
  { name: 'Toronto', wiki: 'Toronto', r: 'u' },
  { name: 'Vancouver', wiki: 'Vancouver', r: 'u' },
  { name: 'Chicago', wiki: 'Chicago', r: 'u' },
  { name: 'Miami', wiki: 'Miami', r: 'r' },
  { name: 'Washington D.C.', wiki: 'Washington (district de Columbia)', r: 'u' },
  { name: 'La Havane', wiki: 'La Havane', r: 'r' },
  { name: 'Reykjavik', wiki: 'Reykjavik', r: 'r' },
  { name: 'Édimbourg', wiki: 'Édimbourg', r: 'r' },
  { name: 'Dublin', wiki: 'Dublin', r: 'u' },
  { name: 'Bruxelles', wiki: 'Bruxelles', r: 'u' },
  { name: 'Genève', wiki: 'Genève', r: 'u' },
  { name: 'Zurich', wiki: 'Zurich', r: 'u' },
  { name: 'Monaco', wiki: 'Monaco', r: 'r' },
  { name: 'Stockholm', wiki: 'Stockholm', r: 'u' },
  { name: 'Copenhague', wiki: 'Copenhague', r: 'u' },
  { name: 'Oslo', wiki: 'Oslo', r: 'u' },
  { name: 'Helsinki', wiki: 'Helsinki', r: 'u' },
  { name: 'Varsovie', wiki: 'Varsovie', r: 'u' },
  { name: 'Budapest', wiki: 'Budapest', r: 'r' },
  { name: 'Jérusalem', wiki: 'Jérusalem', r: 'e' },
  { name: 'La Mecque', wiki: 'La Mecque', r: 'e' },
  { name: 'Le Cap', wiki: 'Le Cap', r: 'r' },
  { name: 'Casablanca', wiki: 'Casablanca', r: 'u' },
  { name: 'Alger', wiki: 'Alger', r: 'u' },
  { name: 'Tunis', wiki: 'Tunis', r: 'u' },
  { name: 'Dakar', wiki: 'Dakar', r: 'u' },
  { name: 'Nairobi', wiki: 'Nairobi', r: 'u' },
  { name: 'Melbourne', wiki: 'Melbourne', r: 'u' },
  { name: 'Auckland', wiki: 'Auckland', r: 'u' },
  { name: 'Lyon', wiki: 'Lyon', r: 'r' },
  { name: 'Marseille', wiki: 'Marseille', r: 'r' },
  { name: 'Nice', wiki: 'Nice', r: 'u' },
  { name: 'Bordeaux', wiki: 'Bordeaux', r: 'u' },
  { name: 'Toulouse', wiki: 'Toulouse', r: 'u' },
  { name: 'Strasbourg', wiki: 'Strasbourg', r: 'u' },
  // Lieux & Monuments Iconiques (hors les 14 Merveilles)
  { name: 'Tour Eiffel', wiki: 'Tour Eiffel', r: 'm' },
  { name: 'Mont Saint-Michel', wiki: 'Mont Saint-Michel', r: 'm' },
  { name: 'Statue de la Liberté', wiki: 'Statue de la Liberté', r: 'm' },
  { name: 'Mont Fuji', wiki: 'Mont Fuji', r: 'm' },
  { name: 'Mont Everest', wiki: 'Everest', r: 'm' },
  { name: 'Grand Canyon', wiki: 'Grand Canyon', r: 'l' },
  { name: 'Angkor Vat', wiki: 'Angkor Vat', r: 'l' },
  { name: 'Acropole d’Athènes (Parthénon)', wiki: 'Parthénon', r: 'l' },
  { name: 'Sagrada Família', wiki: 'Sagrada Família', r: 'l' },
  { name: 'Château de Versailles', wiki: 'Château de Versailles', r: 'l' },
  { name: 'Cathédrale Notre-Dame de Paris', wiki: 'Cathédrale Notre-Dame de Paris', r: 'l' },
  { name: 'Musée du Louvre', wiki: 'Musée du Louvre', r: 'l' },
  { name: 'Opéra de Sydney', wiki: 'Opéra de Sydney', r: 'l' },
  { name: 'Burj Khalifa', wiki: 'Burj Khalifa', r: 'l' },
  { name: 'Golden Gate Bridge', wiki: 'Pont du Golden Gate', r: 'l' },
  { name: 'Île de Pâques (Moaï)', wiki: 'Moaï', r: 'l' },
  { name: 'Stonehenge', wiki: 'Stonehenge', r: 'l' },
  { name: 'Château de Neuschwanstein', wiki: 'Château de Neuschwanstein', r: 'l' },
  { name: 'Sanctuaire Fushimi Inari', wiki: 'Fushimi Inari-taisha', r: 'l' },
  { name: 'Baie d’Along', wiki: 'Baie d’Along', r: 'l' },
  { name: 'Salar d’Uyuni', wiki: 'Salar d’Uyuni', r: 'l' },
  { name: 'Chutes du Niagara', wiki: 'Chutes du Niagara', r: 'e' },
  { name: 'Chutes d’Iguazú', wiki: 'Chutes d’Iguazú', r: 'e' },
  { name: 'Chutes Victoria', wiki: 'Chutes Victoria', r: 'e' },
  { name: 'Tour de Pise', wiki: 'Tour de Pise', r: 'e' },
  { name: 'Big Ben & Palais de Westminster', wiki: 'Big Ben', r: 'e' },
  { name: 'Alhambra de Grenade', wiki: 'Alhambra (Grenade)', r: 'e' },
  { name: 'Sainte-Sophie (Istanbul)', wiki: 'Sainte-Sophie (Constantinople)', r: 'e' },
  { name: 'Cathédrale Saint-Basile de Moscou', wiki: 'Cathédrale Saint-Basile-le-Bienheureux de Moscou', r: 'e' },
  { name: 'Cité Interdite', wiki: 'Cité interdite', r: 'e' },
  { name: 'Armée de terre cuite (Xi’an)', wiki: 'Armée de terre cuite', r: 'e' },
  { name: 'Abou Simbel', wiki: 'Temples d’Abou Simbel', r: 'e' },
  { name: 'Sphinx de Gizeh', wiki: 'Sphinx de Gizeh', r: 'e' },
  { name: 'Mont Rushmore', wiki: 'Mont Rushmore', r: 'e' },
  { name: 'Empire State Building', wiki: 'Empire State Building', r: 'e' },
  { name: 'Times Square', wiki: 'Times Square', r: 'e' },
  { name: 'Hollywood Sign', wiki: 'Panneau Hollywood', r: 'e' },
  { name: 'Île d’Alcatraz', wiki: 'Île d’Alcatraz', r: 'r' },
  { name: 'Parc national de Yellowstone', wiki: 'Parc national de Yellowstone', r: 'e' },
  { name: 'Monument Valley', wiki: 'Monument Valley', r: 'e' },
  { name: 'Kilimandjaro', wiki: 'Kilimandjaro', r: 'e' },
  { name: 'Mont Blanc', wiki: 'Mont Blanc', r: 'e' },
  { name: 'Cervin (Matterhorn)', wiki: 'Cervin', r: 'e' },
  { name: 'Uluru (Ayers Rock)', wiki: 'Uluru', r: 'e' },
  { name: 'Grande Barrière de corail', wiki: 'Grande Barrière de corail', r: 'e' },
  { name: 'Santorin (Oia)', wiki: 'Santorin', r: 'e' },
  { name: 'Pompéi & le Vésuve', wiki: 'Pompéi', r: 'e' },
  { name: 'Vatican (Basilique Saint-Pierre)', wiki: 'Basilique Saint-Pierre', r: 'e' },
  { name: 'Arc de Triomphe', wiki: 'Arc de triomphe de l’Étoile', r: 'e' },
  { name: 'Pont du Gard', wiki: 'Pont du Gard', r: 'r' },
  { name: 'Cité de Carcassonne', wiki: 'Cité de Carcassonne', r: 'r' },
  { name: 'Château de Chambord', wiki: 'Château de Chambord', r: 'r' },
  { name: 'Dune du Pilat', wiki: 'Dune du Pilat', r: 'r' },
  { name: 'Falaises d’Étretat', wiki: 'Étretat', r: 'r' },
  { name: 'Tchernobyl & Pripyat', wiki: 'Prypiat', r: 'e' },
  { name: 'Zone 51 (Nevada)', wiki: 'Zone 51', r: 'e' },
  { name: 'Triangle des Bermudes', wiki: 'Triangle des Bermudes', r: 'r' },
  { name: 'Fosse des Mariannes', wiki: 'Fosse des Mariannes', r: 'e' },
  { name: 'Forêt Amazonienne', wiki: 'Forêt amazonienne', r: 'e' },
  { name: 'Désert du Sahara', wiki: 'Sahara', r: 'e' },
  { name: 'Antarctique', wiki: 'Antarctique', r: 'e' },
];

// ─────────────────────────────────────────────────────────────────────────────
// 4. ANIMAUX DU MONDE (~220 espèces : mammifères, marins, oiseaux, reptiles, insolites, préhistoriques)
// ─────────────────────────────────────────────────────────────────────────────
const ANIMALS_LIST = [
  // 6★ Mythiques (les stars absolues & créatures légendaires du règne animal)
  { name: 'Lion d’Afrique', wiki: 'Lion', r: 'm' },
  { name: 'Tigre du Bengale', wiki: 'Tigre du Bengale', r: 'm' },
  { name: 'Panthère des neiges', wiki: 'Panthère des neiges', r: 'm' },
  { name: 'Loup gris', wiki: 'Canis lupus', r: 'm' },
  { name: 'Ours polaire', wiki: 'Ours blanc', r: 'm' },
  { name: 'Panda géant', wiki: 'Panda géant', r: 'm' },
  { name: 'Orque (Épaulard)', wiki: 'Orque', r: 'm' },
  { name: 'Grand requin blanc', wiki: 'Grand requin blanc', r: 'm' },
  { name: 'Aigle royal', wiki: 'Aigle royal', r: 'm' },
  { name: 'Axolotl', wiki: 'Axolotl', r: 'm' },
  { name: 'Capybara', wiki: 'Capybara', r: 'm' },
  { name: 'Tyrannosaure Rex', wiki: 'Tyrannosaurus', r: 'm' },

  // 5★ Légendaires
  { name: 'Guépard', wiki: 'Guépard', r: 'l' },
  { name: 'Jaguar', wiki: 'Jaguar', r: 'l' },
  { name: 'Léopard (Panthère)', wiki: 'Léopard', r: 'l' },
  { name: 'Panthère noire', wiki: 'Panthère noire', r: 'l' },
  { name: 'Panda roux', wiki: 'Panda roux', r: 'l' },
  { name: 'Grizzli', wiki: 'Grizzli', r: 'l' },
  { name: 'Éléphant d’Afrique', wiki: 'Éléphant d’Afrique', r: 'l' },
  { name: 'Gorille des montagnes', wiki: 'Gorille des montagnes', r: 'l' },
  { name: 'Baleine bleue', wiki: 'Baleine bleue', r: 'l' },
  { name: 'Narval (Licorne des mers)', wiki: 'Narval', r: 'l' },
  { name: 'Requin-baleine', wiki: 'Requin-baleine', r: 'l' },
  { name: 'Pieuvre à anneaux bleus', wiki: 'Hapalochlaena', r: 'l' },
  { name: 'Calmar géant', wiki: 'Calmar géant', r: 'l' },
  { name: 'Harfang des neiges', wiki: 'Harfang des neiges', r: 'l' },
  { name: 'Faucon pèlerin', wiki: 'Faucon pèlerin', r: 'l' },
  { name: 'Pygargue à tête blanche', wiki: 'Pygargue à tête blanche', r: 'l' },
  { name: 'Dragon de Komodo', wiki: 'Dragon de Komodo', r: 'l' },
  { name: 'Cobra royal', wiki: 'Cobra royal', r: 'l' },
  { name: 'Ornithorynque', wiki: 'Ornithorynque', r: 'l' },
  { name: 'Quokka', wiki: 'Quokka', r: 'l' },
  { name: 'Tardigrade (Ourson d’eau)', wiki: 'Tardigrada', r: 'l' },
  { name: 'Mante orchidée', wiki: 'Hymenopus coronatus', r: 'l' },
  { name: 'Mégalodon', wiki: 'Mégalodon', r: 'l' },
  { name: 'Mammouth laineux', wiki: 'Mammouth laineux', r: 'l' },
  { name: 'Smilodon (Tigre à dents de sabre)', wiki: 'Smilodon', r: 'l' },

  // 4★ Épiques
  { name: 'Lynx boréal', wiki: 'Lynx boréal', r: 'e' },
  { name: 'Puma (Cougar)', wiki: 'Puma', r: 'e' },
  { name: 'Caracal', wiki: 'Caracal', r: 'e' },
  { name: 'Ocelot', wiki: 'Ocelot', r: 'e' },
  { name: 'Chat de Pallas (Manul)', wiki: 'Chat de Pallas', r: 'e' },
  { name: 'Renard polaire', wiki: 'Renard polaire', r: 'e' },
  { name: 'Fennec', wiki: 'Fennec', r: 'e' },
  { name: 'Renard roux', wiki: 'Renard roux', r: 'e' },
  { name: 'Glouton (Carcajou)', wiki: 'Glouton', r: 'e' },
  { name: 'Ratonelaveur (Trash Panda)', wiki: 'Raton laveur', r: 'e' },
  { name: 'Loutre de mer', wiki: 'Loutre de mer', r: 'e' },
  { name: 'Suricate', wiki: 'Suricate', r: 'e' },
  { name: 'Girafe réticulée', wiki: 'Girafe', r: 'e' },
  { name: 'Rhinocéros blanc', wiki: 'Rhinocéros blanc', r: 'e' },
  { name: 'Hippopotame', wiki: 'Hippopotame', r: 'e' },
  { name: 'Orang-outan', wiki: 'Orang-outan', r: 'e' },
  { name: 'Mandrill', wiki: 'Mandrill', r: 'e' },
  { name: 'Lémur catta (Maki catta)', wiki: 'Lemur catta', r: 'e' },
  { name: 'Koala', wiki: 'Koala', r: 'e' },
  { name: 'Kangourou roux', wiki: 'Kangourou roux', r: 'e' },
  { name: 'Paresseux à trois doigts', wiki: 'Bradypus', r: 'e' },
  { name: 'Pangolin', wiki: 'Pangolin', r: 'e' },
  { name: 'Okapi', wiki: 'Okapi', r: 'e' },
  { name: 'Béluga', wiki: 'Béluga', r: 'e' },
  { name: 'Baleine à bosse', wiki: 'Baleine à bosse', r: 'e' },
  { name: 'Cachalot', wiki: 'Grand cachalot', r: 'e' },
  { name: 'Requin-marteau', wiki: 'Requin-marteau', r: 'e' },
  { name: 'Raie manta', wiki: 'Raie manta', r: 'e' },
  { name: 'Baudroie abyssale', wiki: 'Melanocetus johnsonii', r: 'e' },
  { name: 'Blobfish', wiki: 'Psychrolutes marcidus', r: 'e' },
  { name: 'Manchot empereur', wiki: 'Manchot empereur', r: 'e' },
  { name: 'Colibri (Oiseau-mouche)', wiki: 'Trochilidae', r: 'e' },
  { name: 'Toucan toco', wiki: 'Toucan toco', r: 'e' },
  { name: 'Ara hyacinthe', wiki: 'Ara hyacinthe', r: 'e' },
  { name: 'Paon bleu', wiki: 'Paon bleu', r: 'e' },
  { name: 'Casoar à casque', wiki: 'Casoar à casque', r: 'e' },
  { name: 'Kiwi', wiki: 'Kiwi (oiseau)', r: 'e' },
  { name: 'Dodo', wiki: 'Dronte de Maurice', r: 'e' },
  { name: 'Condor des Andes', wiki: 'Condor des Andes', r: 'e' },
  { name: 'Hibou grand-duc', wiki: 'Grand-duc d’Europe', r: 'e' },
  { name: 'Crocodile marin', wiki: 'Crocodile marin', r: 'e' },
  { name: 'Anaconda vert', wiki: 'Grand anaconda', r: 'e' },
  { name: 'Caméléon panthère', wiki: 'Furcifer pardalis', r: 'e' },
  { name: 'Dendrobate bleu (Grenouille poison)', wiki: 'Dendrobates tinctorius', r: 'e' },
  { name: 'Rainette aux yeux rouges', wiki: 'Agalychnis callidryas', r: 'e' },
  { name: 'Scarabée Hercule', wiki: 'Dynaste Hercule', r: 'e' },
  { name: 'Papillon Morpho bleu', wiki: 'Morpho', r: 'e' },
  { name: 'Tricératops', wiki: 'Triceratops', r: 'e' },
  { name: 'Vélociraptor', wiki: 'Velociraptor', r: 'e' },

  // 3★ Rares
  { name: 'Serval', wiki: 'Serval', r: 'r' },
  { name: 'Chacal doré', wiki: 'Chacal doré', r: 'r' },
  { name: 'Coyote', wiki: 'Coyote', r: 'r' },
  { name: 'Lycaon (Chien sauvage d’Afrique)', wiki: 'Lycaon (animal)', r: 'r' },
  { name: 'Hyène tachetée', wiki: 'Hyène tachetée', r: 'r' },
  { name: 'Ours brun', wiki: 'Ours brun', r: 'r' },
  { name: 'Ours noir d’Amérique', wiki: 'Ours noir', r: 'r' },
  { name: 'Blaireau européen', wiki: 'Blaireau européen', r: 'r' },
  { name: 'Ratel (Honey Badger)', wiki: 'Ratel', r: 'r' },
  { name: 'Zèbre des plaines', wiki: 'Zèbre des plaines', r: 'r' },
  { name: 'Bison d’Amérique', wiki: 'Bison d’Amérique', r: 'r' },
  { name: 'Élan (Orignal)', wiki: 'Élan', r: 'r' },
  { name: 'Renne (Caribou)', wiki: 'Renne', r: 'r' },
  { name: 'Cerf élaphe', wiki: 'Cerf élaphe', r: 'r' },
  { name: 'Bouquetin des Alpes', wiki: 'Bouquetin des Alpes', r: 'r' },
  { name: 'Chamois', wiki: 'Chamois', r: 'r' },
  { name: 'Lama', wiki: 'Lama (animal)', r: 'r' },
  { name: 'Alpaga', wiki: 'Alpaga', r: 'r' },
  { name: 'Chameau de Bactriane', wiki: 'Chameau de Bactriane', r: 'r' },
  { name: 'Dromadaire', wiki: 'Dromadaire', r: 'r' },
  { name: 'Chimpanzé', wiki: 'Chimpanzé', r: 'r' },
  { name: 'Bonobo', wiki: 'Bonobo', r: 'r' },
  { name: 'Babouin', wiki: 'Babouin', r: 'r' },
  { name: 'Macaque japonais (Singe des neiges)', wiki: 'Macaque japonais', r: 'r' },
  { name: 'Singe hurleur', wiki: 'Alouate', r: 'r' },
  { name: 'Capucin', wiki: 'Cebus', r: 'r' },
  { name: 'Ouistiti pygmée', wiki: 'Cebuella pygmaea', r: 'r' },
  { name: 'Tarsier', wiki: 'Tarsier', r: 'r' },
  { name: 'Wombat', wiki: 'Wombat', r: 'r' },
  { name: 'Diable de Tasmanie', wiki: 'Diable de Tasmanie', r: 'r' },
  { name: 'Échidné', wiki: 'Échidné', r: 'r' },
  { name: 'Tamanoir (Fourmilier géant)', wiki: 'Tamanoir', r: 'r' },
  { name: 'Tatou à neuf bandes', wiki: 'Tatou à neuf bandes', r: 'r' },
  { name: 'Tapir', wiki: 'Tapir', r: 'r' },
  { name: 'Porc-épic', wiki: 'Porc-épic', r: 'r' },
  { name: 'Castor', wiki: 'Castor (genre)', r: 'r' },
  { name: 'Marmotte des Alpes', wiki: 'Marmotte des Alpes', r: 'r' },
  { name: 'Grand dauphin', wiki: 'Grand dauphin', r: 'r' },
  { name: 'Morse', wiki: 'Morse (animal)', r: 'r' },
  { name: 'Éléphant de mer', wiki: 'Éléphant de mer', r: 'r' },
  { name: 'Lamantin', wiki: 'Lamantin', r: 'r' },
  { name: 'Dugong', wiki: 'Dugong', r: 'r' },
  { name: 'Tortue luth', wiki: 'Tortue luth', r: 'r' },
  { name: 'Tortue verte', wiki: 'Tortue verte', r: 'r' },
  { name: 'Tortue géante des Galápagos', wiki: 'Tortue géante des Galápagos', r: 'r' },
  { name: 'Poisson-clown', wiki: 'Poisson-clown', r: 'r' },
  { name: 'Hippocampe', wiki: 'Hippocampe', r: 'r' },
  { name: 'Poisson-lune (Mola mola)', wiki: 'Môle (poisson)', r: 'r' },
  { name: 'Rascasse volante (Poisson-lion)', wiki: 'Pterois volitans', r: 'r' },
  { name: 'Poisson-globe (Fugu)', wiki: 'Tetraodontidae', r: 'r' },
  { name: 'Espadon', wiki: 'Espadon', r: 'r' },
  { name: 'Murène', wiki: 'Muraenidae', r: 'r' },
  { name: 'Nautile', wiki: 'Nautilus (mollusque)', r: 'r' },
  { name: 'Crevette-mante (Squille multicolore)', wiki: 'Odontodactylus scyllarus', r: 'r' },
  { name: 'Crabe-yéti', wiki: 'Kiwa hirsuta', r: 'r' },
  { name: 'Crabe de cocotier', wiki: 'Crabe de cocotier', r: 'r' },
  { name: 'Flamant rose', wiki: 'Flamant rose', r: 'r' },
  { name: 'Macareux moine', wiki: 'Macareux moine', r: 'r' },
  { name: 'Albatros hurleur', wiki: 'Albatros hurleur', r: 'r' },
  { name: 'Pélican blanc', wiki: 'Pélican blanc', r: 'r' },
  { name: 'Martin-pêcheur d’Europe', wiki: 'Martin-pêcheur d’Europe', r: 'r' },
  { name: 'Autruche', wiki: 'Autruche d’Afrique', r: 'r' },
  { name: 'Cacatoès à huppe jaune', wiki: 'Cacatoès à galerite', r: 'r' },
  { name: 'Chouette effraie', wiki: 'Effraie des clochers', r: 'r' },
  { name: 'Grand Corbeau', wiki: 'Grand Corbeau', r: 'r' },
  { name: 'Iguane marin des Galápagos', wiki: 'Iguane marin des Galápagos', r: 'r' },
  { name: 'Alligator d’Amérique', wiki: 'Alligator d’Amérique', r: 'r' },
  { name: 'Gavial du Gange', wiki: 'Gavial du Gange', r: 'r' },
  { name: 'Python réticulé', wiki: 'Python réticulé', r: 'r' },
  { name: 'Crotale (Serpent à sonnette)', wiki: 'Crotalus', r: 'r' },
  { name: 'Mamba noir', wiki: 'Mamba noir', r: 'r' },
  { name: 'Monstre de Gila', wiki: 'Monstre de Gila', r: 'r' },
  { name: 'Moloch (Diable cornu)', wiki: 'Moloch horridus', r: 'r' },
  { name: 'Salamandre tachetée', wiki: 'Salamandre tachetée', r: 'r' },
  { name: 'Mante religieuse', wiki: 'Mante religieuse', r: 'r' },
  { name: 'Lucane cerf-volant', wiki: 'Lucane cerf-volant', r: 'r' },
  { name: 'Papillon Monarque', wiki: 'Monarque (papillon)', r: 'r' },
  { name: 'Grand Paon de nuit', wiki: 'Grand paon de nuit', r: 'r' },
  { name: 'Mygale de Leblond', wiki: 'Theraphosa blondi', r: 'r' },
  { name: 'Veuve noire', wiki: 'Latrodectus', r: 'r' },
  { name: 'Scorpion empereur', wiki: 'Pandinus imperator', r: 'r' },

  // 2★ Peu communes & 1★ Communes (animaux familiers, de la ferme, des bois & du jardin)
  { name: 'Chien (Berger allemand)', wiki: 'Berger allemand', r: 'u' },
  { name: 'Chien (Golden Retriever)', wiki: 'Golden Retriever', r: 'u' },
  { name: 'Chien (Shiba Inu)', wiki: 'Shiba (chien)', r: 'r' },
  { name: 'Chien (Husky sibérien)', wiki: 'Husky de Sibérie', r: 'u' },
  { name: 'Chat domestique', wiki: 'Chat', r: 'u' },
  { name: 'Chat Maine Coon', wiki: 'Maine Coon', r: 'u' },
  { name: 'Cheval pur-sang', wiki: 'Pur-sang', r: 'u' },
  { name: 'Cheval de Camargue', wiki: 'Camargue (cheval)', r: 'u' },
  { name: 'Âne', wiki: 'Âne commun', r: 'c' },
  { name: 'Vache laitière', wiki: 'Bos taurus', r: 'c' },
  { name: 'Vache Highland', wiki: 'Highland (race bovine)', r: 'u' },
  { name: 'Mouton', wiki: 'Mouton', r: 'c' },
  { name: 'Chèvre', wiki: 'Chèvre', r: 'c' },
  { name: 'Cochon', wiki: 'Porc', r: 'c' },
  { name: 'Poule', wiki: 'Poule domestique', r: 'c' },
  { name: 'Coq gaulois', wiki: 'Coq', r: 'u' },
  { name: 'Canard colvert', wiki: 'Canard colvert', r: 'c' },
  { name: 'Oie blanche', wiki: 'Oie domestique', r: 'c' },
  { name: 'Cygne tuberculé', wiki: 'Cygne tuberculé', r: 'u' },
  { name: 'Dindon', wiki: 'Dinde', r: 'c' },
  { name: 'Lapin de garenne', wiki: 'Lapin de garenne', r: 'c' },
  { name: 'Lièvre d’Europe', wiki: 'Lièvre d’Europe', r: 'u' },
  { name: 'Écureuil roux', wiki: 'Écureuil roux', r: 'u' },
  { name: 'Hérisson d’Europe', wiki: 'Hérisson commun', r: 'u' },
  { name: 'Taupe d’Europe', wiki: 'Taupe d’Europe', r: 'c' },
  { name: 'Chauve-souris', wiki: 'Chiroptera', r: 'u' },
  { name: 'Chevreuil', wiki: 'Chevreuil', r: 'u' },
  { name: 'Fouine', wiki: 'Fouine', r: 'c' },
  { name: 'Belette', wiki: 'Belette d’Europe', r: 'u' },
  { name: 'Hermine', wiki: 'Hermine', r: 'u' },
  { name: 'Furet', wiki: 'Furet', r: 'u' },
  { name: 'Hamster doré', wiki: 'Hamster doré', r: 'c' },
  { name: 'Cochon d’Inde', wiki: 'Cobaye', r: 'c' },
  { name: 'Chinchilla', wiki: 'Chinchilla', r: 'u' },
  { name: 'Souris grise', wiki: 'Souris', r: 'c' },
  { name: 'Rat brun', wiki: 'Rattus norvegicus', r: 'c' },
  { name: 'Pigeon biset', wiki: 'Pigeon biset', r: 'c' },
  { name: 'Moineau domestique', wiki: 'Moineau domestique', r: 'c' },
  { name: 'Rouge-gorge familier', wiki: 'Rouge-gorge familier', r: 'u' },
  { name: 'Mésange bleue', wiki: 'Mésange bleue', r: 'u' },
  { name: 'Hirondelle rustique', wiki: 'Hirondelle rustique', r: 'u' },
  { name: 'Pie bavarde', wiki: 'Pie bavarde', r: 'c' },
  { name: 'Geai des chênes', wiki: 'Geai des chênes', r: 'u' },
  { name: 'Pic épeiche', wiki: 'Pic épeiche', r: 'u' },
  { name: 'Cigogne blanche', wiki: 'Cigogne blanche', r: 'u' },
  { name: 'Héron cendré', wiki: 'Héron cendré', r: 'u' },
  { name: 'Mouette rieuse', wiki: 'Mouette rieuse', r: 'c' },
  { name: 'Goéland argenté', wiki: 'Goéland argenté', r: 'c' },
  { name: 'Faisan de Colchide', wiki: 'Faisan de Colchide', r: 'u' },
  { name: 'Buse variable', wiki: 'Buse variable', r: 'u' },
  { name: 'Faucon crécerelle', wiki: 'Faucon crécerelle', r: 'u' },
  { name: 'Phoque veau-marin', wiki: 'Phoque veau-marin', r: 'u' },
  { name: 'Otarie de Californie', wiki: 'Otarie de Californie', r: 'u' },
  { name: 'Méduse commune', wiki: 'Aurelia aurita', r: 'u' },
  { name: 'Étoile de mer', wiki: 'Asteroidea', r: 'c' },
  { name: 'Oursin', wiki: 'Echinoidea', r: 'c' },
  { name: 'Bernard-l’ermite', wiki: 'Paguroidea', r: 'c' },
  { name: 'Homard européen', wiki: 'Homard européen', r: 'u' },
  { name: 'Crabe tourteau', wiki: 'Tourteau (crabe)', r: 'c' },
  { name: 'Crevette rose', wiki: 'Crevette', r: 'c' },
  { name: 'Saumon atlantique', wiki: 'Saumon atlantique', r: 'u' },
  { name: 'Truite fario', wiki: 'Truite fario', r: 'u' },
  { name: 'Brochet', wiki: 'Grand brochet', r: 'u' },
  { name: 'Carpe Koï', wiki: 'Carpe koï', r: 'r' },
  { name: 'Silure glane', wiki: 'Silure glane', r: 'u' },
  { name: 'Poisson rouge', wiki: 'Poisson rouge', r: 'c' },
  { name: 'Piranha à ventre rouge', wiki: 'Pygocentrus nattereri', r: 'u' },
  { name: 'Anguille d’Europe', wiki: 'Anguille d’Europe', r: 'c' },
  { name: 'Crapaud commun', wiki: 'Crapaud commun', r: 'c' },
  { name: 'Grenouille verte', wiki: 'Pelophylax kl. esculentus', r: 'c' },
  { name: 'Lézard des murailles', wiki: 'Lézard des murailles', r: 'c' },
  { name: 'Lézard vert', wiki: 'Lézard à deux raies', r: 'u' },
  { name: 'Gecko léopard', wiki: 'Gecko léopard', r: 'u' },
  { name: 'Couleuvre à collier', wiki: 'Couleuvre à collier', r: 'c' },
  { name: 'Vipère aspic', wiki: 'Vipère aspic', r: 'u' },
  { name: 'Tortue d’Hermann', wiki: 'Tortue d’Hermann', r: 'u' },
  { name: 'Abeille mellifère', wiki: 'Apis mellifera', r: 'u' },
  { name: 'Bourdon terrestre', wiki: 'Bourdon terrestre', r: 'c' },
  { name: 'Guêpe commune', wiki: 'Vespula vulgaris', r: 'c' },
  { name: 'Frelon asiatique', wiki: 'Frelon asiatique', r: 'u' },
  { name: 'Coccinelle à sept points', wiki: 'Coccinelle à sept points', r: 'u' },
  { name: 'Libellule', wiki: 'Odonata', r: 'u' },
  { name: 'Cigale', wiki: 'Cicadidae', r: 'u' },
  { name: 'Grillon des champs', wiki: 'Grillon champêtre', r: 'c' },
  { name: 'Sauterelle verte', wiki: 'Grande sauterelle verte', r: 'c' },
  { name: 'Phasme', wiki: 'Phasmatodea', r: 'u' },
  { name: 'Fourmi rousse', wiki: 'Formica rufa', r: 'c' },
  { name: 'Moustique tigre', wiki: 'Aedes albopictus', r: 'c' },
  { name: 'Mouche domestique', wiki: 'Mouche domestique', r: 'c' },
  { name: 'Escargot de Bourgogne', wiki: 'Escargot de Bourgogne', r: 'c' },
  { name: 'Limace rouge', wiki: 'Loches (mollusques)', r: 'c' },
  { name: 'Ver de terre (Lombric)', wiki: 'Lumbricina', r: 'c' },
];

// ─────────────────────────────────────────────────────────────────────────────
// 5. NOURRITURE : Plats Français, Grands Plats Étrangers, Snacks & Marques
// ─────────────────────────────────────────────────────────────────────────────
const FOOD_LIST = [
  // 6★ Mythiques
  { name: 'Raclette savoyarde', wiki: 'Raclette', r: 'm' },
  { name: 'Baguette de tradition française', wiki: 'Baguette (pain)', r: 'm' },
  { name: 'Croissant pur beurre', wiki: 'Croissant (viennoiserie)', r: 'm' },
  { name: 'Pizza Napolitaine', wiki: 'Pizza napolitaine', r: 'm' },
  { name: 'Sushi & Sashimi', wiki: 'Sushi', r: 'm' },
  { name: 'Pot de Nutella', wiki: 'Nutella', off: 'Nutella Ferrero', r: 'm' },
  { name: 'Tacos Français (3 Viandes Sauce Fromagère)', wiki: 'Tacos français', r: 'm' },
  { name: 'Kebab Salade-Tomate-Oignon (Chef)', wiki: 'Kebab', r: 'm' },

  // 5★ Légendaires
  { name: 'Fondue savoyarde', wiki: 'Fondue savoyarde', r: 'l' },
  { name: 'Tartiflette au Reblochon', wiki: 'Tartiflette', r: 'l' },
  { name: 'Aligot de l’Aubrac', wiki: 'Aligot', r: 'l' },
  { name: 'Bœuf bourguignon', wiki: 'Bœuf bourguignon', r: 'l' },
  { name: 'Blanquette de veau', wiki: 'Blanquette de veau', r: 'l' },
  { name: 'Cassoulet de Castelnaudary', wiki: 'Cassoulet', r: 'l' },
  { name: 'Magret de canard', wiki: 'Magret de canard', r: 'l' },
  { name: 'Foie gras du Sud-Ouest', wiki: 'Foie gras', r: 'l' },
  { name: 'Kouign-amann breton', wiki: 'Kouign-amann', r: 'l' },
  { name: 'Pain au chocolat (Chocolatine)', wiki: 'Pain au chocolat', r: 'l' },
  { name: 'Ramen Tonkotsu', wiki: 'Ramen', r: 'l' },
  { name: 'Burger Smash Double Cheese', wiki: 'Hamburger', r: 'l' },
  { name: 'Tiramisu italien', wiki: 'Tiramisu', r: 'l' },
  { name: 'Couscous royal', wiki: 'Couscous', r: 'l' },
  { name: 'Paella valenciana', wiki: 'Paella', r: 'l' },
  { name: 'Poutine québécoise', wiki: 'Poutine (plat)', r: 'l' },
  { name: 'Kinder Bueno', wiki: 'Kinder Bueno', off: 'Kinder Bueno', r: 'l' },
  { name: 'Haribo Fraise Tagada', wiki: 'Fraise Tagada', off: 'Haribo Tagada', r: 'l' },
  { name: 'Ricard (Pastis 51)', wiki: 'Ricard (marque)', commons: 'Verre de Ricard', r: 'l' },

  // 4★ Épiques
  { name: 'Gratin dauphinois', wiki: 'Gratin dauphinois', r: 'e' },
  { name: 'Quiche lorraine', wiki: 'Quiche lorraine', r: 'e' },
  { name: 'Bouillabaisse marseillaise', wiki: 'Bouillabaisse', r: 'e' },
  { name: 'Choucroute alsacienne', wiki: 'Choucroute garnie', r: 'e' },
  { name: 'Pot-au-feu', wiki: 'Pot-au-feu', r: 'e' },
  { name: 'Hachis parmentier', wiki: 'Hachis parmentier', r: 'e' },
  { name: 'Croque-monsieur', wiki: 'Croque-monsieur', r: 'e' },
  { name: 'Galette complète bretonne', wiki: 'Galette de sarrasin', r: 'e' },
  { name: 'Crêpe au Nutella', wiki: 'Crêpe', r: 'e' },
  { name: 'Escargots au beurre persillé', wiki: 'Escargots de Bourgogne', r: 'e' },
  { name: 'Plateau d’huîtres', wiki: 'Huître', r: 'e' },
  { name: 'Camembert de Normandie', wiki: 'Camembert de Normandie', r: 'e' },
  { name: 'Comté AOP 24 mois', wiki: 'Comté (fromage)', r: 'e' },
  { name: 'Roquefort AOP', wiki: 'Roquefort (fromage)', r: 'e' },
  { name: 'Reblochon de Savoie', wiki: 'Reblochon', r: 'e' },
  { name: 'Saint-Nectaire fermier', wiki: 'Saint-nectaire', r: 'e' },
  { name: 'Mont d’Or chaud au four', wiki: 'Mont d’Or (fromage)', r: 'e' },
  { name: 'Macaron parisien', wiki: 'Macaron', r: 'e' },
  { name: 'Paris-Brest', wiki: 'Paris-Brest', r: 'e' },
  { name: 'Mille-feuille', wiki: 'Mille-feuille', r: 'e' },
  { name: 'Éclair au chocolat', wiki: 'Éclair (pâtisserie)', r: 'e' },
  { name: 'Tarte Tatin', wiki: 'Tarte Tatin', r: 'e' },
  { name: 'Crème brûlée', wiki: 'Crème brûlée', r: 'e' },
  { name: 'Cannelé de Bordeaux', wiki: 'Canelé', r: 'e' },
  { name: 'Lasagnes à la bolognaise', wiki: 'Lasagnes', r: 'e' },
  { name: 'Spaghetti alla Carbonara', wiki: 'Pâtes à la carbonara', r: 'e' },
  { name: 'Pad Thaï aux crevettes', wiki: 'Pad thai', r: 'e' },
  { name: 'Bo Bun vietnamien', wiki: 'Bò bún', r: 'e' },
  { name: 'Phở vietnamien', wiki: 'Phở', r: 'e' },
  { name: 'Canard laqué de Pékin', wiki: 'Canard laqué de Pékin', r: 'e' },
  { name: 'Bibimbap coréen', wiki: 'Bibimbap', r: 'e' },
  { name: 'Poulet frit (KFC / Korean Fried)', wiki: 'Poulet frit', r: 'e' },
  { name: 'Tacos mexicains al Pastor', wiki: 'Taco', r: 'e' },
  { name: 'Tajine d’agneau aux pruneaux', wiki: 'Tajine', r: 'e' },
  { name: 'Kinder Surprise', wiki: 'Kinder Surprise', r: 'e' },
  { name: 'Ferrero Rocher', wiki: 'Ferrero Rocher', r: 'e' },
  { name: 'Oreo', wiki: 'Oreo', r: 'e' },
  { name: 'Haribo Dragibus', wiki: 'Dragibus', off: 'Haribo Dragibus', r: 'e' },
  { name: 'Carambar', wiki: 'Carambar', r: 'e' },
  { name: 'Chocapic', wiki: 'Chocapic', off: 'Chocapic Nestle', r: 'e' },
  { name: 'Coca-Cola bien frais', wiki: 'Coca-Cola', r: 'e' },
  { name: 'Oasis Tropical', wiki: 'Oasis (boisson)', off: 'Oasis Tropical', r: 'e' },
  { name: 'Red Bull', wiki: 'Red Bull', r: 'e' },
  { name: 'Monster Energy', wiki: 'Monster Energy', r: 'e' },
  { name: 'Eau Cristaline (Si bonne !)', wiki: 'Cristaline', off: 'Cristaline eau', r: 'e' },

  // 3★ Rares, 2★ Peu communes & 1★ Communes
  { name: 'Moules-frites', wiki: 'Moules-frites', r: 'r' },
  { name: 'Steak-frites sauce au poivre', wiki: 'Steak frites', r: 'r' },
  { name: 'Poulet rôti du dimanche & patates', wiki: 'Poulet rôti', r: 'r' },
  { name: 'Coq au vin', wiki: 'Coq au vin', r: 'r' },
  { name: 'Confit de canard', wiki: 'Confit de canard', r: 'r' },
  { name: 'Ratatouille niçoise', wiki: 'Ratatouille', r: 'r' },
  { name: 'Salade niçoise', wiki: 'Salade niçoise', r: 'u' },
  { name: 'Flammekueche (Tarte flambée)', wiki: 'Tarte flambée', r: 'r' },
  { name: 'Quenelle de brochet sauce Nantua', wiki: 'Quenelle', r: 'u' },
  { name: 'Andouillette de Troyes', wiki: 'Andouillette', r: 'u' },
  { name: 'Boudin noir aux pommes', wiki: 'Boudin noir', r: 'u' },
  { name: 'Saucisson sec pur porc', wiki: 'Saucisson', r: 'r' },
  { name: 'Jambon de Bayonne', wiki: 'Jambon de Bayonne', r: 'u' },
  { name: 'Pâté en croûte', wiki: 'Pâté en croûte', r: 'u' },
  { name: 'Rillettes du Mans', wiki: 'Rillettes', r: 'u' },
  { name: 'Soupe à l’oignon gratinée', wiki: 'Soupe à l’oignon', r: 'r' },
  { name: 'Gigot d’agneau aux flageolets', wiki: 'Gigot', r: 'u' },
  { name: 'Tomates farcies', wiki: 'Tomate farcie', r: 'u' },
  { name: 'Mousse au chocolat maison', wiki: 'Mousse au chocolat', r: 'r' },
  { name: 'Île flottante', wiki: 'Île flottante', r: 'u' },
  { name: 'Profiteroles au chocolat', wiki: 'Profiterole', r: 'r' },
  { name: 'Tarte aux fraises', wiki: 'Tarte aux fraises', r: 'r' },
  { name: 'Tarte au citron meringuée', wiki: 'Tarte au citron', r: 'r' },
  { name: 'Fraisier', wiki: 'Fraisier (pâtisserie)', r: 'r' },
  { name: 'Forêt-noire', wiki: 'Forêt-noire (gâteau)', r: 'r' },
  { name: 'Galette des rois (Frangipane)', wiki: 'Galette des rois', r: 'r' },
  { name: 'Brioche tressée', wiki: 'Brioche', r: 'u' },
  { name: 'Chouquettes', wiki: 'Chouquette', r: 'u' },
  { name: 'Madeleine de Commercy', wiki: 'Madeleine (cuisine)', r: 'u' },
  { name: 'Gaufre de Liège', wiki: 'Gaufre de Liège', r: 'r' },
  { name: 'Churros au chocolat', wiki: 'Churro', r: 'r' },
  { name: 'Gyoza grillés', wiki: 'Jiaozi', r: 'r' },
  { name: 'Takoyaki d’Osaka', wiki: 'Takoyaki', r: 'r' },
  { name: 'Mochi glacé', wiki: 'Mochi', r: 'r' },
  { name: 'Nems croustillants', wiki: 'Nem', r: 'r' },
  { name: 'Rouleau de printemps', wiki: 'Rouleau de printemps', r: 'u' },
  { name: 'Poulet Tikka Masala & Naan fromage', wiki: 'Poulet tikka masala', r: 'r' },
  { name: 'Risotto aux cèpes', wiki: 'Risotto', r: 'r' },
  { name: 'Gnocchis poêlés', wiki: 'Gnocchi', r: 'u' },
  { name: 'Bruschetta', wiki: 'Bruschetta', r: 'c' },
  { name: 'Burrito mexicain', wiki: 'Burrito', r: 'r' },
  { name: 'Guacamole & Nachos', wiki: 'Guacamole', r: 'r' },
  { name: 'Chili con carne', wiki: 'Chili con carne', r: 'u' },
  { name: 'Ceviche péruvien', wiki: 'Ceviche', r: 'r' },
  { name: 'Empanadas', wiki: 'Empanada', r: 'u' },
  { name: 'Fish and Chips', wiki: 'Fish and chips', r: 'r' },
  { name: 'Hot-dog New-Yorkais', wiki: 'Hot-dog', r: 'u' },
  { name: 'Pancakes au sirop d’érable', wiki: 'Pancake', r: 'r' },
  { name: 'Donut glacé rose (Homer)', wiki: 'Donut', r: 'r' },
  { name: 'Cheesecake New-Yorkais', wiki: 'Cheesecake', r: 'r' },
  { name: 'Brownie aux noix de pécan', wiki: 'Brownie', r: 'u' },
  { name: 'Cookie aux pépites de chocolat', wiki: 'Cookie (cuisine)', r: 'u' },
  { name: 'Houmous & Falafel', wiki: 'Falafel', r: 'u' },
  { name: 'Baklava aux pistaches', wiki: 'Baklava', r: 'r' },
  { name: 'Moussaka grecque', wiki: 'Moussaka', r: 'u' },
  { name: 'Salade grecque (Feta & Olives)', wiki: 'Salade grecque', r: 'c' },
  { name: 'Pastel de nata', wiki: 'Pastel de nata', r: 'r' },
  { name: 'Jambon Ibérique Pata Negra', wiki: 'Jambon ibérique', r: 'r' },
  { name: 'Prince de Lu', wiki: 'Prince (biscuit)', off: 'Prince Lu chocolat', r: 'r' },
  { name: 'Véritable Petit Beurre Lu', wiki: 'Petit Beurre', r: 'u' },
  { name: 'BN au chocolat (Sourire)', wiki: 'Biscuiterie nantaise', r: 'r' },
  { name: 'Speculoos Lotus', wiki: 'Spéculoos', r: 'u' },
  { name: 'Toblerone', wiki: 'Toblerone', r: 'r' },
  { name: 'M&M’s Cacahuète', wiki: "M&M's", r: 'r' },
  { name: 'Snickers', wiki: 'Snickers', r: 'u' },
  { name: 'Twix', wiki: 'Twix', r: 'u' },
  { name: 'Mars', wiki: 'Mars (chocolat)', r: 'u' },
  { name: 'KitKat', wiki: 'Kit Kat', r: 'u' },
  { name: 'Chupa Chups', wiki: 'Chupa Chups', r: 'u' },
  { name: 'Pringles Original', wiki: 'Pringles', r: 'r' },
  { name: 'Doritos Nacho Cheese', wiki: 'Doritos', r: 'r' },
  { name: 'Chips Lay’s Paysanne', wiki: "Lay's", off: 'Lays chips', r: 'u' },
  { name: 'Curly Cacahuète (Si t’as pas d’amis…)', wiki: 'Curly (biscuit apéritif)', off: 'Curly Vico', r: 'r' },
  { name: 'Babybel rouge', wiki: 'Babybel', r: 'r' },
  { name: 'La Vache qui rit', wiki: 'La Vache qui rit', r: 'r' },
  { name: 'Caprice des Dieux', wiki: 'Caprice des Dieux', off: 'Caprice des Dieux', r: 'u' },
  { name: 'Danette Chocolat', wiki: 'Danette', off: 'Danette chocolat', r: 'u' },
  { name: 'Yop Fraise', wiki: 'Yop', off: 'Yop Yoplait', r: 'u' },
  { name: 'Orangina (Secouez-moi !)', wiki: 'Orangina', r: 'r' },
  { name: 'Lipton Ice Tea Pêche', wiki: 'Lipton Ice Tea', off: 'Lipton Ice Tea Peche', r: 'r' },
  { name: 'Capri-Sun Multivitaminé', wiki: 'Capri-Sun', r: 'r' },
  { name: 'Pâtes au beurre & gruyère râpé (Fin de mois)', wiki: 'Nouilles', r: 'c' },
  { name: 'Jambon-beurre parisien', wiki: 'Jambon-beurre', r: 'u' },
  { name: 'Œuf à la coque & mouillettes', wiki: 'Œuf à la coque', r: 'c' },
  { name: 'Purée-jambon (Puits de sauce)', wiki: 'Purée de pommes de terre', r: 'c' },
  { name: 'Cordon bleu poêlé', wiki: 'Cordon bleu (cuisine)', r: 'u' },
  { name: 'Frites belges mayo', wiki: 'Frite', r: 'u' },
];

// ─────────────────────────────────────────────────────────────────────────────
// 6. VOITURES : Françaises, Iconiques, Sportives & Légendes
// ─────────────────────────────────────────────────────────────────────────────
const CARS_LIST = [
  // 6★ Mythiques
  { name: 'Citroën 2CV', wiki: 'Citroën 2 CV', r: 'm' },
  { name: 'Citroën DS 21 Pallas', wiki: 'Citroën DS', r: 'm' },
  { name: 'Peugeot 205 GTI 1.9', wiki: 'Peugeot 205', r: 'm' },
  { name: 'Renault Twingo I (1993)', wiki: 'Renault Twingo I', r: 'm' },
  { name: 'Renault Espace F1 (V10 800 ch)', wiki: 'Renault Espace F1', r: 'm' },
  { name: 'Bugatti Chiron Super Sport', wiki: 'Bugatti Chiron', r: 'm' },
  { name: 'Ferrari F40', wiki: 'Ferrari F40', r: 'm' },
  { name: 'Porsche 911 GT3 RS', wiki: 'Porsche 911 GT3', r: 'm' },
  { name: 'Nissan Skyline GT-R R34', wiki: 'Nissan Skyline GT-R', r: 'm' },
  { name: 'Fiat Multipla (Légende Absolue)', wiki: 'Fiat Multipla', r: 'm' },

  // 5★ Légendaires
  { name: 'Renault 4L (Renault 4)', wiki: 'Renault 4', r: 'l' },
  { name: 'Renault 5 Turbo 2', wiki: 'Renault 5 Turbo', r: 'l' },
  { name: 'Renault Clio Williams', wiki: 'Renault Clio Williams', r: 'l' },
  { name: 'Renault Clio V6 Phase 2', wiki: 'Renault Clio V6', r: 'l' },
  { name: 'Alpine A110 Berlinette (1973)', wiki: 'Alpine A110', r: 'l' },
  { name: 'Peugeot 406 Blanche (Taxi Marseille)', wiki: 'Peugeot 406', r: 'l' },
  { name: 'Peugeot 205 Turbo 16 (Groupe B)', wiki: 'Peugeot 205 Turbo 16', r: 'l' },
  { name: 'Citroën Méhari', wiki: 'Citroën Méhari', r: 'l' },
  { name: 'Bugatti Veyron 16.4', wiki: 'Bugatti Veyron 16.4', r: 'l' },
  { name: 'Bugatti Type 35', wiki: 'Bugatti Type 35', r: 'l' },
  { name: 'Lamborghini Countach LP500', wiki: 'Lamborghini Countach', r: 'l' },
  { name: 'Lamborghini Aventador SVJ', wiki: 'Lamborghini Aventador', r: 'l' },
  { name: 'Toyota Supra MK4 (A80)', wiki: 'Toyota Supra', r: 'l' },
  { name: 'Mazda RX-7 FD', wiki: 'Mazda RX-7', r: 'l' },
  { name: 'Ford Mustang Fastback 1967', wiki: 'Ford Mustang', r: 'l' },
  { name: 'DeLorean DMC-12', wiki: 'DeLorean DMC-12', r: 'l' },
  { name: 'McLaren F1', wiki: 'McLaren F1', r: 'l' },
  { name: 'Aston Martin DB5 (007)', wiki: 'Aston Martin DB5', r: 'l' },

  // 4★ Épiques
  { name: 'Citroën Traction Avant', wiki: 'Citroën Traction Avant', r: 'e' },
  { name: 'Citroën SM (Moteur Maserati)', wiki: 'Citroën SM', r: 'e' },
  { name: 'Citroën Saxo VTS 16v', wiki: 'Citroën Saxo', r: 'e' },
  { name: 'Citroën Xsara WRC (Sébastien Loeb)', wiki: 'Citroën Xsara WRC', r: 'e' },
  { name: 'Peugeot 206 RC / 206 CC', wiki: 'Peugeot 206', r: 'e' },
  { name: 'Peugeot 504 Coupé V6', wiki: 'Peugeot 504', r: 'e' },
  { name: 'Peugeot 106 S16 / Rallye', wiki: 'Peugeot 106', r: 'e' },
  { name: 'Peugeot 208 T16 Pikes Peak', wiki: 'Peugeot 208 T16 Pikes Peak', r: 'e' },
  { name: 'Renault 8 Gordini', wiki: 'Renault 8', r: 'e' },
  { name: 'Renault Mégane RS Trophy', wiki: 'Renault Mégane', r: 'e' },
  { name: 'Renault Avantime', wiki: 'Renault Avantime', r: 'e' },
  { name: 'Alpine A110 R (Nouvelle)', wiki: 'Alpine A110 (2017)', r: 'e' },
  { name: 'Bugatti EB110', wiki: 'Bugatti EB110', r: 'e' },
  { name: 'Venturi 400 GT', wiki: 'Venturi 400 GT', r: 'e' },
  { name: 'Ferrari Testarossa', wiki: 'Ferrari Testarossa', r: 'e' },
  { name: 'Ferrari Enzo', wiki: 'Ferrari Enzo', r: 'e' },
  { name: 'Ferrari 250 GTO', wiki: 'Ferrari 250 GTO', r: 'e' },
  { name: 'Ferrari LaFerrari', wiki: 'LaFerrari', r: 'e' },
  { name: 'Lamborghini Miura', wiki: 'Lamborghini Miura', r: 'e' },
  { name: 'Lamborghini Diablo', wiki: 'Lamborghini Diablo', r: 'e' },
  { name: 'Lamborghini Murciélago', wiki: 'Lamborghini Murciélago', r: 'e' },
  { name: 'Pagani Zonda', wiki: 'Pagani Zonda', r: 'e' },
  { name: 'Koenigsegg Jesko', wiki: 'Koenigsegg Jesko', r: 'e' },
  { name: 'Porsche Carrera GT', wiki: 'Porsche Carrera GT', r: 'e' },
  { name: 'BMW M3 E30', wiki: 'BMW M3', r: 'e' },
  { name: 'Mercedes-Benz 300 SL Gullwing', wiki: 'Mercedes-Benz 300 SL', r: 'e' },
  { name: 'Audi Quattro S1 (Groupe B)', wiki: 'Audi Quattro', r: 'e' },
  { name: 'Lancia Delta HF Integrale', wiki: 'Lancia Delta', r: 'e' },
  { name: 'Lancia Stratos', wiki: 'Lancia Stratos', r: 'e' },
  { name: 'Subaru Impreza WRX STI', wiki: 'Subaru Impreza', r: 'e' },
  { name: 'Mitsubishi Lancer Evolution IX', wiki: 'Mitsubishi Lancer Evolution', r: 'e' },
  { name: 'Honda NSX (Ayrton Senna)', wiki: 'Honda NSX', r: 'e' },
  { name: 'Toyota AE86 Sprinter Trueno (Initial D)', wiki: 'Toyota AE86', r: 'e' },
  { name: 'Mazda MX-5 Miata NA', wiki: 'Mazda MX-5', r: 'e' },
  { name: 'Dodge Charger R/T 1969', wiki: 'Dodge Charger', r: 'e' },
  { name: 'Shelby Cobra 427', wiki: 'AC Cobra', r: 'e' },
  { name: 'Ford GT40', wiki: 'Ford GT40', r: 'e' },
  { name: 'Volkswagen Combi T1', wiki: 'Volkswagen Type 2', r: 'e' },
  { name: 'Volkswagen Coccinelle', wiki: 'Volkswagen Coccinelle', r: 'e' },

  // 3★ Rares, 2★ Peu communes & 1★ Communes
  { name: 'Citroën CX GTI Turbo', wiki: 'Citroën CX', r: 'r' },
  { name: 'Citroën BX 16 Soupapes', wiki: 'Citroën BX', r: 'r' },
  { name: 'Citroën Xantia Activa', wiki: 'Citroën Xantia', r: 'r' },
  { name: 'Citroën Ami 6', wiki: 'Citroën Ami 6', r: 'u' },
  { name: 'Citroën Berlingo', wiki: 'Citroën Berlingo', r: 'c' },
  { name: 'Citroën C3 Pluriel', wiki: 'Citroën C3 Pluriel', r: 'c' },
  { name: 'Citroën Xsara Picasso', wiki: 'Citroën Xsara Picasso', r: 'u' },
  { name: 'Citroën Ami (Le Cube sans permis)', wiki: 'Citroën Ami (2020)', r: 'r' },
  { name: 'Peugeot 404', wiki: 'Peugeot 404', r: 'u' },
  { name: 'Peugeot 306 S16', wiki: 'Peugeot 306', r: 'r' },
  { name: 'Peugeot 309 GTI 16', wiki: 'Peugeot 309', r: 'r' },
  { name: 'Peugeot 405 Mi16', wiki: 'Peugeot 405', r: 'r' },
  { name: 'Peugeot RCZ', wiki: 'Peugeot RCZ', r: 'r' },
  { name: 'Peugeot 103 SP (Mobylette)', wiki: 'Peugeot 103', r: 'r' },
  { name: 'Peugeot 207', wiki: 'Peugeot 207', r: 'c' },
  { name: 'Peugeot 307', wiki: 'Peugeot 307', r: 'c' },
  { name: 'Peugeot 3008', wiki: 'Peugeot 3008', r: 'c' },
  { name: 'Peugeot Partner', wiki: 'Peugeot Partner', r: 'c' },
  { name: 'Renault Dauphine', wiki: 'Renault Dauphine', r: 'u' },
  { name: 'Renault 4CV', wiki: 'Renault 4CV', r: 'u' },
  { name: 'Renault 12 Gordini', wiki: 'Renault 12', r: 'u' },
  { name: 'Renault Fuego', wiki: 'Renault Fuego', r: 'r' },
  { name: 'Renault 21 2L Turbo', wiki: 'Renault 21', r: 'r' },
  { name: 'Renault Safrane Biturbo', wiki: 'Renault Safrane', r: 'r' },
  { name: 'Renault Spider', wiki: 'Renault Sport Spider', r: 'r' },
  { name: 'Renault Kangoo Express', wiki: 'Renault Kangoo', r: 'u' },
  { name: 'Renault Scénic I', wiki: 'Renault Scénic', r: 'c' },
  { name: 'Renault Modus', wiki: 'Renault Modus', r: 'c' },
  { name: 'Renault Laguna II', wiki: 'Renault Laguna', r: 'c' },
  { name: 'Renault Clio II Campus', wiki: 'Renault Clio II', r: 'u' },
  { name: 'Dacia Duster 4x4', wiki: 'Dacia Duster', r: 'u' },
  { name: 'Dacia Sandero', wiki: 'Dacia Sandero', r: 'c' },
  { name: 'Simca 1000 Rallye', wiki: 'Simca 1000', r: 'r' },
  { name: 'Matra Murena', wiki: 'Matra Murena', r: 'r' },
  { name: 'Facel Vega HK500', wiki: 'Facel Vega HK 500', r: 'r' },
  { name: 'Fiat 500 Classique (Nuova 500)', wiki: 'Fiat 500 (1957)', r: 'r' },
  { name: 'Fiat Panda 4x4 (1983)', wiki: 'Fiat Panda', r: 'r' },
  { name: 'Mini Cooper originale', wiki: 'Mini (1959-2000)', r: 'r' },
  { name: 'Volkswagen Golf I GTI', wiki: 'Volkswagen Golf I', r: 'r' },
  { name: 'Audi R8 V10', wiki: 'Audi R8 (voiture de route)', r: 'r' },
  { name: 'Audi RS6 Avant', wiki: 'Audi RS6', r: 'r' },
  { name: 'Mercedes Classe G AMG', wiki: 'Mercedes-Benz Classe G', r: 'r' },
  { name: 'Land Rover Defender', wiki: 'Land Rover Defender', r: 'r' },
  { name: 'Jeep Willys MB', wiki: 'Willys MB', r: 'r' },
  { name: 'Hummer H1', wiki: 'Hummer H1', r: 'r' },
  { name: 'Chevrolet Corvette Stingray C3', wiki: 'Chevrolet Corvette (C3)', r: 'r' },
  { name: 'Chevrolet Camaro SS', wiki: 'Chevrolet Camaro', r: 'r' },
  { name: 'Dodge Viper GTS', wiki: 'Dodge Viper', r: 'r' },
  { name: 'Jaguar Type E', wiki: 'Jaguar Type E', r: 'r' },
  { name: 'Rolls-Royce Phantom', wiki: 'Rolls-Royce Phantom', r: 'r' },
  { name: 'Bentley Continental GT', wiki: 'Bentley Continental GT', r: 'r' },
  { name: 'Honda Civic Type R', wiki: 'Honda Civic Type R', r: 'r' },
  { name: 'Nissan 350Z', wiki: 'Nissan 350Z', r: 'r' },
  { name: 'Toyota Land Cruiser', wiki: 'Toyota Land Cruiser', r: 'u' },
  { name: 'Toyota Prius (Uber)', wiki: 'Toyota Prius', r: 'c' },
  { name: 'Tesla Cybertruck', wiki: 'Tesla Cybertruck', r: 'r' },
  { name: 'Tesla Model 3', wiki: 'Tesla Model 3', r: 'c' },
];

// ─────────────────────────────────────────────────────────────────────────────
// FONCTIONS D'INTERROGATION WIKIDATA / WIKIPEDIA / COMMONS / OPENFOODFACTS
// ─────────────────────────────────────────────────────────────────────────────

async function fetchSovereignCountriesFromWikidata() {
  console.log('1/5 Interrogation Wikidata SPARQL : tous les États souverains du monde…');
  const sparql = `
SELECT ?country ?countryLabel (SAMPLE(?flag) AS ?flagUrl) (SAMPLE(?img) AS ?imgUrl) (MAX(?sitelinks) AS ?links) WHERE {
  ?country wdt:P31 wd:Q3624078 .
  FILTER NOT EXISTS { ?country wdt:P576 ?dissolved }
  FILTER NOT EXISTS { ?country wdt:P31 wd:Q3024240 }
  OPTIONAL { ?country wdt:P41 ?flag }
  OPTIONAL { ?country wdt:P18 ?img }
  ?country wikibase:sitelinks ?sitelinks .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". }
}
GROUP BY ?country ?countryLabel
ORDER BY DESC(?links)
`;
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sparql)}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' } });
  const data = await res.json();
  const seen = new Set();
  const countries = [];
  for (const b of data.results.bindings) {
    const label = b.countryLabel?.value;
    if (!label || /^Q\d+$/.test(label)) continue;
    const slug = slugify(label);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    const links = parseInt(b.links?.value || '0', 10);
    const rawFlag = b.flagUrl?.value || b.imgUrl?.value || '';
    // Convertir Special:FilePath en miniature 640px PNG/JPG via Wikimedia
    let thumbUrl = '';
    if (rawFlag) {
      const fileName = decodeURIComponent(rawFlag.split('/').pop());
      thumbUrl = `https://commons.wikimedia.org/w/index.php?title=Special:Redirect/file/${encodeURIComponent(fileName)}&width=640`;
    }
    countries.push({ name: `Pays : ${label}`, rawName: label, slug: `pays-${slug}`, links, imageUrl: thumbUrl });
  }
  // Attribution des raretés par popularité (sitelinks) sur les ~195 pays :
  // Top 6 -> m, suivants 14 -> l, 25 -> e, 45 -> r, 55 -> u, reste -> c
  countries.forEach((c, idx) => {
    if (idx < 6) c.r = 'm';
    else if (idx < 20) c.r = 'l';
    else if (idx < 45) c.r = 'e';
    else if (idx < 90) c.r = 'r';
    else if (idx < 145) c.r = 'u';
    else c.r = 'c';
  });
  console.log(`   -> ${countries.length} pays récupérés depuis Wikidata !`);
  return countries;
}

async function resolveWikipediaImagesBatch(items, lang = 'fr') {
  const titlesToItems = new Map();
  for (const it of items) {
    if (it.imageUrl) continue;
    const t = it.wiki || it.name;
    if (!titlesToItems.has(t)) titlesToItems.set(t, []);
    titlesToItems.get(t).push(it);
  }
  const allTitles = [...titlesToItems.keys()];
  const BATCH = 45;
  for (let i = 0; i < allTitles.length; i += BATCH) {
    const slice = allTitles.slice(i, i + BATCH);
    const api = `https://${lang}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(slice.join('|'))}&prop=pageimages&piprop=thumbnail|original&pithumbsize=640&redirects=1&format=json`;
    try {
      const res = await fetch(api, { headers: { 'User-Agent': UA } });
      const data = await res.json();
      const q = data.query || {};
      // Map normalized & redirected titles back to original requested titles
      const normMap = new Map();
      for (const n of q.normalized || []) normMap.set(n.to, n.from);
      const redirMap = new Map();
      for (const r of q.redirects || []) redirMap.set(r.to, r.from);

      for (const page of Object.values(q.pages || {})) {
        const img = page.thumbnail?.source || page.original?.source;
        if (!img) continue;
        let origTitle = page.title;
        // Remonter redirect -> normalized
        if (redirMap.has(origTitle)) origTitle = redirMap.get(origTitle);
        if (normMap.has(origTitle)) origTitle = normMap.get(origTitle);
        const matched = titlesToItems.get(origTitle) || titlesToItems.get(page.title) || [];
        for (const it of matched) {
          if (!it.imageUrl) it.imageUrl = img;
        }
      }
    } catch (err) {
      console.warn(`   [warn] batch Wikipedia ${lang} failed:`, err.message);
    }
  }
}

async function searchCommonsImage(query) {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent('filetype:bitmap ' + query)}&gsrnamespace=6&gsrlimit=3&prop=imageinfo&iiprop=url&iiurlwidth=640&format=json`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    const data = await res.json();
    const pages = Object.values(data.query?.pages || {});
    for (const p of pages) {
      const ii = p.imageinfo?.[0];
      const u = ii?.thumburl || ii?.url;
      if (u && !/\.svg$/i.test(u) && !/\.pdf$/i.test(u) && !/\.djvu$/i.test(u)) return u;
    }
  } catch {
    /* ignore */
  }
  return '';
}

async function searchOpenFoodFactsImage(query) {
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=5`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    const data = await res.json();
    for (const prod of data.products || []) {
      const u = prod.image_front_url || prod.image_url;
      if (u) return u;
    }
  } catch {
    /* ignore */
  }
  return '';
}

async function resolveAllImagesForList(label, items) {
  console.log(`   Résolution des images pour ${label} (${items.length} entrées)…`);
  await resolveWikipediaImagesBatch(items, 'fr');
  const missingAfterFr = items.filter((it) => !it.imageUrl);
  if (missingAfterFr.length) {
    await resolveWikipediaImagesBatch(missingAfterFr, 'en');
  }
  // Fallbacks : OpenFoodFacts (si .off) puis Wikimedia Commons Search
  const stillMissing = items.filter((it) => !it.imageUrl);
  if (stillMissing.length) {
    console.log(`   -> ${stillMissing.length} images restantes à chercher sur OpenFoodFacts / Wikimedia Commons…`);
    for (const it of stillMissing) {
      if (it.off) {
        it.imageUrl = await searchOpenFoodFactsImage(it.off);
      }
      if (!it.imageUrl) {
        it.imageUrl = await searchCommonsImage(it.commons || it.wiki || it.name);
      }
      if (!it.imageUrl && it.off) {
        it.imageUrl = await searchCommonsImage(it.off);
      }
    }
  }
  const resolvedCount = items.filter((it) => !!it.imageUrl).length;
  console.log(`   ✓ ${label} : ${resolvedCount}/${items.length} images résolues.`);
}

function generateTsSetFile({ constName, infoName, id, label, code, artDir, prefix, entries, includeSecret = false }) {
  const rMap = includeSecret
    ? `const R = { c: 'common', u: 'uncommon', r: 'rare', e: 'epic', l: 'legendary', m: 'mythic', s: 'secret' } as const;`
    : `const R = { c: 'common', u: 'uncommon', r: 'rare', e: 'epic', l: 'legendary', m: 'mythic' } as const;`;
  const rarityType = includeSecret
    ? `export type WorldRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic' | 'secret';`
    : `export type WorldRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';`;

  const lines = entries.map((e, i) => {
    const num = i + 1;
    const safeName = e.name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return `  [${num}, '${e.slug}', '${safeName}', '${e.r}'],`;
  });

  return `/**
 * Sous-thème « ${label} » (World Pack 🌍) — données pures, AUCUN import (partageable avec convex/).
 * Généré par scripts/build-world-catalog.mjs.
 */
${rarityType}

export interface WorldSetEntry {
  num: number;
  slug: string;
  name: string;
  rarity: WorldRarity;
}

export const ${infoName} = { id: '${id}', label: '${label}', code: '${code}', size: ${entries.length}, artDir: '${artDir}' } as const;

${rMap}

const RAW: Array<[number, string, string, keyof typeof R]> = [
${lines.join('\n')}
];

export const ${constName}: WorldSetEntry[] = RAW.map(([num, slug, name, r]) => ({ num, slug, name, rarity: R[r] }));

export const ${prefix}CardId = (e: WorldSetEntry) => \`${prefix}-\${e.slug}\`;

export const ${prefix}File = (e: WorldSetEntry) => \`\${String(e.num).padStart(3, '0')}-\${e.slug}.png\`;
`;
}

async function main() {
  const countries = await fetchSovereignCountriesFromWikidata();

  // Préparer les slugs uniques par catégorie
  const prep = (list) => {
    const used = new Set();
    return list.map((item) => {
      let s = item.slug || slugify(item.name);
      while (used.has(s)) s += '-2';
      used.add(s);
      return { ...item, slug: s };
    });
  };

  const wonders = prep(WONDERS_14);
  const ardeche = prep(ARDECHE_ITEMS);
  const citiesLandmarks = prep(CITIES_AND_LANDMARKS);
  const animals = prep(ANIMALS_LIST);
  const food = prep(FOOD_LIST);
  const cars = prep(CARS_LIST);

  await resolveAllImagesForList('14 Merveilles du Monde (Secrets)', wonders);
  await resolveAllImagesForList('Ardèche', ardeche);
  await resolveAllImagesForList('Capitales, Grandes Villes & Lieux Iconiques', citiesLandmarks);
  await resolveAllImagesForList('Animaux', animals);
  await resolveAllImagesForList('Nourriture & Marques', food);
  await resolveAllImagesForList('Voitures', cars);

  // Combiner Pays + Capitales/Villes/Lieux Iconiques dans `lieux`
  const allLieux = prep([...citiesLandmarks, ...countries].filter((x) => !!x.imageUrl));
  const validWonders = wonders.filter((x) => !!x.imageUrl);
  const validArdeche = ardeche.filter((x) => !!x.imageUrl);
  const validAnimals = animals.filter((x) => !!x.imageUrl);
  const validFood = food.filter((x) => !!x.imageUrl);
  const validCars = cars.filter((x) => !!x.imageUrl);

  const setsDir = path.join(ROOT, 'src/core/sets');
  await fs.mkdir(setsDir, { recursive: true });

  await fs.writeFile(
    path.join(setsDir, 'merveilles.ts'),
    generateTsSetFile({
      constName: 'MERVEILLES_14',
      infoName: 'MERVEILLES_INFO',
      id: 'merveilles',
      label: 'Les 14 Merveilles du Monde',
      code: 'MRV',
      artDir: 'art/merveilles',
      prefix: 'mrv',
      entries: validWonders,
      includeSecret: true,
    }),
  );

  await fs.writeFile(
    path.join(setsDir, 'ardeche.ts'),
    generateTsSetFile({
      constName: 'ARDECHE_SET',
      infoName: 'ARDECHE_INFO',
      id: 'ardeche',
      label: 'Ardèche',
      code: '07',
      artDir: 'art/ardeche',
      prefix: 'ard',
      entries: validArdeche,
    }),
  );

  await fs.writeFile(
    path.join(setsDir, 'lieux.ts'),
    generateTsSetFile({
      constName: 'LIEUX_SET',
      infoName: 'LIEUX_INFO',
      id: 'lieux',
      label: 'Lieux & pays',
      code: 'GEO',
      artDir: 'art/lieux',
      prefix: 'geo',
      entries: allLieux,
    }),
  );

  await fs.writeFile(
    path.join(setsDir, 'animaux.ts'),
    generateTsSetFile({
      constName: 'ANIMAUX_SET',
      infoName: 'ANIMAUX_INFO',
      id: 'animaux',
      label: 'Animaux',
      code: 'ZOO',
      artDir: 'art/animaux',
      prefix: 'zoo',
      entries: validAnimals,
    }),
  );

  await fs.writeFile(
    path.join(setsDir, 'nourriture.ts'),
    generateTsSetFile({
      constName: 'NOURRITURE_SET',
      infoName: 'NOURRITURE_INFO',
      id: 'nourriture',
      label: 'Nourriture',
      code: 'MIAM',
      artDir: 'art/nourriture',
      prefix: 'miam',
      entries: validFood,
    }),
  );

  await fs.writeFile(
    path.join(setsDir, 'voitures.ts'),
    generateTsSetFile({
      constName: 'VOITURES_SET',
      infoName: 'VOITURES_INFO',
      id: 'voitures',
      label: 'Voitures',
      code: 'AUTO',
      artDir: 'art/voitures',
      prefix: 'auto',
      entries: validCars,
    }),
  );

  // Sauvegarder le manifeste de téléchargement d'images
  const manifest = {
    merveilles: validWonders.map((e, i) => ({ num: i + 1, slug: e.slug, name: e.name, r: e.r, url: e.imageUrl })),
    ardeche: validArdeche.map((e, i) => ({ num: i + 1, slug: e.slug, name: e.name, r: e.r, url: e.imageUrl })),
    lieux: allLieux.map((e, i) => ({ num: i + 1, slug: e.slug, name: e.name, r: e.r, url: e.imageUrl })),
    animaux: validAnimals.map((e, i) => ({ num: i + 1, slug: e.slug, name: e.name, r: e.r, url: e.imageUrl })),
    nourriture: validFood.map((e, i) => ({ num: i + 1, slug: e.slug, name: e.name, r: e.r, url: e.imageUrl })),
    voitures: validCars.map((e, i) => ({ num: i + 1, slug: e.slug, name: e.name, r: e.r, url: e.imageUrl })),
  };
  const manifestFile = path.join(ROOT, 'scripts/world-manifest.json');
  await fs.mkdir(path.dirname(manifestFile), { recursive: true });
  await fs.writeFile(manifestFile, JSON.stringify(manifest, null, 2));

  const total =
    manifest.merveilles.length +
    manifest.ardeche.length +
    manifest.lieux.length +
    manifest.animaux.length +
    manifest.nourriture.length +
    manifest.voitures.length;
  console.log(`\n🎉 Catalogue World Pack généré : ${total} cartes au total !`);
  console.log(`   - Merveilles (Secrets 3D) : ${manifest.merveilles.length}`);
  console.log(`   - Ardèche (07)            : ${manifest.ardeche.length}`);
  console.log(`   - Lieux & Pays            : ${manifest.lieux.length}`);
  console.log(`   - Animaux                 : ${manifest.animaux.length}`);
  console.log(`   - Nourriture & Marques    : ${manifest.nourriture.length}`);
  console.log(`   - Voitures                : ${manifest.voitures.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
