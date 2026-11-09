# Discord 1.0.9267 Compatibility Design

## Intent

Restore the Breeze Vencord runtime on this Windows PC after Discord 1.0.9267 stopped loading with the fork's Vencord 1.15.6 build.

## Goals

- Synchronize the local fork with upstream Vencord 1.15.16.
- Preserve `VoiceMessageBooster`, `ProfileLocationWidget`, the Breeze runtime marker and the custom installer workflow.
- Pass the repository's desktop verification gates.
- Build the standalone desktop runtime with the updater disabled.
- Install the runtime locally and prove that Discord reaches the Friends screen without the previous constructor error.

## Non-goals

- Push, publish or change GitHub releases during this local repair.
- Redesign either custom plugin.
- Change Discord account settings or user data.

## Constraints

- Keep the existing Vencord settings and themes.
- Preserve a recoverable copy of the currently installed loader and runtime.
- Make no GitHub write through a connector or assistant identity.
- Keep the official Discord loader available as the rollback path.

## Approaches

1. Merge upstream `main` into the Breeze fork. This preserves the public fork history and custom commits while importing the compatibility fixes. Chosen.
2. Rebase the 44 Breeze commits onto upstream. This gives a cleaner history but rewrites the fork and increases conflict risk.
3. Start from upstream and cherry-pick only the custom features. This is clean but requires a larger audit and risks dropping installer or runtime details.

## Acceptance evidence

- `pnpm test` passes.
- `pnpm build --dev --standalone --disable-updater` passes and produces all four runtime assets.
- The built runtime contains the Breeze marker and both custom plugin names.
- Discord opens a responsive `Friends - Discord` window.
- No new `i.A is not a constructor` or Vencord startup exception appears after the repaired launch.
