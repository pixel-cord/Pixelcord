/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { debounce } from "@shared/debounce";
import { proxyLazy } from "@utils/lazy";
import { zustandCreate } from "@webpack/common";

import { Connections, getUsersConnections } from "./api";
import { CONNECTIONS_FETCH_COOLDOWN } from "./constants";

interface ConnectionsEntry {
    connections: Connections;
    fetchedAt: number;
}

interface UsersConnectionsState {
    users: Map<string, ConnectionsEntry>;
    queue: Set<string>;
    bulkFetch: () => Promise<void>;
    request: (userId: string, force?: boolean) => void;
    get: (userId: string) => Connections | undefined;
    setLocal: (userId: string, connections: Connections) => void;
}

export const useUsersConnectionsStore = proxyLazy(() => zustandCreate((set: any, get: any) => ({
    users: new Map<string, ConnectionsEntry>(),
    queue: new Set<string>(),
    bulkFetch: debounce(async () => {
        const { queue, users } = get();
        if (queue.size === 0) return;

        set({ queue: new Set() });

        const ids = [...queue] as string[];
        const fetched = await getUsersConnections(ids).catch(() => ({} as Record<string, Connections>));

        const next = new Map(users);
        const now = Date.now();
        for (const id of ids) next.set(id, { connections: fetched[id] ?? {}, fetchedAt: now });

        set({ users: next });
    }, 50),
    request(userId: string, force = false) {
        const { users, queue, bulkFetch } = get();

        const entry = users.get(userId);
        if (entry && !force && Date.now() - entry.fetchedAt < CONNECTIONS_FETCH_COOLDOWN) return;

        set({ queue: new Set(queue).add(userId) });
        bulkFetch();
    },
    get(userId: string) {
        return get().users.get(userId)?.connections;
    },
    setLocal(userId: string, connections: Connections) {
        const next = new Map(get().users);
        next.set(userId, { connections, fetchedAt: Date.now() });
        set({ users: next });
    }
} as UsersConnectionsState)));
