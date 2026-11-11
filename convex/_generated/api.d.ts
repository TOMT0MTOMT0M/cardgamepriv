/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as abuse from "../abuse.js";
import type * as accounts from "../accounts.js";
import type * as admin from "../admin.js";
import type * as adminDash from "../adminDash.js";
import type * as auth from "../auth.js";
import type * as binders from "../binders.js";
import type * as cardsCatalog from "../cardsCatalog.js";
import type * as challenges from "../challenges.js";
import type * as chat from "../chat.js";
import type * as contracts from "../contracts.js";
import type * as crons from "../crons.js";
import type * as discordBot from "../discordBot.js";
import type * as discordRoles from "../discordRoles.js";
import type * as dropShots from "../dropShots.js";
import type * as econLib from "../econLib.js";
import type * as economy from "../economy.js";
import type * as feed from "../feed.js";
import type * as friends from "../friends.js";
import type * as games from "../games.js";
import type * as http from "../http.js";
import type * as inventory from "../inventory.js";
import type * as labFeedback from "../labFeedback.js";
import type * as launch from "../launch.js";
import type * as listings from "../listings.js";
import type * as market from "../market.js";
import type * as migrations from "../migrations.js";
import type * as missions from "../missions.js";
import type * as packs from "../packs.js";
import type * as presse from "../presse.js";
import type * as profiles from "../profiles.js";
import type * as purgedCards from "../purgedCards.js";
import type * as push from "../push.js";
import type * as pushSend from "../pushSend.js";
import type * as pwAuth from "../pwAuth.js";
import type * as referrals from "../referrals.js";
import type * as suggestions from "../suggestions.js";
import type * as survey from "../survey.js";
import type * as trades from "../trades.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  abuse: typeof abuse;
  accounts: typeof accounts;
  admin: typeof admin;
  adminDash: typeof adminDash;
  auth: typeof auth;
  binders: typeof binders;
  cardsCatalog: typeof cardsCatalog;
  challenges: typeof challenges;
  chat: typeof chat;
  contracts: typeof contracts;
  crons: typeof crons;
  discordBot: typeof discordBot;
  discordRoles: typeof discordRoles;
  dropShots: typeof dropShots;
  econLib: typeof econLib;
  economy: typeof economy;
  feed: typeof feed;
  friends: typeof friends;
  games: typeof games;
  http: typeof http;
  inventory: typeof inventory;
  labFeedback: typeof labFeedback;
  launch: typeof launch;
  listings: typeof listings;
  market: typeof market;
  migrations: typeof migrations;
  missions: typeof missions;
  packs: typeof packs;
  presse: typeof presse;
  profiles: typeof profiles;
  purgedCards: typeof purgedCards;
  push: typeof push;
  pushSend: typeof pushSend;
  pwAuth: typeof pwAuth;
  referrals: typeof referrals;
  suggestions: typeof suggestions;
  survey: typeof survey;
  trades: typeof trades;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
