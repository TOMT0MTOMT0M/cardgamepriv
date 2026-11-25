# Pokémon 151 set — integration & image audit (1 Nov 2026)

## What's wired
- Set data: `src/core/sets/pokemon151.ts` — `[dex, slug, French name, rarity]` × 151, zero imports (shareable with Convex).
  Rarity split: 51 common · 45 uncommon · 33 rare · 14 epic · 6 legendary (Dracaufeu, Léviator, Artikodin, Électhor, Sulfura, Dracolosse) · 2 mythic (Mewtwo, Mew).
- Card sets in `src/core/cardData.ts`: `pokemon151` (default) and `lab` (the 12 procedural placeholders). `CARDS` is a live array, so every experiment follows the active set.
  Switch with `?set=lab|pokemon151` or the **set** menu in the panel of the design showcases (028–037) and of 038; the choice is remembered.
- New subject kind `image`: `src/core/art/images.ts` loads each PNG, removes opaque white backgrounds (edge flood fill at white ≥ 248, plus enclosed white holes ≥ 0.18 % of the image), trims to content and extracts a palette from the dominant hue.
  `src/core/art/imageSubject.ts` paints the background from that palette, puts the art on the parallax subject layer and writes relief/foil masks from the silhouette.
- `ensureFonts()` now also waits for the active set's images (~1–3 s for 151 locally, cached afterwards).
- New experiment **038 · Planche de contrôle du set**: the whole set rendered through the real pipeline, with per-card diagnostics.

## Test results
- 151/151 images load, no 404s.
- All 35 experiments load in sequence with the Pokémon set: no console errors (headless Chromium, WebGPU on SwiftShader).
- The lab set still renders (regression check).

## Asset issues to fix
- **105 of 151 sources are 160×142 scans on an opaque white background.** They are cut out at load time and look clean, but they get upscaled ~3× in the card window, so they look soft. Two more (043 Mystherbe 250 px, 151 Mew 233 px) are also under 256 px.
- HD sources with real transparency (44): 001–009, 016–022, 025, 053, 054, 065–068, 092–094, 108, 109, 114, 123, 125, 130, 131, 133–136, 144–150.
- To upgrade one, drop a transparent HD PNG in `public/art/pokemon-151/` under the **same file name**. Nothing else changes.

## Not changed (infra side)
- `convex/cardsCatalog.ts` still rolls boosters from the 12 lab cards. The exact patch to deal the Pokémon set is in `LAB_NOTES.md` (tested: esbuild bundle + rarity rolls OK).
- `package-lock.json` doesn't list `convex` even though `package.json` and `node_modules` have it, so `npm ci` (clean installs, CI) fails until `npm install` is run once.
