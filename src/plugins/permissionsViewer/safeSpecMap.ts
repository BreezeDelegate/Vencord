/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 BreezeDelegate
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/* Minimal guard for optional Discord permission label metadata. */

export function safelyResolvePermissionSpecs<T extends Record<string, unknown>>(lookup: () => T | undefined): T | Record<string, never> {
    try {
        return lookup() ?? {};
    } catch {
        return {};
    }
}
