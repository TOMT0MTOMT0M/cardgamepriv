import type { FunctionReturnType } from 'convex/server';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { POLL, SUB_MAX_MONTHS } from '../core/abo';

/**
 * DASHBOARD — onglet « Abonnements » (20/11, convex/abo.ts, règles : src/core/abo.ts).
 *  1. Destinataire Wero (le numéro affiché aux joueurs : saisi ici, jamais dans le code) ;
 *  2. Demandes « j'ai payé » : vérifier le Wero sur son téléphone, puis « Activer 1 mois » (ou refuser) ;
 *  3. Abonnés : fin de chaque abonnement, + 1 mois, arrêter ; activer à la main n'importe quel joueur ;
 *  4. Cartes Bebou proposées (nom, idée, image) et leur état ;
 *  5. Vote du mois : ouvrir un vote (question, 2 à 6 choix, date de fin), voir les voix, le terminer.
 * Tout est lu à la demande (bouton « Actualiser »), rien en temps réel.
 */
type State = FunctionReturnType<typeof api.abo.adminState>;

export interface AboCtx {
  ask<T>(f: unknown, args?: object): Promise<T>;
  call<T>(f: unknown, args?: object): Promise<T>;
  busy<T>(btn: HTMLButtonElement | null, fn: () => Promise<T>, ok?: (r: T) => string | void): Promise<T | undefined>;
  esc(s: unknown): string;
  fullDate(at: number): string;
}

const DAY = 86_400_000;
const dayFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: 'Europe/Paris' });
const toLocal = (t: number) => {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const CARD_STATUS: Record<string, string> = { new: 'À lire', ok: 'Retenue', done: 'Dans le jeu' };

export async function viewAbonnements(v: HTMLElement, c: AboCtx): Promise<void> {
  const { esc } = c;
  const s = await c.ask<State>(api.abo.adminState);
  const left = (until?: number) => (until && until > s.now ? `${Math.ceil((until - s.now) / DAY)} j` : 'terminé');
  const reload = () => viewAbonnements(v, c);
  const who = (u: { name: string; avatarUrl?: string }) => `${u.avatarUrl ? `<img src="${esc(u.avatarUrl)}" alt="" width="26" height="26" style="border-radius:50%">` : ''}<b>${esc(u.name)}</b>`;
  const active = s.subs.filter((u) => u.active);
  const ended = s.subs.filter((u) => !u.active);

  v.innerHTML = `
    <form class="panel" data-wero>
      <h3>Destinataire Wero</h3>
      <p class="muted small">Ce que les joueurs voient à l’étape « Envoie ${s.priceEur} € par Wero à… » : ton prénom et ton numéro. Vide : le bouton « J’ai payé » reste grisé.</p>
      <div class="row"><input name="w" maxlength="80" placeholder="ex. Tom · 06 12 34 56 78" value="${esc(s.weroTo)}" style="flex:1"><button class="btn accent">Enregistrer</button></div>
    </form>

    <div class="panel">
      <h3>Demandes « j’ai payé » <span class="muted">${s.asks.length}</span></h3>
      ${s.asks.length ? `<p class="muted small">Vérifie d’abord le paiement Wero sur ton téléphone.</p>` : '<p class="muted small">Aucune demande en attente.</p>'}
      ${s.asks.map((u) => `<div class="row quick" style="padding:8px 0;border-top:1px solid var(--line)">${who(u)}<span class="muted small">déclaré le ${esc(c.fullDate(u.subAskAt ?? 0))}${u.active ? ` · déjà abonné (${left(u.subUntil)})` : ''}</span><span style="margin-left:auto" class="row"><button class="btn sm accent" data-act="${u.id}">Activer 1 mois</button><button class="btn sm ghost" data-stop="${u.id}">Refuser</button></span></div>`).join('')}
    </div>

    <div class="panel">
      <h3>Abonnés <span class="muted">${active.length}</span></h3>
      ${active.length ? '' : '<p class="muted small">Personne pour l’instant.</p>'}
      ${active.map((u) => `<div class="row quick" style="padding:8px 0;border-top:1px solid var(--line)">${who(u)}<span class="muted small">jusqu’au ${esc(dayFmt.format(u.subUntil ?? 0))} · <b>${left(u.subUntil)}</b></span><span style="margin-left:auto" class="row"><button class="btn sm" data-act="${u.id}">+ 1 mois</button><button class="btn sm ghost" data-stop="${u.id}" data-confirm="1">Arrêter</button></span></div>`).join('')}
      ${ended.length ? `<p class="muted small" style="margin-top:12px">Anciens abonnés : ${ended.map((u) => `${esc(u.name)} (fini le ${esc(dayFmt.format(u.subUntil ?? 0))})`).join(' · ')}</p>` : ''}
      <form class="row quick" data-manual style="margin-top:12px;padding-top:12px;border-top:1px solid var(--line)">
        <select name="u" required><option value="">Activer un joueur à la main…</option>${s.players.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select>
        <select name="m">${Array.from({ length: SUB_MAX_MONTHS }, (_, i) => `<option value="${i + 1}">${i + 1} mois</option>`).join('')}</select>
        <button class="btn">Activer</button>
      </form>
    </div>

    <div class="panel">
      <h3>Cartes Bebou proposées <span class="muted">${s.cards.length}</span></h3>
      ${s.cards.length ? '' : '<p class="muted small">Aucune proposition.</p>'}
      ${s.cards.map((k) => `<div style="display:grid;grid-template-columns:${k.mediaUrl ? '84px ' : ''}1fr;gap:12px;padding:10px 0;border-top:1px solid var(--line)">
          ${k.mediaUrl ? `<a href="${esc(k.mediaUrl)}" target="_blank" rel="noopener"><img src="${esc(k.mediaUrl)}" alt="" style="width:84px;aspect-ratio:63/88;object-fit:cover;border-radius:8px"></a>` : ''}
          <div><b>${esc(k.title)}</b> <span class="muted small">par ${esc(k.name)} · ${esc(c.fullDate(k.updatedAt))}</span>
            <p style="margin:6px 0;white-space:pre-wrap">${esc(k.idea) || '<span class="muted">(pas de texte)</span>'}</p>
            <div class="row quick">${Object.entries(CARD_STATUS).map(([st, l]) => `<button class="btn sm${k.status === st ? ' on' : ''}" data-card="${k.id}" data-st="${st}">${l}</button>`).join('')}</div>
          </div></div>`).join('')}
    </div>

    <form class="panel" data-poll>
      <h3>Vote du mois</h3>
      <p class="muted small">Un seul vote ouvert à la fois : en ouvrir un nouveau termine le précédent. Seuls les abonnés votent.</p>
      <input name="t" maxlength="${POLL.title}" placeholder="Question (ex. Quelle collection en janvier ?)" required>
      ${Array.from({ length: POLL.maxOptions }, (_, i) => `<input name="o${i}" maxlength="${POLL.option}" placeholder="Choix ${i + 1}${i < POLL.minOptions ? '' : ' (facultatif)'}"${i < POLL.minOptions ? ' required' : ''}>`).join('')}
      <label class="row">Fin du vote <input type="datetime-local" name="end" value="${toLocal(s.now + 7 * DAY)}" required></label>
      <label class="row"><input type="checkbox" name="n" checked> Prévenir les abonnés (notification)</label>
      <button class="btn accent">Ouvrir le vote</button>
    </form>
    ${s.polls.map((p) => `<div class="panel"><h3>${esc(p.title)} <span class="muted small">${p.open ? `ouvert jusqu’au ${esc(c.fullDate(p.closesAt))}` : 'terminé'} · ${p.total} voix · par ${esc(p.byName)}</span></h3>
        ${p.options.map((o) => { const n = p.counts?.[o.id] ?? 0; return `<div class="row" style="gap:10px;padding:3px 0"><span style="flex:0 0 38%">${esc(o.label)}</span><span style="flex:1;height:8px;border-radius:4px;background:var(--line);overflow:hidden"><i style="display:block;height:100%;width:${p.total ? Math.round((n / p.total) * 100) : 0}%;background:var(--text)"></i></span><b style="min-width:26px;text-align:right">${n}</b></div>`; }).join('')}
        ${p.open ? `<button class="btn sm ghost" data-close="${p.id}" style="margin-top:10px">Terminer ce vote</button>` : ''}</div>`).join('')}`;

  const btn = (e: Event) => (e.currentTarget ?? e.target) as HTMLButtonElement;
  v.querySelector<HTMLFormElement>('[data-wero]')!.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.currentTarget as HTMLFormElement;
    void c.busy(f.querySelector('button'), () => c.call<string>(api.abo.adminSetWero, { weroTo: (f.elements.namedItem('w') as HTMLInputElement).value }));
  });
  v.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((b) => b.addEventListener('click', (e) => void c.busy(btn(e), () => c.call<string>(api.abo.adminActivate, { userId: b.dataset.act as Id<'users'>, months: 1 })).then(reload)));
  v.querySelectorAll<HTMLButtonElement>('[data-stop]').forEach((b) =>
    b.addEventListener('click', (e) => {
      if (b.dataset.confirm && !confirm('Arrêter cet abonnement tout de suite ?')) return;
      void c.busy(btn(e), () => c.call<string>(api.abo.adminStop, { userId: b.dataset.stop as Id<'users'> })).then(reload);
    }),
  );
  v.querySelector<HTMLFormElement>('[data-manual]')!.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.currentTarget as HTMLFormElement;
    const userId = (f.elements.namedItem('u') as HTMLSelectElement).value;
    if (!userId) return;
    void c.busy(f.querySelector('button'), () => c.call<string>(api.abo.adminActivate, { userId, months: Number((f.elements.namedItem('m') as HTMLSelectElement).value) })).then(reload);
  });
  v.querySelectorAll<HTMLButtonElement>('[data-card]').forEach((b) => b.addEventListener('click', (e) => void c.busy(btn(e), () => c.call<string>(api.abo.adminCard, { cardId: b.dataset.card as Id<'bebouCards'>, status: b.dataset.st })).then(reload)));
  v.querySelector<HTMLFormElement>('[data-poll]')!.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.currentTarget as HTMLFormElement;
    const val = (n: string) => (f.elements.namedItem(n) as HTMLInputElement).value;
    const options = Array.from({ length: POLL.maxOptions }, (_, i) => val(`o${i}`)).filter((x) => x.trim());
    void c
      .busy(f.querySelector('button'), () => c.call<string>(api.abo.adminPollSave, { title: val('t'), options, closesAt: new Date(val('end')).getTime(), notifyPlayers: (f.elements.namedItem('n') as HTMLInputElement).checked }))
      .then((r) => void (r && reload()));
  });
  v.querySelectorAll<HTMLButtonElement>('[data-close]').forEach((b) => b.addEventListener('click', (e) => void c.busy(btn(e), () => c.call<string>(api.abo.adminPollClose, { pollId: b.dataset.close as Id<'aboPolls'> })).then(reload)));
}
