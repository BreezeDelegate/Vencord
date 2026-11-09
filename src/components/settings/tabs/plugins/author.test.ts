/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import test from "node:test";

import { getContributorAvatarUrl, isPluginByAuthor } from "./author";

test("matches plugins by their declared author name", () => {
    const authors = [{ name: "BreezeDelegate", id: 0n }];

    assert.equal(isPluginByAuthor(authors, "BreezeDelegate"), true);
    assert.equal(isPluginByAuthor(authors, "Vendicated"), false);
});

test("prefers an external contributor avatar", () => {
    const user = {
        vcAvatarUrl: "https://avatars.githubusercontent.com/u/271538431?v=4",
        getAvatarURL: () => "https://cdn.discordapp.com/default.png"
    };

    assert.equal(getContributorAvatarUrl(user, 80), user.vcAvatarUrl);
});

test("falls back to the Discord avatar", () => {
    const user = { getAvatarURL: (_guildId: undefined, size: number) => `discord:${size}` };

    assert.equal(getContributorAvatarUrl(user, 512), "discord:512");
});
