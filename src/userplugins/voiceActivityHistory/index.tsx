/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 BreezeDelegate
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import * as DataStore from "@api/DataStore";
import { Settings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { Microphone } from "@components/Icons";
import { LegacySafeModal } from "@components/LegacySafeModal";
import definePlugin from "@utils/types";
import { ApplicationStreamingStore, ApplicationStreamPreviewStore, ChannelStore, openModal, PresenceStore, SelectedChannelStore, SelectedGuildStore, useEffect, UserStore, useState, useStateFromStores, VoiceStateStore } from "@webpack/common";

import { compactEvents, diffVoice, snapshot, VoiceEvent, VoiceEventKind, VoiceSnapshot, VoiceUpdate } from "./model";

const KEY = "BreezeVoiceActivityHistory.v1";
const CAPTURE_INTERVAL = 2 * 60 * 1000;
const capturedAt = new Map<string, number>();
const listeners = new Set<() => void>();
const voiceStates = new Map<string, VoiceSnapshot>();
const games = new Map<string, string>();
let tracked: Record<string, boolean> = {};
let history: Record<string, VoiceEvent[]> = {};
let ready = false;
let active = false;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let gameTimer: ReturnType<typeof setInterval> | undefined;

type Saved = { tracked: Record<string, boolean>; history: Record<string, VoiceEvent[]>; };

const kinds: Record<VoiceEventKind, string> = {
    join: "A rejoint",
    leave: "A quitté",
    move: "A changé de salon",
    mute: "Micro coupé",
    unmute: "Micro réactivé",
    deafen: "Son coupé",
    undeafen: "Son réactivé",
    "stream-start": "Partage d'écran lancé",
    "stream-stop": "Partage d'écran arrêté",
    "camera-start": "Caméra activée",
    "camera-stop": "Caméra désactivée",
    game: "Jeu détecté",
    "stream-preview": "Aperçu du stream"
};

function notify() {
    for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

function filteredEvents(guildId: string) {
    return compactEvents(history[guildId] ?? []);
}

function compactHistory() {
    let changed = false;
    for (const guildId of Object.keys(history)) {
        const old = history[guildId];
        const clean = filteredEvents(guildId);
        if (old.length !== clean.length || old.some((item, i) => Boolean(item.preview) !== Boolean(clean[i]?.preview))) {
            history[guildId] = clean;
            changed = true;
        }
    }
    if (changed) scheduleSave();
}

function flush() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = undefined;
    if (!ready) return;
    const state: Saved = { tracked, history };
    void DataStore.set(KEY, state).catch(error => console.error("[VoiceActivityHistory] Local save failed", error));
}

function scheduleSave() {
    if (!active || !ready) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 800);
}

function append(event: VoiceEvent) {
    const { guildId } = event;
    history[guildId] = compactEvents([...filteredEvents(guildId), event]);
    scheduleSave();
    notify();
}

function seedGuild(guildId: string) {
    for (const [key] of voiceStates) if (key.startsWith(guildId + ":")) voiceStates.delete(key);
    for (const [key] of games) if (key.startsWith(guildId + ":")) games.delete(key);
    const states = VoiceStateStore.getVoiceStates(guildId) ?? {};
    for (const [userId, value] of Object.entries(states)) {
        const current = value as VoiceUpdate & { userId?: string; };
        if (current.channelId) {
            voiceStates.set(guildId + ":" + (current.userId ?? userId), snapshot(current));
        }
    }
}

async function hydrate() {
    try {
        const saved = await DataStore.get<Saved>(KEY);
        if (!active) return;
        tracked = saved?.tracked && typeof saved.tracked === "object" ? saved.tracked : {};
        history = {};
        if (saved?.history && typeof saved.history === "object") {
            for (const [guildId, items] of Object.entries(saved.history)) {
                if (Array.isArray(items)) {
                    history[guildId] = compactEvents(items.filter(item => item && typeof item.at === "number" && typeof item.kind === "string"));
                }
            }
        }
        for (const guildId of Object.keys(tracked)) if (tracked[guildId]) seedGuild(guildId);
    } catch (error) {
        console.error("[VoiceActivityHistory] Failed to load local data", error);
    } finally {
        ready = active;
        if (ready) compactHistory();
        notify();
    }
}

function setTracking(guildId: string, value: boolean) {
    if (!ready) return;
    tracked = { ...tracked, [guildId]: value };
    if (value) seedGuild(guildId);
    else {
        for (const key of voiceStates.keys()) if (key.startsWith(guildId + ":")) { voiceStates.delete(key); capturedAt.delete(key); }
    }
    scheduleSave();
    notify();
}

function clearHistory(guildId: string) {
    history = { ...history, [guildId]: [] };
    scheduleSave();
    notify();
}

interface StateChange extends VoiceUpdate {
    guildId?: string;
    userId: string;
}

function handleVoiceUpdates(states: StateChange[]) {
    if (!ready || !Array.isArray(states)) return;
    for (const state of states) {
        if (!state || typeof state.userId !== "string") continue;
        const guildId = state.guildId
            ?? (state.channelId ? ChannelStore.getChannel(state.channelId)?.guild_id : undefined)
            ?? (state.oldChannelId ? ChannelStore.getChannel(state.oldChannelId)?.guild_id : undefined);
        if (!guildId || !tracked[guildId]) continue;

        const key = guildId + ":" + state.userId;
        const before = voiceStates.get(key) ?? (state.oldChannelId ? { channelId: state.oldChannelId, mute: Boolean(state.mute || state.selfMute), deaf: Boolean(state.deaf || state.selfDeaf), stream: Boolean(state.selfStream), video: Boolean(state.selfVideo) } : undefined);
        const after = snapshot(state);
        for (const event of diffVoice(guildId, state.userId, before, after)) {
            append(event);
            if (event.kind === "stream-stop") capturedAt.delete(key);
            if (event.kind === "stream-start" && event.channelId) {
                setTimeout(() => void capturePreview(guildId, state.userId, event.channelId!), 15000);
            }
        }
        if (after.channelId) voiceStates.set(key, after);
        else {
            voiceStates.delete(key);
            games.delete(key);
            capturedAt.delete(key);
        }
    }
}

async function capturePreview(guildId: string, userId: string, channelId: string) {
    const key = guildId + ":" + userId;
    if (!active || !ready || !tracked[guildId]) return;
    const before = capturedAt.get(key) ?? 0;
    if (Date.now() - before < CAPTURE_INTERVAL) return;
    capturedAt.set(key, Date.now());

    try {
        const stream = ApplicationStreamingStore.getAnyStreamForUser(userId);
        if (!stream || stream.guildId !== guildId || stream.channelId !== channelId) return;
        const url = await ApplicationStreamPreviewStore.getPreviewURL(stream.guildId, stream.channelId, stream.ownerId);
        if (!url || !tracked[guildId] || !active || !voiceStates.get(key)?.stream) return;

        const response = await fetch(url, { mode: "cors", credentials: "omit" });
        if (!response.ok) return;
        const blob = await response.blob();
        if (!blob.type.startsWith("image/") || blob.size > 4_000_000) return;
        const bitmap = await createImageBitmap(blob);
        const canvas = document.createElement("canvas");
        const scale = Math.min(480 / bitmap.width, 270 / bitmap.height, 1);
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) { bitmap.close(); return; }
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
        const preview = canvas.toDataURL("image/webp", 0.58);
        if (preview.length > 100_000 || !preview.startsWith("data:image/webp;")) return;
        if (!tracked[guildId] || !active || !voiceStates.get(key)?.stream) return;
        append({
            id: Date.now() + ":" + userId + ":preview",
            at: Date.now(),
            guildId, userId,
            kind: "stream-preview",
            channelId,
            preview
        });
    } catch {
        // Discord previews may be unavailable or cross-origin restricted.
    }
}

function checkGames() {
    if (!ready) return;
    compactHistory();
    for (const [key, state] of voiceStates) {
        if (!state.channelId) continue;
        const split = key.indexOf(":");
        const guildId = key.slice(0, split);
        const userId = key.slice(split + 1);
        if (!tracked[guildId]) continue;
        if (state.stream && Date.now() - (capturedAt.get(key) ?? 0) >= CAPTURE_INTERVAL) {
            void capturePreview(guildId, userId, state.channelId);
        }
        const activities = PresenceStore.getActivities(userId) ?? [];
        const game = activities.find(activity => activity.type === 0 && activity.name)?.name ?? "";
        const oldGame = games.get(key);
        games.set(key, game);
        if (game && game !== oldGame) {
            append({ id: Date.now() + ":" + userId + ":game", at: Date.now(), guildId, userId, kind: "game", channelId: state.channelId, detail: game.slice(0, 100) });
        }
    }
}

function VoiceHistoryPanel({ guildId, close, showHeader = true }: { guildId: string; close: () => void; showHeader?: boolean; }) {
    const [filter, setFilter] = useState("all");
    useStateFromStores([SelectedGuildStore], () => SelectedGuildStore.getGuildId());
    const [confirmClear, setConfirmClear] = useState(false);

    // DataStore does not expose a Flux store; subscribe to local history updates.
    const [revision, setRevision] = useState(0);
    useEffect(() => subscribe(() => setRevision(value => value + 1)), []);
    void revision;

    const enabled = Boolean(tracked[guildId]);
    const all = filteredEvents(guildId).slice().reverse();
    const rows = filter === "all" ? all : all.filter(item => {
        if (filter === "movement") return ["join", "leave", "move"].includes(item.kind);
        if (filter === "audio") return ["mute", "unmute", "deafen", "undeafen"].includes(item.kind);
        if (filter === "stream") return ["stream-start", "stream-stop", "stream-preview", "camera-start", "camera-stop"].includes(item.kind);
        return item.kind === "game";
    });

    return (
        <div className="vc-vah-panel">
            {showHeader && <div className="vc-vah-head">
                <strong>Historique vocal</strong>
                <button type="button" onClick={close} className="vc-vah-close">Fermer</button>
            </div>}
            {!ready ? <div className="vc-vah-empty">Chargement...</div>
                : !enabled ? (
                    <div className="vc-vah-onboarding">
                        <strong>Traquer ce serveur</strong>
                        <p>Conserver localement les entrées, sorties, déplacements, micros, streams et jeux détectés pendant que Discord est ouvert. Les aperçus de streams visibles dans Discord sont enregistrés temporairement en miniatures. Aucun historique n'est envoyé hors de cet appareil.</p>
                        <button className="vc-vah-primary" type="button" onClick={() => setTracking(guildId, true)}>Activer le suivi</button>
                    </div>
                ) : (
                    <>
                        <div className="vc-vah-tools">
                            <select value={filter} onChange={event => setFilter(event.currentTarget.value)} aria-label="Filtrer les événements">
                                <option value="all">Tous les événements</option>
                                <option value="movement">Entrées, sorties, déplacements</option>
                                <option value="audio">Micro et son</option>
                                <option value="stream">Stream et caméra</option>
                                <option value="game">Jeux</option>
                            </select>
                            <span>{rows.length} événement{rows.length !== 1 ? "s" : ""}</span>
                        </div>
                        <div className="vc-vah-list" role="log" aria-label="Historique des activités vocales">
                            {rows.length ? rows.map(item => (
                                <div className="vc-vah-row" key={item.id}>
                                    <div className="vc-vah-row-main">
                                        <strong>{UserStore.getUser(item.userId)?.globalName ?? UserStore.getUser(item.userId)?.username ?? item.userId}</strong>
                                        <span>{kinds[item.kind] ?? item.kind}</span>
                                    </div>
                                    {(item.kind === "move" || item.channelId) && (
                                        <div className="vc-vah-meta">
                                            {item.kind === "move" && item.fromChannelId ? (ChannelStore.getChannel(item.fromChannelId)?.name ?? "Salon inconnu") + " → " : ""}
                                            {item.channelId ? ChannelStore.getChannel(item.channelId)?.name ?? "Salon inconnu" : ""}
                                            {item.detail ? " · " + item.detail : ""}
                                        </div>
                                    )}
                                    {item.preview && <img className="vc-vah-preview" src={item.preview} alt="Aperçu temporaire du partage d’écran" loading="lazy" />}
                                    <time className="vc-vah-date" dateTime={new Date(item.at).toISOString()}>{new Date(item.at).toLocaleString()}</time>
                                </div>
                            )) : <div className="vc-vah-empty">Aucune activité enregistrée pour ce filtre.</div>}
                        </div>
                        <div className="vc-vah-foot">
                            <button type="button" onClick={() => setTracking(guildId, false)}>Arrêter le suivi</button>
                            {!confirmClear
                                ? <button type="button" onClick={() => setConfirmClear(true)}>Effacer l'historique</button>
                                : <button type="button" onClick={() => { clearHistory(guildId); setConfirmClear(false); }}>Confirmer la suppression</button>}
                        </div>
                        <p className="vc-vah-note">Local uniquement · événements : 30 jours · captures WebP : 24 heures et 20 maximum par serveur · aucun enregistrement audio ou vidéo.</p>
                    </>
                )}
        </div>
    );
}

function VoiceHistoryButton() {
    const guildId = useStateFromStores(
        [SelectedGuildStore, SelectedChannelStore],
        () => SelectedGuildStore.getGuildId() ?? ChannelStore.getChannel(SelectedChannelStore.getChannelId())?.guild_id
    );
    if (!guildId) return null;

    const openHistory = () => openModal(modalProps => (
        <LegacySafeModal {...modalProps} title="Historique vocal" size="lg">
            <VoiceHistoryPanel guildId={guildId} close={modalProps.onClose} showHeader={false} />
        </LegacySafeModal>
    ));

    return (
        <button
            type="button"
            className="vc-vah-button"
            onClick={openHistory}
            title="Historique vocal"
            aria-label="Historique vocal"
            aria-haspopup="dialog"
        >
            <Microphone width={20} height={20} />
        </button>
    );
}

export default definePlugin({
    name: "VoiceActivityHistory",
    description: "Opt-in local voice activity history per server.",
    tags: ["Voice", "Utility"],
    authors: [{ name: "BreezeDelegate", id: 271538431n }],
    enabledByDefault: true,
    patches: [{
        find: '?"BACK_FORWARD_NAVIGATION":',
        predicate: () => !Settings.plugins.VencordToolbox.enabled,
        replacement: {
            // Follow the proven native toolbar anchor used by VencordToolbox.
            match: /(trailing:.{0,50}?)\i.Fragment,(?=\{children:\[)/,
            replace: "$1$self.TrailingWrapper,"
        }
    }],
    TrailingWrapper({ children }: { children?: React.ReactNode; }) {
        return <>
            {children}
            <ErrorBoundary noop key="vc-voice-history"><VoiceHistoryButton /></ErrorBoundary>
        </>;
    },
    renderHeaderButton() {
        return (
            <ErrorBoundary noop key="vc-voice-history">
                <VoiceHistoryButton />
            </ErrorBoundary>
        );
    },
    flux: {
        VOICE_STATE_UPDATES({ voiceStates }: { voiceStates: StateChange[]; }) {
            handleVoiceUpdates(voiceStates);
        }
    },
    start() {
        active = true;
        void hydrate();
        gameTimer = setInterval(checkGames, 30000);
    },
    stop() {
        if (saveTimer) flush();
        if (gameTimer) clearInterval(gameTimer);
        gameTimer = undefined;
        active = false;
        ready = false;
        tracked = {};
        history = {};
        voiceStates.clear();
        games.clear();
        capturedAt.clear();
        notify();
    }
});
