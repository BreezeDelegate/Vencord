/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import test from "node:test";

import { formatLocationClock, normalizeNominatimResult } from "./model";

test("normalizes a Nominatim city result into a saved location candidate", () => {
    const result = normalizeNominatimResult({
        lat: "48.148598",
        lon: "17.107748",
        name: "Bratislava",
        type: "city",
        display_name: "Bratislava, District of Bratislava, Region of Bratislava, Slovakia",
        address: { city: "Bratislava", country: "Slovakia" }
    });

    assert.deepEqual(result, {
        label: "Bratislava, Slovakia",
        lat: 48.148598,
        lng: 17.107748,
        timezone: "Europe/Bratislava",
        zoom: 10
    });
});

test("rejects malformed Nominatim coordinates", () => {
    assert.equal(normalizeNominatimResult({ lat: "oops", lon: "17.1", display_name: "Invalid" }), null);
});

test("formats the selected place clock with its UTC offset", () => {
    const date = new Date("2026-09-17T19:48:00.000Z");
    assert.equal(formatLocationClock(date, "Europe/Bratislava"), "21:48 GMT+2");
});
