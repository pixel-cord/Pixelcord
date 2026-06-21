/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { BASE_URL } from "../moreConnections/lib/constants";

// Uploads the rendered PNG to the Pixelcord API, which stores it on a Discord
// channel and returns a proxied image link. No auth — uploads land in the bot's
// own channel, so there's nothing per-user to gate.
export async function uploadImageMessage(imageBase64: string): Promise<string> {
    const res = await fetch(`${BASE_URL}/api/image-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64 })
    });

    if (!res.ok) throw new Error(`upload failed (${res.status})`);

    const { url } = await res.json();
    if (!url) throw new Error("no url returned");
    return url;
}
