/**
 * Registre des THÈMES (cartes, boosters, sous-thèmes) — point d'entrée unique, API synchrone (`catalogEntry()`…).
 * Le code est dans themesCore.ts ; ce fichier y ajoute les 4 gros sets tout de suite : c'est ce que voient le serveur
 * Convex, les tests et les scripts (catalogue complet, comme toujours).
 * Le BUILD CLIENT (jeu et labo, vite.config.ts → alias `…/sets/themes` → `themesCore`) ne passe pas par ici : le jeu
 * installe les gros sets pendant son démarrage (main.ts), avant toute lecture du catalogue ; le labo au lancement.
 */
import './catalogFull';

export * from './themesCore';
