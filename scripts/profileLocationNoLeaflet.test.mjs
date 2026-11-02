/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 BreezeDelegate
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("src/plugins/profileLocationWidget/ProfileLocationSection.tsx", "utf8");

test("ProfileLocationWidget must not import Leaflet at bundle startup", () => {
    assert.equal(/from\s+["']leaflet["']/.test(source), false);
});
