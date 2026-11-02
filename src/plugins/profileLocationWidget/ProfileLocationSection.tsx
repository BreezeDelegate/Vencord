/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 BreezeDelegate
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useEffect, useMemo, useState } from "@webpack/common";

import { searchLocations } from "./geocode";
import { formatLocationClock } from "./model";
import { getLocation, removeLocation, saveLocation, subscribeLocations } from "./store";
import type { GeocodeCandidate, SavedLocation } from "./types";

const TILE_SIZE = 256;
const MAX_MERCATOR_LAT = 85.05112878;

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function tileCount(zoom: number) {
    return 2 ** zoom;
}

function longitudeToTileX(longitude: number, zoom: number) {
    return (longitude + 180) / 360 * tileCount(zoom);
}

function latitudeToTileY(latitude: number, zoom: number) {
    const bounded = clamp(latitude, -MAX_MERCATOR_LAT, MAX_MERCATOR_LAT);
    const radians = bounded * Math.PI / 180;
    return (1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2 * tileCount(zoom);
}

function tileXToLongitude(x: number, zoom: number) {
    return x / tileCount(zoom) * 360 - 180;
}

function tileYToLatitude(y: number, zoom: number) {
    const n = Math.PI - 2 * Math.PI * y / tileCount(zoom);
    return 180 / Math.PI * Math.atan(Math.sinh(n));
}

function LocationPinIcon({ size = 16 }: { size?: number; }) {
    return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M20 10c0 5-5.5 11-8 12.5C9.5 21 4 15 4 10a8 8 0 1 1 16 0Z" stroke="currentColor" strokeWidth="2" /><circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="2" /></svg>;
}

function EditIcon() {
    return <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="m14.7 6.3 3 3M4 20l4.2-1 10.5-10.5a2.1 2.1 0 0 0-3-3L5.2 16 4 20Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function ExternalIcon() {
    return <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M14 5h5v5M19 5l-8 8M19 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function useSavedLocation(userId: string) {
    const [location, setLocation] = useState<SavedLocation | null>(() => getLocation(userId));
    useEffect(() => {
        setLocation(getLocation(userId));
        return subscribeLocations(() => setLocation(getLocation(userId)));
    }, [userId]);
    return location;
}

function useLocationClock(timezone: string | undefined) {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        if (!timezone) return;
        const timer = window.setInterval(() => setNow(new Date()), 30_000);
        return () => window.clearInterval(timer);
    }, [timezone]);
    return timezone ? formatLocationClock(now, timezone) : "";
}

type MapView = Pick<SavedLocation, "lat" | "lng" | "zoom">;

function LocationMap({ location }: { location: SavedLocation; }) {
    const [view, setView] = useState<MapView>(() => ({
        lat: location.lat,
        lng: location.lng,
        zoom: location.zoom
    }));

    useEffect(() => {
        setView({ lat: location.lat, lng: location.lng, zoom: location.zoom });
    }, [location.lat, location.lng, location.zoom]);

    const tiles = useMemo(() => {
        const x = longitudeToTileX(view.lng, view.zoom);
        const y = latitudeToTileY(view.lat, view.zoom);
        const baseX = Math.floor(x);
        const baseY = Math.floor(y);
        const fractionX = x - baseX;
        const fractionY = y - baseY;
        const count = tileCount(view.zoom);
        const result: Array<{ key: string; x: number; y: number; left: number; top: number; }> = [];

        for (let dy = -1; dy <= 1; dy++) {
            const rawY = baseY + dy;
            if (rawY < 0 || rawY >= count) continue;

            for (let dx = -2; dx <= 2; dx++) {
                const rawX = baseX + dx;
                const wrappedX = ((rawX % count) + count) % count;
                result.push({
                    key: `${view.zoom}:${rawX}:${rawY}`,
                    x: wrappedX,
                    y: rawY,
                    left: (dx - fractionX) * TILE_SIZE,
                    top: (dy - fractionY) * TILE_SIZE
                });
            }
        }

        return result;
    }, [view.lat, view.lng, view.zoom]);

    function pan(deltaX: number, deltaY: number) {
        setView(current => {
            const x = longitudeToTileX(current.lng, current.zoom) + deltaX;
            const y = clamp(latitudeToTileY(current.lat, current.zoom) + deltaY, 0, tileCount(current.zoom));
            return {
                ...current,
                lat: tileYToLatitude(y, current.zoom),
                lng: tileXToLongitude(x, current.zoom)
            };
        });
    }

    function zoom(delta: number) {
        setView(current => ({ ...current, zoom: clamp(current.zoom + delta, 3, 17) }));
    }

    return <div className="vc-plw-map" role="img" aria-label={`Map centered near ${location.label}`}>
        <div className="vc-plw-tile-layer">
            {tiles.map(tile => <img
                aria-hidden="true"
                className="vc-plw-tile"
                draggable={false}
                key={tile.key}
                src={`https://tile.openstreetmap.org/${view.zoom}/${tile.x}/${tile.y}.png`}
                style={{
                    left: `calc(50% + ${tile.left}px)`,
                    top: `calc(50% + ${tile.top}px)`
                }}
            />)}
        </div>
        <span className="vc-plw-map-pin" aria-hidden="true" />
        <div className="vc-plw-map-nav" aria-label="Map navigation">
            <button type="button" className="vc-plw-nav-button" aria-label="Zoom in" onClick={() => zoom(1)}>+</button>
            <button type="button" className="vc-plw-nav-button" aria-label="Zoom out" onClick={() => zoom(-1)}>−</button>
            <button type="button" className="vc-plw-nav-button" aria-label="Pan left" onClick={() => pan(-0.45, 0)}>←</button>
            <button type="button" className="vc-plw-nav-button" aria-label="Pan up" onClick={() => pan(0, -0.45)}>↑</button>
            <button type="button" className="vc-plw-nav-button" aria-label="Pan down" onClick={() => pan(0, 0.45)}>↓</button>
            <button type="button" className="vc-plw-nav-button" aria-label="Pan right" onClick={() => pan(0.45, 0)}>→</button>
        </div>
        <a
            className="vc-plw-attribution"
            href="https://www.openstreetmap.org/copyright"
            onClick={event => {
                event.preventDefault();
                VencordNative.native.openExternal("https://www.openstreetmap.org/copyright");
            }}
        >© OpenStreetMap</a>
    </div>;
}

function SearchEditor({ userId, onClose }: { userId: string; onClose(): void; }) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<GeocodeCandidate[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const trimmed = query.trim();
        if (trimmed.length < 2) {
            setResults([]);
            setError(null);
            setLoading(false);
            return;
        }
        const controller = new AbortController();
        const timer = window.setTimeout(async () => {
            setLoading(true);
            setError(null);
            try {
                setResults(await searchLocations(trimmed, controller.signal));
            } catch (searchError) {
                if (controller.signal.aborted) return;
                setResults([]);
                setError(searchError instanceof Error ? searchError.message : "Location search failed");
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }, 650);
        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [query]);

    async function choose(candidate: GeocodeCandidate) {
        await saveLocation(userId, candidate);
        onClose();
    }

    return <div className="vc-plw-editor">
        <div className="vc-plw-search-row">
            <LocationPinIcon />
            <input autoFocus className="vc-plw-search" placeholder="Search a city or place" value={query} onChange={event => setQuery(event.currentTarget.value)} />
            <button type="button" className="vc-plw-icon-button" aria-label="Close location editor" onClick={onClose}>×</button>
        </div>
        {loading && <div className="vc-plw-search-state">Searching…</div>}
        {error && <div className="vc-plw-search-state vc-plw-error">{error}</div>}
        {!loading && !error && query.trim().length >= 2 && results.length === 0 && <div className="vc-plw-search-state">No place found</div>}
        {results.length > 0 && <div className="vc-plw-results">{results.map(result => <button type="button" className="vc-plw-result" key={`${result.lat}:${result.lng}:${result.label}`} onClick={() => void choose(result)}><LocationPinIcon size={14} /><span>{result.label}</span></button>)}</div>}
    </div>;
}

export function ProfileLocationSection({ userId, isSideBar }: { userId: string; isSideBar: boolean; }) {
    const location = useSavedLocation(userId);
    const [editing, setEditing] = useState(false);
    const clock = useLocationClock(location?.timezone);
    const osmUrl = useMemo(() => location ? `https://www.openstreetmap.org/?mlat=${location.lat}&mlon=${location.lng}#map=${location.zoom}/${location.lat}/${location.lng}` : null, [location]);

    if (editing) return <section className={`vc-plw ${isSideBar ? "vc-plw-sidebar" : ""}`}><SearchEditor userId={userId} onClose={() => setEditing(false)} />{location && <button type="button" className="vc-plw-remove" onClick={() => void removeLocation(userId).then(() => setEditing(false))}>Remove saved location</button>}</section>;

    if (!location) return <button type="button" className={`vc-plw vc-plw-empty ${isSideBar ? "vc-plw-sidebar" : ""}`} onClick={() => setEditing(true)}><span className="vc-plw-empty-icon"><LocationPinIcon size={17} /></span><span className="vc-plw-empty-copy"><strong>Set location</strong><span>Add a place to this profile</span></span><span className="vc-plw-empty-plus">+</span></button>;

    return <section className={`vc-plw ${isSideBar ? "vc-plw-sidebar" : ""}`}><div className="vc-plw-map-shell"><LocationMap location={location} /><div className="vc-plw-time">{clock}</div><div className="vc-plw-place"><LocationPinIcon size={13} /><span>{location.label}</span></div><div className="vc-plw-map-actions"><button type="button" className="vc-plw-map-action" aria-label="Edit saved location" onClick={() => setEditing(true)}><EditIcon /></button>{osmUrl && <button type="button" className="vc-plw-map-action" aria-label="Open in OpenStreetMap" onClick={() => VencordNative.native.openExternal(osmUrl)}><ExternalIcon /></button>}</div></div></section>;
}
