/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 BreezeDelegate
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { diffVoice, snapshot } from "../src/userplugins/voiceActivityHistory/model";

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
