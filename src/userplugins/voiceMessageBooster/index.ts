/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 BreezeDelegate
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Logger } from "@utils/Logger";
import definePlugin, { makeRange, OptionType, StartAt } from "@utils/types";

const logger = new Logger("VoiceMessageBooster");

interface AudioGraph {
    context: AudioContext;
    source: MediaElementAudioSourceNode;
    gain: GainNode;
    limiter: DynamicsCompressorNode;
}

const graphs = new WeakMap<HTMLAudioElement, AudioGraph>();
const failedElements = new WeakSet<HTMLAudioElement>();
let audioContext: AudioContext | null = null;
let started = false;

function rescanPlayingAudio() {
    if (!started) return;

    document.querySelectorAll<HTMLAudioElement>("audio").forEach(audio => {
        if (!audio.paused) void boostAudio(audio);
    });
}

function refreshConnectedAudio() {
    document.querySelectorAll<HTMLAudioElement>("audio").forEach(audio => {
        const graph = graphs.get(audio);
        if (graph) configureGraph(graph, started);
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

function configureGraph(graph: AudioGraph, enableBoost: boolean) {
    const now = graph.context.currentTime;

    graph.source.disconnect();
    graph.gain.disconnect();
    graph.limiter.disconnect();

    if (!enableBoost) {
        graph.source.connect(graph.context.destination);
        return;
    }

    graph.gain.gain.cancelScheduledValues(now);
    graph.gain.gain.setTargetAtTime(settings.store.multiplier, now, 0.01);
    graph.source.connect(graph.gain);

    if (settings.store.limiter) {
        graph.limiter.threshold.setValueAtTime(-2, now);
        graph.limiter.knee.setValueAtTime(8, now);
        graph.limiter.ratio.setValueAtTime(16, now);
        graph.limiter.attack.setValueAtTime(0.003, now);
        graph.limiter.release.setValueAtTime(0.2, now);
        graph.gain.connect(graph.limiter);
        graph.limiter.connect(graph.context.destination);
    } else {
        graph.gain.connect(graph.context.destination);
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

async function boostAudio(audio: HTMLAudioElement) {
    if (!started || failedElements.has(audio) || !isVoiceMessage(audio)) return;

    const context = getAudioContext();
    await syncOutputDevice(context, audio);
    if (context.state === "suspended") await context.resume();

    let graph = graphs.get(audio);
    if (!graph) {
        try {
            graph = {
                context,
                source: context.createMediaElementSource(audio),
                gain: context.createGain(),
                limiter: context.createDynamicsCompressor()
            };
            graphs.set(audio, graph);
        } catch (error) {
            failedElements.add(audio);
            logger.error("Failed to connect a voice-message player to the Web Audio API", error);
            return;
        }
    }

    configureGraph(graph, true);
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
        refreshConnectedAudio();
    }
});
