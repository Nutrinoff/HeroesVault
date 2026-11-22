# HeroesVault

A zero-backend, framework-free single-page web application for *Heroes of the Storm* builds, talent calculation, hero/map reference, rotations, tier lists, academy guides, and patch notes—built with plain JavaScript (`<script>` tags) and designed for static hosting on GitHub Pages (`./` relative paths).

## Architecture & Design Principles

- **Zero build step / plain script tags:** All modules load directly via `<script>` tags in `index.html` without bundlers, transpilers, or runtime frameworks.
- **GitHub Pages compatible:** Uses relative paths (`./`) and hash/query deep linking so the app runs cleanly from project subpaths on GitHub Pages as well as local static servers.
- **Explicit module responsibilities:** Logic is split into focused files under `js/` to avoid duplicated state, inline styles, or inline event handlers.

## Module Overview (`js/`)

- **`state.js`** — Shared application and view state across tabs, selections, and filters.
- **`buildcodes.js`** — Encoding and decoding talent selection strings and in-game build codes.
- **`parser.js`** — Normalizing raw hero data, abilities, and talent trees.
- **`heroes.js`** — Hero catalog queries, filtering, and lookups.
- **`hero-sidebar.js`** — Hero list sidebar rendering and selection handling.
- **`hero-view.js`** — Hero header, ability strip rendering, build tabs/notes, and build talent strips.
- **`talentcalculator.js`** — Interactive talent matrix, selection state, URL/build code output, and copy controls.
- **`assets.js`** — Centralized asset URL resolution for hero portraits, loading screen art (`heroportraits/`), and ability/talent icons.
- **`tooltips.js`** — Hover/focus tooltips for abilities and talents.
- **`router.js`** — Tab/view navigation and URL state synchronization.
- **`rotation.js`**, **`academy.js`**, **`maps.js`**, **`tierlist.js`** — Feature modules for rotations, academy content, battlegrounds, and tier lists.
- **`patchnotes/`**
  - **`repository.js`** — Fetches, normalizes, deduplicates, sorts, and caches master and detail patch note feeds.
  - **`formatter.js`** — Stateless text normalization, formatting, and TL;DR summary generation.
  - **`sidebar.js`** — Filter buttons (`All`, `Live`, `PTR`), sidebar list rendering, and sticky layout syncing.
  - **`controller.js`** — Coordinates patch filter/selection/deep-link state, Home preview cards, and race-safe async view updates.

## Hero & Asset Edge Cases

- **Loading screen artwork:** Loading screen portraits (such as `storm_ui_ingame_hero_loadingscreen_*`) resolve under `heroportraits/` in `assets.js` and power the `#builder-model-bg` backdrop in the talent builder.
- **Multi-stage & transform heroes:** Heroes with alternate/transform states (such as Alexstrasza, Greymane, and Deathwing) deduplicate ability entries while preserving distinct abilities and custom `Z` actions.
- **The Lost Vikings:** Condenses `Trait` and `Z` to one card each, omits `Activable` controls (*Select Olaf/Baleog/Erik/All*), suppresses ungranted base `Q`/`W`/`E` slots, dynamically adds talent-granted `Q`/`W`/`E` abilities from active selections in both Builds view and the Talent Builder, and orders cards consistently (`Q -> W -> E -> Trait -> Z`).

## Running Locally & Deploying to GitHub Pages

1. Serve the repository root over HTTP (for example, `npx serve .` or `python3 -m http.server`) so `fetch()` requests for local JSON data work properly.
2. Push to your GitHub repository and enable **GitHub Pages** from the configured branch/folder—because asset and data paths use `./`, no base-path rewrite is needed.
