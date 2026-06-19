/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { IpcMainInvokeEvent } from "electron";

// Runs in the main process so the request isn't subject to the renderer's CSP.
export async function makeLanguageToolRequest(_: IpcMainInvokeEvent, baseUrl: string, text: string, language: string) {
    const url = `${baseUrl.replace(/\/+$/, "")}/v2/check`;

    try {
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ text, language, enabledOnly: "false" }).toString()
        });
        return { status: res.status, data: await res.text() };
    } catch (e) {
        return { status: -1, data: String(e) };
    }
}
