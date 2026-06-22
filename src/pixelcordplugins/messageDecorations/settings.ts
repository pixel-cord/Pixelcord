/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const settings = definePluginSettings({
    // The decoration applied to outgoing messages. Empty string means "none".
    // Managed entirely from the chat-bar picker, so it's hidden from the settings UI.
    activeDecorationId: {
        type: OptionType.STRING,
        description: "Decoration applied to your next messages (managed from the chat button)",
        default: "",
        hidden: true
    }
});
