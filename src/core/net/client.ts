import { ConvexClient } from 'convex/browser';
import type { FunctionReference } from 'convex/server';
import { api } from '../../../convex/_generated/api';
import type { Doc, Id } from '../../../convex/_generated/dataModel';
import type { RarityId } from '../rarity';
import type { MissionsState } from '../missions';
import type { StreakState } from '../streak';

const LS_SESSION_TOKEN = 'cardlab.session_token';
/** page (hash compris) d'où l'on part se connecter : le serveur écrase le hash au retour de Discord */
const SS_RETURN_HASH = 'bebou.returnHash';
/** pas de première réponse du serveur au bout de… (ou WebSocket coupé depuis…) : « serveur injoignable » */
const SERVER_DOWN_MS = 8000;

/** Codes d'erreur du retour Discord (convex/http.ts) → phrases. */
const AUTH_ERRORS: Record<string, string> = {
  not_in_discord_server: 'Ton compte Discord n’est pas sur le serveur des potes : demande une invitation, puis reconnecte-toi.',
  token_exchange_failed: 'Discord n’a pas confirmé la connexion. Réessaie.',
  user_fetch_failed: 'Discord n’a pas répondu. Réessaie dans un instant.',
  guild_check_failed: 'Impossible de vérifier ton serveur Discord. Réessaie.',
  missing_code: 'Connexion annulée.',
};
export const SESSION_EXPIRED = 'Ta session a expiré : reconnecte-toi.';
/** (ouverture 07/11) la saison de test a été remise à zéro : l'ancien compte n'existe plus */
export const NEW_SEASON = 'Nouvelle saison : les compteurs sont remis à zéro, crée ton compte pour jouer.';
/** clés du stockage local liées à la progression : vidées après une remise à zéro (les réglages restent) */
const SEASON_KEYS = ['bebou.vues.v1', 'bebou.cosm.seen', 'bebou.roueVue', 'bebou.booster', 'bebou.qty'];
const LS_EPOCH = 'bebou.saison';

export interface MeProfile {
  _id: Id<'users'>;
  discordId: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  packBalance: number;
  totalPacksOpened: number;
  canClaimDaily: boolean;
  nextDailyClaimAt: number;
  /** recharge des boosters (src/core/packRegen.ts) : réserve stockée + départ du minuteur */
  packStored?: number;
  packRegenAt?: number;
  /** (ouverture 07/11) recharge ×2 jusqu'à cet instant */
  boostUntil?: number;
  nextPackAt?: number | null;
  /** pity 6★ (src/core/pity.ts) */
  pityCount?: number;
  /** envies (ids de cartes) */
  wishlist?: string[];
  /** série de connexion (src/core/streak.ts) */
  streak?: StreakState | null;
  streakClaimable?: boolean;
  /** pochettes de sous-thème épinglées (vue Albums) */
  covers?: Record<string, string>;
  /** (ouverture 07/11) équipe (admin / modérateur) : passe le compte à rebours */
  staff?: boolean;
  /** compte pseudo (sans Discord) */
  pwAccount?: boolean;
}

/** (ouverture 07/11, convex/launch.ts) heure d'ouverture, dernière remise à zéro, code du club demandé à l'inscription */
export interface LaunchInfo {
  launchAt: number | null;
  resetAt: number | null;
  clubCode: boolean;
}

export interface FriendPresence {
  _id: Id<'users'>;
  displayName: string;
  username: string;
  avatarUrl?: string;
  totalPacksOpened: number;
  online: boolean;
  statusText?: string;
  lastSeenAt: number;
}

export interface TradeItem {
  cardId: string;
  rarity: RarityId;
  count: number;
}

export type TradeDoc = Doc<'trades'> & { fromName: string; toName: string };

export interface PackRequestArgs {
  packKind: 'theme' | 'bebou';
  themeId?: string;
}

export interface NetState {
  configured: boolean;
  /** vrai dès la première réponse du serveur (profil) */
  connected: boolean;
  /** aucune réponse depuis SERVER_DOWN_MS (démarrage) ou WebSocket coupé depuis autant : bandeau « serveur injoignable » */
  serverDown: boolean;
  authError: string | null;
  user: MeProfile | null;
  friends: FriendPresence[];
  collection: (typeof api.inventory.myCollection)['_returnType'];
  sealedPack: Doc<'packOpens'> | null;
  feed: Doc<'activityFeed'>[];
  /** gros tirages (Légendaire+) ; `null` = requête pas encore déployée sur le serveur → on les tire du fil */
  bigPulls: Doc<'activityFeed'>[] | null;
  trades: { incoming: TradeDoc[]; outgoing: TradeDoc[] };
  /** missions du jour (+ instant du prochain tirage) */
  missions: (MissionsState & { resetAt: number }) | null;
  /** classeurs perso */
  binders: Doc<'binders'>[];
  /** TABLEAU D'OFFRES (lot T, convex/listings.ts) : mes annonces et mes offres (verrouillage, pastille) */
  board: BoardMine;
  /** AMIS (lot A2, convex/friends.ts) : `null` tant que rien n'est arrivé (ou pas connecté) */
  social: FriendsMine | null;
  /** (ouverture 07/11) compte à rebours : `null` tant que le serveur n'a pas répondu (ou ancienne version du serveur) */
  launch: LaunchInfo | null;
}

/** Réponse de `listings.mine` (tableau d'offres : mes annonces + mes offres). */
export type BoardMine = (typeof api.listings.mine)['_returnType'];

/** Réponse de `friends.mine` (amis acceptés + demandes reçues / envoyées). */
export type FriendsMine = NonNullable<(typeof api.friends.mine)['_returnType']>;
/** Amis sans `lastSeenAt` des amis (change à chaque battement) : seulement en ligne / hors ligne, pour décider d'émettre. */
const socialSig = (s: FriendsMine | null) =>
  !s
    ? ''
    : JSON.stringify([
        s.incoming.map((r) => [r.friendshipId, r.name, r.avatarUrl ?? '']),
        s.outgoing.map((r) => [r.friendshipId, r.name, r.avatarUrl ?? '']),
        s.friends.map((f) => [f.friendshipId, f.name, f.avatarUrl ?? '', f.statusText ?? '', f.packsOpened, Date.now() - f.lastSeenAt < 90_000, f.lastActivity?.createdAt ?? 0]),
      ]);

type Listener = (state: NetState) => void;

/** Profil sans les champs qui changent à chaque battement de cœur sans rien changer à l'écran. */
const userSig = (u: MeProfile | null) => (u ? JSON.stringify({ ...u, nextDailyClaimAt: 0 }) : '');
/** Amis sans `lastSeenAt` (change à chaque battement) ni l'ordre qui en découle. */
const friendsSig = (fs: FriendPresence[]) =>
  fs
    .map((f) => JSON.stringify([f._id, f.displayName, f.username, f.avatarUrl ?? '', f.totalPacksOpened, f.online, f.statusText ?? '']))
    .sort()
    .join('|');

/**
 * Singleton reactive WebSocket client for Convex (`convex/browser`).
 * Keeps collection, friend presence, live pull feed, and pre-rolled ("sealed")
 * boosters in local memory so the Three.js WebGPU loop runs with 0ms network wait.
 */
class GameNetClient {
  private client: ConvexClient | null = null;
  private sessionToken: string | null = null;
  private unsubscribers: Array<() => void> = [];
  /** fil d'activité complet (`feed.recent`) : demandé par le HUD du labo ; le jeu lit `feed.bigPulls` (repli : le fil) */
  private feedWanted = false;
  /** abonné au fil dans la série d'abonnements en cours (remise à zéro par setupSubscriptions) */
  private feedOn = false;
  private heartbeatTimer: number | null = null;
  private listeners = new Set<Listener>();
  /** ce qui compte pour l'affichage dans `user` / `friends` (comparé avant d'émettre) */
  private userSig = '';
  private friendsSig = '';
  private socialSig = '';

  public state: NetState = {
    configured: false,
    connected: false,
    serverDown: false,
    authError: null,
    user: null,
    friends: [],
    collection: [],
    sealedPack: null,
    feed: [],
    bigPulls: null,
    trades: { incoming: [], outgoing: [] },
    missions: null,
    binders: [],
    social: null,
    board: { listings: [], offers: [] },
    launch: null,
  };
  /** remise à zéro vue pendant cette visite : la session disparue s'explique par la nouvelle saison */
  private seasonChanged = false;

  constructor() {
    this.captureHashAuth();
    this.sessionToken = this.loadStoredToken();

    const convexUrl = (import.meta.env.VITE_CONVEX_URL as string | undefined)?.trim();
    if (!convexUrl) {
      return;
    }

    this.state.configured = true;
    this.client = new ConvexClient(convexUrl);
    this.setupSubscriptions();
    this.startHeartbeat();
    this.watchConnection();
  }

  private downTimer: number | null = null;
  /**
   * Serveur injoignable ≠ joueur déconnecté : sans première réponse au bout de 8 s, ou si le WebSocket reste coupé
   * 8 s, `serverDown` passe à vrai (bandeau dans le jeu) ; il retombe à la reconnexion.
   */
  private watchConnection() {
    const arm = () => {
      if (this.downTimer !== null || this.state.serverDown) return;
      this.downTimer = window.setTimeout(() => {
        this.downTimer = null;
        this.state.serverDown = true;
        this.emit();
      }, SERVER_DOWN_MS);
    };
    arm(); // on attend la première réponse
    const c = this.client as ConvexClient & { subscribeToConnectionState?: (cb: (s: { isWebSocketConnected: boolean }) => void) => () => void };
    c.subscribeToConnectionState?.((cs) => {
      if (!cs.isWebSocketConnected) arm();
      else if (this.state.connected) this.serverUp();
    });
  }
  private serverUp() {
    if (this.downTimer !== null) clearTimeout(this.downTimer);
    this.downTimer = null;
    if (this.state.serverDown) {
      this.state.serverDown = false;
      this.emit();
    }
  }

  private get convexSiteUrl(): string | null {
    const explicit = (import.meta.env.VITE_CONVEX_SITE_URL as string | undefined)?.trim();
    if (explicit) return explicit.replace(/\/$/, '');
    const cloudUrl = (import.meta.env.VITE_CONVEX_URL as string | undefined)?.trim();
    if (!cloudUrl) return null;
    return cloudUrl.replace(/\.convex\.cloud\/?$/, '.convex.site');
  }

  private loadStoredToken(): string | null {
    try {
      return localStorage.getItem(LS_SESSION_TOKEN);
    } catch {
      return null;
    }
  }

  private saveStoredToken(token: string | null) {
    this.sessionToken = token;
    try {
      if (token) localStorage.setItem(LS_SESSION_TOKEN, token);
      else localStorage.removeItem(LS_SESSION_TOKEN);
    } catch {
      /* ignore */
    }
  }

  /**
   * Captures `#auth_token=...` or `#auth_error=...` from Discord OAuth callback redirect
   * and restores the clean hash URL.
   */
  private captureHashAuth() {
    const hash = window.location.hash;
    if (!hash.startsWith('#auth_token=') && !hash.startsWith('#auth_error=')) return;
    // retour sur la page d'où l'on était parti (« #/echanges »…), gardée avant de partir chez Discord
    let back = '';
    try {
      back = sessionStorage.getItem(SS_RETURN_HASH) ?? '';
      sessionStorage.removeItem(SS_RETURN_HASH);
    } catch {
      /* ignore */
    }
    if (!/^#\/[\w/-]*$/.test(back)) back = '';
    if (hash.startsWith('#auth_token=')) {
      const token = decodeURIComponent(hash.slice('#auth_token='.length));
      this.saveStoredToken(token);
    } else {
      const err = decodeURIComponent(hash.slice('#auth_error='.length));
      // code technique → phrase (le code inconnu reste visible entre parenthèses, pour nous aider)
      this.state.authError = AUTH_ERRORS[err] ?? `Connexion impossible (${err.slice(0, 60)}). Réessaie.`;
    }
    history.replaceState(null, '', window.location.pathname + window.location.search + back);
  }

  private setupSubscriptions() {
    if (!this.client) return;

    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers = [];
    this.feedOn = false;

    const tokenArg: { sessionToken?: string } = this.sessionToken ? { sessionToken: this.sessionToken } : {};

    // 1. Current user profile & pack balance
    this.unsubscribers.push(
      this.client.onUpdate(api.users.me, tokenArg, (me) => {
        const first = !this.state.connected;
        this.state.connected = true;
        this.serverUp();
        // jeton gardé mais le serveur ne le reconnaît plus (session de 30 jours expirée, déconnexion ailleurs) :
        // on l'oublie, on le dit, et on se réabonne sans lui
        let expired = false;
        if (!me && tokenArg.sessionToken && this.sessionToken === tokenArg.sessionToken) {
          expired = true;
          this.saveStoredToken(null);
          this.state.authError = this.seasonChanged ? NEW_SEASON : SESSION_EXPIRED;
          queueMicrotask(() => this.setupSubscriptions());
        }
        const before = this.userSig;
        this.state.user = me ?? null;
        this.userSig = userSig(this.state.user);
        // (propre battement de cœur : le document utilisateur change, `nextDailyClaimAt` = maintenant quand la réserve est
        // pleine, mais rien de ce qu'on affiche → état tenu à jour sans réveiller tout le jeu, audit PERF2-08)
        if (first || expired || this.userSig !== before) this.emit();
      }),
    );

    // 2. Pre-rolled sealed booster (0ms tear/light-leak ready in RAM)
    this.unsubscribers.push(
      this.client.onUpdate(api.packs.getSealedPack, tokenArg, (pack) => {
        this.state.sealedPack = pack ?? null;
        this.emit();
      }),
    );

    // 2 bis. (ouverture 07/11) compte à rebours + remise à zéro (aussi sans être connecté) ; un serveur qui n'a pas
    // encore cette requête répond par une erreur : on reste sans compte à rebours
    this.unsubscribers.push(
      this.client.onUpdate(
        api.launch.status,
        {},
        (l) => {
          this.state.launch = l ?? null;
          this.newSeason(l?.resetAt ?? null);
          this.emit();
        },
        () => undefined,
      ),
    );

    // 3. Player card inventory (instant BatchedMesh 019-binder loading)
    this.unsubscribers.push(
      this.client.onUpdate(api.inventory.myCollection, tokenArg, (cards) => {
        this.state.collection = cards ?? [];
        this.emit();
      }),
    );

    // 4. Online friends list (20 max)
    this.unsubscribers.push(
      this.client.onUpdate(api.users.friends, {}, (friends) => {
        this.state.friends = friends ?? [];
        // battement de cœur d'un ami (toutes les 35 s chacun) : seuls `lastSeenAt` et l'ordre bougent → pas d'émission
        // (avant : tout l'état du jeu remappé et les signatures de collection recalculées ~toutes les 2 s à 20 amis)
        const sig = friendsSig(this.state.friends);
        if (sig === this.friendsSig) return;
        this.friendsSig = sig;
        this.emit();
      }),
    );

    // 5. Échanges en attente (reçus / envoyés)
    this.unsubscribers.push(
      this.client.onUpdate(api.trades.myTrades, tokenArg, (trades) => {
        this.state.trades = (trades as NetState['trades']) ?? { incoming: [], outgoing: [] };
        this.emit();
      }),
    );

    // 6 bis. Missions du jour
    if (this.sessionToken)
      this.unsubscribers.push(
        this.client.onUpdate(api.missions.mine, tokenArg, (m) => {
          this.state.missions = (m as NetState['missions']) ?? null;
          this.emit();
        }),
      );

    // 6 quater. Amis (lot A2) : battement de cœur d'un ami = `lastSeenAt` gardé à jour SANS émettre (la page Amis relit
    // l'état toutes les 30 s) ; on n'émet que si une demande, un ami ou un statut en ligne / hors ligne change
    this.state.social = null;
    this.socialSig = '';
    if (this.sessionToken)
      this.unsubscribers.push(
        this.client.onUpdate(
          api.friends.mine,
          tokenArg,
          (s) => {
            this.state.social = s ?? null;
            const sig = socialSig(this.state.social);
            if (sig === this.socialSig && sig) return;
            this.socialSig = sig;
            this.emit();
          },
          () => {
            // (serveur pas encore redéployé : liste vide, rien de cassé)
            this.state.social = { friends: [], incoming: [], outgoing: [] };
            this.emit();
          },
        ),
      );

    // 6 ter. Classeurs perso
    if (this.sessionToken)
      this.unsubscribers.push(
        this.client.onUpdate(api.binders.mine, tokenArg, (b) => {
          this.state.binders = b ?? [];
          this.emit();
        }),
      );

    // 6 quater. Tableau d'offres : mes annonces et mes offres (serveur pas encore redéployé → erreur → rien)
    if (this.sessionToken)
      this.unsubscribers.push(
        this.client.onUpdate(
          api.listings.mine,
          tokenArg,
          (b) => {
            this.state.board = b ?? { listings: [], offers: [] };
            this.emit();
          },
          () => {},
        ),
      );

    // 6. Global real-time pull & trade feed — seulement si on le lit (HUD du labo) ou en repli des gros tirages (perf :
    // le jeu ne lit que `feed.bigPulls` ; avant, les deux requêtes étaient ré-exécutées et renvoyées à chaque tirage)
    if (this.feedWanted) this.subscribeFeed();

    // 7. Gros tirages (page d'accueil). Serveur pas encore redéployé → erreur → repli sur le fil ci-dessus.
    this.unsubscribers.push(
      this.client.onUpdate(
        api.feed.bigPulls,
        { limit: 30 },
        (rows) => {
          this.state.bigPulls = rows ?? [];
          this.emit();
        },
        () => {
          this.state.bigPulls = null;
          this.subscribeFeed();
          this.emit();
        },
      ),
    );
  }

  /** Abonnement au fil d'activité (`feed.recent`, 20 derniers), une fois par série d'abonnements. */
  private subscribeFeed() {
    if (this.feedOn || !this.client) return;
    this.feedOn = true;
    this.unsubscribers.push(
      this.client.onUpdate(api.feed.recent, { limit: 20 }, (feed) => {
        this.state.feed = feed ?? [];
        this.emit();
      }),
    );
  }

  /** Le fil d'activité complet est affiché (HUD du club, labo) : on s'y abonne. */
  public watchFeed() {
    this.feedWanted = true;
    this.subscribeFeed();
  }

  private startHeartbeat() {
    if (this.heartbeatTimer !== null) clearInterval(this.heartbeatTimer);
    const beat = () => {
      if (this.client && this.sessionToken && document.visibilityState === 'visible') {
        void this.client.mutation(api.users.heartbeat, { sessionToken: this.sessionToken, deviceId: deviceId() }).catch(() => {});
      }
    };
    // tout de suite (la série de connexion compte la visite du jour), puis toutes les 35 s
    beat();
    this.heartbeatTimer = window.setInterval(beat, 35_000);
    // retour sur l'onglet après minuit : la série avance sans attendre le prochain battement
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && beat());
  }

  public onChange(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn(this.state);
  }

  /**
   * Redirects to the Convex HTTP Action `/auth/discord` which initiates Discord OAuth2.
   */
  public loginWithDiscord() {
    const siteUrl = this.convexSiteUrl;
    if (!siteUrl) {
      alert('Configure d’abord VITE_CONVEX_URL dans ton fichier .env.local');
      return;
    }
    // retour sur la page d'où l'on vient (le labo à la racine, ou le jeu dans /jeu/) ; le serveur remplace le hash,
    // on garde donc la page du jeu (« #/echanges ») de côté pour la retrouver au retour (captureHashAuth)
    const returnTo = window.location.origin + window.location.pathname + window.location.search;
    try {
      if (window.location.hash.startsWith('#/')) sessionStorage.setItem(SS_RETURN_HASH, window.location.hash);
    } catch {
      /* ignore */
    }
    window.location.href = `${siteUrl}/auth/discord?returnTo=${encodeURIComponent(returnTo)}`;
  }

  /** Remise à zéro côté serveur pas encore vue par ce navigateur : on oublie la progression gardée en local. */
  private newSeason(resetAt: number | null) {
    if (!resetAt) return;
    try {
      const seen = localStorage.getItem(LS_EPOCH);
      if (seen === String(resetAt)) return;
      for (const k of SEASON_KEYS) localStorage.removeItem(k);
      localStorage.setItem(LS_EPOCH, String(resetAt));
      if (seen !== null || this.sessionToken) this.seasonChanged = true;
    } catch {
      /* stockage indisponible */
    }
  }

  /** (ouverture 07/11) compte sans Discord : pseudo + mot de passe (convex/pwAuth.ts). */
  public async signupWithPassword(name: string, password: string, clubCode?: string) {
    if (!this.client) throw new Error('Serveur non configuré');
    const { token } = await this.client.action(api.pwAuth.signup, { name, password, ...(clubCode ? { clubCode } : {}) });
    this.adoptToken(token);
  }
  public async loginWithPassword(name: string, password: string) {
    if (!this.client) throw new Error('Serveur non configuré');
    const { token } = await this.client.action(api.pwAuth.login, { name, password });
    this.adoptToken(token);
  }
  private adoptToken(token: string) {
    this.saveStoredToken(token);
    this.state.authError = null;
    this.setupSubscriptions();
    this.emit();
  }

  public async logout() {
    if (this.client && this.sessionToken) {
      await this.client.mutation(api.auth.logout, { sessionToken: this.sessionToken }).catch(() => {});
    }
    this.saveStoredToken(null);
    this.state.user = null;
    this.state.collection = [];
    this.state.sealedPack = null;
    this.setupSubscriptions();
    this.emit();
  }

  public async claimDailyBooster() {
    if (!this.client || !this.sessionToken) throw new Error('Non connecté');
    return await this.client.mutation(api.users.claimDailyBooster, {
      sessionToken: this.sessionToken,
    });
  }

  /**
   * Pre-rolls a 5-card booster on the server BEFORE the 3D tear animation begins.
   * If a sealed pack is already cached in `state.sealedPack`, returns it in 0ms.
   */
  public async preparePack(req?: PackRequestArgs): Promise<{
    packId: Id<'packOpens'>;
    maxRarity: RarityId;
    cards: Doc<'packOpens'>['cards'];
    packKind: 'theme' | 'bebou';
    themeId?: string;
  }> {
    const shape = (p: Doc<'packOpens'>) => ({
      packId: p._id,
      maxRarity: p.maxRarity,
      cards: p.cards,
      packKind: p.packKind ?? ('bebou' as const),
      themeId: p.themeId,
    });
    // un pack scellé non ouvert est rendu tel quel (anti-reroll côté serveur aussi)
    if (this.state.sealedPack) return shape(this.state.sealedPack);
    if (!this.client || !this.sessionToken) {
      throw new Error('Non connecté');
    }
    const pack = await this.client.mutation(api.packs.preparePack, {
      sessionToken: this.sessionToken,
      ...(req ?? {}),
    });
    this.state.sealedPack = pack;
    this.emit();
    return shape(pack);
  }

  /** Série (retours de Tom, 4 nov.) : toute la série scellée en un appel (boosters déjà scellés d'abord). */
  public async preparePacks(req: PackRequestArgs | undefined, count: number): Promise<Doc<'packOpens'>[]> {
    if (!this.client || !this.sessionToken) throw new Error('Non connecté');
    const packs = await this.client.mutation(api.packs.preparePacks, { sessionToken: this.sessionToken, ...(req ?? {}), count });
    if (packs[0]) {
      this.state.sealedPack = packs[0];
      this.emit();
    }
    return packs;
  }

  /** « Tout passer » : plusieurs boosters crédités en un seul appel. */
  public async revealPacks(packIds: Id<'packOpens'>[]): Promise<string[]> {
    if (!this.client || !this.sessionToken) throw new Error('Non connecté');
    const done = await this.client.mutation(api.packs.revealPacks, { sessionToken: this.sessionToken, packIds });
    this.state.sealedPack = null;
    this.emit();
    return done;
  }

  /**
   * Confirms the reveal at the end of the 3D pack opening animation,
   * crediting cards to the binder and broadcasting Rare+/Mythic pulls to friends.
   */
  public async revealPack(packId?: Id<'packOpens'>) {
    const targetId = packId ?? this.state.sealedPack?._id;
    if (!targetId || !this.client || !this.sessionToken) return null;
    const revealed = await this.client.mutation(api.packs.revealPack, {
      sessionToken: this.sessionToken,
      packId: targetId,
    });
    this.state.sealedPack = null;
    this.emit();
    return revealed;
  }

  // ─────────────────────────────── échanges
  private requireToken(): string {
    if (!this.client || !this.sessionToken) throw new Error('Non connecté');
    return this.sessionToken;
  }

  /** Collection d'un ami (pour composer un échange). */
  public async userCollection(userId: Id<'users'>): Promise<Doc<'inventory'>[]> {
    if (!this.client) return [];
    return await this.client.query(api.inventory.userCollection, { userId });
  }

  /** Contrat façon CS:GO : brûle des doublons d'une étoile contre une carte de l'étoile au-dessus (src/core/contracts.ts). */
  public async signContract(rarity: RarityId, items: Array<{ cardId: string; count: number }>) {
    return await this.client!.mutation(api.contracts.sign, { sessionToken: this.requireToken(), rarity, items });
  }

  public async proposeTrade(toUserId: Id<'users'>, offered: TradeItem[], requested: TradeItem[], note?: string) {
    return await this.client!.mutation(api.trades.propose, { sessionToken: this.requireToken(), toUserId, offered, requested, note });
  }

  public async respondTrade(tradeId: Id<'trades'>, accept: boolean) {
    return await this.client!.mutation(api.trades.respond, { sessionToken: this.requireToken(), tradeId, accept });
  }

  public async cancelTrade(tradeId: Id<'trades'>) {
    return await this.client!.mutation(api.trades.cancel, { sessionToken: this.requireToken(), tradeId });
  }
  /** Contre-proposition : modifie l'échange reçu et le renvoie. */
  public async counterTrade(tradeId: Id<'trades'>, offered: TradeItem[], requested: TradeItem[], note?: string) {
    return await this.client!.mutation(api.trades.counter, { sessionToken: this.requireToken(), tradeId, offered, requested, note });
  }
  public async tradeHistory(limit = 30): Promise<TradeDoc[]> {
    if (!this.client || !this.sessionToken) return [];
    return (await this.client.query(api.trades.history, { sessionToken: this.sessionToken, limit })) as TradeDoc[];
  }
  /** Envies d'un ami (badges croisés des échanges). */
  public async wishlistOf(userId: Id<'users'>): Promise<string[]> {
    if (!this.client) return [];
    return await this.client.query(api.trades.wishlistOf, { userId });
  }

  // ─────────────────────────────── missions & profils
  public async claimMission(missionId: string) {
    return await this.client!.mutation(api.missions.claim, { sessionToken: this.requireToken(), missionId });
  }
  public async claimMissionBonus() {
    return await this.client!.mutation(api.missions.claimBonus, { sessionToken: this.requireToken() });
  }
  public async rerollMission(missionId: string) {
    return await this.client!.mutation(api.missions.reroll, { sessionToken: this.requireToken(), missionId });
  }
  public async profile(userId: Id<'users'>) {
    if (!this.client) return null;
    return await this.client.query(api.profiles.profile, { userId });
  }
  public async setShowcase(cards: Array<{ cardId: string; rarity: RarityId }>) {
    return await this.client!.mutation(api.profiles.setShowcase, { sessionToken: this.requireToken(), cards });
  }
  public async setBio(bio: string) {
    return await this.client!.mutation(api.profiles.setBio, { sessionToken: this.requireToken(), bio });
  }
  public async setCosmetics(c: { banner?: string; frame?: string; title?: string; badges?: string[]; accent?: string; vitrine?: string; vitrineColor?: string }) {
    return await this.client!.mutation(api.profiles.setCosmetics, { sessionToken: this.requireToken(), ...c });
  }
  /** Photo / bannière importées (GIF, retours live 02) : envoi au stockage Convex puis enregistrement ; `null` = retirer. */
  public async setProfileMedia(kind: 'avatar' | 'banner', file: Blob | null): Promise<string | undefined> {
    const sessionToken = this.requireToken();
    let storageId: Id<'_storage'> | undefined;
    if (file) {
      const url = await this.client!.mutation(api.profiles.generateMediaUploadUrl, { sessionToken });
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': file.type }, body: file });
      if (!res.ok) throw new Error('L’envoi du fichier a échoué : réessaie.');
      storageId = ((await res.json()) as { storageId: Id<'_storage'> }).storageId;
    }
    const r = await this.client!.mutation(api.profiles.setProfileMedia, { sessionToken, kind, storageId });
    if (r.error) throw new Error(r.error);
    return r.url;
  }
  // ─── suggestions des joueurs (onglet Suggestions) ───
  public async submitSuggestion(o: { kind: 'bug' | 'design' | 'ajout' | 'autre'; text: string; cardId?: string; imageUrl?: string; category?: string; page?: string }, file: Blob | null) {
    const sessionToken = this.requireToken();
    let screenshot: Id<'_storage'> | undefined;
    if (file) {
      const url = await this.client!.mutation(api.suggestions.generateUploadUrl, { sessionToken });
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': file.type }, body: file });
      if (!res.ok) throw new Error('L’envoi de l’image a échoué : réessaie.');
      screenshot = ((await res.json()) as { storageId: Id<'_storage'> }).storageId;
    }
    const { page, ...rest } = o;
    await this.client!.mutation(api.suggestions.submit, { sessionToken, ...rest, screenshot, meta: { page, ua: navigator.userAgent } });
  }
  public async mySuggestions() {
    return await this.client!.query(api.suggestions.mine, { sessionToken: this.requireToken() });
  }
  public async adminSuggestions(status?: 'nouvelle' | 'vue' | 'acceptee' | 'refusee' | 'traitee') {
    return await this.client!.query(api.suggestions.adminList, { sessionToken: this.requireToken(), status });
  }
  public async setSuggestionStatus(id: string, status: 'nouvelle' | 'vue' | 'acceptee' | 'refusee' | 'traitee', adminNote?: string) {
    await this.client!.mutation(api.suggestions.setStatus, { sessionToken: this.requireToken(), id: id as Id<'suggestions'>, status, adminNote });
  }
  public async leaderboard() {
    if (!this.client) return [];
    return await this.client.query(api.profiles.leaderboard, {});
  }
  public async activity(userId: Id<'users'>) {
    if (!this.client) return [];
    return await this.client.query(api.profiles.activity, { userId, limit: 40 });
  }
  /** Envies : marque / retire une carte. */
  public async toggleWish(cardId: string) {
    return await this.client!.mutation(api.users.toggleWish, { sessionToken: this.requireToken(), cardId });
  }
  /** Récompense de la série de connexion (jour 7). */
  public async claimStreak() {
    return await this.client!.mutation(api.users.claimStreak, { sessionToken: this.requireToken() });
  }
  /** Pochette d'un sous-thème (vue Albums). */
  public async setSubthemeCover(subthemeId: string, cardId?: string) {
    return await this.client!.mutation(api.users.setSubthemeCover, { sessionToken: this.requireToken(), subthemeId, cardId });
  }
  // ─────────────────────────────── classeurs
  public async createBinder(name: string, cards?: Array<{ cardId: string; rarity: RarityId }>) {
    return await this.client!.mutation(api.binders.create, { sessionToken: this.requireToken(), name, cards });
  }
  public async renameBinder(binderId: Id<'binders'>, name: string) {
    return await this.client!.mutation(api.binders.rename, { sessionToken: this.requireToken(), binderId, name });
  }
  public async deleteBinder(binderId: Id<'binders'>) {
    return await this.client!.mutation(api.binders.remove, { sessionToken: this.requireToken(), binderId });
  }
  public async setBinderCards(binderId: Id<'binders'>, cards: Array<{ cardId: string; rarity: RarityId }>) {
    return await this.client!.mutation(api.binders.setCards, { sessionToken: this.requireToken(), binderId, cards });
  }
  public async toggleBinderCard(binderId: Id<'binders'>, card: { cardId: string; rarity: RarityId }) {
    return await this.client!.mutation(api.binders.toggleCard, { sessionToken: this.requireToken(), binderId, card });
  }
  public async setBinderCover(binderId: Id<'binders'>, cardId?: string) {
    return await this.client!.mutation(api.binders.setCover, { sessionToken: this.requireToken(), binderId, cardId });
  }
  // ─────────────────────────────── amis (lot A2)
  public async requestFriend(to: { userId?: Id<'users'>; name?: string }) {
    return await this.client!.mutation(api.friends.request, { sessionToken: this.requireToken(), ...to });
  }
  public async friendAction(kind: 'accept' | 'decline' | 'cancel' | 'remove', friendshipId: Id<'friendships'>) {
    return await this.client!.mutation(api.friends[kind], { sessionToken: this.requireToken(), friendshipId });
  }
  public async pinBinder(binderId: Id<'binders'>, on: boolean) {
    return await this.client!.mutation(api.binders.pin, { sessionToken: this.requireToken(), binderId, on });
  }

  /** Retours du labo → serveur (une ligne par navigateur, mise à jour à chaque envoi). */
  public async pushLabFeedback(args: {
    clientId: string;
    tester: string;
    entries: Array<{ id: string; title: string; category: string; vote: number; note: string; updatedAt?: string | null }>;
    meta: { backend?: string; userAgent?: string; quality?: string; dpr?: number };
  }) {
    if (!this.client) throw new Error('Serveur non configuré (VITE_CONVEX_URL)');
    return await this.client.mutation(api.labFeedback.submit, { ...args, sessionToken: this.sessionToken ?? undefined });
  }

  public get loggedIn(): boolean {
    return !!this.sessionToken && !!this.state.user;
  }

  // ─────────────────────────────── accès génériques (économie, jeux : src/game/ecoOnline.ts)
  /** Mutation avec le jeton de session ajouté. */
  public async call<F extends FunctionReference<'mutation'>>(fn: F, args: Omit<F['_args'], 'sessionToken'>): Promise<F['_returnType']> {
    return await this.client!.mutation(fn, { ...args, sessionToken: this.requireToken() } as F['_args']);
  }

  /** Mutation publique (sans session) : clic sur un lien d'invitation. */
  public async publicCall<F extends FunctionReference<'mutation'>>(fn: F, args: F['_args']): Promise<F['_returnType']> {
    if (!this.client) throw new Error('Serveur non configuré');
    return await this.client.mutation(fn, args);
  }

  /** Lecture ponctuelle (jeton ajouté s'il y en a un). */
  public async ask<F extends FunctionReference<'query'>>(fn: F, args: Omit<F['_args'], 'sessionToken'>, withToken = true): Promise<F['_returnType']> {
    if (!this.client) throw new Error('Serveur non configuré');
    return await this.client.query(fn, (withToken && this.sessionToken ? { ...args, sessionToken: this.sessionToken } : args) as F['_args']);
  }

  /** Abonnement temps réel ; renvoie de quoi se désabonner. */
  public watch<F extends FunctionReference<'query'>>(fn: F, args: Omit<F['_args'], 'sessionToken'>, cb: (v: F['_returnType']) => void, withToken = true, onError?: (e: Error) => void): () => void {
    if (!this.client) return () => {};
    const a = (withToken && this.sessionToken ? { ...args, sessionToken: this.sessionToken } : args) as F['_args'];
    return this.client.onUpdate(fn, a, cb, onError);
  }
}

/** Id d'appareil (tiré une fois, gardé dans le navigateur) : signal anti-abus « deux comptes sur le même appareil ». */
export function deviceId(): string | undefined {
  try {
    let id = localStorage.getItem('bebou.device');
    if (!id) {
      id = (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`).toLowerCase();
      localStorage.setItem('bebou.device', id);
    }
    return id;
  } catch {
    return undefined;
  }
}

export const net = new GameNetClient();
