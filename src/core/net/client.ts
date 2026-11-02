import { ConvexClient } from 'convex/browser';
import { api } from '../../../convex/_generated/api';
import type { Doc, Id } from '../../../convex/_generated/dataModel';
import type { RarityId } from '../rarity';
import type { MissionsState } from '../missions';
import type { StreakState } from '../streak';

const LS_SESSION_TOKEN = 'cardlab.session_token';

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
  nextPackAt?: number | null;
  uniqueCards: number;
  totalCards: number;
  /** pity 6★ (src/core/pity.ts) */
  pityCount?: number;
  /** envies (ids de cartes) */
  wishlist?: string[];
  /** série de connexion (src/core/streak.ts) */
  streak?: StreakState | null;
  streakClaimable?: boolean;
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
  connected: boolean;
  authError: string | null;
  user: MeProfile | null;
  friends: FriendPresence[];
  collection: Doc<'inventory'>[];
  sealedPack: Doc<'packOpens'> | null;
  feed: Doc<'activityFeed'>[];
  /** gros tirages (Légendaire+) ; `null` = requête pas encore déployée sur le serveur → on les tire du fil */
  bigPulls: Doc<'activityFeed'>[] | null;
  trades: { incoming: TradeDoc[]; outgoing: TradeDoc[] };
  /** missions du jour (+ instant du prochain tirage) */
  missions: (MissionsState & { resetAt: number }) | null;
}

type Listener = (state: NetState) => void;

/**
 * Singleton reactive WebSocket client for Convex (`convex/browser`).
 * Keeps collection, friend presence, live pull feed, and pre-rolled ("sealed")
 * boosters in local memory so the Three.js WebGPU loop runs with 0ms network wait.
 */
class GameNetClient {
  private client: ConvexClient | null = null;
  private sessionToken: string | null = null;
  private unsubscribers: Array<() => void> = [];
  private heartbeatTimer: number | null = null;
  private listeners = new Set<Listener>();

  public state: NetState = {
    configured: false,
    connected: false,
    authError: null,
    user: null,
    friends: [],
    collection: [],
    sealedPack: null,
    feed: [],
    bigPulls: null,
    trades: { incoming: [], outgoing: [] },
    missions: null,
  };

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
    if (hash.startsWith('#auth_token=')) {
      const token = decodeURIComponent(hash.slice('#auth_token='.length));
      this.saveStoredToken(token);
      history.replaceState(null, '', window.location.pathname + window.location.search);
    } else if (hash.startsWith('#auth_error=')) {
      const err = decodeURIComponent(hash.slice('#auth_error='.length));
      this.state.authError = err;
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }

  private setupSubscriptions() {
    if (!this.client) return;

    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers = [];

    const tokenArg = this.sessionToken ? { sessionToken: this.sessionToken } : {};

    // 1. Current user profile & pack balance
    this.unsubscribers.push(
      this.client.onUpdate(api.users.me, tokenArg, (me) => {
        this.state.connected = true;
        this.state.user = me ?? null;
        this.emit();
      }),
    );

    // 2. Pre-rolled sealed booster (0ms tear/light-leak ready in RAM)
    this.unsubscribers.push(
      this.client.onUpdate(api.packs.getSealedPack, tokenArg, (pack) => {
        this.state.sealedPack = pack ?? null;
        this.emit();
      }),
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

    // 6. Global real-time pull & trade feed
    this.unsubscribers.push(
      this.client.onUpdate(api.feed.recent, { limit: 20 }, (feed) => {
        this.state.feed = feed ?? [];
        this.emit();
      }),
    );

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
          this.emit();
        },
      ),
    );
  }

  private startHeartbeat() {
    if (this.heartbeatTimer !== null) clearInterval(this.heartbeatTimer);
    const beat = () => {
      if (this.client && this.sessionToken && document.visibilityState === 'visible') {
        void this.client.mutation(api.users.heartbeat, { sessionToken: this.sessionToken }).catch(() => {});
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
    // retour sur la page d'où l'on vient (le labo à la racine, ou le jeu dans /jeu/)
    const returnTo = window.location.origin + window.location.pathname;
    window.location.href = `${siteUrl}/auth/discord?returnTo=${encodeURIComponent(returnTo)}`;
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
  /** Envies : marque / retire une carte. */
  public async toggleWish(cardId: string) {
    return await this.client!.mutation(api.users.toggleWish, { sessionToken: this.requireToken(), cardId });
  }
  /** Récompense de la série de connexion (jour 7). */
  public async claimStreak() {
    return await this.client!.mutation(api.users.claimStreak, { sessionToken: this.requireToken() });
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
}

export const net = new GameNetClient();
