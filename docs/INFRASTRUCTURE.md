# Infrastructure Guide — Card Game Privé (20 Friends Max)

Stack: **Three.js r187 WebGPU (Vite)** + **Convex (Real-Time WebSocket Backend)** + **Discord OAuth2** + **Cloudflare Pages (Edge CDN + HTTPS)**.

---

## 1. Connect Convex Backend (1 minute)

In a terminal at `c:\Users\Tom\Desktop\cardgamepriv`:

```powershell
npx convex dev
```

1. It will open your browser to log into [Convex](https://www.convex.dev/) (free account).
2. Create a new project (e.g. `cardgamepriv`) — select **EU (`eu-west-1`)** if available for the lowest ping.
3. `npx convex dev` will automatically write `.env.local` with your `VITE_CONVEX_URL` and `VITE_CONVEX_SITE_URL`, and push the database schema (`convex/schema.ts`).

---

## 2. Configure Discord OAuth2 (2 minutes)

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) → **New Application**.
2. Open **OAuth2** in the left menu:
   - Copy your **Client ID** and **Client Secret**.
   - Under **Redirects**, add your Convex HTTP callback URL (replace `<your-deployment>` with the name in `.env.local`):
     ```text
     https://<your-deployment>.convex.site/auth/discord/callback
     ```
     *(Because our `/auth/discord` router forwards `returnTo` in `state`, this **single** Redirect URI works for `http://localhost:5173`, `https://192.168.x.x:5173` on mobile, and `https://cardgamepriv.pages.dev`!)*
3. Set the environment variables in Convex:
   ```powershell
   npx convex env set DISCORD_CLIENT_ID "YOUR_DISCORD_CLIENT_ID"
   npx convex env set DISCORD_CLIENT_SECRET "YOUR_DISCORD_CLIENT_SECRET"
   npx convex env set FRONTEND_URL "http://localhost:5173"
   ```

### Optional: Lock Access to Your 20 Friends Only
- **Option A — By Discord Server (Recommended)**: Only members of your friends' Discord server can log in:
  ```powershell
  npx convex env set DISCORD_GUILD_ID "YOUR_DISCORD_SERVER_ID"
  ```
- **Option B — By Discord User IDs**: Comma-separated list of Discord IDs:
  ```powershell
  npx convex env set ALLOWED_DISCORD_IDS "123456789012345678,234567890123456789"
  ```
- **Option C — AutomaticDiscord Pull Alerts**: Post Legendary / Mythic / `#1` serial pulls straight into a Discord channel:
  ```powershell
  npx convex env set DISCORD_WEBHOOK_URL "https://discord.com/api/webhooks/..."
  ```

---

## 3. Deploy to Cloudflare Pages (HTTPS + Global CDN)

WebGPU and mobile gyroscope require **HTTPS**, which Cloudflare Pages provides automatically.

```powershell
# 1. Deploy Convex functions to production
npx convex deploy

# 2. Deploy frontend to Cloudflare Pages
npm run cf:deploy
```

Or connect your GitHub repository directly in the [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **Create Pages**:
- **Build command**: `npx convex deploy --cmd 'npm run build'`
- **Build output directory**: `dist`
- **Environment variable**: `CONVEX_DEPLOY_KEY` (generated in Convex Dashboard → Project Settings → Deploy Keys).

---

## 4. Using the 0ms Pre-Rolled Booster Flow in 3D Experiments

Import `net` from `src/core/net/client.ts` inside any pack-opening experiment (`002-pack-tear`, `003-rarity-leak`, `013-fan-flip`, `018-mythic`):

```ts
import { net } from '../../core/net/client';

// 1. When booster enters stage (before user drags to tear):
const sealed = await net.preparePack();
// -> `sealed.maxRarity` drives the light leak color (003)
// -> `sealed.cards` contains the 5 cards + serial numbers (#1, #2...)
// All 3D shaders now run locally at 60–120 FPS with 0ms network wait!

// 2. When final card is flipped:
await net.revealPack(sealed.packId);
// -> Credits cards to inventory (019-binder) and broadcasts Rare+/Mythic pulls to friends!
```

---

## 5. Images du jeu sur Cloudflare R2 (au-delà de 20 000 fichiers)

Cloudflare Pages limite un site à 20 000 fichiers (gratuit). Les images (`public/art`, ~17 000 fichiers) vont donc dans
le bucket R2 **`cardgamepriv-art`** ; le site garde les mêmes adresses `/art/...`, servies par `functions/art/[[path]].js`
(binding `ART`). En local (`npm run dev`), rien ne change : Vite sert `public/art`.

Mise en place (une fois) :
1. Tableau de bord Cloudflare → **R2** → activer R2, puis **Créer un bucket** `cardgamepriv-art`.
2. R2 → **Gérer les jetons d'API R2** → créer un jeton **Lecture et écriture d'objets**, limité à ce bucket.
3. Dans `.env.local` (jamais publié) : `R2_ACCOUNT_ID=…`, `R2_ACCESS_KEY_ID=…`, `R2_SECRET_ACCESS_KEY=…`.
4. Double-clic sur **`activer-r2.cmd`** : envoie toutes les images, puis branche le bucket sur le site (`wrangler.jsonc`).
5. Ensuite **`deployer.cmd`** fait tout : il envoie seulement les images nouvelles/modifiées (`scripts/r2-sync.mjs`)
   et retire `dist/art` du site avant la mise en ligne.

Quotas gratuits : R2 10 Go, 10 M lectures/mois, sortie gratuite ; Pages Functions 100 000 requêtes/jour (chaque image
non encore en cache dans le navigateur = 1 requête ; les navigateurs gardent les images une semaine).
