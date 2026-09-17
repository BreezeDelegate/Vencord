/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 BreezeDelegate
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import L from "leaflet";

const leafletVersion = L.version;

export default definePlugin({
    name: "ProfileLocationWidget",
    description: `Diagnostic shell loading Leaflet ${leafletVersion} without any profile patch.`,
    authors: [Devs.BreezeDelegate],
    tags: ["Appearance", "Utility"],
    enabledByDefault: false
});
