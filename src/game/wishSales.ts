/**
 * (V3, C bis) PASTILLE « une carte que tu veux vient d'être mise en vente » : les alertes du serveur
 * (convex/market.ts `alerts`, une ligne par vendeur) comparées à la dernière visite de l'onglet Acheter, gardée sur
 * l'appareil. Lue par l'en-tête (pastille de « Marché ») et la page Marché (pastille d'Acheter, cartes « nouveau »).
 */
import type { GameBackend, WishSale } from './backend';

const KEY = 'bebou.wishSalesSeen';
let list: WishSale[] = [];
let started = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

function readSeen(): number {
  try {
    const v = Number(localStorage.getItem(KEY));
    if (v > 0) return v;
  } catch {
    /* rien */
  }
  // première fois sur cet appareil : les alertes du dernier jour comptent
  return Date.now() - 86400_000;
}
let seen = readSeen();
function writeSeen(v: number) {
  seen = v;
  try {
    localStorage.setItem(KEY, String(v));
  } catch {
    /* rien */
  }
}

export const wishSales = {
  /** abonnement (une fois, joueur connecté) ; sans `watchWishSales` (démo) : rien */
  start(backend: GameBackend) {
    if (started || !backend.watchWishSales) return;
    started = true;
    backend.watchWishSales((l) => {
      list = l;
      emit();
    });
  },
  /** alertes arrivées depuis la dernière visite d'Acheter */
  unseen: () => list.filter((a) => a.at > seen).length,
  /** entrée dans Acheter : rend la visite précédente (cartes « nouveau ») et éteint la pastille */
  visit(): number {
    const was = seen;
    const lit = list.some((a) => a.at > seen);
    writeSeen(Date.now());
    if (lit) emit();
    return was;
  },
  onChange(fn: () => void): () => void {
    subs.add(fn);
    return () => subs.delete(fn);
  },
};
