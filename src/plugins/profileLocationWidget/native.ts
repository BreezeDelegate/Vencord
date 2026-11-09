/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 BreezeDelegate
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { VENCORD_USER_AGENT } from "@shared/vencordUserAgent";
import { IpcMainInvokeEvent } from "electron";

import { buildNominatimSearchUrl } from "./geocodeRequest";
import type { NominatimResult } from "./types";

const CACHE_TTL = 30 * 60 * 1000;
const cache = new Map<string, { expiresAt: number; results: NominatimResult[]; }>();
let nextRequestAt = 0;
let requestQueue = Promise.resolve();

function wait(milliseconds: number) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}

export async function searchLocations(_: IpcMainInvokeEvent, query: string, language: string) {
    const url = buildNominatimSearchUrl(query, language);
    const cached = cache.get(url);
    if (cached && cached.expiresAt > Date.now()) return cached.results;

    let resolveResult: (value: NominatimResult[]) => void;
    let rejectResult: (reason: unknown) => void;
    const result = new Promise<NominatimResult[]>((resolve, reject) => {
        resolveResult = resolve;
        rejectResult = reject;
    });

    requestQueue = requestQueue.then(async () => {
        try {
            const remainingDelay = nextRequestAt - Date.now();
            if (remainingDelay > 0) await wait(remainingDelay);
            nextRequestAt = Date.now() + 1000;

            const response = await fetch(url, {
                headers: {
                    Accept: "application/json",
                    "User-Agent": VENCORD_USER_AGENT
                }
            });
            if (!response.ok) throw new Error(`Location search failed (${response.status})`);

            const payload: unknown = await response.json();
            if (!Array.isArray(payload)) throw new Error("Location search returned invalid data");

            const results = payload as NominatimResult[];
            cache.set(url, { expiresAt: Date.now() + CACHE_TTL, results });
            resolveResult(results);
        } catch (error) {
            rejectResult(error);
        }
    });

    return result;
}
