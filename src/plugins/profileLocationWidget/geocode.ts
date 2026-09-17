/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 BreezeDelegate
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { normalizeNominatimResult } from "./model";
import type { GeocodeCandidate, NominatimResult } from "./types";

const SEARCH_ENDPOINT = "https://nominatim.openstreetmap.org/search";
const cache = new Map<string, GeocodeCandidate[]>();

export async function searchLocations(query: string, signal?: AbortSignal) {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 2) return [];

    const cacheKey = normalizedQuery.toLocaleLowerCase();
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const url = new URL(SEARCH_ENDPOINT);
    url.searchParams.set("q", normalizedQuery);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("limit", "6");

    const response = await fetch(url, {
        signal,
        headers: {
            Accept: "application/json",
            "Accept-Language": navigator.language || "en"
        }
    });
    if (!response.ok) throw new Error(`Location search failed (${response.status})`);

    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) return [];

    const candidates = payload
        .map(item => normalizeNominatimResult(item as NominatimResult))
        .filter((item): item is GeocodeCandidate => item != null);

    cache.set(cacheKey, candidates);
    return candidates;
}
