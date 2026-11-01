import { ConvexClient } from 'convex/browser';
import { api } from '../../../convex/_generated/api';
import type { Doc, Id } from '../../../convex/_generated/dataModel';
import type { RarityId } from '../rarity';

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
  uniqueCards: number;
  totalCards: number;
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

export interface NetState {
  configured: boolean;
  connected: boolean;
  authError: string | null;
  user: MeProfile | null;
  friends: FriendPresence[];
  collection: Doc<'inventory'>[];
  sealedPack: Doc<'packOpens'> | null;
  feed: Doc<'activityFeed'>[];
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

    // 5. Global real-time pull & trade feed
    this.unsubscribers.push(
      this.client.onUpdate(api.feed.recent, { limit: 20 }, (feed) => {
        this.state.feed = feed ?? [];
        this.emit();
      }),
    );
  }

  private startHeartbeat() {
    if (this.heartbeatTimer !== null) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = window.setInterval(() => {
      if (this.client && this.sessionToken && document.visibilityState === 'visible') {
        void this.client.mutation(api.users.heartbeat, { sessionToken: this.sessionToken }).catch(() => {});
      }
    }, 35_000);
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
    const returnTo = window.location.origin;
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
  public async preparePack(): Promise<{
    packId: Id<'packOpens'>;
    maxRarity: RarityId;
    cards: Doc<'packOpens'>['cards'];
  }> {
    if (this.state.sealedPack) {
      return {
        packId: this.state.sealedPack._id,
        maxRarity: this.state.sealedPack.maxRarity,
        cards: this.state.sealedPack.cards,
      };
    }
    if (!this.client || !this.sessionToken) {
      throw new Error('Non connecté');
    }
    const pack = await this.client.mutation(api.packs.preparePack, {
      sessionToken: this.sessionToken,
    });
    this.state.sealedPack = pack;
    this.emit();
    return {
      packId: pack._id,
      maxRarity: pack.maxRarity,
      cards: pack.cards,
    };
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
}

export const net = new GameNetClient();
