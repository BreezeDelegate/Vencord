/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 BreezeDelegate
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { compactEvents, diffVoice, snapshot } from "../src/userplugins/voiceActivityHistory/model";

const base = { channelId: null, mute: false, deaf: false, stream: false, video: false };

test("new participant joins once and duplicate updates do not create events", () => {
    const joined = snapshot({ channelId: "voice1" });
    assert.deepEqual(diffVoice("guild1", "user1", undefined, joined, 10).map(e => e.kind), ["join"]);
    assert.deepEqual(diffVoice("guild1", "user1", joined, joined, 20), []);
});

test("move is a single event containing old and new voice rooms", () => {
    const from = { ...base, channelId: "voice1" };
    const to = { ...from, channelId: "voice2" };
    const [event] = diffVoice("guild1", "user1", from, to, 11);
    assert.equal(event.kind, "move");
    assert.equal(event.fromChannelId, "voice1");
    assert.equal(event.channelId, "voice2");
});

test("leave, self mute, server mute, unmute and deafening are explicit", () => {
    const joined = { ...base, channelId: "voice1" };
    assert.deepEqual(diffVoice("g", "u", joined, { ...joined, mute: true }, 1).map(e => e.kind), ["mute"]);
    assert.deepEqual(diffVoice("g", "u", { ...joined, mute: true }, joined, 2).map(e => e.kind), ["unmute"]);
    assert.deepEqual(diffVoice("g", "u", joined, { ...joined, deaf: true }, 3).map(e => e.kind), ["deafen"]);
    assert.deepEqual(diffVoice("g", "u", joined, base, 4).map(e => e.kind), ["leave"]);
    assert.equal(snapshot({ channelId: "voice1", mute: true }).mute, true);
    assert.equal(snapshot({ channelId: "voice1", selfMute: true }).mute, true);
});

test("stream and camera transitions are independent", () => {
    const joined = { ...base, channelId: "voice1" };
    assert.deepEqual(diffVoice("g", "u", joined, { ...joined, stream: true, video: true }, 1).map(e => e.kind), ["stream-start", "camera-start"]);
    assert.deepEqual(diffVoice("g", "u", { ...joined, stream: true, video: true }, joined, 2).map(e => e.kind), ["stream-stop", "camera-stop"]);
});

test("disabled and startup baseline are handled without synthetic history", () => {
    const baseline = snapshot({ channelId: "voice1", selfMute: true });
    assert.ok(baseline.channelId);
    assert.equal(diffVoice("g", "u", baseline, baseline).length, 0);
});

test("retention keeps recent events, expires old previews and limits stored images", () => {
    const now = Date.now();
    const events = Array.from({ length: 35 }, (_, index) => ({
        id: String(index),
        at: now - (index === 0 ? 25 * 60 * 60 * 1000 : index * 1000),
        guildId: "g",
        userId: "u",
        kind: "stream-preview" as const,
        preview: "data:image/webp;base64,AAAA"
    }));
    const kept = compactEvents(events, now, 1500, 20);
    assert.equal(kept.length, 35);
    assert.equal(kept.filter(e => e.preview).length, 20);
    assert.equal(kept[0].preview, undefined);
    assert.ok(events[0].preview, "original events must not be mutated");
    assert.equal(compactEvents([{ ...events[1], at: now - 31 * 24 * 60 * 60 * 1000 }], now).length, 0);
    assert.equal(compactEvents(events, now, 3).length, 3);
});

test("both toolbar patch orders preserve voice and toolbox buttons", () => {
    const original = "trailing:a.Fragment,{children:[icon1,icon2]}";
    const voicePattern = /(trailing:.{0,180}?\{children:\[)/;
    const toolboxPattern = /(trailing:.{0,50}?)a\.Fragment,(?=\{children:\[)/;
    const voice = (code: string) => code.replace(voicePattern, "$1VoiceActivityHistory.renderHeaderButton(),");
    const toolbox = (code: string) => code.replace(toolboxPattern, "$1VencordToolbox.TrailingWrapper,");
    for (const patched of [voice(toolbox(original)), toolbox(voice(original))]) {
        assert.match(patched, /VoiceActivityHistory\.renderHeaderButton/);
        assert.match(patched, /VencordToolbox\.TrailingWrapper/);
    }
});
