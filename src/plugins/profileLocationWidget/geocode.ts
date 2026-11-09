/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 BreezeDelegate
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { PluginNative } from "@utils/types";

import { normalizeNominatimResult } from "./model";
import type { GeocodeCandidate, NominatimResult } from "./types";

const cache = new Map<string, GeocodeCandidate[]>();
const Native = VencordNative.pluginHelpers.ProfileLocationWidget as PluginNative<typeof import("./native")> | undefined;

export async function searchLocations(query: string) {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 2) return [];

    const cacheKey = normalizedQuery.toLocaleLowerCase();
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    if (!Native?.searchLocations) throw new Error("Location search requires the Discord desktop app");
    const payload = await Native.searchLocations(normalizedQuery, navigator.language || "en");

    const candidates = payload
        .map(item => normalizeNominatimResult(item as NominatimResult))
        .filter((item): item is GeocodeCandidate => item != null);

    cache.set(cacheKey, candidates);
    return candidates;
}
