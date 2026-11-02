import type { ExperimentMeta } from './Experiment';

export type Vote = 1 | -1 | 0;

export interface FeedbackEntry {
  vote: Vote;
  note: string;
  updatedAt: string;
}

const KEY = 'cardlab.feedback.v1';
const NAME_KEY = 'cardlab.tester';

/** Prénom du testeur : demandé au premier export / envoi, mémorisé, inclus dans le JSON et le nom du fichier. */
export function testerName(suggested = ''): string {
  let name = '';
  try {
    name = localStorage.getItem(NAME_KEY) || '';
  } catch {
    /* stockage indisponible */
  }
  if (!name) {
    try {
      name = (window.prompt('Ton prénom (pour que Tom sache de qui viennent ces retours) :', suggested) || '').trim();
    } catch {
      /* prompt bloqué */
    }
    name = name.slice(0, 40) || 'anonyme';
    try {
      localStorage.setItem(NAME_KEY, name);
    } catch {
      /* tant pis */
    }
  }
  return name;
}

export function loadFeedback(): Record<string, FeedbackEntry> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

export function saveFeedback(all: Record<string, FeedbackEntry>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* quota / privé : tant pis */
  }
}

export function setFeedback(id: string, patch: Partial<FeedbackEntry>) {
  const all = loadFeedback();
  const prev = all[id] ?? { vote: 0, note: '', updatedAt: '' };
  all[id] = { ...prev, ...patch, updatedAt: new Date().toISOString() };
  saveFeedback(all);
  return all[id];
}

export function exportFeedback(metas: ExperimentMeta[], extra: Record<string, unknown>) {
  const all = loadFeedback();
  const tester = testerName();
  const payload = {
    tester,
    exportedAt: new Date().toISOString(),
    ...extra,
    summary: {
      up: metas.filter((m) => all[m.id]?.vote === 1).map((m) => m.id),
      down: metas.filter((m) => all[m.id]?.vote === -1).map((m) => m.id),
    },
    experiments: metas.map((m) => ({
      id: m.id,
      title: m.title,
      category: m.category,
      vote: all[m.id]?.vote ?? 0,
      note: all[m.id]?.note ?? '',
      updatedAt: all[m.id]?.updatedAt ?? null,
    })),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const slug = tester.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'anonyme';
  a.download = `cardlab-retours-${slug}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return payload;
}

// ───────────────────────────────────────────── envoi en ligne
const CLIENT_KEY = 'cardlab.feedback.client';
const SYNC_KEY = 'cardlab.feedback.synced';

/** Identifiant stable de ce navigateur : renvoyer met à jour la même ligne côté serveur. */
function clientId(): string {
  try {
    let id = localStorage.getItem(CLIENT_KEY);
    if (!id) {
      id = (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`).slice(0, 64);
      localStorage.setItem(CLIENT_KEY, id);
    }
    return id;
  } catch {
    return `volatile-${Math.random().toString(36).slice(2, 12)}`;
  }
}

/** Vrai une fois que ce testeur a envoyé ses retours au moins une fois (les modifications suivantes partent seules). */
export function feedbackSynced(): boolean {
  try {
    return localStorage.getItem(SYNC_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Envoie tous les retours de ce navigateur au serveur Convex (table labFeedback).
 * `send` : la fonction réseau (core/net/client), injectée pour garder ce module sans dépendance.
 */
export async function pushFeedback(
  metas: ExperimentMeta[],
  extra: { backend?: string; userAgent?: string; quality?: string; dpr?: number },
  send: (args: { clientId: string; tester: string; entries: Array<{ id: string; title: string; category: string; vote: number; note: string; updatedAt?: string | null }>; meta: typeof extra }) => Promise<{ kept: number }>,
  suggestedName = '',
): Promise<{ kept: number }> {
  const all = loadFeedback();
  const tester = testerName(suggestedName);
  const res = await send({
    clientId: clientId(),
    tester,
    entries: metas.map((m) => ({
      id: m.id,
      title: m.title,
      category: m.category,
      vote: all[m.id]?.vote ?? 0,
      note: all[m.id]?.note ?? '',
      updatedAt: all[m.id]?.updatedAt ?? null,
    })),
    meta: extra,
  });
  try {
    localStorage.setItem(SYNC_KEY, '1');
  } catch {
    /* ignore */
  }
  return res;
}
