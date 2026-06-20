/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";
import { findByPropsLazy } from "@webpack";

import { openManageConnections } from "../components";

// Discord's connection-platform registry. `get(type)` returns a platform
// descriptor; the descriptor's `enabled` flag controls whether it's offered in
// the "Add connection" modal (Discord set Instagram's to false).
const platforms: any = findByPropsLazy("isSupported", "getByUrl");
const logger = new Logger("MoreConnections");

let patched = false;
const saved: Record<string, any> = {};

export function installNativeInstagram() {
    if (patched) return;

    try {
        const handler: any = platforms?.get?.("instagram");
        if (!handler) {
            logger.warn("Instagram platform handler not found — native add unavailable.");
            return;
        }

        // Diagnostics: handler shape + registry methods (to locate the connect action).
        logger.info("Instagram handler keys:", Object.keys(handler), "| enabled:", handler.enabled);
        logger.info("Registry keys:", Object.keys(platforms));

        // Re-enable Instagram so it shows in the Add Connection modal.
        if ("enabled" in handler) {
            saved.handlerEnabled = handler.enabled;
            handler.enabled = true;
        }
        if (typeof platforms.isSupported === "function") {
            saved.registryIsSupported = platforms.isSupported;
            platforms.isSupported = (type: string, ...rest: any[]) =>
                type === "instagram" ? true : saved.registryIsSupported.call(platforms, type, ...rest);
        }

        // Best-effort: route any connect-style action on the descriptor to our
        // editor. The connect likely lives elsewhere — the logged keys will say.
        for (const key of ["connect", "authorize", "openConnection", "handleConnect"]) {
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
        if (handler) {
            if ("handlerEnabled" in saved) handler.enabled = saved.handlerEnabled;
            for (const key of ["connect", "authorize", "openConnection", "handleConnect"])
                if (key in saved) handler[key] = saved[key];
        }
        if (saved.registryIsSupported) platforms.isSupported = saved.registryIsSupported;
    } catch { /* ignore */ }

    for (const key of Object.keys(saved)) delete saved[key];
    patched = false;
}
