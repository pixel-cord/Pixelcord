/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { UserStore } from "@webpack/common";

import { Connections, getMyConnections, MyConnections, setMyConnections } from "./api";
import { useUsersConnectionsStore } from "./store";

// The signed-in user's own connections (values + hidden), cached so the settings
// cards and the editor share one source of truth.
let cache: MyConnections = { connections: {}, hidden: [] };
const listeners = new Set<() => void>();

export function getMine(): MyConnections {
    return cache;
}

export function onMineChange(fn: () => void): () => void {
    listeners.add(fn);
    return () => void listeners.delete(fn);
}

function emit() {
    listeners.forEach(fn => fn());
}

// Keep the public/profile store in sync with our visible-only connections, so
// hiding one removes it from our own profile immediately.
function syncPublicStore() {
    const me = UserStore.getCurrentUser();
    if (!me) return;
    const visible: Connections = {};
    for (const [platform, value] of Object.entries(cache.connections)) {
        if (!cache.hidden.includes(platform)) visible[platform] = value;
    }
    useUsersConnectionsStore.getState().setLocal(me.id, visible);
}

export async function loadMine(): Promise<MyConnections> {
    try {
        cache = await getMyConnections();
        emit();
        syncPublicStore();
    } catch { /* ignore */ }
    return cache;
}

export async function saveMine(next: MyConnections): Promise<MyConnections> {
    cache = next; // optimistic
    emit();
    syncPublicStore();
    try {
        cache = await setMyConnections(next.connections, next.hidden);
        emit();
        syncPublicStore();
    } catch { /* keep optimistic copy */ }
    return cache;
}

export function setVisible(platform: string, visible: boolean): Promise<MyConnections> {
    const hidden = new Set(cache.hidden);
    if (visible) hidden.delete(platform);
    else hidden.add(platform);
    return saveMine({ connections: cache.connections, hidden: [...hidden] });
}

export function removeMine(platform: string): Promise<MyConnections> {
    const connections = { ...cache.connections };
    delete connections[platform];
    return saveMine({ connections, hidden: cache.hidden.filter(p => p !== platform) });
}
