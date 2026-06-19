/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { PixelCordDevs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { UserStore } from "@webpack/common";

import { profileConnectionsComponent, SettingsComponent } from "./components";
import { useAuthorizationStore } from "./lib/auth";
import { loadApiConfig } from "./lib/constants";
import { useUsersConnectionsStore } from "./lib/store";

const settings = definePluginSettings({
    manage: {
        type: OptionType.COMPONENT,
        description: "Authorize and manage the connections shown on your profile.",
        component: SettingsComponent
    }
});

export default definePlugin({
    name: "MoreConnections",
    description: "Add extra profile connections (like Instagram) that show for everyone using Pixelcord.",
    authors: [PixelCordDevs.myvings],
    settings,

    patches: [
        {
            // Same profile-popout anchor ShowConnections uses. The tolerant
            // lookahead ([,\]]) lets both plugins append into the same children
            // array without clobbering each other.
            find: '"UserProfilePopout");',
            replacement: {
                match: /userId:\i\.id,guild:\i\}\)(?=[,\]])/,
                replace: "$&,$self.profileConnectionsComponent(arguments[0])"
            }
        }
    ],

    profileConnectionsComponent,

    flux: {
        USER_PROFILE_FETCH_START({ userId }: { userId?: string; }) {
            if (userId) useUsersConnectionsStore.getState().request(userId);
        }
    },

    async start() {
        await loadApiConfig();
        useAuthorizationStore.getState().init();

        const me = UserStore.getCurrentUser();
        if (me) useUsersConnectionsStore.getState().request(me.id);
    }
});
