# Discord 1.0.9267 Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the Breeze Vencord fork locally and restore a working Vencord runtime in Discord 1.0.9267.

**Architecture:** Merge upstream Vencord 1.15.16 into the isolated Breeze branch, resolve only custom-fork conflicts, then use the existing build and injection paths. Preserve the official Discord loader and the previous Breeze runtime as rollback artifacts.

**Tech Stack:** TypeScript, pnpm, esbuild, Electron/Discord desktop, PowerShell smoke verification

**Spec:** `docs/superpowers/specs/2026-11-08-discord-9267-compat-design.md`

## Global Constraints

- Preserve `VoiceMessageBooster`, `ProfileLocationWidget`, the Breeze marker and custom installer workflow.
- Do not push or publish during this local repair.
- Preserve user settings, themes and a rollback copy of the installed runtime.
- Build with `--dev`, as required by the current upstream `AGENTS.md`.

## Review Focus

- Upstream merge accidentally drops a Breeze-only plugin or marker.
- Dependency or lockfile resolution no longer matches pnpm 11.9.0.
- Standalone build succeeds but omits one of the four runtime assets.
- Injection overwrites the official Discord loader without a rollback copy.
- Discord opens but repeats the previous constructor error in the new launch interval.

---

### Task 1: Synchronize the fork

**Files:**
- Modify: files changed by merging `upstream/main`
- Verify: `src/userplugins/voiceMessageBooster/`, `src/plugins/profileLocationWidget/`, `src/utils/constants.ts`, `.github/workflows/`

**Interfaces:**
- Consumes: upstream Vencord `main` at version 1.15.16
- Produces: a conflict-free local tree containing upstream compatibility changes and all Breeze customizations

- [ ] Record the existing Discord failure signature from `renderer_js.log` as the RED regression evidence.
- [ ] Merge `upstream/main` without committing.
- [ ] Resolve conflicts with upstream structure as the base and Breeze-only behavior preserved.
- [ ] Confirm the version and Breeze markers by repository search.

### Task 2: Build and verify the runtime

**Files:**
- Generated: `dist/patcher.js`, `dist/preload.js`, `dist/renderer.js`, `dist/renderer.css`

**Interfaces:**
- Consumes: synchronized source tree from Task 1
- Produces: verified standalone desktop runtime assets

- [ ] Install dependencies with `pnpm install --frozen-lockfile`.
- [ ] Run `pnpm test` and require a clean pass.
- [ ] Run `pnpm build --dev --standalone --disable-updater`.
- [ ] Verify the four assets and Breeze/custom-plugin markers.

### Task 3: Install and live-verify Discord

**Files:**
- Backup: `%APPDATA%/Vencord/BreezeBackup/discord-9267-update-20261108/`
- Replace: `%APPDATA%/Vencord/dist/`
- Restore: Discord's Vencord loader in `resources/app.asar`

**Interfaces:**
- Consumes: verified runtime assets from Task 2
- Produces: working local Discord with the updated Breeze Vencord runtime

- [ ] Stop Discord and back up the current runtime and loader state.
- [ ] Copy only the four verified runtime assets into the installed Vencord runtime directory.
- [ ] Restore the saved Vencord loader while preserving the official `_app.asar` rollback.
- [ ] Launch Discord and wait for a responsive `Friends - Discord` window.
- [ ] Verify the post-launch log contains gateway readiness and no new constructor or Vencord startup exception.
