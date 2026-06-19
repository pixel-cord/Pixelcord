/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const settings = definePluginSettings({
    autoCorrect: {
        type: OptionType.BOOLEAN,
        description: "Automatically fix your messages before sending",
        default: false
    },
    language: {
        type: OptionType.STRING,
        description: "Language code (e.g. auto, en-US, pt-BR, es). 'auto' detects it for you.",
        default: "auto"
    },
    apiBaseUrl: {
        type: OptionType.STRING,
        description: "LanguageTool API base URL (use your own instance to avoid rate limits)",
        default: "https://api.languagetool.org"
    },
    showAutoCorrectTooltip: {
        type: OptionType.BOOLEAN,
        description: "Show a tooltip on the chat button when a message gets auto-corrected",
        default: true
    }
});
