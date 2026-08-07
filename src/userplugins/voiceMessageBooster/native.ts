/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 BreezeDelegate
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const MAX_VOICE_MESSAGE_BYTES = 64 * 1024 * 1024;

function isAllowedDiscordMediaUrl(rawUrl: string) {
    try {
        const url = new URL(rawUrl);
        if (url.protocol !== "https:") return false;

        return url.hostname === "discordapp.com"
            || url.hostname.endsWith(".discordapp.com")
            || url.hostname === "discordapp.net"
            || url.hostname.endsWith(".discordapp.net");
    } catch {
        return false;
    }
}

export async function fetchVoiceMessage(_: unknown, rawUrl: string) {
    if (!isAllowedDiscordMediaUrl(rawUrl)) return null;

    try {
        const response = await fetch(rawUrl, { redirect: "follow" });
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
