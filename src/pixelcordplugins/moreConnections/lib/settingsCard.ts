/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";
import { findStore } from "@webpack";
import { UserStore } from "@webpack/common";

import { PLATFORMS } from "./platforms";
import { useUsersConnectionsStore } from "./store";

const logger = new Logger("MoreConnections");

let store: any = null;
let origGetAccounts: ((...args: any[]) => any) | null = null;

// Build account objects (the shape the Connections settings list renders into
// cards) from the current user's configured connections.
function ourAccounts(): any[] {
    const me = UserStore.getCurrentUser();
    if (!me) return [];
    const conns = useUsersConnectionsStore.getState().get(me.id);
    if (!conns) return [];

    const out: any[] = [];
    for (const p of PLATFORMS) {
        const name = conns[p.id];
        if (!name) continue;
        out.push({
            type: p.id,
            id: `${p.id}:${name}`,
            name,
            verified: false,
            visibility: 1,
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
}

// Nudge the settings list to re-read after our data changes.
export function refreshSettingsCard() {
    try { store?.emitChange?.(); } catch { /* ignore */ }
}

export function uninstallSettingsCard() {
    if (store && origGetAccounts) store.getAccounts = origGetAccounts;
    origGetAccounts = null;
    store = null;
}
