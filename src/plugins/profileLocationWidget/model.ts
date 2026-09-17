/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 BreezeDelegate
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import tzLookup from "tz-lookup";

import type { GeocodeCandidate, NominatimResult } from "./types";

const CITY_TYPES = new Set(["city", "town", "municipality"]);
const LOCAL_TYPES = new Set(["village", "hamlet", "suburb", "neighbourhood", "quarter"]);
const REGION_TYPES = new Set(["state", "region", "province", "county"]);
const COUNTRY_TYPES = new Set(["country"]);

function pickLocality(address: Record<string, unknown> | undefined, fallback: string | undefined) {
    if (!address) return fallback;

    const value = address.city
        ?? address.town
        ?? address.village
        ?? address.municipality
        ?? address.hamlet
        ?? address.suburb
        ?? address.county
        ?? address.state;

    return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function pickCountry(address: Record<string, unknown> | undefined) {
    const value = address?.country;
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function zoomForNominatimType(type: string | undefined) {
    const normalized = type?.toLowerCase();
    if (!normalized) return 11;
    if (COUNTRY_TYPES.has(normalized)) return 5;
    if (REGION_TYPES.has(normalized)) return 7;
    if (CITY_TYPES.has(normalized)) return 10;
    if (LOCAL_TYPES.has(normalized)) return 12;
    return 11;
}

export function normalizeNominatimResult(raw: NominatimResult): GeocodeCandidate | null {
    const lat = Number(raw.lat);
    const lng = Number(raw.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

    const address = raw.address && typeof raw.address === "object" ? raw.address : undefined;
    const fallbackName = typeof raw.name === "string" && raw.name.trim()
        ? raw.name.trim()
        : typeof raw.display_name === "string"
            ? raw.display_name.split(",")[0]?.trim()
            : undefined;
    const locality = pickLocality(address, fallbackName);
    const country = pickCountry(address);
    const label = [locality, country].filter((part, index, values) => part && values.indexOf(part) === index).join(", ")
        || (typeof raw.display_name === "string" ? raw.display_name.trim() : "")
        || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

    let timezone: string;
    try {
        timezone = tzLookup(lat, lng);
    } catch {
        timezone = "UTC";
    }

    return {
        label,
        lat,
        lng,
        timezone,
        zoom: zoomForNominatimType(raw.type)
    };
}

export function formatLocationClock(date: Date, timezone: string) {
    try {
        return new Intl.DateTimeFormat("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
            timeZone: timezone,
            timeZoneName: "shortOffset"
        }).format(date);
    } catch {
        return new Intl.DateTimeFormat("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
            timeZone: "UTC",
            timeZoneName: "shortOffset"
        }).format(date);
    }
}
