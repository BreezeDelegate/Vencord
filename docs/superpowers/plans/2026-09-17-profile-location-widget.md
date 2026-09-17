# Profile Location Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add a local-only searchable mini-map and local clock to user profiles in the BreezeDelegate Vencord fork.

**Architecture:** A single built-in plugin patches the three Discord profile surfaces and renders one shared React section. Persistence uses Vencord DataStore; map rendering uses Leaflet; timezone lookup is offline via `tz-lookup`; Nominatim is only used for searched place suggestions.

**Tech Stack:** TypeScript, React, Vencord plugin patches/DataStore, Leaflet, OpenStreetMap, Nominatim, tz-lookup, Node test runner via tsx.

**Spec:** `docs/superpowers/specs/2026-09-17-profile-location-widget-design.md`

## Global Constraints
- Local-only cosmetic data; never write profile locations to Discord.
- Render before Member Since on sidebar, modal, and modal-v2 surfaces.
- Debounce Nominatim requests and preserve OpenStreetMap attribution.
- Keep implementation self-contained under `src/plugins/profileLocationWidget/` except package dependency updates.
- Preserve existing VoiceMessageBooster and fork installer behavior while syncing upstream.

---

### Task 1: Restore the post-upstream baseline
**Files:** `src/userplugins/voiceMessageBooster/index.ts`
- [x] Reproduce the TypeScript failure after merging upstream.
- [x] Trace it to `satisfies BoostSession` retaining a narrower inferred object type under the updated TypeScript toolchain.
- [x] Type the recursive session object as `BoostSession` so optional `source` remains visible.
- [x] Run `pnpm testTsc` and confirm green.

### Task 2: Pure location model
**Files:** Create `src/plugins/profileLocationWidget/model.test.ts`, `src/plugins/profileLocationWidget/model.ts`; modify package dependencies.
- [x] Write tests for Nominatim normalization, timezone derivation, zoom choice, and stable clock formatting.
- [x] Run the test first and observe failure because the model is missing.
- [x] Add `tz-lookup`, implement the pure helpers, and rerun tests green.

### Task 3: Persistence and search
**Files:** Create `store.ts`, `geocode.ts`, `types.ts`.
- [x] Add DataStore-backed CRUD keyed by Discord user ID with a listener mechanism.
- [x] Add debounced-call-friendly Nominatim search that accepts AbortSignal, returns normalized results, and rejects malformed responses safely.
- [x] Reuse pure model helpers rather than duplicating label/timezone logic.

### Task 4: Profile widget UI and map
**Files:** Create `ProfileLocationSection.tsx`, `styles.css`; add Leaflet dependencies.
- [x] Render empty, view, and edit states.
- [x] Mount/unmount one Leaflet map per visible location; use circle marker to avoid marker image assets.
- [x] Enable drag/zoom, keep wheel zoom opt-in by direct interaction, and retain OSM attribution.
- [x] Add local-time refresh, search results, save/remove actions, and external OSM open action.

### Task 5: Vencord integration
**Files:** Create `index.tsx`.
- [x] Patch sidebar, modal, and modal-v2 using current profile anchors derived from the maintained Equicord ProfileSections implementation.
- [x] Inject the widget before Member Since and wrap render errors safely.
- [x] Hydrate persisted data in `start()` and clear transient listeners/map state in `stop()` where needed.

### Task 6: Gates and publish branch
**Files:** all changed files.
- [x] Run unit test, `pnpm testTsc`, `pnpm buildStandalone`, lint/stylelint, then full `pnpm test`.
- [x] Inspect git diff/status for accidental files or secrets.
- [x] Commit with normal project-style messages and push `feat/profile-location-widget` to `BreezeDelegate/Vencord`.
