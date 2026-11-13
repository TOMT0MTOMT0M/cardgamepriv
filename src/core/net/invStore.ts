/**
 * (audit 12/11, S15 / A6-07) COPIE DE LA COLLECTION GARDÉE SUR L'APPAREIL (IndexedDB). Sans elle, chaque lancement
 * relisait toute la collection (`inventory.collectionFull`, ≈ 600 Ko par joueur et par lancement d'après l'audit) alors
 * que le suivi par différence (`mineSince`) sait repartir d'une révision.
 *
 * Garde-fous : la copie n'est reprise que pour la MÊME session, la MÊME version du jeu, et si elle a moins de 24 h —
 * une remise à zéro ou un ménage de cartes fait par une migration ne laisse pas de trace de suppression, et sort avec
 * une nouvelle version. Tout échec (stockage refusé, navigation privée) = lecture complète, comme avant.
 */
import { BUILD_ID } from '../canal';
import type { InvRow } from './invDiff';

const DB = 'bebou-collection';
const STORE = 'miroir';
const MAX_AGE_MS = 24 * 3600 * 1000;
const LOAD_WAIT_MS = 1500;

interface Saved {
  key: string;
  build: string;
  at: number;
  rows: InvRow[];
}

/** empreinte de la session (le jeton lui-même n'est pas recopié dans cette base) */
export function invKeyOf(token: string | undefined): string {
  let h = 0x811c9dc5;
  const s = token ?? '';
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return `${s.length}-${h.toString(36)}`;
}

function open(): Promise<IDBDatabase | null> {
  return new Promise((done) => {
    try {
      if (typeof indexedDB === 'undefined') return done(null);
      const rq = indexedDB.open(DB, 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore(STORE);
      rq.onsuccess = () => done(rq.result);
      rq.onerror = rq.onblocked = () => done(null);
    } catch {
      done(null);
    }
  });
}

/** Copie gardée pour cette session, ou null (absente, autre session, autre version, trop ancienne, illisible). */
export function loadInv(key: string): Promise<{ rows: InvRow[]; at: number } | null> {
  // (IndexedDB peut ne jamais répondre — base verrouillée, Safari : au-delà de 1,5 s, lecture complète comme avant)
  return Promise.race([read(key), new Promise<null>((r) => setTimeout(() => r(null), LOAD_WAIT_MS))]);
}
async function read(key: string): Promise<{ rows: InvRow[]; at: number } | null> {
  const db = await open();
  if (!db) return null;
  return new Promise((done) => {
    try {
      const rq = db.transaction(STORE, 'readonly').objectStore(STORE).get('moi');
      rq.onsuccess = () => {
        const s = rq.result as Saved | undefined;
        db.close();
        done(s && s.key === key && s.build === BUILD_ID && Array.isArray(s.rows) && Date.now() - s.at < MAX_AGE_MS && Date.now() >= s.at ? { rows: s.rows, at: s.at } : null);
      };
      rq.onerror = () => (db.close(), done(null));
    } catch {
      db.close();
      done(null);
    }
  });
}

/** `at` : date de la dernière lecture COMPLÈTE (la copie ne se rajeunit pas en étant suivie). */
export async function saveInv(key: string, rows: InvRow[], at: number): Promise<void> {
  const db = await open();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ key, build: BUILD_ID, at, rows } satisfies Saved, 'moi');
    tx.oncomplete = tx.onerror = tx.onabort = () => db.close();
  } catch {
    db.close();
  }
}

export async function clearInv(): Promise<void> {
  const db = await open();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete('moi');
    tx.oncomplete = tx.onerror = tx.onabort = () => db.close();
  } catch {
    db.close();
  }
}
