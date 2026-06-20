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
        description: "Automatically fix your draft while you type (pause to apply). The word you're still typing is left alone.",
        default: false
    },
    correctDelay: {
        type: OptionType.NUMBER,
        description: "How long (ms) to wait after you stop typing before correcting",
        default: 1200
    },
    scope: {
        type: OptionType.SELECT,
        description: "What to fix",
        options: [
            { label: "Spelling + grammar (recommended)", value: "grammar", default: true },
            { label: "Spelling only", value: "spelling" },
            { label: "Everything (incl. style, casing, smart quotes)", value: "all" }
        ]
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
