/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useAuthorizationStore } from "./auth";
import { API_URL } from "./constants";

/** Map of platform id -> handle/username, e.g. { instagram: "someone" }. */
export type Connections = Record<string, string>;

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

export const getMyConnections = async (): Promise<Connections> =>
    fetchApi(`${API_URL}/me/connections`).then(res => res.json()).then(data => data.connections ?? {});

export const setMyConnections = async (connections: Connections): Promise<Connections> =>
    fetchApi(`${API_URL}/me/connections`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connections })
    }).then(res => res.json()).then(data => data.connections ?? {});
