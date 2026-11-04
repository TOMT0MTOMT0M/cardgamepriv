import gsap from 'gsap';
import type { Experiment } from '../../core/Experiment';
import { cardById } from '../../core/cardData';
import createDuelSummon from '../../game/scenes/duelSummon';
import { DUEL_MONSTERS } from '../../game/scenes/duelMonsters';

/**
 * 042 — Invocation (6★ Yu-Gi-Oh) : la cinématique du jeu (game/scenes/duelSummon.ts), seule.
 * `?carte=pop-dark-magician` pour choisir le monstre ; `?speed=0.25` ralentit (captures).
 * Fin de séquence : un toucher recharge (la scène du jeu est à usage unique).
 */
export default function create(): Experiment {
  const q = new URLSearchParams(location.search);
  const id = q.get('carte') && DUEL_MONSTERS[q.get('carte')!] ? q.get('carte')! : 'pop-blue-eyes-white-dragon';
  let finished = false;
  const inner = createDuelSummon({
    card: cardById(id),
    monster: DUEL_MONSTERS[id],
    onDone: () => (finished = true),
  });
  let warm = 0;
  return {
    async setup(c) {
      await inner.setup(c);
      const sp = Number(q.get('speed'));
      if (sp > 0) gsap.globalTimeline.timeScale(sp);
      c.bag.fn(c.input.onTap(() => finished && location.reload()));
      warm = 3;
    },
    update(dt, t) {
      if (warm > 0 && --warm === 0) inner.replay?.();
      inner.update(dt, t);
    },
    resize: (w, h) => inner.resize?.(w, h),
    dispose: () => inner.dispose(),
  };
}
