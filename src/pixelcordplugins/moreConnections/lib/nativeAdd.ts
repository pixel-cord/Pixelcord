/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";
import { findByPropsLazy } from "@webpack";

import { openManageConnections } from "../components";

// Discord's connection-platform registry (each platform's metadata + actions).
const platforms: any = findByPropsLazy("isSupported", "getByUrl");
const logger = new Logger("MoreConnections");

let patched = false;
const saved: Record<string, any> = {};

// Make Instagram show up in Discord's native "Add connection" modal again, and
// route its connect action to our own handle input (Discord dropped real
// Instagram OAuth, so we store the handle on the Pixelcord backend instead).
export function installNativeInstagram() {
    if (patched) return;

    try {
        const handler: any = platforms?.get?.("instagram");
        if (!handler) {
            logger.warn("Instagram platform handler not found — native add unavailable.");
            return;
        }

        // Diagnostic: shows exactly which methods the modal can call, so the
        // connect interception below can be pinned down if a key is missing.
        logger.info("Instagram handler keys:", Object.keys(handler));

        if (typeof handler.isSupported === "function") {
            saved.isSupported = handler.isSupported;
            handler.isSupported = () => true;
        }

        // Route any connect-style action to our editor instead of Discord OAuth.
        for (const key of ["connect", "authorize", "openConnection", "handleConnect", "getConnectionURL"]) {
            if (typeof handler[key] === "function") {
                saved[key] = handler[key];
                handler[key] = () => {
                    openManageConnections();
                    return undefined;
                };
            }
        }

        patched = true;
    } catch (e) {
        logger.error("Failed to install native Instagram connection", e);
    }
}

export function uninstallNativeInstagram() {
    if (!patched) return;

    try {
        const handler: any = platforms?.get?.("instagram");
        if (handler) for (const key of Object.keys(saved)) handler[key] = saved[key];
    } catch { /* ignore */ }

    for (const key of Object.keys(saved)) delete saved[key];
    patched = false;
}
