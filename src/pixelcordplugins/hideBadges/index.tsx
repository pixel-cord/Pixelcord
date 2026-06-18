/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { PixelCordDevs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { UserStore } from "@webpack/common";

import { SettingsComponent } from "./components";
import { useAuthorizationStore } from "./lib/auth";
import { BASE_URL, loadApiConfig } from "./lib/constants";
import { useUsersHiddenStore } from "./lib/store";

const settings = definePluginSettings({
    manage: {
        type: OptionType.COMPONENT,
        description: "Authorize and choose which of your badges to hide.",
        component: SettingsComponent
    }
});

const VERSION_URL = `${BASE_URL}/badges/version`;
let versionIntervalId: any;
let lastVersion: number | null = null;

// Rotating cache: the version bumps whenever a badge OR a hidden-set changes. When it
// moves, force-refetch the cached hidden sets so hide/unhide propagates to everyone fast.
async function pollHiddenVersion() {
    try {
        const { version } = await fetch(VERSION_URL).then(r => r.json());
        if (typeof version !== "number") return;
        if (lastVersion === null) {
            lastVersion = version;
            return;
        }
        if (version !== lastVersion) {
            lastVersion = version;
            useUsersHiddenStore.getState().refreshAll();
        }
    } catch {
        // backend unreachable; retry next tick
    }
}

export default definePlugin({
    name: "HideBadges",
    description: "Hide your own badges for everyone using PixelCord.",
    authors: [PixelCordDevs.myvings],
    settings,

    flux: {
        USER_PROFILE_FETCH_START({ userId }: { userId?: string; }) {
            if (userId) useUsersHiddenStore.getState().request(userId);
        }
    },

    getHiddenBadges(userId: string): string[] {
        try {
            const store = useUsersHiddenStore.getState();
            const cached = store.get(userId);
            if (cached === undefined) {
                store.request(userId);
                return [];
            }
            return cached;
        } catch {
            return [];
        }
    },

    async start() {
        await loadApiConfig();
        useAuthorizationStore.getState().init();

        const me = UserStore.getCurrentUser();
        if (me) useUsersHiddenStore.getState().request(me.id);

        clearInterval(versionIntervalId);
        versionIntervalId = setInterval(pollHiddenVersion, 1000 * 20);
    },

    stop() {
        clearInterval(versionIntervalId);
    }
});
