/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { debounce } from "@shared/debounce";
import { proxyLazy } from "@utils/lazy";
import { zustandCreate } from "@webpack/common";

import { getUsersHidden } from "./api";
import { HIDDEN_FETCH_COOLDOWN } from "./constants";

interface HiddenEntry {
    hidden: string[];
    fetchedAt: number;
}

interface UsersHiddenState {
    users: Map<string, HiddenEntry>;
    queue: Set<string>;
    bulkFetch: () => Promise<void>;
    request: (userId: string, force?: boolean) => void;
    get: (userId: string) => string[] | undefined;
    setLocal: (userId: string, hidden: string[]) => void;
    refreshAll: () => void;
}

export const useUsersHiddenStore = proxyLazy(() => zustandCreate((set: any, get: any) => ({
    users: new Map<string, HiddenEntry>(),
    queue: new Set<string>(),
    bulkFetch: debounce(async () => {
        const { queue, users } = get();
        if (queue.size === 0) return;

        set({ queue: new Set() });

        const ids = [...queue] as string[];
        const fetched = await getUsersHidden(ids).catch(() => ({} as Record<string, string[]>));

        const next = new Map(users);
        const now = Date.now();
        for (const id of ids) next.set(id, { hidden: fetched[id] ?? [], fetchedAt: now });

        set({ users: next });
    }, 50),
    request(userId: string, force = false) {
        const { users, queue, bulkFetch } = get();

        const entry = users.get(userId);
        if (entry && !force && Date.now() - entry.fetchedAt < HIDDEN_FETCH_COOLDOWN) return;

        set({ queue: new Set(queue).add(userId) });
        bulkFetch();
    },
    get(userId: string) {
        return get().users.get(userId)?.hidden;
    },
    setLocal(userId: string, hidden: string[]) {
        const next = new Map(get().users);
        next.set(userId, { hidden, fetchedAt: Date.now() });
        set({ users: next });
    },
    // Force-refetch every cached user's hidden set (used when the version rotates).
    refreshAll() {
        const { users, request } = get();
        for (const id of users.keys()) request(id, true);
    }
} as UsersHiddenState)));
