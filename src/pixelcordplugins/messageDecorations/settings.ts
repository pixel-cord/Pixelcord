/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const settings = definePluginSettings({
    // How a decorated message renders. TikTok (default) keeps Discord's own avatar outside
    // the bubble; Pixelcord tucks the author's avatar inside the bubble with the character.
    style: {
        type: OptionType.SELECT,
        description: "Style of decorated messages",
        options: [
            { label: "TikTok — Discord avatar stays outside the bubble", value: "tiktok", default: true },
            { label: "Pixelcord — avatar tucked inside the bubble", value: "pixelcord" }
        ]
    },
    // The decoration applied to outgoing messages. Empty string means "none".
    // Managed entirely from the chat-bar picker, so it's hidden from the settings UI.
    activeDecorationId: {
        type: OptionType.STRING,
        description: "Decoration applied to your next messages (managed from the chat button)",
        default: "",
        hidden: true
    }
});
