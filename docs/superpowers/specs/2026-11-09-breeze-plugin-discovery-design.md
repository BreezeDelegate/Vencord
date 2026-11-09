# Breeze plugin discovery and profile location search design

## Goal

Make profile location search reliable in Discord Desktop, make BreezeDelegate plugins easy to isolate in the plugin list, and show the BreezeDelegate GitHub avatar in author surfaces.

## Design

- Move Nominatim requests from the renderer to the plugin native helper. The helper identifies the fork, serializes requests to at most one per second, and caches repeated queries.
- Replace key-driven autocomplete with an explicit form submission by Enter or a Search button. This follows the public Nominatim policy and avoids unnecessary requests.
- Keep OpenStreetMap attribution visible and allow its tile and image hosts through the desktop CSP.
- Add a dedicated `Show BreezeDelegate Plugins` type filter based on plugin author metadata.
- Extend plugin author metadata with an optional external avatar URL. Use the current GitHub avatar URL for BreezeDelegate and render it in both author summaries and contributor details.

## Verification

- Focused Node tests cover URL construction, author filtering, and external-avatar precedence.
- `pnpm test` and the standalone desktop build must pass.
- The installed Discord client must return results for Paris, show the BreezeDelegate filter, render the GitHub avatar, and log no CSP or plugin errors.
