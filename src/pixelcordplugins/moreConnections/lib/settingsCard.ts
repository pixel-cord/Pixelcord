/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";
import { findStore } from "@webpack";

import { useAuthorizationStore } from "./auth";
import { getMine, loadMine, onMineChange, setVisible } from "./mine";
import { PLATFORMS } from "./platforms";

const logger = new Logger("MoreConnections");

let store: any = null;
let origGetAccounts: ((...args: any[]) => any) | null = null;
let unsubMine: (() => void) | null = null;
let unsubAuth: (() => void) | null = null;
let clickListener: ((e: MouseEvent) => void) | null = null;
// The auth token rehydrates asynchronously, so load our connections once it's
// available (and again if it changes), guarded so we never load in a loop.
let lastToken: string | null = null;

// Build account objects (the shape the Connections settings list renders into
// cards) from the current user's configured connections, reflecting visibility.
function ourAccounts(): any[] {
    const { connections, hidden } = getMine();
    const out: any[] = [];
    for (const p of PLATFORMS) {
        const name = connections[p.id];
        if (!name) continue;
        out.push({
            type: p.id,
            id: `${p.id}:${name}`,
            name,
            verified: false,
            visibility: hidden.includes(p.id) ? 0 : 1,
            revoked: false,
            friendSync: false,
            showActivity: false,
            twoWayLink: false,
            metadata: undefined,
            integrations: []
        });
    }
    return out;
}

// The "Show on profile" toggle on our card is Discord's switch and does nothing
// for our synthetic accounts. Catch the click, find which of our connections the
// card is for (by its value text), and flip our own visibility instead.
function installToggleInterception() {
    if (clickListener) return;
    clickListener = (e: MouseEvent) => {
        const sw = (e.target as HTMLElement | null)?.closest?.('[role="switch"],input[type="checkbox"]') as HTMLElement | null;
        if (!sw) return;

        const values = Object.entries(getMine().connections); // [platform, value][]
        if (!values.length) return;

        let node: HTMLElement | null = sw;
        let platform: string | undefined;
        for (let i = 0; i < 8 && node; i++) {
            const txt = node.textContent || "";
            const hit = values.find(([, v]) => v && txt.includes(v));
            if (hit) { platform = hit[0]; break; }
            node = node.parentElement;
        }
        if (!platform) return; // not one of our cards

        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        // Flip: if it's currently hidden, make it visible, and vice-versa.
        setVisible(platform, getMine().hidden.includes(platform));
    };
    document.addEventListener("click", clickListener, true);
}

export function installSettingsCard() {
    if (origGetAccounts) return;

    store = findStore("ConnectedAccountsStore");
    if (typeof store?.getAccounts !== "function") {
        logger.warn("ConnectedAccountsStore.getAccounts not found — settings cards unavailable.", store && Object.keys(store));
        return;
    }
    logger.info("ConnectedAccountsStore keys:", Object.keys(store));

    origGetAccounts = store.getAccounts.bind(store);
    store.getAccounts = (...args: any[]) => {
        const accounts = origGetAccounts!(...args) ?? [];
        const ours = ourAccounts().filter(a => !accounts.some((x: any) => x.type === a.type && x.name === a.name));
        return ours.length ? [...accounts, ...ours] : accounts;
    };

    // Re-render the list whenever our data changes.
    unsubMine = onMineChange(() => { try { store?.emitChange?.(); } catch { /* ignore */ } });

    installToggleInterception();

    const tryLoad = () => {
        const token = useAuthorizationStore.getState().token;
        if (token && token !== lastToken) {
            lastToken = token;
            loadMine();
        }
    };
    tryLoad();
    unsubAuth = (useAuthorizationStore as any).subscribe(tryLoad);
}

export function refreshSettingsCard() {
    loadMine();
}

export function uninstallSettingsCard() {
    if (store && origGetAccounts) store.getAccounts = origGetAccounts;
    if (clickListener) {
        document.removeEventListener("click", clickListener, true);
        clickListener = null;
    }
    unsubMine?.();
    unsubMine = null;
    unsubAuth?.();
    unsubAuth = null;
    lastToken = null;
    origGetAccounts = null;
    store = null;
}
