/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useAuthorizationStore } from "./auth";
import { API_URL } from "./constants";

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

export const getUsersHidden = async (ids: string[]): Promise<Record<string, string[]>> => {
    if (!ids.length) return {};

    const url = new URL(`${API_URL}/hidden`);
    url.searchParams.set("ids", JSON.stringify(ids));

    return fetch(url).then(res => res.json());
};

export const getMyHidden = async (): Promise<string[]> =>
    fetchApi(`${API_URL}/me/hidden`).then(res => res.json()).then(data => data.hidden ?? []);

export const setMyHidden = async (hidden: string[]): Promise<string[]> =>
    fetchApi(`${API_URL}/me/hidden`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hidden })
    }).then(res => res.json()).then(data => data.hidden ?? []);
