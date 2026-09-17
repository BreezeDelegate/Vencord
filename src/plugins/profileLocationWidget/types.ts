/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 BreezeDelegate
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface SavedLocation {
    label: string;
    lat: number;
    lng: number;
    timezone: string;
    zoom: number;
    updatedAt: number;
}

export interface GeocodeCandidate extends Omit<SavedLocation, "updatedAt"> { }

export interface NominatimResult {
    lat?: string | number;
    lon?: string | number;
    name?: string;
    type?: string;
    display_name?: string;
    address?: Record<string, unknown>;
}
