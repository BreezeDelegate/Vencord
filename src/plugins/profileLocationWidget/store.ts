/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 BreezeDelegate
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";

import type { GeocodeCandidate, SavedLocation } from "./types";

const DATA_KEY = "ProfileLocationWidget.locations.v1";

let locations: Record<string, SavedLocation> = {};
const listeners = new Set<() => void>();

function emit() {
    for (const listener of listeners) listener();
}

function isSavedLocation(value: unknown): value is SavedLocation {
    if (!value || typeof value !== "object") return false;
    const candidate = value as Partial<SavedLocation>;
    return typeof candidate.label === "string"
        && typeof candidate.lat === "number"
        && Number.isFinite(candidate.lat)
        && typeof candidate.lng === "number"
        && Number.isFinite(candidate.lng)
        && typeof candidate.timezone === "string"
        && typeof candidate.zoom === "number"
        && Number.isFinite(candidate.zoom)
        && typeof candidate.updatedAt === "number";
}

export async function hydrateLocations() {
    const stored = await DataStore.get<Record<string, unknown>>(DATA_KEY);
    if (!stored || typeof stored !== "object") {
        locations = {};
        emit();
        return;
    }

    locations = Object.fromEntries(
        Object.entries(stored).filter(([, value]) => isSavedLocation(value))
    ) as Record<string, SavedLocation>;
    emit();
}

export function subscribeLocations(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

export function getLocation(userId: string) {
    return locations[userId] ?? null;
}

export async function saveLocation(userId: string, candidate: GeocodeCandidate) {
    locations = {
        ...locations,
        [userId]: {
            ...candidate,
            updatedAt: Date.now()
        }
    };
    emit();
    await DataStore.set(DATA_KEY, locations);
}

export async function removeLocation(userId: string) {
    if (!(userId in locations)) return;
    const next = { ...locations };
    delete next[userId];
    locations = next;
    emit();
    await DataStore.set(DATA_KEY, locations);
}
