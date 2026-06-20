/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useAuthorizationStore } from "./auth";
import { API_URL } from "./constants";

/** Map of platform id -> handle/username, e.g. { instagram: "someone" }. */
export type Connections = Record<string, string>;

/** The signed-in user's connections: values plus which platforms are hidden. */
export interface MyConnections {
    connections: Connections;
    hidden: string[];
}

export async function fetchApi(url: RequestInfo, options?: RequestInit) {
    const res = await fetch(url, {
        ...options,
        headers: {
            ...options?.headers,
            Authorization: `Bearer ${useAuthorizationStore.getState().token}`
        }
    });

    if (res.ok) return res;
    throw new Error(await res.text());
}

export const getUsersConnections = async (ids: string[]): Promise<Record<string, Connections>> => {
    if (!ids.length) return {};

    const url = new URL(`${API_URL}/connections`);
    url.searchParams.set("ids", JSON.stringify(ids));

    return fetch(url).then(res => res.json());
};

export const getMyConnections = async (): Promise<MyConnections> =>
    fetchApi(`${API_URL}/me/connections`).then(res => res.json()).then(d => ({
        connections: d.connections ?? {},
        hidden: d.hidden ?? []
    }));

export const setMyConnections = async (connections: Connections, hidden: string[] = []): Promise<MyConnections> =>
    fetchApi(`${API_URL}/me/connections`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connections, hidden })
    }).then(res => res.json()).then(d => ({
        connections: d.connections ?? {},
        hidden: d.hidden ?? []
    }));
