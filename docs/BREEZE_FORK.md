# BreezeDelegate Vencord fork

This repository is the BreezeDelegate Vencord fork. It tracks upstream Vencord while keeping the custom runtime, installer and local plugins used by this fork.

## Current fork features

- `VoiceMessageBooster`: custom voice-message playback boost with the fork-specific native/runtime handling.
- `ProfileLocationWidget`: local-only profile map widget. A Discord user ID can be assigned any searched place; the profile then shows an interactive mini-map, the selected place name and its local time. The mapping is stored only in Vencord DataStore on the local client and is not sent to Discord or other users.

`ProfileLocationWidget` uses OpenStreetMap/Nominatim for user-initiated place search, Leaflet for the map UI and `tz-lookup` to resolve the local timezone from coordinates.

## Updating the installed Discord client

The supported Windows update path is the fork installer release:

1. Download `BreezeVencordInstaller.exe` from the GitHub release tagged `installer` in `BreezeDelegate/Vencord`.
2. Close Discord before updating when possible.
3. Run the installer and install/update the desired Discord branch.
4. Restart Discord.

The custom installer is patched to download only the BreezeDelegate runtime release (`breeze-runtime`), not the upstream Vendicated runtime. The runtime release is expected to contain exactly these required assets:

- `patcher.js`
- `preload.js`
- `renderer.js`
- `renderer.css`

## Release pipeline

A push to `main` that changes the runtime source, build scripts or package lock starts `.github/workflows/build.yml`.

That workflow:

1. installs dependencies with the lockfile frozen;
2. builds the standalone desktop runtime with the built-in updater disabled;
3. verifies the fork marker, `VoiceMessageBooster`, `ProfileLocationWidget` and all required runtime assets;
4. publishes the four runtime assets to the `breeze-runtime` release.

When `Build DevBuild` completes successfully, `.github/workflows/build-custom-installer.yml` runs on Windows, compiles `BreezeVencordInstaller.exe`, points it exclusively at the BreezeDelegate releases, verifies the executable and republishes the `installer` release.

## Local development gates

Install dependencies:

```bash
pnpm install --frozen-lockfile
```

Run the desktop gates:

```bash
pnpm test
```

Run the web gates:

```bash
pnpm testWeb
```

Build the standalone desktop runtime manually:

```bash
pnpm build --standalone --disable-updater
```

The Windows graphical installer itself is intentionally built by the Windows GitHub Actions runner rather than the Linux VPS.

## VoiceActivityHistory (local, opt-in)

The fork adds a Discord-style voice-history icon in the channel header. Its popout requires an explicit **Activer le suivi** action for each guild. The plugin stores data in the local Vencord DataStore, not an external service. It records voice joins, departures, channel moves, mute/deafen state transitions, stream/camera transitions, and observed game changes while Discord runs. Filters separate movement, audio, stream and games.

- Nothing is recorded before guild-level opt-in. Tracking can be stopped, and local history deleted, per guild.
- Each guild retains at most 1,500 events within 30 days.
- Where Discord's own stream preview is available, the client may capture a compressed 480x270 WebP thumbnail every two minutes during an active stream. Up to 20 images per guild are retained for 24 hours. No audio/video recordings are created.
- A screenshot is not guaranteed: the client may not receive preview access, Discord might not generate a preview, or image retrieval/canvas conversion may fail.
- There is no retrospective Discord history, no monitoring when the client is closed, and no remote sync.
- ProfileLocationWidget remains outside the scope of this change.

### Validating a new Windows build

Keep the currently installed Discord/PTB runtime unchanged during development. Build and test the fork in an isolated directory, then check the actual Discord UI and runtime patch compatibility before updating the release assets. Source compile and unit tests alone do not validate Discord UI injection.

### QA record, 2026-11-02

- Windows target: DESKTOP-0O5FKEG, isolated breeze-mcp account. The owner's installed Discord was left unchanged.
- Verified source: 7603bc2f (feature branch feat/voice-activity-history-permissions).
- Windows: pnpm test succeeded (standalone build, TypeScript check, ESLint, core stylelint and plugin inventory generation).
- Windows: 7/7 targeted voice-history tests passed, including toolbar coexistence and local retention cases.
- Windows: standalone build with updater disabled produced nonempty patcher.js, preload.js, renderer.js and renderer.css. Voice-history CSS was validated separately by stylelint.
- Linux preflight: same 7 tests and type check passed, build succeeded.
- Not live-verified: on-server Discord context menus, toolbar injection in a logged-in client, stream preview CORS availability and actual guild voice events. Do not promote to the installed runtime or public installer until these paths are tested in a real Discord session.
- No GitHub-hosted runners were used. The fork's existing main-only GitHub Actions were not triggered by the feature-branch push.

## Discord Stable startup regression (2026-11-03)

On the owner's Discord Stable 1.0.9266, runtime `8b56178` started its main patcher but did not show Vencord's Settings/Plugins/Themes UI. A real A/B test of the same logged-in desktop client confirmed that the older runtime `9acb948` showed all Vencord menus. The feature branch had been based on `479a50f9`, which predated the no-Leaflet ProfileLocationWidget startup fix included in `9acb948`. Restoring that previously working implementation and its regression test produced a Windows candidate that booted successfully and displayed the Vencord menus again.

Windows live checks: Discord Stable process restart, UI Automation click on User Settings, and presence of `Vencord`, `Plugins`, `Vencord Settings`, and `Themes`. The voice history model and toolbar coexistence unit tests passed. Real voice participants and every plugin action were not exercised in this check; do not treat menu visibility as proof of those paths.

## 2026-11-03 targeted runtime repair

Discord Stable logs confirmed a WebpackModule201001 permission spec lookup throwing an undefined length during both guild and member permissions. Permission label lookup is now optional and fails to an empty metadata map, preserving the underlying role/permission flags. The voice history toolbar injection now targets the same native Fragment anchor as VencordToolbox, including a separate coexistence path when VencordToolbox is enabled. The plugin info modal displays plain author metadata for custom plugins instead of requesting a synthetic Discord user, and is wrapped in an error boundary. These fixes require actual live Discord UI verification before promotion; compilation and unit tests alone are insufficient.

### 2026-11-03 follow-up validation

A live Discord Stable restart of 67ede863 logged a new renderer exception when the toolbar wrapper tried to call renderHeaderButton through an unbound this. Commit 3de1e3d3 now renders VoiceHistoryButton directly inside the React wrapper, with a regression guard; the next Windows restart logged VoiceActivityHistory starting without that exception. The PC session did not expose a testable main Discord window for completing actual plugin-info, permission, toolbar-click and popout checks. The feature branch is therefore a **QA candidate, not a verified release**. The downloadable breeze-runtime release was reverted to known-good 9acb9488 to avoid shipping the broken 086c51f8 runtime. The candidate was left in the owner's installed dist for further hands-on testing; local backup was retained.
