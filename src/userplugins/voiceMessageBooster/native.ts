/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 BreezeDelegate
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { net } from "electron";

const MAX_VOICE_MESSAGE_BYTES = 64 * 1024 * 1024;

function isAllowedDiscordMediaUrl(rawUrl: string) {
    try {
        const url = new URL(rawUrl);
        if (url.protocol !== "https:") return false;

        const allowedHost = url.hostname === "cdn.discordapp.com"
            || url.hostname === "media.discordapp.net";

        return allowedHost && url.pathname.startsWith("/attachments/");
    } catch {
        return false;
    }
}

export async function fetchVoiceMessage(_: unknown, rawUrl: string) {
    if (!isAllowedDiscordMediaUrl(rawUrl)) return null;

    try {
        // Electron's network stack is used intentionally here. This runs in the native
        // Vencord helper, outside the renderer's CORS restrictions, while preserving
        // Discord's signed attachment URL exactly as supplied by the voice-message UI.
        const response = await net.fetch(rawUrl, {
            method: "GET",
            redirect: "follow",
            cache: "no-store"
        });
        if (!response.ok) return null;

        const declaredLength = Number(response.headers.get("content-length") ?? 0);
        if (declaredLength > MAX_VOICE_MESSAGE_BYTES) return null;

        const arrayBuffer = await response.arrayBuffer();
        if (arrayBuffer.byteLength === 0 || arrayBuffer.byteLength > MAX_VOICE_MESSAGE_BYTES) return null;

        return new Uint8Array(arrayBuffer);
    } catch {
        return null;
    }
}
