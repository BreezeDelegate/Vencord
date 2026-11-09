/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 BreezeDelegate
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import test from "node:test";

import { buildNominatimSearchUrl } from "./geocodeRequest";

test("builds an encoded Nominatim search request", () => {
    const url = new URL(buildNominatimSearchUrl(" Paris, France ", "fr-FR"));

    assert.equal(url.origin + url.pathname, "https://nominatim.openstreetmap.org/search");
    assert.equal(url.searchParams.get("q"), "Paris, France");
    assert.equal(url.searchParams.get("format"), "jsonv2");
    assert.equal(url.searchParams.get("addressdetails"), "1");
    assert.equal(url.searchParams.get("limit"), "6");
    assert.equal(url.searchParams.get("accept-language"), "fr-FR");
});

test("rejects an empty Nominatim search query", () => {
    assert.throws(() => buildNominatimSearchUrl("  ", "en-US"), /at least 2 characters/i);
});
