/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const settings = definePluginSettings({
    enabled: {
        type: OptionType.BOOLEAN,
        description: "Encrypt my outgoing messages",
        default: false
    },
    key: {
        type: OptionType.STRING,
        description: "Shared secret key — set the same one as the other person (managed from the chat button)",
        default: "",
        hidden: true
    }
});
