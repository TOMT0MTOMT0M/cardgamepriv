/**
 * (audit perf 12/11) Compte ce qu'une requête LIT, dans la base simulée de convex-test.
 * Convex ré-exécute une requête abonnée dès qu'un document qu'elle a lu change : « ne lit plus le document joueur »
 * et « lit N documents au lieu de M » sont les mesures avant / après des lots Convex.
 * Fichier à deux points dans le nom : ignoré par `convex deploy`, comme les tests.
 */
import type { TestConvex } from 'convex-test';
import type { GenericSchema, SchemaDefinition } from 'convex/server';

export type Reads = {
  /** ids lus par `db.get` */
  gets: string[];
  /** documents rendus par les lectures d'index (`collect`, `take`, `first`, `unique`, itération), par table */
  scanned: Record<string, number>;
  /** total : gets trouvés + documents parcourus */
  docs: number;
  /** taille approchée de ce qui a été lu (JSON), en octets */
  bytes: number;
};

const isDoc = (x: unknown): x is { _id: string } => !!x && typeof x === 'object' && '_id' in (x as object);

function wrapQuery<Q extends object>(q: Q, table: string, r: Reads): Q {
  const tally = (res: unknown) => {
    const n = Array.isArray(res) ? res.filter(isDoc).length : isDoc(res) ? 1 : res && typeof res === 'object' && Array.isArray((res as { page?: unknown[] }).page) ? (res as { page: unknown[] }).page.length : 0;
    r.scanned[table] = (r.scanned[table] ?? 0) + n;
    r.docs += n;
    if (n) r.bytes += JSON.stringify(Array.isArray(res) ? res.filter(isDoc) : isDoc(res) ? res : (res as { page: unknown[] }).page).length;
    return res;
  };
  return new Proxy(q, {
    get(target, prop, recv) {
      const v = Reflect.get(target, prop, recv);
      if (typeof v !== 'function') return v;
      if (prop === Symbol.asyncIterator)
        return () => {
          const it = (v as () => AsyncIterator<unknown>).call(target);
          return { next: async () => {
            const step = await it.next();
            if (!step.done) tally(step.value);
            return step;
          } };
        };
      return (...a: unknown[]) => {
        const out = (v as (...x: unknown[]) => unknown).apply(target, a);
        if (out instanceof Promise) return out.then(tally);
        return out && typeof out === 'object' ? wrapQuery(out as object, table, r) : out;
      };
    },
  });
}

/** Exécute le `handler` d'une requête Convex avec une base qui compte ses lectures. */
export async function countReads<S extends GenericSchema, Out>(
  t: TestConvex<SchemaDefinition<S, boolean>>,
  fn: unknown,
  args: Record<string, unknown>,
): Promise<{ result: Out; reads: Reads }> {
  const handler = (fn as { _handler?: (ctx: unknown, args: unknown) => Promise<Out> })._handler;
  if (!handler) throw new Error('countReads : pas une fonction Convex enregistrée');
  const reads: Reads = { gets: [], scanned: {}, docs: 0, bytes: 0 };
  const result = await t.run(async (ctx) => {
    const db = new Proxy(ctx.db as object, {
      get(target, prop, recv) {
        const v = Reflect.get(target, prop, recv);
        if (prop === 'get')
          return async (id: string) => {
            const doc = await (v as (i: string) => Promise<unknown>).call(target, id);
            if (doc) {
              reads.gets.push(String(id));
              reads.docs++;
              reads.bytes += JSON.stringify(doc).length;
            }
            return doc;
          };
        if (prop === 'query') return (table: string) => wrapQuery((v as (tb: string) => object).call(target, table), table, reads);
        return typeof v === 'function' ? (v as (...x: unknown[]) => unknown).bind(target) : v;
      },
    });
    return await handler({ ...(ctx as object), db }, args);
  });
  return { result, reads };
}
