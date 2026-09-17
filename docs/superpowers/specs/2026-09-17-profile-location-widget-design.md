# Profile Location Widget Design

## Goal
Add a local-only location widget to Discord user profiles in the BreezeDelegate Vencord fork. The widget sits immediately before the existing Member Since section, lets the local user assign any searched place to a Discord user ID, renders a compact interactive map, and shows the selected place plus its local time.

## Constraints
- Data is cosmetic and local to this Vencord installation; nothing is sent to Discord.
- Keep the feature isolated in one built-in plugin so upstream syncs remain manageable.
- Support the DM sidebar profile, legacy modal, and modal-v2 profile surfaces.
- No production deployment or Discord injection from the VPS; validation is build/type/lint plus patch compilation.
- Use OpenStreetMap tiles and Nominatim search at low personal-use volume with attribution and debounced requests.
- Resolve timezone offline from coordinates so the clock does not depend on a second remote API.

## UX
When a location exists, show a compact dark map card with a marker, local time in the upper-left, place label in the lower-left, map pan/zoom, and a small edit control. Editing reveals a search field and result list. Selecting a result saves immediately. A remove action clears the assignment. With no assignment, show a compact Set location affordance rather than an empty map.

## Architecture
`index.tsx` owns Vencord patch injection and plugin lifecycle. `store.ts` persists `userId -> SavedLocation` through Vencord DataStore and exposes a subscription hook. `geocode.ts` talks to Nominatim and normalizes results. `model.ts` contains pure label/time/zoom helpers. `ProfileLocationSection.tsx` owns the React UI and Leaflet map lifecycle. `styles.css` scopes all visuals under `vc-plw-*`.

## Validation
Unit-test pure normalization/time helpers with Node test + tsx. Run Vencord TypeScript, build, lint, stylelint, and full `pnpm test` before push. Confirm the patch regexes compile into the bundle without patch warnings during build.
