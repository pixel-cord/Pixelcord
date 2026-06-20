/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { PixelCordDevs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { ConnectedAccount } from "@vencord/discord-types";
import { UserProfileStore, UserStore } from "@webpack/common";

import { SettingsComponent } from "./components";
import { useAuthorizationStore } from "./lib/auth";
import { loadApiConfig } from "./lib/constants";
import { installNativeConnections, uninstallNativeConnections } from "./lib/nativeAdd";
import { PLATFORMS } from "./lib/platforms";
import { installSettingsCard, uninstallSettingsCard } from "./lib/settingsCard";
import { useUsersConnectionsStore } from "./lib/store";

const settings = definePluginSettings({
    manage: {
        type: OptionType.COMPONENT,
        description: "Authorize and manage the connections shown on your profile.",
        component: SettingsComponent
    }
});

// Turn a user's stored connections into native-shaped ConnectedAccount objects.
// We use real Discord connection `type`s (e.g. "instagram"), so Discord renders
// them with the proper icon, link and layout — no custom UI needed.
function extraAccounts(userId: string): ConnectedAccount[] {
    const store = useUsersConnectionsStore.getState();
    const conns = store.get(userId);
    if (conns === undefined) {
        store.request(userId);
        return [];
    }

    const out: ConnectedAccount[] = [];
    for (const p of PLATFORMS) {
        const name = conns[p.id];
        if (name) out.push({ type: p.id as ConnectedAccount["type"], id: `${p.id}:${name}`, name, verified: false });
    }
    return out;
}

// getUserProfile is read by every connections renderer (popout, profile modal,
// ShowConnections...). We wrap it so our connections are merged into the array
// they all read, memoizing per source-profile so referential equality holds.
const mergeCache = new Map<string, { src: any; key: string; merged: any; }>();
let originalGetUserProfile: ((userId: string) => any) | null = null;

function installInjection() {
    if (originalGetUserProfile) return;

    const orig = UserProfileStore.getUserProfile.bind(UserProfileStore);
    originalGetUserProfile = orig;

    (UserProfileStore as any).getUserProfile = (userId: string) => {
        const profile = orig(userId);
        if (!profile) return profile;

        const extra = extraAccounts(userId);
        if (!extra.length) return profile;

        const existing: ConnectedAccount[] = profile.connectedAccounts ?? [];
        const key = extra.map(a => `${a.type}=${a.name}`).join(",") + "#" + existing.length;

        const cached = mergeCache.get(userId);
        if (cached && cached.src === profile && cached.key === key) return cached.merged;

        const merged = [...existing];
        for (const acc of extra) {
            if (!existing.some(e => e.type === acc.type && e.name.toLowerCase() === acc.name.toLowerCase()))
                merged.push(acc);
        }

        const mergedProfile = { ...profile, connectedAccounts: merged };
        mergeCache.set(userId, { src: profile, key, merged: mergedProfile });
        return mergedProfile;
    };
}

function uninstallInjection() {
    if (originalGetUserProfile) {
        (UserProfileStore as any).getUserProfile = originalGetUserProfile;
        originalGetUserProfile = null;
    }
    mergeCache.clear();
}

let lastUsersRef: any = null;

export default definePlugin({
    name: "MoreConnections",
    description: "Add extra profile connections (like Instagram) that show for everyone using Pixelcord.",
    authors: [PixelCordDevs.myvings],
    // On by default so every Pixelcord user renders others' connections without
    // having to enable anything (a viewer must run the plugin to see them).
    enabledByDefault: true,
    settings,

    flux: {
        USER_PROFILE_FETCH_START({ userId }: { userId?: string; }) {
            if (userId) useUsersConnectionsStore.getState().request(userId);
        }
    },

    async start() {
        await loadApiConfig();
        useAuthorizationStore.getState().init();

        installInjection();
        installNativeConnections();
        installSettingsCard();

        // When our async data lands (batched fetch), drop the merge cache and nudge
        // profile consumers so the injected connections appear without reopening.
        (useUsersConnectionsStore as any).subscribe((state: any) => {
            if (state.users !== lastUsersRef) {
                lastUsersRef = state.users;
                mergeCache.clear();
                try { (UserProfileStore as any).emitChange(); } catch { }
            }
        });

        const me = UserStore.getCurrentUser();
        if (me) useUsersConnectionsStore.getState().request(me.id);
    },

    stop() {
        uninstallInjection();
        uninstallNativeConnections();
        uninstallSettingsCard();
    }
});
