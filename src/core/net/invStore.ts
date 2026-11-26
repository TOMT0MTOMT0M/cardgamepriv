/**
 * (audit 12/11, S15 / A6-07) COPIE DE LA COLLECTION GARDÉE SUR L'APPAREIL (IndexedDB). Sans elle, chaque lancement
 * relisait toute la collection (`inventory.collectionFull`, ≈ 600 Ko par joueur et par lancement d'après l'audit) alors
 * que le suivi par différence (`mineSince`) sait repartir d'une révision.
 *
 * Garde-fous : la copie n'est reprise que pour le MÊME joueur (même session, ou id du joueur vérifié par le client), la
 * MÊME époque de copie, et si sa dernière lecture complète a moins de 30 jours (filet). Tout échec (stockage refusé,
 * navigation privée) = lecture complète, comme avant, avec sa raison (`InvWhy`, écrite dans les journaux Convex).
 * (26/11, coût Convex) AVANT : la copie était liée à la version du jeu — chaque patch (8 le 26/11) faisait relire sa
 * collection entière à chaque joueur (jusqu'à 6 Mo), et elle expirait au bout de 24 h. Depuis, toute suppression
 * d'inventaire laisse une trace (`dropInv`, migrations comprises, jamais purgée) et toute écriture pose `rev` : la
 * différence suffit. (v2.1.31, piste 2) 72 h → 30 jours, nouvelle session du même joueur acceptée, 1,5 → 4 s d'attente.
 * MONTER `EPOCH` si une migration supprime des lignes sans trace ou si le format des lignes gardées change.
 */
import type { InvRow } from './invDiff';

const DB = 'bebou-collection';
const STORE = 'miroir';
const EPOCH = 'copie-1';
const MAX_AGE_MS = 30 * 24 * 3600 * 1000;
const LOAD_WAIT_MS = 4000;

/** raison d'une lecture complète (argument `why` de `inventory.collectionFull`, écrit dans les journaux Convex) */
export type InvWhy = 'absente' | 'expiree' | 'autre-compte' | 'lente' | 'illisible' | 'trop-de-changements' | 'sans-jeton';

interface Saved {
  key: string;
  /** (v2.1.31) id du joueur : une nouvelle session du même joueur reprend la copie */
  uid?: string;
  build: string;
  at: number;
  rows: InvRow[];
}
export interface KeptInv {
  key: string;
  uid?: string;
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

/** Copie gardée sur l'appareil (à qui elle est : au client de le vérifier), ou la raison de s'en passer. */
export function loadInv(): Promise<KeptInv | { why: InvWhy }> {
  // (IndexedDB peut ne jamais répondre — base verrouillée, Safari : au-delà de 4 s, lecture complète comme avant)
  return Promise.race([read(), new Promise<{ why: InvWhy }>((r) => setTimeout(() => r({ why: 'lente' }), LOAD_WAIT_MS))]);
}
async function read(): Promise<KeptInv | { why: InvWhy }> {
  const db = await open();
  if (!db) return { why: 'illisible' };
  return new Promise((done) => {
    try {
      const rq = db.transaction(STORE, 'readonly').objectStore(STORE).get('moi');
      rq.onsuccess = () => {
        const s = rq.result as Saved | undefined;
        db.close();
        if (!s || !Array.isArray(s.rows)) return done({ why: 'absente' });
        if (s.build !== EPOCH || !(Date.now() - s.at < MAX_AGE_MS && Date.now() >= s.at)) return done({ why: 'expiree' });
        done({ key: s.key, uid: s.uid, at: s.at, rows: s.rows });
      };
      rq.onerror = () => (db.close(), done({ why: 'illisible' }));
    } catch {
      db.close();
      done({ why: 'illisible' });
    }
  });
}

/** `at` : date de la dernière lecture COMPLÈTE (la copie ne se rajeunit pas en étant suivie : filet de 30 jours). */
export async function saveInv(key: string, uid: string | undefined, rows: InvRow[], at: number): Promise<void> {
  const db = await open();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ key, uid, build: EPOCH, at, rows } satisfies Saved, 'moi');
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
