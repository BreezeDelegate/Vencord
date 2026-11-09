/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 BreezeDelegate
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const SEARCH_ENDPOINT = "https://nominatim.openstreetmap.org/search";

export function buildNominatimSearchUrl(query: string, language: string) {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 2) throw new Error("Enter at least 2 characters");
    if (normalizedQuery.length > 200) throw new Error("Location search is too long");

    const url = new URL(SEARCH_ENDPOINT);
    url.searchParams.set("q", normalizedQuery);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("limit", "6");
    url.searchParams.set("accept-language", language || "en");
    return url.toString();
}
