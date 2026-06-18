/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const settings = definePluginSettings({
    delay: {
        type: OptionType.SLIDER,
        description: "Delay between deletion batches in milliseconds. Higher is safer against rate limits and account flags.",
        markers: [300, 500, 700, 1000, 1500, 2000, 3000],
        default: 1000,
        stickToMarkers: false
    }
});
