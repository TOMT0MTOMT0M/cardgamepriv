import type { ExperimentMeta } from './Experiment';

export type Vote = 1 | -1 | 0;

export interface FeedbackEntry {
  vote: Vote;
  note: string;
  updatedAt: string;
}

const KEY = 'cardlab.feedback.v1';
const NAME_KEY = 'cardlab.tester';

/** Prénom du testeur : demandé au premier export, mémorisé, inclus dans le JSON et le nom du fichier. */
function testerName(): string {
  let name = '';
  try {
    name = localStorage.getItem(NAME_KEY) || '';
  } catch {
    /* stockage indisponible */
  }
  if (!name) {
    try {
      name = (window.prompt('Ton prénom (pour que Tom sache de qui viennent ces retours) :') || '').trim();
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
