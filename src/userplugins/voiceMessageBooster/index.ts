/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 BreezeDelegate
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Logger } from "@utils/Logger";
import definePlugin, { makeRange, OptionType, PluginNative, StartAt } from "@utils/types";
import { React } from "@webpack/common";

const logger = new Logger("VoiceMessageBooster");
const Native = VencordNative.pluginHelpers.VoiceMessageBooster as PluginNative<typeof import("./native")>;

const MESSAGE_SELECTOR = '[id^="chat-messages-"], [data-list-item-id^="chat-messages"]';
const SOURCE_MARKER_SELECTOR = "[data-vmb-src]";
const BOOST_SCALE = 2.5;

interface BoostSession {
    original: HTMLAudioElement;
    context: AudioContext;
    buffer: AudioBuffer;
    gain: GainNode;
    limiter: DynamicsCompressorNode;
    source?: AudioBufferSourceNode;
    url: string;
    originalMuted: boolean;
    driftTimer: number;
    sourceStartedContextTime: number;
    sourceStartedMediaTime: number;
    onPause: () => void;
    onSeeking: () => void;
    onRateChange: () => void;
    onVolumeChange: () => void;
    onEnded: () => void;
}

const sessions = new WeakMap<HTMLAudioElement, BoostSession>();
const activeSessions = new Set<BoostSession>();
const preparingElements = new WeakSet<HTMLAudioElement>();
let audioContext: AudioContext | null = null;
let started = false;

function getAudioContext() {
    audioContext ??= new AudioContext({ latencyHint: "interactive" });
    return audioContext;
}

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
        description: "Volume multiplier for voice messages. Scale: 1 = x2.5, 2 = x5, 3 = x7.5, 4 = x10.",
        markers: makeRange(1, 4, 0.25),
        default: 2,
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
    const effectiveGain = Math.max(0, session.original.volume) * settings.store.multiplier * BOOST_SCALE;

    session.gain.disconnect();
    session.limiter.disconnect();

    session.gain.gain.cancelScheduledValues(now);
    session.gain.gain.setTargetAtTime(effectiveGain, now, 0.01);

    if (settings.store.limiter) {
        session.limiter.threshold.setValueAtTime(-2, now);
        session.limiter.knee.setValueAtTime(6, now);
        session.limiter.ratio.setValueAtTime(12, now);
        session.limiter.attack.setValueAtTime(0.002, now);
        session.limiter.release.setValueAtTime(0.15, now);
        session.gain.connect(session.limiter);
        session.limiter.connect(session.context.destination);
    } else {
        session.gain.connect(session.context.destination);
    }
}

function getMessageElement(audio: HTMLAudioElement) {
    return audio.closest<HTMLElement>(MESSAGE_SELECTOR);
}

function getPatchedVoiceMessageUrl(audio: HTMLAudioElement) {
    const message = getMessageElement(audio);
    const marker = message?.querySelector<HTMLElement>(SOURCE_MARKER_SELECTOR);
    const src = marker?.dataset.vmbSrc;
    return src || null;
}

function getVoiceMessageUrl(audio: HTMLAudioElement) {
    return getPatchedVoiceMessageUrl(audio) || audio.currentSrc || audio.src || null;
}

function classLooksLikeVoiceMessage(element: Element | null) {
    for (let current = element, depth = 0; current && depth < 10; current = current.parentElement, depth++) {
        const className = current.getAttribute("class") ?? "";
        if (/voice[-_ ]?message/i.test(className)) return true;
    }

    return false;
}

function urlLooksLikeVoiceMessage(rawUrl: string | null) {
    if (!rawUrl) return false;

    let url = rawUrl;
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
    return Boolean(getMessageElement(audio));
}

function isVoiceMessage(audio: HTMLAudioElement) {
    if (getPatchedVoiceMessageUrl(audio)) return true;
    if (urlLooksLikeVoiceMessage(getVoiceMessageUrl(audio)) || classLooksLikeVoiceMessage(audio)) return true;

    const message = getMessageElement(audio);
    if (message && hasVoiceMessageLabel(message)) return true;

    return settings.store.compatibilityMode && isMessageAudio(audio);
}

function stopSource(session: BoostSession) {
    const source = session.source;
    if (!source) return;

    session.source = undefined;
    source.onended = null;

    try {
        source.stop();
    } catch {
        // The source may already have ended.
    }

    try {
        source.disconnect();
    } catch {
        // The source may already be disconnected.
    }
}

function startSource(session: BoostSession) {
    const { original, buffer, context } = session;
    if (original.paused || original.ended) return false;

    const offset = Math.max(0, Math.min(original.currentTime, buffer.duration));
    if (!Number.isFinite(offset) || offset >= buffer.duration) return false;

    stopSource(session);

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.setValueAtTime(Math.max(0.1, original.playbackRate), context.currentTime);
    source.connect(session.gain);
    source.start(0, offset);

    session.source = source;
    session.sourceStartedContextTime = context.currentTime;
    session.sourceStartedMediaTime = offset;

    source.onended = () => {
        if (session.source !== source) return;
        session.source = undefined;
        try {
            source.disconnect();
        } catch { }
    };

    return true;
}

function cleanupSession(session: BoostSession, restoreOriginal = true) {
    activeSessions.delete(session);
    if (sessions.get(session.original) === session) sessions.delete(session.original);

    window.clearInterval(session.driftTimer);
    session.original.removeEventListener("pause", session.onPause);
    session.original.removeEventListener("seeking", session.onSeeking);
    session.original.removeEventListener("ratechange", session.onRateChange);
    session.original.removeEventListener("volumechange", session.onVolumeChange);
    session.original.removeEventListener("ended", session.onEnded);

    stopSource(session);

    try {
        session.gain.disconnect();
        session.limiter.disconnect();
    } catch { }

    if (restoreOriginal && session.original.isConnected) {
        session.original.muted = session.originalMuted;
    }
}

async function resumeSession(session: BoostSession) {
    const { context, original } = session;

    await syncOutputDevice(context, original);
    if (context.state === "suspended") await context.resume();

    configureGraph(session);
    if (startSource(session)) original.muted = true;
}

async function createSession(original: HTMLAudioElement, url: string) {
    const context = getAudioContext();
    await syncOutputDevice(context, original);
    if (context.state === "suspended") await context.resume();

    const bytes = await Native.fetchVoiceMessage(url);
    if (!bytes?.byteLength) throw new Error(`Native voice-message download failed for ${new URL(url).hostname}`);

    const encoded = new Uint8Array(bytes.byteLength);
    encoded.set(bytes);
    const buffer = await context.decodeAudioData(encoded.buffer);

    if (!started) throw new Error("Plugin stopped while preparing audio");
    if (getVoiceMessageUrl(original) !== url) throw new Error("Voice-message source changed while preparing audio");

    const gain = context.createGain();
    const limiter = context.createDynamicsCompressor();

    const session = {
        original,
        context,
        buffer,
        gain,
        limiter,
        url,
        originalMuted: original.muted,
        driftTimer: 0,
        sourceStartedContextTime: 0,
        sourceStartedMediaTime: 0,
        onPause: () => stopSource(session),
        onSeeking: () => {
            if (!original.paused) startSource(session);
        },
        onRateChange: () => {
            if (!original.paused) startSource(session);
        },
        onVolumeChange: () => configureGraph(session),
        onEnded: () => cleanupSession(session, true)
    } satisfies BoostSession;

    configureGraph(session);

    original.addEventListener("pause", session.onPause);
    original.addEventListener("seeking", session.onSeeking);
    original.addEventListener("ratechange", session.onRateChange);
    original.addEventListener("volumechange", session.onVolumeChange);
    original.addEventListener("ended", session.onEnded);

    sessions.set(original, session);
    activeSessions.add(session);

    session.driftTimer = window.setInterval(() => {
        if (!original.isConnected) {
            cleanupSession(session, false);
            return;
        }

        if (original.paused || !session.source) return;

        const elapsed = context.currentTime - session.sourceStartedContextTime;
        const expectedTime = session.sourceStartedMediaTime + elapsed * Math.max(0.1, original.playbackRate);
        if (Math.abs(original.currentTime - expectedTime) > 0.2) startSource(session);
    }, 500);

    if (!original.paused && startSource(session)) {
        original.muted = true;
        const actualMultiplier = Math.round(settings.store.multiplier * BOOST_SCALE * 100) / 100;
        logger.info(`Boost engine active at x${actualMultiplier} (${Math.round(buffer.duration * 100) / 100}s)`);
    }
}

async function boostAudio(audio: HTMLAudioElement) {
    if (!started || !isVoiceMessage(audio)) return;

    const url = getVoiceMessageUrl(audio);
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
        logger.error("Boosted playback could not start; Discord's original audio remains active", error);
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

    patches: [
        {
            // Discord's voice-message component already receives the canonical signed attachment
            // URL as arguments[0].src. Add an invisible marker next to its controls so the audio
            // event handler can use that exact URL instead of a blob/proxy currentSrc.
            find: "#{intl::VOICE_MESSAGES_PLAYBACK_RATE_LABEL}",
            replacement: {
                match: /(?<=onVolumeHide:\i\}\))/,
                replace: ",$self.renderSourceMarker(arguments[0].src)"
            }
        }
    ],

    renderSourceMarker(src: string) {
        if (typeof src !== "string" || !src) return null;
        return React.createElement("span", {
            "data-vmb-src": src,
            hidden: true
        });
    },

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

        for (const session of [...activeSessions]) cleanupSession(session, true);

        const context = audioContext;
        audioContext = null;
        if (context && context.state !== "closed") void context.close();
    }
});
