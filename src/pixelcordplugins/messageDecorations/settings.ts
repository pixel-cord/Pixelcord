/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

// The available render styles. `value` is stored per-message in the marker and mirrored into
// the `data-vc-msgdeco-style` attribute the CSS keys off, so keep the values short slugs.
export const STYLES = [
    { value: "tiktok", label: "TikTok — Discord avatar stays outside the bubble" },
    { value: "pixelcord", label: "Pixelcord — avatar tucked inside the bubble" },
    { value: "minimal", label: "Minimal — just the coloured bubble, no character" },
    { value: "sticker", label: "Sticker — big character peeking over the top" },
    { value: "badge", label: "Badge — character on your Discord avatar" },
    { value: "outline", label: "Outline — coloured border, no fill" }
] as const;

export const DEFAULT_STYLE = "tiktok";
export const STYLE_VALUES = new Set<string>(STYLES.map(s => s.value));

export const settings = definePluginSettings({
    // Both are managed from the chat-bar picker (hidden here) and travel per-message inside the
    // marker, so everyone with the plugin sees each message exactly as its sender chose it.
    activeDecorationId: {
        type: OptionType.STRING,
        description: "Decoration applied to your next messages (managed from the chat button)",
        default: "",
        hidden: true
    },
    activeStyle: {
        type: OptionType.STRING,
        description: "Style applied to your next messages (managed from the chat button)",
        default: DEFAULT_STYLE,
        hidden: true
    }
});
