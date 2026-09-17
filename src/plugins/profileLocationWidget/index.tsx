/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 BreezeDelegate
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

export default definePlugin({
    name: "ProfileLocationWidget",
    description: "Diagnostic shell for the local-only profile location widget.",
    authors: [Devs.BreezeDelegate],
    tags: ["Appearance", "Utility"],
    enabledByDefault: false
});
