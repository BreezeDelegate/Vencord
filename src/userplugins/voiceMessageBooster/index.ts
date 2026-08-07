/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 BreezeDelegate
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Logger } from "@utils/Logger";
import definePlugin, { makeRange, OptionType, StartAt } from "@utils/types";

const logger = new Logger("VoiceMessageBooster");

interface BoostSession {
    original: HTMLAudioElement;
    processor: HTMLAudioElement;
    context: AudioContext;
    source: MediaElementAudioSourceNode;
    gain: GainNode;
    limiter: DynamicsCompressorNode;
    url: string;
    originalMuted: boolean;
    driftTimer: number;
    onPause: () => void;
    onSeeking: () => void;
    onRateChange: () => void;
    onEnded: () => void;
}

const sessions = new WeakMap<HTMLAudioElement, BoostSession>();
const activeSessions = new Set<BoostSession>();
const preparingElements = new WeakSet<HTMLAudioElement>();
const failedElements = new WeakSet<HTMLAudioElement>();
let audioContext: AudioContext | null = null;
let started = false;

function refreshConnectedAudio() {
    for (const session of activeSessions) configureGraph(session);
}

function rescanPlayingAudio() {
    if (!started) return;

    document.querySelectorAll<HTMLAudioElement>("audio").forEach(audio => {
        if (!audio.paused) void boostAudio(audio);
    });
}

const settings = definePluginSettings({
    multiplier: {
        type: OptionType.SLIDER,
        description: "Volume multiplier for voice messages. Increase it gradually to protect your hearing.",
        markers: makeRange(1, 5, 0.25),
        default: 2.5,
        stickToMarkers: true,
        onChange: refreshConnectedAudio
    },
    limiter: {
        type: OptionType.BOOLEAN,
        description: "Limit loud peaks to reduce clipping and sudden volume spikes.",
        default: true,
        onChange: refreshConnectedAudio
    },
    compatibilityMode: {
        type: OptionType.BOOLEAN,
        description: "Boost every audio player inside messages when strict voice-message detection fails.",
        default: false,
        onChange: rescanPlayingAudio
    }
});

function getAudioContext() {
    audioContext ??= new AudioContext({ latencyHint: "interactive" });
    return audioContext;
}

type SinkAwareAudioContext = AudioContext & {
    sinkId?: string;
    setSinkId?(sinkId: string): Promise<void>;
};

type SinkAwareAudioElement = HTMLAudioElement & {
    sinkId?: string;
};

async function syncOutputDevice(context: AudioContext, audio: HTMLAudioElement) {
    const sinkId = (audio as SinkAwareAudioElement).sinkId;
    const sinkContext = context as SinkAwareAudioContext;

    if (sinkId == null || !sinkContext.setSinkId) return;

    const normalizedSinkId = sinkId === "default" ? "" : sinkId;
    if (sinkContext.sinkId === normalizedSinkId) return;

    try {
        await sinkContext.setSinkId(normalizedSinkId);
    } catch (error) {
        logger.error("Failed to use Discord's selected output device", error);
    }
}

function configureGraph(session: BoostSession) {
    const now = session.context.currentTime;

    session.source.disconnect();
    session.gain.disconnect();
    session.limiter.disconnect();

    session.gain.gain.cancelScheduledValues(now);
    session.gain.gain.setTargetAtTime(settings.store.multiplier, now, 0.01);
    session.source.connect(session.gain);

    if (settings.store.limiter) {
        session.limiter.threshold.setValueAtTime(-2, now);
        session.limiter.knee.setValueAtTime(8, now);
        session.limiter.ratio.setValueAtTime(16, now);
        session.limiter.attack.setValueAtTime(0.003, now);
        session.limiter.release.setValueAtTime(0.2, now);
        session.gain.connect(session.limiter);
        session.limiter.connect(session.context.destination);
    } else {
        session.gain.connect(session.context.destination);
    }
}

function classLooksLikeVoiceMessage(element: Element | null) {
    for (let current = element, depth = 0; current && depth < 10; current = current.parentElement, depth++) {
        const className = current.getAttribute("class") ?? "";
        if (/voice[-_ ]?message/i.test(className)) return true;
    }

    return false;
}

function urlLooksLikeVoiceMessage(audio: HTMLAudioElement) {
    let url = audio.currentSrc || audio.src;

    try {
        url = decodeURIComponent(url);
    } catch {
        // Keep malformed URLs unchanged.
    }

    return /(?:^|\/)(?:voice[-_ ]?message)[^/?#]*\.(?:ogg|opus|webm|m4a|mp3|wav)(?:[?#]|$)/i.test(url);
}

function hasVoiceMessageLabel(message: Element) {
    for (const element of Array.from(message.querySelectorAll<HTMLElement>("[aria-label]"))) {
        const label = element.getAttribute("aria-label") ?? "";
        if (/(?:voice message|message vocal|mensaje de voz|mensagem de voz|messaggio vocale|sprachnachricht)/i.test(label)) {
            return true;
        }
    }

    return false;
}

function isMessageAudio(audio: HTMLAudioElement) {
    return Boolean(audio.closest('[id^="chat-messages-"], [data-list-item-id^="chat-messages"]'));
}

function isVoiceMessage(audio: HTMLAudioElement) {
    if (urlLooksLikeVoiceMessage(audio) || classLooksLikeVoiceMessage(audio)) return true;

    const message = audio.closest('[id^="chat-messages-"], [data-list-item-id^="chat-messages"]');
    if (message && hasVoiceMessageLabel(message)) return true;

    return settings.store.compatibilityMode && isMessageAudio(audio);
}

function syncPlayback(session: BoostSession, force = false) {
    const { original, processor } = session;

    processor.playbackRate = original.playbackRate;

    const targetTime = original.currentTime;
    if (!Number.isFinite(targetTime)) return;

    const drift = Math.abs(processor.currentTime - targetTime);
    if (force || drift > 0.25) {
        try {
            processor.currentTime = targetTime;
        } catch {
            // Metadata may not be ready yet. The next drift check will retry.
        }
    }
}

function cleanupSession(session: BoostSession, restoreOriginal = true) {
    if (!activeSessions.delete(session)) return;

    sessions.delete(session.original);
    window.clearInterval(session.driftTimer);

    session.original.removeEventListener("pause", session.onPause);
    session.original.removeEventListener("seeking", session.onSeeking);
    session.original.removeEventListener("ratechange", session.onRateChange);
    session.original.removeEventListener("ended", session.onEnded);

    session.processor.pause();

    try {
        session.source.disconnect();
        session.gain.disconnect();
        session.limiter.disconnect();
    } catch {
        // Nodes may already be disconnected while Discord tears down the player.
    }

    session.processor.removeAttribute("src");
    session.processor.load();

    if (restoreOriginal && session.original.isConnected) {
        session.original.muted = session.originalMuted;
    }
}

async function resumeSession(session: BoostSession) {
    const { context, original, processor } = session;

    await syncOutputDevice(context, original);
    if (context.state === "suspended") await context.resume();

    syncPlayback(session, true);
    processor.volume = original.volume;

    try {
        await processor.play();
        if (!original.paused) original.muted = true;
        else processor.pause();
    } catch (error) {
        logger.error("Failed to resume boosted voice-message playback; restoring Discord audio", error);
        failedElements.add(original);
        cleanupSession(session, true);
    }
}

async function createSession(original: HTMLAudioElement, url: string) {
    const context = getAudioContext();
    await syncOutputDevice(context, original);
    if (context.state === "suspended") await context.resume();

    // Discord voice-message attachments are loaded from a different origin. Creating a
    // MediaElementAudioSourceNode from Discord's existing element can therefore produce
    // mandatory CORS silence. A dedicated element is created with CORS enabled before its
    // source URL is assigned, leaving Discord's own player untouched as a safe fallback.
    const processor = new Audio();
    processor.crossOrigin = "anonymous";
    processor.preload = "auto";
    processor.volume = 0;
    processor.playbackRate = original.playbackRate;
    processor.src = url;

    const source = context.createMediaElementSource(processor);
    const gain = context.createGain();
    const limiter = context.createDynamicsCompressor();

    const session = {
        original,
        processor,
        context,
        source,
        gain,
        limiter,
        url,
        originalMuted: original.muted,
        driftTimer: 0,
        onPause: () => processor.pause(),
        onSeeking: () => syncPlayback(session, true),
        onRateChange: () => {
            processor.playbackRate = original.playbackRate;
        },
        onEnded: () => cleanupSession(session, true)
    } satisfies BoostSession;

    configureGraph(session);

    try {
        // Start at zero volume first so Discord's original player remains audible until the
        // CORS-enabled copy has actually started successfully.
        await processor.play();
    } catch (error) {
        processor.removeAttribute("src");
        processor.load();
        source.disconnect();
        gain.disconnect();
        limiter.disconnect();
        throw error;
    }

    syncPlayback(session, true);
    processor.volume = original.volume;

    original.addEventListener("pause", session.onPause);
    original.addEventListener("seeking", session.onSeeking);
    original.addEventListener("ratechange", session.onRateChange);
    original.addEventListener("ended", session.onEnded);

    session.driftTimer = window.setInterval(() => {
        if (!original.isConnected) {
            cleanupSession(session, false);
            return;
        }

        if (!original.paused) syncPlayback(session);
    }, 500);

    sessions.set(original, session);
    activeSessions.add(session);

    if (original.paused) {
        processor.pause();
    } else {
        original.muted = true;
    }
}

async function boostAudio(audio: HTMLAudioElement) {
    if (!started || failedElements.has(audio) || !isVoiceMessage(audio)) return;

    const url = audio.currentSrc || audio.src;
    if (!url) return;

    const existing = sessions.get(audio);
    if (existing) {
        if (existing.url === url) {
            await resumeSession(existing);
            return;
        }

        cleanupSession(existing, true);
    }

    if (preparingElements.has(audio)) return;
    preparingElements.add(audio);

    try {
        await createSession(audio, url);
    } catch (error) {
        failedElements.add(audio);
        logger.error("Boosted playback could not start; Discord's original audio was left untouched", error);
    } finally {
        preparingElements.delete(audio);
    }
}

function onAudioPlay(event: Event) {
    if (event.target instanceof HTMLAudioElement) void boostAudio(event.target);
}

export default definePlugin({
    name: "VoiceMessageBooster",
    description: "Boosts Discord voice messages with an optional peak limiter.",
    authors: [{ name: "BreezeDelegate", id: 271538431n }],
    tags: ["Voice", "Utility"],
    settings,
    startAt: StartAt.DOMContentLoaded,

    start() {
        started = true;
        document.addEventListener("play", onAudioPlay, true);

        document.querySelectorAll<HTMLAudioElement>("audio").forEach(audio => {
            if (!audio.paused) void boostAudio(audio);
        });
    },

    stop() {
        started = false;
        document.removeEventListener("play", onAudioPlay, true);

        for (const session of Array.from(activeSessions)) {
            cleanupSession(session, true);
        }
    }
});