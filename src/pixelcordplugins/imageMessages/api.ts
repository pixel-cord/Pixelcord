/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useAuthorizationStore } from "../moreConnections/lib/auth";
import { BASE_URL } from "../moreConnections/lib/constants";

// Uploads the rendered PNG to the Pixelcord API, which stores it on the CDN and
// returns the public image URL. Reuses the Pixelcord OAuth token (the same one the
// connections/badges features use), authorizing on first use if needed.
export async function uploadImageMessage(imageBase64: string): Promise<string> {
    let { token } = useAuthorizationStore.getState();
    if (!token) {
        await useAuthorizationStore.getState().authorize();
        token = useAuthorizationStore.getState().token;
    }
    if (!token) throw new Error("not authorized");

    const res = await fetch(`${BASE_URL}/api/image-message`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ imageBase64 })
    });

    if (!res.ok) throw new Error(`upload failed (${res.status})`);

    const { url } = await res.json();
    if (!url) throw new Error("no url returned");
    return url;
}
