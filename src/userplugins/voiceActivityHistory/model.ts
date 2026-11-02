/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 BreezeDelegate
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export type VoiceEventKind = "join" | "leave" | "move" | "mute" | "unmute" | "deafen" | "undeafen" | "stream-start" | "stream-stop" | "camera-start" | "camera-stop" | "game" | "stream-preview";

export interface VoiceSnapshot {
    channelId: string | null;
    mute: boolean;
    deaf: boolean;
    stream: boolean;
    video: boolean;
}

export interface VoiceEvent {
    id: string;
    at: number;
    guildId: string;
    userId: string;
    kind: VoiceEventKind;
    channelId?: string;
    fromChannelId?: string;
    detail?: string;
    preview?: string;
}

export interface VoiceUpdate {
    channelId?: string | null;
    oldChannelId?: string | null;
    selfMute?: boolean;
    mute?: boolean;
    selfDeaf?: boolean;
    deaf?: boolean;
    selfStream?: boolean;
    selfVideo?: boolean;
}

export function snapshot(update: VoiceUpdate): VoiceSnapshot {
    return {
        channelId: update.channelId ?? null,
        mute: Boolean(update.selfMute || update.mute),
        deaf: Boolean(update.selfDeaf || update.deaf),
        stream: Boolean(update.selfStream),
        video: Boolean(update.selfVideo)
    };
}

export function diffVoice(guildId: string, userId: string, previous: VoiceSnapshot | undefined, current: VoiceSnapshot, at = Date.now()): VoiceEvent[] {
    const result: VoiceEvent[] = [];
    const push = (kind: VoiceEventKind, detail?: string) => {
        result.push({
            id: `${at}:${userId}:${kind}:${result.length}`,
            at, guildId, userId, kind,
            channelId: current.channelId ?? previous?.channelId ?? undefined,
            fromChannelId: previous?.channelId ?? undefined,
            detail
        });
    };

    previous ??= { channelId: null, mute: false, deaf: false, stream: false, video: false };
    if (previous.channelId !== current.channelId) {
        if (!previous.channelId && current.channelId) push("join");
        else if (previous.channelId && !current.channelId) push("leave");
        else push("move");
    }

    if (current.channelId) {
        if (previous.mute !== current.mute) push(current.mute ? "mute" : "unmute");
        if (previous.deaf !== current.deaf) push(current.deaf ? "deafen" : "undeafen");
        if (previous.stream !== current.stream) push(current.stream ? "stream-start" : "stream-stop");
        if (previous.video !== current.video) push(current.video ? "camera-start" : "camera-stop");
    }
    return result;
}
