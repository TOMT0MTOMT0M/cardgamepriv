/**
 * CHAT (V2, 10/11) — règles et types partagés par le jeu (src/game/chat*.ts) et le serveur (convex/chat.ts).
 * Aucune dépendance : ce fichier est importé des deux côtés.
 *
 * Conversations : « general » (le chat général, tout le monde) et les privés à deux, `dm:<idA>:<idB>` (ids triés : une seule clé par paire).
 * Chaque message porte un numéro d'ordre `n` dans sa conversation : non-lus = n de la conversation − n lu, sans relire
 * un seul message (c'est ce qui rend la pastille gratuite côté serveur).
 */
export const CHAT_GENERAL = 'general';
/** longueur maximale d'un message */
export const CHAT_TEXT_MAX = 500;
/** historique : messages par page */
export const CHAT_PAGE = 30;
/** abonnement « depuis T » : au-delà, le client recharge une page au lieu de suivre */
export const CHAT_TAIL_MAX = 60;
/** le client suit « depuis T − marge » : une réaction validée juste avant un message plus récent n'est jamais perdue */
export const CHAT_TAIL_OVERLAP_MS = 15_000;
/** anti-rafale : écart minimal entre deux messages, et plafond par fenêtre */
export const CHAT_MIN_GAP_MS = 400;
export const CHAT_BURST_WINDOW_MS = 20_000;
export const CHAT_BURST_MAX = 12;
/** mentions par message, au plus */
export const CHAT_MENTIONS_MAX = 5;
/** réactions : des tampons gravés, pas d'émojis (direction « usinage ») */
export const CHAT_REACTS = ['GG', '+1', '♥', 'LOL', 'RIP', '?!'] as const;
export type ChatReact = (typeof CHAT_REACTS)[number];
/** notification « le chat général se réveille » : après ce silence, et au plus une fois par ce délai */
export const CHAT_WAKE_SILENCE_MS = 20 * 60 * 1000;
export const CHAT_WAKE_EVERY_MS = 45 * 60 * 1000;
/** privés : pas de nouvelle notification tant que la précédente n'a pas été lue, avant ce délai */
export const CHAT_DM_PUSH_EVERY_MS = 3 * 60 * 1000;

/** Clé d'un privé entre deux joueurs (ids triés). */
export const dmKey = (a: string, b: string) => (a < b ? `dm:${a}:${b}` : `dm:${b}:${a}`);
/** Les deux joueurs d'un privé (dans l'ordre de la clé), ou null si ce n'est pas un privé. */
export function dmPeers(key: string): [string, string] | null {
  const m = /^dm:([A-Za-z0-9_-]+):([A-Za-z0-9_-]+)$/.exec(key);
  return m && m[1] < m[2] ? [m[1], m[2]] : null;
}
/** L'autre joueur d'un privé. */
export function dmPeer(key: string, me: string): string | null {
  const p = dmPeers(key);
  if (!p) return null;
  return p[0] === me ? p[1] : p[1] === me ? p[0] : null;
}

/** Texte nettoyé : caractères de contrôle retirés, 2 sauts de ligne d'affilée au plus, longueur bornée. */
export function cleanChatText(s: string): string {
  return s
    .replace(/\r/g, '')
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F​-‏‪-‮⁦-⁩]/g, (c) => (c === '\t' ? ' ' : ''))
    .replace(/[  ]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, CHAT_TEXT_MAX);
}
/** Une ligne pour les aperçus (liste des conversations, bandeau, notification). */
export function chatSnippet(text: string, max = 90): string {
  const one = text.replace(/\s+/g, ' ').trim();
  return one.length > max ? `${one.slice(0, max - 1).trimEnd()}…` : one;
}

export interface ChatCard {
  cardId: string;
  rarity: string;
  mintNumber?: number;
}
export interface ChatMsg {
  id: string;
  /** numéro d'ordre dans la conversation */
  n: number;
  userId: string;
  /** nom affiché au moment de l'envoi */
  name: string;
  text: string;
  at: number;
  /** dernier changement (envoi, réaction, suppression) : l'abonnement suit ce champ */
  touchedAt: number;
  card?: ChatCard;
  reply?: { id: string; name: string; text: string };
  reacts?: Array<{ k: string; by: string[] }>;
  deleted?: boolean;
  /** id tiré par l'appareil qui envoie : remplace le message « en cours d'envoi » quand le vrai arrive */
  clientId?: string;
  /** côté jeu seulement */
  pending?: boolean;
  failed?: boolean;
}
/** État d'une conversation pour moi. */
export interface ChatHead {
  key: string;
  /** privé : l'autre joueur */
  peerId?: string;
  /** nombre de messages de la conversation */
  n: number;
  lastAt: number;
  lastUserId?: string;
  lastName?: string;
  lastText?: string;
  /** jusqu'où j'ai lu */
  seenN: number;
  /** privé : jusqu'où l'autre a lu (« Vu ») */
  peerSeenN?: number;
  /** général : on m'a mentionné depuis ma dernière lecture */
  mention?: boolean;
}
export interface ChatInbox {
  me: string;
  general: ChatHead;
  dms: ChatHead[];
  /** conversations en sourdine (clés) */
  muted: string[];
  /** équipe : peut supprimer n'importe quel message */
  staff?: boolean;
}
export interface ChatSend {
  text: string;
  card?: { cardId: string; rarity: string };
  replyTo?: string;
  mentions?: string[];
  clientId: string;
}
/** Accès au chat (en ligne : convex/chat.ts ; démo : robots dans ce navigateur). */
export interface ChatApi {
  /** mes conversations + non-lus (temps réel) ; null = pas connecté */
  watchInbox(cb: (inbox: ChatInbox | null) => void): () => void;
  /** une page d'historique, du plus ancien au plus récent ; `done` : il n'y a rien avant */
  page(conv: string, before?: number): Promise<{ msgs: ChatMsg[]; done: boolean }>;
  /** ce qui a changé depuis `after` (temps réel) ; `more` : trop de retard, recharger une page */
  watchTail(conv: string, after: number, cb: (r: { msgs: ChatMsg[]; more: boolean } | null) => void): () => void;
  send(conv: string, o: ChatSend): Promise<{ id: string; n: number; at: number }>;
  react(id: string, k: string): Promise<void>;
  remove(id: string): Promise<void>;
  markRead(conv: string, n: number): Promise<void>;
  mute(conv: string, on: boolean): Promise<void>;
}
