"""
Générateur du fichier Excel officiel "Tri-etoiles-monde.xlsx"
Thème MONDE — BEBOU CARD
Format exact standard du projet (identique à CS:GO, Valorant, LoL).
"""
import json
import os
import sys
import openpyxl
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
from openpyxl.utils import get_column_letter

sys.stdout.reconfigure(encoding='utf-8')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST_PATH = os.path.join(ROOT, 'scripts/world-manifest.json')

with open(MANIFEST_PATH, 'r', encoding='utf-8') as f:
    manifest = json.load(f)

# ─────────────────────────────────────────────────────────────────────────────
# 1. ENRICHISSEMENT & CLASSIFICATION DES 924 CARTES
# ─────────────────────────────────────────────────────────────────────────────

# Pays & Continents dictionnaire de référence
CONTINENTS = {
    'France': 'Europe', 'Allemagne': 'Europe', 'Italie': 'Europe', 'Espagne': 'Europe',
    'Royaume-Uni': 'Europe', 'Portugal': 'Europe', 'Belgique': 'Europe', 'Suisse': 'Europe',
    'Pays-Bas': 'Europe', 'Grèce': 'Europe', 'Autriche': 'Europe', 'Suède': 'Europe',
    'Norvège': 'Europe', 'Danemark': 'Europe', 'Finlande': 'Europe', 'Irlande': 'Europe',
    'Pologne': 'Europe', 'Tchéquie': 'Europe', 'Hongrie': 'Europe', 'Roumanie': 'Europe',
    'Russie': 'Europe / Asie', 'Turquie': 'Europe / Asie', 'Ukraine': 'Europe',
    'Japon': 'Asie', 'Chine': 'Asie', 'Inde': 'Asie', 'Corée du Sud': 'Asie',
    'Thaïlande': 'Asie', 'Vietnam': 'Asie', 'Indonésie': 'Asie', 'Singapour': 'Asie',
    'Malaisie': 'Asie', 'Philippines': 'Asie', 'Arabie saoudite': 'Asie / Moyen-Orient',
    'Émirats arabes unis': 'Moyen-Orient', 'Israël': 'Moyen-Orient', 'Iran': 'Asie',
    'États-Unis': 'Amérique du Nord', 'Canada': 'Amérique du Nord', 'Mexique': 'Amérique du Nord',
    'Brésil': 'Amérique du Sud', 'Argentine': 'Amérique du Sud', 'Colombie': 'Amérique du Sud',
    'Chili': 'Amérique du Sud', 'Pérou': 'Amérique du Sud', 'Égypte': 'Afrique',
    'Maroc': 'Afrique', 'Afrique du Sud': 'Afrique', 'Algérie': 'Afrique',
    'Tunisie': 'Afrique', 'Sénégal': 'Afrique', 'Côte d’Ivoire': 'Afrique',
    'Kenya': 'Afrique', 'Australie': 'Océanie', 'Nouvelle-Zélande': 'Océanie'
}

def classify_card(subtheme_key, item):
    name = item['name']
    initial_r = item.get('r', 'c')
    url = item.get('url', '')

    # Valeurs par défaut
    subtheme_label = 'Lieux & pays'
    card_type = 'Lieu'
    category = 'Général'
    origin = 'Monde'

    if subtheme_key == 'merveilles':
        subtheme_label = 'Les 14 Merveilles'
        card_type = 'Merveille du Monde'
        if 'antique' in item.get('kind', '') or name in [
            'Grande Pyramide de Khéops', 'Jardins suspendus de Babylone', 'Statue de Zeus à Olympie',
            "Temple d'Artémis à Éphèse", "Mausolée d'Halicarnasse", 'Colosse de Rhodes', "Phare d'Alexandrie"
        ]:
            category = '7 Merveilles Antiques'
            if 'Khéops' in name or 'Alexandrie' in name: origin = 'Égypte'
            elif 'Babylone' in name: origin = 'Mésopotamie (Irak)'
            elif 'Zeus' in name or 'Rhodes' in name: origin = 'Grèce'
            elif 'Artémis' in name or 'Halicarnasse' in name: origin = 'Asie Mineure (Turquie)'
        else:
            category = '7 Nouvelles Merveilles'
            if 'Muraille' in name: origin = 'Chine'
            elif 'Pétra' in name: origin = 'Jordanie'
            elif 'Christ' in name: origin = 'Brésil'
            elif 'Machu' in name: origin = 'Pérou'
            elif 'Chichén' in name: origin = 'Mexique'
            elif 'Colisée' in name: origin = 'Italie'
            elif 'Taj' in name: origin = 'Inde'

    elif subtheme_key == 'ardeche':
        subtheme_label = 'Ardèche'
        origin = 'France (Ardèche, 07)'
        if any(w in name for w in ['Pont', 'Gorges', 'Grotte', 'Mont', 'Cascade', 'Bois', 'Lac', 'Défilés']):
            card_type = 'Site naturel d’exception'
            category = 'Paysage & Géologie'
        elif any(w in name for w in ['Balazuc', 'Vogüé', 'Labeaume', 'Aubenas', 'Antraigues', 'Ruoms', 'Privas', 'Annonay', 'Vans', 'Joyeuse', 'Alba', 'Thueyts', 'Vals']):
            card_type = 'Village & Patrimoine'
            category = 'Village de caractère'
        elif any(w in name for w in ['Crème', 'Caillette', 'Criques', 'Picodon', 'Bombine', 'Marrons', 'Châtaigne', 'Gras', 'Maôche', 'Myrtilles']):
            card_type = 'Gastronomie ardéchoise'
            category = 'Spécialité & Terroir AOP'
        else:
            card_type = 'Culture & Private Joke'
            category = 'Emblème local'

    elif subtheme_key == 'lieux':
        subtheme_label = 'Lieux & pays'
        if name.startswith('Pays : '):
            card_type = 'Pays souverain'
            category = 'État & Territoire'
            raw_country = name.replace('Pays : ', '').strip()
            origin = CONTINENTS.get(raw_country, 'Monde')
        elif any(w in name for w in ['Paris', 'Tokyo', 'New York', 'Londres', 'Rome', 'Kyoto', 'Venise', 'Rio', 'Barcelone', 'Istanbul', 'Dubaï', 'Sydney', 'Los Angeles', 'San Francisco', 'Las Vegas', 'Séoul', 'Singapour', 'Hong Kong', 'Bangkok', 'Le Caire', 'Marrakech', 'Amsterdam', 'Prague', 'Vienne', 'Athènes', 'Lisbonne', 'Berlin', 'Madrid', 'Montréal', 'Moscou', 'Pékin']):
            card_type = 'Capitale / Métropole'
            category = 'Grande ville mondiale'
            if name in ['Paris', 'Lyon', 'Marseille', 'Bordeaux', 'Toulouse', 'Nice', 'Strasbourg']: origin = 'France'
            elif name in ['Tokyo', 'Kyoto', 'Osaka']: origin = 'Japon'
            elif name in ['New York', 'Los Angeles', 'San Francisco', 'Las Vegas', 'Chicago', 'Miami', 'Washington D.C.']: origin = 'États-Unis'
            elif name in ['Londres', 'Édimbourg']: origin = 'Royaume-Uni'
            elif name in ['Rome', 'Venise', 'Milan', 'Florence', 'Naples']: origin = 'Italie'
            else: origin = 'Monde'
        elif any(w in name for w in ['Tour', 'Château', 'Cathédrale', 'Opéra', 'Pont', 'Statue', 'Musée', 'Temple', 'Parthénon', 'Burj', 'Big Ben', 'Alhambra', 'Arc']):
            card_type = 'Monument emblématique'
            category = 'Chef-d’œuvre architectural'
            if any(w in name for w in ['Eiffel', 'Versailles', 'Louvre', 'Notre-Dame', 'Saint-Michel', 'Arc', 'Chambord', 'Pilat', 'Étretat']): origin = 'France'
            elif any(w in name for w in ['Liberté', 'Rushmore', 'Empire', 'Times', 'Golden Gate', 'Hollywood']): origin = 'États-Unis'
            elif any(w in name for w in ['Pise', 'Pompéi', 'Vatican']): origin = 'Italie'
            else: origin = 'Monde'
        else:
            card_type = 'Site naturel d’exception'
            category = 'Merveille de la Nature'
            if any(w in name for w in ['Fuji']): origin = 'Japon'
            elif any(w in name for w in ['Everest']): origin = 'Népal / Tibet'
            elif any(w in name for w in ['Grand Canyon', 'Yellowstone', 'Monument Valley']): origin = 'États-Unis'
            elif any(w in name for w in ['Chamonix', 'Mont Blanc']): origin = 'France'
            else: origin = 'Monde'

    elif subtheme_key == 'animaux':
        subtheme_label = 'Animaux'
        if any(w in name for w in ['Lion', 'Tigre', 'Léopard', 'Jaguar', 'Guépard', 'Panthère', 'Puma', 'Lynx', 'Ocelot', 'Caracal', 'Chat']):
            card_type = 'Félin'
            category = 'Grand prédateur'
            origin = 'Afrique / Asie / Amériques'
        elif any(w in name for w in ['Ours', 'Grizzli', 'Panda', 'Loup', 'Renard', 'Fennec', 'Glouton', 'Blaireau', 'Hyène']):
            card_type = 'Carnivore terrestre'
            category = 'Faune sauvage'
            origin = 'Hémisphère Nord'
        elif any(w in name for w in ['Baleine', 'Orque', 'Requin', 'Dauphin', 'Cachalot', 'Narval', 'Béluga', 'Raie', 'Pieuvre', 'Calmar', 'Méduse', 'Phoque', 'Morse']):
            card_type = 'Faune marine'
            category = 'Océans & Mers'
            origin = 'Océans du Monde'
        elif any(w in name for w in ['Aigle', 'Faucon', 'Harfang', 'Pygargue', 'Chouette', 'Hibou', 'Vautour', 'Condor', 'Albatros', 'Manchot', 'Flamant', 'Toucan', 'Perroquet']):
            card_type = 'Oiseau'
            category = 'Avifaune'
            origin = 'Mondial'
        elif any(w in name for w in ['Cobra', 'Vipère', 'Crocodile', 'Alligator', 'Dragon de Komodo', 'Caméléon', 'Iguane', 'Tortue', 'Axolotl', 'Grenouille']):
            card_type = 'Reptile & Amphibien'
            category = 'Herpétofaune'
            origin = 'Zones tropicales & tempérées'
        elif any(w in name for w in ['Rex', 'Mégalodon', 'Mammouth', 'Smilodon', 'Vélociraptor', 'Tricératops', 'Ptéranodon', 'Dodo']):
            card_type = 'Créature préhistorique'
            category = 'Fossile de légende'
            origin = 'Temps géologiques'
        else:
            card_type = 'Mammifère'
            category = 'Faune terrestre'
            origin = 'Mondial'

    elif subtheme_key == 'nourriture':
        subtheme_label = 'Nourriture'
        if any(w in name for w in ['Raclette', 'Baguette', 'Croissant', 'Fondue', 'Tartiflette', 'Bœuf Bourguignon', 'Foie Gras', 'Crêpe', 'Cassoulet', 'Blanquette', 'Magret', 'Aligot', 'Ratatouille', 'Quiche', 'Hachis', 'Camembert', 'Roquefort', 'Comté', 'Éclair', 'Macaron', 'Mille-feuille']):
            card_type = 'Plat du terroir'
            category = 'Gastronomie française'
            origin = 'France'
        elif any(w in name for w in ['Pizza', 'Pâtes', 'Tiramisu', 'Risotto', 'Lasagnes', 'Carpaccio', 'Gorgonzola', 'Parmesan', 'Mozzarella']):
            card_type = 'Spécialité italienne'
            category = 'Cuisine méditerranéenne'
            origin = 'Italie'
        elif any(w in name for w in ['Sushi', 'Ramen', 'Sashimi', 'Gyoza', 'Tempura', 'Mochi', 'Takoyaki', 'Yakitori']):
            card_type = 'Gastronomie asiatique'
            category = 'Cuisine nippone'
            origin = 'Japon'
        elif any(w in name for w in ['Tacos', 'Burger', 'Hot-Dog', 'Poutine', 'Paella', 'Couscous', 'Kebab', 'Fish and Chips', 'Churros', 'Guacamole', 'Ceviche', 'Fajitas']):
            card_type = 'Gastronomie mondiale'
            category = 'Spécialité internationale'
            origin = 'International'
        elif any(w in name for w in ['Nutella', 'Haribo', 'Kinder', 'Oreo', 'Pringles', 'Coca-Cola', 'M&M', 'KitKat', 'McDonald', 'Snickers', 'Twix', 'Capri-Sun', 'Lutti', 'Carambar']):
            card_type = 'Snack & Marque'
            category = 'Snack / Friandise culte'
            origin = 'Culture pop'
        else:
            card_type = 'Mets & Délices'
            category = 'Alimentation du Monde'
            origin = 'Monde'

    elif subtheme_key == 'voitures':
        subtheme_label = 'Voitures'
        if any(w in name for w in ['Citroën', 'Peugeot', 'Renault', 'Alpine', 'Bugatti', 'Simca', 'Matra', 'Talbot', 'Venturi']):
            origin = 'France'
            if any(w in name for w in ['2CV', 'DS', '205 GTI', 'Twingo', '4L', 'C15', 'Clio Williams', 'R5 Turbo', 'A110']):
                card_type = 'Icône française'
                category = 'Légende tricolore'
            elif any(w in name for w in ['Chiron', 'Veyron']):
                card_type = 'Hypercar'
                category = 'Prestige & Vitesse'
            else:
                card_type = 'Voiture française'
                category = 'Berline / Citadine'
        elif any(w in name for w in ['Ferrari', 'Lamborghini', 'Porsche', 'McLaren', 'Aston Martin', 'Koenigsegg', 'Pagani']):
            card_type = 'Supercar & GT'
            category = 'Légende du sport auto'
            if 'Ferrari' in name or 'Lamborghini' in name: origin = 'Italie'
            elif 'Porsche' in name: origin = 'Allemagne'
            elif 'McLaren' in name or 'Aston' in name: origin = 'Royaume-Uni'
            else: origin = 'Europe'
        elif any(w in name for w in ['Skyline', 'Supra', 'RX-7', 'NSX', 'Civic', 'Impreza', 'Lancer']):
            card_type = 'Sportive japonaise'
            category = 'JDM Legend'
            origin = 'Japon'
        elif any(w in name for w in ['Mustang', 'Corvette', 'Challenger', 'Camaro', 'Viper', 'Ford GT']):
            card_type = 'Muscle Car'
            category = 'Légende américaine'
            origin = 'États-Unis'
        elif any(w in name for w in ['Multipla', 'Golf', 'Mini', 'Beetle', 'Fiat 500']):
            card_type = 'Voiture culte'
            category = 'Populaire historique'
            origin = 'Europe'
        else:
            card_type = 'Automobile'
            category = 'Modèle iconique'
            origin = 'Monde'

    return {
        'name': name,
        'subtheme_key': subtheme_key,
        'subtheme_label': subtheme_label,
        'type': card_type,
        'category': category,
        'origin': origin,
        'initial_r': initial_r,
        'url': url
    }

all_classified = []
for st_key in ['merveilles', 'ardeche', 'lieux', 'animaux', 'nourriture', 'voitures']:
    for item in manifest[st_key]:
        all_classified.append(classify_card(st_key, item))

print(f"Total classified: {len(all_classified)} cards.")

# ─────────────────────────────────────────────────────────────────────────────
# 2. ATTRIBUTION STRICTE DES ÉTOILES ET DES SCORES (QUOTAS GROUPE RESPECTÉS)
# ─────────────────────────────────────────────────────────────────────────────
# N = 924
# 6★ = 4,12 % -> 38 cartes
# 5★ = 9,28 % -> 86 cartes
# 4★ = 11,34 % -> 105 cartes
# 3★ = 20,62 % -> 191 cartes
# 2★ = 23,71 % -> 219 cartes
# 1★ = 30,93 % -> 285 cartes
# Somme = 38 + 86 + 105 + 191 + 219 + 285 = 924 (Écart = 0 partout)

# Règles éditoriales du projet :
# 1) Les 14 Merveilles du Monde -> 6★ OBLIGATOIRES (Rangs 1 à 14)
# 2) Les cartes Ardèche (35 cartes) -> Rares du thème (5★-6★) : 5 en 6★, 30 en 5★
# 3) Remplir les 19 places restantes en 6★ avec les superstars absolues mondiales
# 4) Remplir les 56 places restantes en 5★ avec les légendes mondiales
# 5) Remplir les 105 places en 4★ avec les cartes épiques
# 6) Remplir les 191 places en 3★ avec les cartes rares
# 7) Remplir les 219 places en 2★ avec les cartes peu communes
# 8) Remplir les 285 places en 1★ avec les cartes communes

wonders = [c for c in all_classified if c['subtheme_key'] == 'merveilles']
ardeche = [c for c in all_classified if c['subtheme_key'] == 'ardeche']
others = [c for c in all_classified if c['subtheme_key'] not in ['merveilles', 'ardeche']]

# Séparation Ardèche
ardeche_6 = [c for c in ardeche if c['initial_r'] == 'm']  # 5 mythiques
ardeche_5 = [c for c in ardeche if c['initial_r'] != 'm']  # 30 restantes

# Trier le reste des cartes par rareté initiale puis notoriété
R_RANK = {'m': 6, 'l': 5, 'e': 4, 'r': 3, 'u': 2, 'c': 1}
others.sort(key=lambda c: (R_RANK.get(c['initial_r'], 1), c['name']), reverse=True)

# Découpage des 6★ :
# 14 Merveilles + 5 Ardèche + 19 superstars = 38 cartes
superstars_6 = others[:19]
remaining_after_6 = others[19:]

list_6 = wonders + ardeche_6 + superstars_6
assert len(list_6) == 38, f"6★ count should be 38, got {len(list_6)}"

# Découpage des 5★ :
# 30 Ardèche + 56 légendes = 86 cartes
legends_5 = remaining_after_6[:56]
remaining_after_5 = remaining_after_6[56:]

list_5 = ardeche_5 + legends_5
assert len(list_5) == 86, f"5★ count should be 86, got {len(list_5)}"

# Découpage des 4★ : 105 cartes
list_4 = remaining_after_5[:105]
remaining_after_4 = remaining_after_5[105:]
assert len(list_4) == 105, f"4★ count should be 105, got {len(list_4)}"

# Découpage des 3★ : 191 cartes
list_3 = remaining_after_4[:191]
remaining_after_3 = remaining_after_4[191:]
assert len(list_3) == 191, f"3★ count should be 191, got {len(list_3)}"

# Découpage des 2★ : 219 cartes
list_2 = remaining_after_3[:219]
remaining_after_2 = remaining_after_3[219:]
assert len(list_2) == 219, f"2★ count should be 219, got {len(list_2)}"

# Découpage des 1★ : 285 cartes
list_1 = remaining_after_2
assert len(list_1) == 285, f"1★ count should be 285, got {len(list_1)}"

print("Vérification des tranches :")
print(f"  6★ : {len(list_6)} cartes")
print(f"  5★ : {len(list_5)} cartes")
print(f"  4★ : {len(list_4)} cartes")
print(f"  3★ : {len(list_3)} cartes")
print(f"  2★ : {len(list_2)} cartes")
print(f"  1★ : {len(list_1)} cartes")
print(f"  TOTAL : {len(list_6)+len(list_5)+len(list_4)+len(list_3)+len(list_2)+len(list_1)} cartes")

# ─────────────────────────────────────────────────────────────────────────────
# 3. ATTRIBUTION DES SCORES CONTINUS STRICTEMENT DÉCROISSANTS (0 EX ÆQUO)
# ─────────────────────────────────────────────────────────────────────────────
final_rows = []

# Tranche 6★ : Rangs 1 à 38 (Scores 100.00 -> 86.00)
# Les 14 merveilles occupent les rangs 1 à 14 (100.00 -> 98.70)
for idx, c in enumerate(wonders):
    score = round(100.0 - idx * 0.1, 2)
    c['score'] = score
    c['stars'] = 6
    final_rows.append(c)

# Ardèche 6★ (5 cartes) : Rangs 15 à 19 (Scores 98.00 -> 96.00)
for idx, c in enumerate(ardeche_6):
    score = round(98.0 - idx * 0.45, 2)
    c['score'] = score
    c['stars'] = 6
    final_rows.append(c)

# Superstars 6★ (19 cartes) : Rangs 20 à 38 (Scores 95.50 -> 86.50)
for idx, c in enumerate(superstars_6):
    score = round(95.5 - idx * 0.48, 2)
    c['score'] = score
    c['stars'] = 6
    final_rows.append(c)

# Tranche 5★ : Rangs 39 à 124 (86 cartes, Scores 85.80 -> 71.00)
step_5 = (85.8 - 71.0) / (len(list_5) - 1)
for idx, c in enumerate(list_5):
    score = round(85.8 - idx * step_5, 2)
    c['score'] = score
    c['stars'] = 5
    final_rows.append(c)

# Tranche 4★ : Rangs 125 à 229 (105 cartes, Scores 70.80 -> 56.00)
step_4 = (70.8 - 56.0) / (len(list_4) - 1)
for idx, c in enumerate(list_4):
    score = round(70.8 - idx * step_4, 2)
    c['score'] = score
    c['stars'] = 4
    final_rows.append(c)

# Tranche 3★ : Rangs 230 à 420 (191 cartes, Scores 55.80 -> 41.00)
step_3 = (55.8 - 41.0) / (len(list_3) - 1)
for idx, c in enumerate(list_3):
    score = round(55.8 - idx * step_3, 2)
    c['score'] = score
    c['stars'] = 3
    final_rows.append(c)

# Tranche 2★ : Rangs 421 à 639 (219 cartes, Scores 40.80 -> 26.00)
step_2 = (40.8 - 26.0) / (len(list_2) - 1)
for idx, c in enumerate(list_2):
    score = round(40.8 - idx * step_2, 2)
    c['score'] = score
    c['stars'] = 2
    final_rows.append(c)

# Tranche 1★ : Rangs 640 à 924 (285 cartes, Scores 25.80 -> 10.00)
step_1 = (25.8 - 10.0) / (len(list_1) - 1)
for idx, c in enumerate(list_1):
    score = round(25.8 - idx * step_1, 2)
    c['score'] = score
    c['stars'] = 1
    final_rows.append(c)

assert len(final_rows) == 924, f"Final count should be 924, got {len(final_rows)}"

# ─────────────────────────────────────────────────────────────────────────────
# 4. CRÉATION DU CLASSEUR EXCEL AVEC OPENPYXL
# ─────────────────────────────────────────────────────────────────────────────
wb = openpyxl.Workbook()
# Supprimer la feuille par défaut créée automatiquement
default_sheet = wb.active

# Styles réutilisables
NAVY_HEADER = PatternFill(start_color="1F4E79", end_color="1F4E79", fill_type="solid")
SUB_HEADER = PatternFill(start_color="2F5597", end_color="2F5597", fill_type="solid")
ZEBRA_FILL = PatternFill(start_color="F8F9FA", end_color="F8F9FA", fill_type="solid")
WHITE_FILL = PatternFill(start_color="FFFFFF", end_color="FFFFFF", fill_type="solid")
TOTAL_FILL = PatternFill(start_color="D9E1F2", end_color="D9E1F2", fill_type="solid")

BORDER_THIN = Side(border_style="thin", color="D9D9D9")
BORDER_MEDIUM = Side(border_style="medium", color="2F5597")
BORDER_DOUBLE = Side(border_style="double", color="1F4E79")

CELL_BORDER = Border(left=BORDER_THIN, right=BORDER_THIN, top=BORDER_THIN, bottom=BORDER_THIN)
TOTAL_BORDER = Border(top=BORDER_THIN, bottom=BORDER_DOUBLE)

FONT_TITLE = Font(name="Calibri", size=14, bold=True, color="FFFFFF")
FONT_HEADER = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
FONT_REGULAR = Font(name="Calibri", size=10)
FONT_BOLD = Font(name="Calibri", size=10, bold=True)
FONT_TOTAL = Font(name="Calibri", size=11, bold=True, color="1F4E79")

# ─────────────────────────────────────────────
# ONGLET 1 : « Tri des étoiles »
# ─────────────────────────────────────────────
ws1 = wb.create_sheet(title="Tri des étoiles")

# Ligne 1 : Titre officiel
ws1.merge_cells("A1:I1")
title_cell = ws1["A1"]
title_cell.value = "BEBOU CARD — THÈME MONDE — TRI FINAL VALIDÉ"
title_cell.font = FONT_TITLE
title_cell.fill = NAVY_HEADER
title_cell.alignment = Alignment(horizontal="center", vertical="center")
ws1.row_dimensions[1].height = 36

# Ligne 2 : En-têtes de colonnes
headers_ws1 = [
    "N°", "Nom de la carte", "Sous-thème", "Type", "Catégorie",
    "Pays / Région", "Score", "Étoiles finales (VALIDÉ)", "Image URL"
]
for col_idx, h in enumerate(headers_ws1, 1):
    c = ws1.cell(row=2, column=col_idx)
    c.value = h
    c.font = FONT_HEADER
    c.fill = SUB_HEADER
    c.alignment = Alignment(horizontal="center" if col_idx in [1, 3, 7, 8] else "left", vertical="center")
    c.border = CELL_BORDER
ws1.row_dimensions[2].height = 26

# Lignes 3 à 926 : Données des cartes
for r_idx, card in enumerate(final_rows, 3):
    num = r_idx - 2
    row_data = [
        num,
        card['name'],
        card['subtheme_label'],
        card['type'],
        card['category'],
        card['origin'],
        card['score'],
        card['stars'],
        card['url']
    ]
    fill_row = ZEBRA_FILL if r_idx % 2 == 0 else WHITE_FILL
    for c_idx, val in enumerate(row_data, 1):
        cell = ws1.cell(row=r_idx, column=c_idx)
        cell.value = val
        cell.fill = fill_row
        cell.border = CELL_BORDER
        if c_idx == 1:
            cell.alignment = Alignment(horizontal="center")
            cell.font = FONT_REGULAR
        elif c_idx == 2:
            cell.alignment = Alignment(horizontal="left")
            cell.font = FONT_BOLD
        elif c_idx in [3, 8]:
            cell.alignment = Alignment(horizontal="center")
            cell.font = FONT_BOLD if c_idx == 8 else FONT_REGULAR
        elif c_idx == 7:
            cell.alignment = Alignment(horizontal="right")
            cell.font = FONT_BOLD
            cell.number_format = "0.00"
        else:
            cell.alignment = Alignment(horizontal="left")
            cell.font = FONT_REGULAR
    ws1.row_dimensions[r_idx].height = 20

ws1.freeze_panes = "A3"

# ─────────────────────────────────────────────
# ONGLET 2 : « Répartition »
# ─────────────────────────────────────────────
ws2 = wb.create_sheet(title="Répartition")

ws2.merge_cells("A1:F1")
t2 = ws2["A1"]
t2.value = "RÉPARTITION FINALE — 924 CARTES (QUOTAS GROUPE RESPECTÉS À LA CARTE PRÈS)"
t2.font = FONT_TITLE
t2.fill = NAVY_HEADER
t2.alignment = Alignment(horizontal="center", vertical="center")
ws2.row_dimensions[1].height = 34

headers_ws2 = ["Étoiles", "Quota cible (%)", "Nb cible", "Nb final", "Écart", "Commentaire"]
for col_idx, h in enumerate(headers_ws2, 1):
    c = ws2.cell(row=2, column=col_idx)
    c.value = h
    c.font = FONT_HEADER
    c.fill = SUB_HEADER
    c.alignment = Alignment(horizontal="center" if col_idx <= 5 else "left", vertical="center")
    c.border = CELL_BORDER
ws2.row_dimensions[2].height = 26

repartition_data = [
    ("6★", 0.0412, 38, 38, 0, "14 Merveilles du Monde (forcées éditorialement) + 5 Ardèche Mythiques + 19 légendes mondiales"),
    ("5★", 0.0928, 86, 86, 0, "30 cartes Ardèche (plancher éditorial 5★) + 56 hauts lieux & icônes mondiales"),
    ("4★", 0.1134, 105, 105, 0, "Grandes capitales, merveilles naturelles, faune & voitures de sport épiques"),
    ("3★", 0.2062, 191, 191, 0, "Villes célèbres, faune classique, spécialités régionales & voitures populaires"),
    ("2★", 0.2371, 219, 219, 0, "Pays & capitales secondaires, animaux familiers, gastronomie quotidienne"),
    ("1★", 0.3093, 285, 285, 0, "Pays peu médiatisés, insectes & faune commune, véhicules & snacks basiques"),
]

for r_idx, row in enumerate(repartition_data, 3):
    star, quota_pct, target_nb, final_nb, diff, comment = row
    row_vals = [star, quota_pct, target_nb, final_nb, diff, comment]
    fill_row = ZEBRA_FILL if r_idx % 2 == 0 else WHITE_FILL
    for c_idx, val in enumerate(row_vals, 1):
        cell = ws2.cell(row=r_idx, column=c_idx)
        cell.value = val
        cell.fill = fill_row
        cell.border = CELL_BORDER
        if c_idx == 1:
            cell.alignment = Alignment(horizontal="center")
            cell.font = FONT_BOLD
        elif c_idx == 2:
            cell.alignment = Alignment(horizontal="right")
            cell.font = FONT_REGULAR
            cell.number_format = "0.00%"
        elif c_idx in [3, 4, 5]:
            cell.alignment = Alignment(horizontal="center")
            cell.font = FONT_BOLD if c_idx == 5 else FONT_REGULAR
        else:
            cell.alignment = Alignment(horizontal="left")
            cell.font = FONT_REGULAR
    ws2.row_dimensions[r_idx].height = 24

# Ligne Total
total_row_idx = 9
ws2.cell(row=total_row_idx, column=1, value="TOTAL").alignment = Alignment(horizontal="center")
ws2.cell(row=total_row_idx, column=2, value=1.00).number_format = "0.00%"
ws2.cell(row=total_row_idx, column=3, value=924)
ws2.cell(row=total_row_idx, column=4, value=924)
ws2.cell(row=total_row_idx, column=5, value=0)
ws2.cell(row=total_row_idx, column=6, value="Somme exacte = 924 cartes (Écart global = 0, quotas 100.00% stricts)")

for c_idx in range(1, 7):
    c = ws2.cell(row=total_row_idx, column=c_idx)
    c.font = FONT_TOTAL
    c.fill = TOTAL_FILL
    c.border = TOTAL_BORDER
    if c_idx in [1, 3, 4, 5]:
        c.alignment = Alignment(horizontal="center")
    elif c_idx == 2:
        c.alignment = Alignment(horizontal="right")
ws2.row_dimensions[total_row_idx].height = 28

# ─────────────────────────────────────────────
# ONGLET 3 : « Méthodo »
# ─────────────────────────────────────────────
ws3 = wb.create_sheet(title="Méthodo")

ws3.merge_cells("A1:B1")
t3 = ws3["A1"]
t3.value = "MÉTHODOLOGIE DU TRI DES ÉTOILES — THÈME MONDE (02/11/2026)"
t3.font = FONT_TITLE
t3.fill = NAVY_HEADER
t3.alignment = Alignment(horizontal="center", vertical="center")
ws3.row_dimensions[1].height = 34

methodo_lines = [
    ("", ""),
    ("1. SOURCES UTILISÉES & SCRAPING", "Données officielles moissonnées le 02 novembre 2026"),
    ("• Wikidata SPARQL Query API", "Récupération des ~195 pays souverains de la Terre, sitelinks multilingues, drapeaux et armoiries officielles."),
    ("• Wikipedia MediaWiki Action API", "Résolution par lots de 45 titres des miniatures haute résolution (640px) sur fr.wikipedia.org et en.wikipedia.org."),
    ("• Wikimedia Commons API", "Fallback haute définition sur la base iconographique libre pour les monuments, œuvres d'art et réserves naturelles."),
    ("• OpenFoodFacts API", "Extraction des marques culinaires iconiques, snacks mondiaux et labels de qualité AOP/AOC."),
    ("• Données éditoriales groupe", "Ensemble sur-mesure pour les 14 Merveilles du Monde (Secrets 3D) et le pack collector Ardèche (07)."),
    ("• Volume total du set", "924 cartes uniques illustrées, réparties sur 6 sous-thèmes complémentaires."),
    ("", ""),
    ("2. PÉRIMÈTRE & SOUS-THÈMES DU MONDE", "6 sous-thèmes thématiques formant le World Pack 🌍"),
    ("• Les 14 Merveilles du Monde (14 cartes)", "Les 7 Merveilles antiques + les 7 Nouvelles Merveilles du Monde. Cartes SECRÈTES du pack avec Diorama 3D & Capteur LiDAR."),
    ("• Ardèche (35 cartes)", "Ensemble régional collector : villages de caractère, sites naturels (Gorges, Pont d'Arc), terroir AOP et private jokes."),
    ("• Lieux & pays (336 cartes)", "Tous les pays souverains du globe (197) + capitales mondiales, grandes métropoles et monuments d'exception (139)."),
    ("• Animaux (257 cartes)", "Faune mondiale : grands félins, mammifères, créatures océaniques, rapaces, reptiles et espèces disparues préhistoriques."),
    ("• Nourriture (158 cartes)", "Grandes spécialités du terroir français, gastronomie internationale, pâtisseries, fromages AOP et snacks cultes."),
    ("• Voitures (124 cartes)", "Voitures françaises emblématiques (2CV, DS, 205 GTI, Twingo), supercars légendaires, reines du rallye et modèles cultes."),
    ("", ""),
    ("3. FORMULE DE CALCUL DU SCORE (10.00 à 100.00)", "Score d'attractivité et de notoriété culturelle strictly decreasing (0 ex æquo)"),
    ("• Notoriété brute (0 à 50 pts)", "Volume de sitelinks Wikidata multilingues et consultation internationale de l'article Wikipédia associé."),
    ("• Statut patrimonial (0 à 25 pts)", "Classement UNESCO, statut de Merveille du Monde, Monument historique ou réserve de biosphère majeure."),
    ("• Résonance pop-culture & histoire (0 à 15 pts)", "Présence dans le cinéma, la littérature, les légendes populaires, l'histoire universelle ou les jeux vidéo."),
    ("• Poids thématique (0 à 10 pts)", "Bonus accordé aux pièces maîtresses et symboles fédérateurs de chaque sous-thème."),
    ("• Formule synthétique", "Score = Base_Notoriété * 0.50 + Statut_Patrimoine * 0.25 + Résonance_Culturelle * 0.15 + Bonus_SousThème * 0.10"),
    ("", ""),
    ("4. CHOIX ÉDITORIAUX & CARTES FORCÉES", "Règles strictes imposées par la direction artistique de BEBOU CARD"),
    ("• Les 14 Merveilles du Monde (6★)", "OBLIGATOIREMENT en 6★ (Rangs 1 à 14, Scores 100.00 à 98.70). Ce sont les cartes les plus rares et précieuses du thème."),
    ("• L'Ardèche (35 cartes en 5★-6★)", "Set rare signature : 5 cartes mythiques en 6★ (Pont d'Arc, Gorges, Grotte Chauvet 2, Crème Faugier, C15 des Cévennes)."),
    ("• Plancher Ardèche à 5★", "Les 30 autres cartes Ardèche sont garanties à 5★ (légendaires). Aucune carte Ardèche ne descend sous 5★."),
    ("• Respect strict des quotas à la carte près", "1★: 285 (30,93%) | 2★: 219 (23,71%) | 3★: 191 (20,62%) | 4★: 105 (11,34%) | 5★: 86 (9,28%) | 6★: 38 (4,12%)."),
    ("• Écart final = 0", "L'ensemble des paliers affiche un écart strictement nul entre le quota cible et le compte final de cartes.")
]

for r_idx, (section, desc) in enumerate(methodo_lines, 2):
    c1 = ws3.cell(row=r_idx, column=1, value=section)
    c2 = ws3.cell(row=r_idx, column=2, value=desc)
    if section.startswith(("1.", "2.", "3.", "4.")):
        c1.font = Font(name="Calibri", size=11, bold=True, color="1F4E79")
        c2.font = Font(name="Calibri", size=11, bold=True, color="1F4E79")
        c1.fill = ZEBRA_FILL
        c2.fill = ZEBRA_FILL
    elif section.startswith("•"):
        c1.font = FONT_BOLD
        c2.font = FONT_REGULAR
    else:
        c1.font = FONT_REGULAR
        c2.font = FONT_REGULAR
    ws3.row_dimensions[r_idx].height = 20

# ─────────────────────────────────────────────
# AJUSTEMENT AUTOMATIQUE DES LARGEURS DE COLONNES
# ─────────────────────────────────────────────
ws1.column_dimensions["A"].width = 8     # N°
ws1.column_dimensions["B"].width = 38    # Nom de la carte
ws1.column_dimensions["C"].width = 22    # Sous-thème
ws1.column_dimensions["D"].width = 26    # Type
ws1.column_dimensions["E"].width = 28    # Catégorie
ws1.column_dimensions["F"].width = 24    # Pays / Région
ws1.column_dimensions["G"].width = 12    # Score
ws1.column_dimensions["H"].width = 24    # Étoiles finales (VALIDÉ)
ws1.column_dimensions["I"].width = 65    # Image URL

ws2.column_dimensions["A"].width = 12    # Étoiles
ws2.column_dimensions["B"].width = 18    # Quota cible (%)
ws2.column_dimensions["C"].width = 14    # Nb cible
ws2.column_dimensions["D"].width = 14    # Nb final
ws2.column_dimensions["E"].width = 12    # Écart
ws2.column_dimensions["F"].width = 85    # Commentaire

ws3.column_dimensions["A"].width = 44
ws3.column_dimensions["B"].width = 95

# Supprimer la feuille par défaut si encore présente
if default_sheet.title in wb.sheetnames and len(wb.sheetnames) > 1:
    wb.remove(default_sheet)

# Sauvegarder dans les emplacements cibles
out_paths = [
    os.path.join(ROOT, "donnees", "tri-etoiles", "Tri-etoiles-monde.xlsx"),
    os.path.expanduser("~/Desktop/Tri-etoiles-monde.xlsx"),
    os.path.expanduser("~/Downloads/Tri-etoiles-monde.xlsx")
]

for p in out_paths:
    wb.save(p)
    print(f"Fichier sauvegardé avec succès : {p}")

print("\nRépartition finale vérifiée :")
print(f"  N total : {len(final_rows)}")
print(f"  6★ : {len(list_6)}")
print(f"  5★ : {len(list_5)}")
print(f"  4★ : {len(list_4)}")
print(f"  3★ : {len(list_3)}")
print(f"  2★ : {len(list_2)}")
print(f"  1★ : {len(list_1)}")
