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

/**
 * (V3, coût Convex, piste 3 de docs/chantiers/convex-pistes.md) COPIE DE LA COLLECTION D'UN AMI, gardée sur l'appareil
 * (même base, clé `ami:<id>`) et reprise par différence (`inventory.userCollectionSince`). AVANT (v2.1.32) : gardée le
 * temps de la session — rouvrir le profil d'un gros collectionneur le lendemain relisait jusqu'à 6,5 Mo en un appel
 * (26 % de la Database I/O mesurée le 27/11). Bornée : FRIEND_KEEP amis au plus, FRIEND_ROWS lignes en tout (les moins
 * récemment ouverts partent d'abord), même époque et même filet de 30 jours que la copie du joueur.
 */
export const FRIEND_KEEP = 10;
export const FRIEND_ROWS = 60_000;
const FRIEND_INDEX = 'amis';
const friendKey = (id: string) => `ami:${id}`;
export interface FriendSlot {
  id: string;
  /** dernière ouverture (ordre d'éviction) */
  used: number;
  /** lignes gardées */
  n: number;
}
interface SavedFriend {
  build: string;
  at: number;
  rows: InvRow[];
}

/**
 * Pur : index des copies d'amis après avoir ouvert `id` (copie de `n` lignes, `n` < 0 : pas de nouvelle copie, on ne
 * fait que la marquer ouverte). Rend le nouvel index (plus récent d'abord) et les amis à effacer.
 */
export function friendLru(index: FriendSlot[], id: string, n: number, now: number, keep = FRIEND_KEEP, maxRows = FRIEND_ROWS): { index: FriendSlot[]; evict: string[] } {
  const old = index.find((s) => s.id === id);
  const rest = index.filter((s) => s.id !== id).sort((a, b) => b.used - a.used);
  const size = n >= 0 ? n : (old?.n ?? -1);
  if (size < 0 || size > maxRows) return { index: rest, evict: old ? [id] : [] };
  const out: FriendSlot[] = [{ id, used: now, n: size }];
  const evict: string[] = [];
  let total = size;
  for (const s of rest) {
    if (out.length < keep && total + s.n <= maxRows) {
      out.push(s);
      total += s.n;
    } else evict.push(s.id);
  }
  return { index: out, evict };
}

function idbGet<T>(db: IDBDatabase, key: string): Promise<T | undefined> {
  return new Promise((done, fail) => {
    const rq = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    rq.onsuccess = () => done(rq.result as T | undefined);
    rq.onerror = () => fail(rq.error);
  });
}

/** Copie de la collection d'un ami (lignes + date de la dernière lecture complète), ou `null` : à relire en entier. */
export function loadFriendInv(id: string): Promise<{ at: number; rows: InvRow[] } | null> {
  const read = async () => {
    const db = await open();
    if (!db) return null;
    try {
      const s = await idbGet<SavedFriend>(db, friendKey(id));
      if (!s || !Array.isArray(s.rows) || s.build !== EPOCH || !(Date.now() - s.at < MAX_AGE_MS && Date.now() >= s.at)) return null;
      return { at: s.at, rows: s.rows };
    } catch {
      return null;
    } finally {
      db.close();
    }
  };
  return Promise.race([read(), new Promise<null>((r) => setTimeout(() => r(null), LOAD_WAIT_MS))]);
}

/**
 * Garde la copie d'un ami (`rows` absent : seulement marquée ouverte, pour l'ordre d'éviction) et efface celles qui
 * sortent des bornes. Tout échec est silencieux (le prochain profil relira, comme avant).
 */
export async function saveFriendInv(id: string, at: number, rows?: InvRow[]): Promise<void> {
  const db = await open();
  if (!db) return;
  try {
    const index = (await idbGet<FriendSlot[]>(db, FRIEND_INDEX)) ?? [];
    const plan = friendLru(Array.isArray(index) ? index : [], id, rows ? rows.length : -1, Date.now());
    const tx = db.transaction(STORE, 'readwrite');
    const st = tx.objectStore(STORE);
    st.put(plan.index, FRIEND_INDEX);
    for (const e of plan.evict) st.delete(friendKey(e));
    if (rows && plan.index.some((s) => s.id === id)) st.put({ build: EPOCH, at, rows } satisfies SavedFriend, friendKey(id));
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
