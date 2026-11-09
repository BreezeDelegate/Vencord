/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { User } from "@vencord/discord-types";

export type ContributorUser = User & { vcAvatarUrl?: string; };

export function isPluginByAuthor(authors: readonly { name: string; }[], authorName: string) {
    return authors.some(author => author.name === authorName);
}

export function getContributorAvatarUrl(user: Pick<User, "getAvatarURL"> & { vcAvatarUrl?: string; }, size: number) {
    return user.vcAvatarUrl ?? user.getAvatarURL(void 0, size, true);
}
