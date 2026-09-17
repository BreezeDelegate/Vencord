/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 BreezeDelegate
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useEffect, useMemo, useRef, useState } from "@webpack/common";
import L, { CircleMarker, Map as LeafletMap } from "leaflet";

import { searchLocations } from "./geocode";
import { formatLocationClock } from "./model";
import { getLocation, removeLocation, saveLocation, subscribeLocations } from "./store";
import type { GeocodeCandidate, SavedLocation } from "./types";

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

function LocationMap({ location, compact }: { location: SavedLocation; compact: boolean; }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<LeafletMap | null>(null);
    const markerRef = useRef<CircleMarker | null>(null);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const map = L.map(container, {
            attributionControl: false,
            zoomControl: true,
            scrollWheelZoom: false,
            dragging: true,
            doubleClickZoom: true,
            boxZoom: false,
            keyboard: false
        });
        mapRef.current = map;
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
        L.control.attribution({ position: "bottomright", prefix: false }).addTo(map);
        markerRef.current = L.circleMarker([location.lat, location.lng], { radius: compact ? 5 : 6, weight: 2, opacity: 1, fillOpacity: 0.9 }).addTo(map);
        map.setView([location.lat, location.lng], location.zoom, { animate: false });
        const frame = window.requestAnimationFrame(() => map.invalidateSize(false));
        return () => {
            window.cancelAnimationFrame(frame);
            markerRef.current = null;
            mapRef.current = null;
            map.remove();
        };
    }, [compact]);

    useEffect(() => {
        const map = mapRef.current;
        const marker = markerRef.current;
        if (!map || !marker) return;
        marker.setLatLng([location.lat, location.lng]);
        map.flyTo([location.lat, location.lng], location.zoom, { duration: 0.35 });
    }, [location.lat, location.lng, location.zoom]);

    return <div ref={containerRef} className="vc-plw-map" />;
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

    return <section className={`vc-plw ${isSideBar ? "vc-plw-sidebar" : ""}`}><div className="vc-plw-map-shell"><LocationMap location={location} compact={isSideBar} /><div className="vc-plw-time">{clock}</div><div className="vc-plw-place"><LocationPinIcon size={13} /><span>{location.label}</span></div><div className="vc-plw-map-actions"><button type="button" className="vc-plw-map-action" aria-label="Edit saved location" onClick={() => setEditing(true)}><EditIcon /></button>{osmUrl && <button type="button" className="vc-plw-map-action" aria-label="Open in OpenStreetMap" onClick={() => VencordNative.native.openExternal(osmUrl)}><ExternalIcon /></button>}</div></div></section>;
}
