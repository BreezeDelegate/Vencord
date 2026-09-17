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
