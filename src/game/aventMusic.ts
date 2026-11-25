import type { Sfx } from '../core/audio';

/**
 * PETITE MUSIQUE DE NOËL de l'onglet Événement (23/11, retours Tom) : « Jingle Bells » (James Lord Pierpont, 1857,
 * domaine public) jouée en boîte à musique, avec une basse feutrée et des grelots discrets. Synthèse Web Audio sur la
 * chaîne du jeu (`Sfx.rig()` : bus « ambience », compresseur, volume général et bouton son compris) — aucun fichier à
 * charger, rien de plus dans la banque de sons cuite.
 * Programmée en avance sur l'horloge audio (fenêtre glissante, un réveil toutes les 250 ms) ; son coupé ou onglet
 * quitté : plus aucune note n'est posée, la dernière s'éteint toute seule.
 */

/** [note MIDI, durée en temps] — refrain, 16 mesures de 4 temps (do majeur, une octave au-dessus du do central) */
const A: Array<[number, number]> = [
  [76, 1], [76, 1], [76, 2],
  [76, 1], [76, 1], [76, 2],
  [76, 1], [79, 1], [72, 1.5], [74, 0.5],
  [76, 4],
];
const B1: Array<[number, number]> = [
  [77, 1], [77, 1], [77, 1.5], [77, 0.5],
  [77, 1], [76, 1], [76, 1], [76, 0.5], [76, 0.5],
  [76, 1], [74, 1], [74, 1], [76, 1],
  [74, 2], [79, 2],
];
const B2: Array<[number, number]> = [
  [77, 1], [77, 1], [77, 1.5], [77, 0.5],
  [77, 1], [76, 1], [76, 1], [76, 0.5], [76, 0.5],
  [79, 1], [79, 1], [77, 1], [74, 1],
  [72, 4],
];
const MELODY = [...A, ...B1, ...A, ...B2];
/** une fondamentale de basse par mesure */
const BASS = [48, 48, 48, 48, 53, 48, 50, 43, 48, 48, 48, 48, 53, 48, 43, 48];
const BEAT = 0.42; // s (≈ 143 à la noire)
const LOOP_BEATS = 64 + 4; // 16 mesures + une mesure de silence avant la reprise
const LOOKAHEAD = 0.9; // s posées d'avance
const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

interface Ev {
  beat: number;
  kind: 'note' | 'bass' | 'bell';
  midi: number;
  len: number;
}
const EVENTS: Ev[] = (() => {
  const out: Ev[] = [];
  let b = 0;
  for (const [m, len] of MELODY) {
    out.push({ beat: b, kind: 'note', midi: m, len });
    b += len;
  }
  BASS.forEach((m, bar) => {
    out.push({ beat: bar * 4, kind: 'bass', midi: m, len: 2 });
    out.push({ beat: bar * 4 + 2, kind: 'bass', midi: m + 7, len: 2 });
  });
  // grelots sur les temps 2 et 4
  for (let bar = 0; bar < 16; bar++) out.push({ beat: bar * 4 + 1, kind: 'bell', midi: 0, len: 0 }, { beat: bar * 4 + 3, kind: 'bell', midi: 0, len: 0 });
  return out.sort((x, y) => x.beat - y.beat);
})();

export interface AventMusic {
  start(): void;
  stop(): void;
  readonly playing: boolean;
}

export function createAventMusic(sfx: Sfx, vol = 0.5): AventMusic {
  let timer = 0;
  let t0 = 0; // instant audio du temps 0 de la boucle en cours
  let next = 0; // index du prochain évènement à poser
  let loop = 0;

  function voice(r: NonNullable<ReturnType<Sfx['rig']>>, e: Ev, at: number) {
    const { c } = r;
    if (e.kind === 'bell') {
      if (!r.voice(0.12)) return;
      const n = r.noise(at, 0.12);
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 7200;
      f.Q.value = 3;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.05 * vol, at + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.11);
      n.connect(f).connect(g);
      r.out(g, 0.2, 'ambience');
      return;
    }
    const bass = e.kind === 'bass';
    const dur = bass ? e.len * BEAT * 0.95 : Math.max(0.9, e.len * BEAT * 1.6);
    if (!r.voice(dur)) return;
    const f = hz(e.midi);
    const g = c.createGain();
    const peak = (bass ? 0.07 : 0.11) * vol;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + (bass ? 0.03 : 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    // boîte à musique : fondamentale + partiels inharmoniques qui s'éteignent plus vite ; basse : un sinus feutré
    const parts: Array<[number, number]> = bass ? [[1, 1], [2, 0.18]] : [[1, 1], [2.76, 0.32], [5.4, 0.12]];
    for (const [k, a] of parts) {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * k;
      const pg = c.createGain();
      pg.gain.setValueAtTime(a, at);
      if (k > 1) pg.gain.exponentialRampToValueAtTime(0.001, at + dur * 0.35);
      o.connect(pg).connect(g);
      o.start(at);
      o.stop(at + dur + 0.05);
    }
    r.out(g, bass ? 0.12 : 0.32, 'ambience');
  }

  function pump() {
    const r = sfx.rig();
    if (!r) return; // son coupé, bloqué (pas encore de toucher) : on réessaie au prochain réveil
    const now = r.c.currentTime;
    const due = t0 ? t0 + (loop * LOOP_BEATS + (EVENTS[next]?.beat ?? 0)) * BEAT : 0;
    if (!t0 || due < now - 1) {
      // (premier départ, ou reprise après un long silence) : on repart du début, un poil en avance
      t0 = now + 0.08;
      loop = 0;
      next = 0;
    }
    for (;;) {
      if (next >= EVENTS.length) {
        next = 0;
        loop++;
      }
      const e = EVENTS[next];
      const at = t0 + (loop * LOOP_BEATS + e.beat) * BEAT;
      if (at > now + LOOKAHEAD) break;
      if (at >= now - 0.02) voice(r, e, Math.max(at, now));
      next++;
    }
  }

  return {
    start() {
      if (timer) return;
      t0 = 0;
      pump();
      timer = window.setInterval(pump, 250);
    },
    stop() {
      clearInterval(timer);
      timer = 0;
    },
    get playing() {
      return !!timer;
    },
  };
}
