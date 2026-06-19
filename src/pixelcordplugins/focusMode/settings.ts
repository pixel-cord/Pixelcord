/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const settings = definePluginSettings({
    hideUnreadBadges: {
        type: OptionType.BOOLEAN,
        description: "Hide red unread/mention badges while focusing",
        default: true,
        restartNeeded: false
    },
    hideMembersList: {
        type: OptionType.BOOLEAN,
        description: "Hide the members sidebar while focusing",
        default: true
    },
    dimServerList: {
        type: OptionType.BOOLEAN,
        description: "Dim the server list so it stops pulling your eyes",
        default: true
    },
    notifyOnEnd: {
        type: OptionType.BOOLEAN,
        description: "Show a notification when a timed session ends",
        default: true
    }
});
