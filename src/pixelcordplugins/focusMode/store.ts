/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showNotification } from "@api/Notifications";
import { proxyLazy } from "@utils/lazy";
import { zustandCreate } from "@webpack/common";

import { settings } from "./settings";

const BODY_CLASS = "vc-focusmode-active";

const FEATURE_CLASSES: Record<string, "hideUnreadBadges" | "hideMembersList" | "dimServerList"> = {
    "vc-focusmode-hidebadges": "hideUnreadBadges",
    "vc-focusmode-hidemembers": "hideMembersList",
    "vc-focusmode-dimservers": "dimServerList"
};

interface FocusState {
    active: boolean;
    /** Epoch ms when the session ends, or null for an open-ended session. */
    endsAt: number | null;
    start: (minutes: number | null) => void;
    stop: (notify?: boolean) => void;
}

let endTimer: ReturnType<typeof setTimeout> | null = null;

function applyBodyClass(active: boolean) {
    document.body.classList.toggle(BODY_CLASS, active);
    for (const [cls, key] of Object.entries(FEATURE_CLASSES)) {
        document.body.classList.toggle(cls, active && settings.store[key]);
    }
}

export const useFocusStore = proxyLazy(() => zustandCreate((set: any, get: any): FocusState => ({
    active: false,
    endsAt: null,

    start(minutes: number | null) {
        if (endTimer) clearTimeout(endTimer);

        const endsAt = minutes ? Date.now() + minutes * 60_000 : null;
        applyBodyClass(true);
        set({ active: true, endsAt });

        if (endsAt) {
            endTimer = setTimeout(() => get().stop(true), minutes! * 60_000);
        }
    },

    stop(notify = false) {
        if (endTimer) {
            clearTimeout(endTimer);
            endTimer = null;
        }

        applyBodyClass(false);
        set({ active: false, endsAt: null });

        if (notify && settings.store.notifyOnEnd) {
            showNotification({
                title: "Focus session finished",
                body: "Time's up — welcome back. 🎯"
            });
        }
    }
})));

/** Cleanly removes the body class when the plugin is disabled. */
export function resetFocus() {
    if (endTimer) {
        clearTimeout(endTimer);
        endTimer = null;
    }
    document.body.classList.remove(BODY_CLASS, ...Object.keys(FEATURE_CLASSES));
}
