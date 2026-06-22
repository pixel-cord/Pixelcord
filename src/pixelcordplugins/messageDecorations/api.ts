/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";

import { BASE_URL } from "../moreConnections/lib/constants";
import { BUILTIN_DECORATIONS } from "./builtin";

export interface Decoration {
    id: string;
    name: string;
    /** URL of the character art. Always rendered through <img>, never inlined. */
    character: string;
    borderColor: string;
    backgroundColor: string;
    textColor: string;
    /** Which side the character sits on. */
    position: "left" | "right";
    /** Where it sits vertically: peeking over the top rim, or below holding the card
        (e.g. the tongue frog). Defaults to "top". */
    anchor?: "top" | "bottom";
}

const logger = new Logger("MessageDecorations");

// The catalog and its character assets only ever come from our own infra. We refuse
// anything else, so a tampered or man-in-the-middled response can't point an <img> at a
// tracker, pull an asset off an arbitrary host, or sneak a non-colour value into CSS.
const ALLOWED_ASSET_HOSTS = ["api.pixelcord.com.br", "cdn.pixelcord.com.br"];
const ID_RE = /^[a-z0-9-]{1,32}$/;
const COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

function isSafeAssetUrl(url: unknown): url is string {
    if (typeof url !== "string") return false;
    try {
        const u = new URL(url);
        return u.protocol === "https:" && ALLOWED_ASSET_HOSTS.includes(u.hostname);
    } catch {
        return false;
    }
}

// Validates one catalog entry and returns a clean Decoration, or null to drop it. We
// never trust the server blindly: ids must be slugs, every colour must be plain hex
// (so it's safe as a CSS value), the character must be an https asset on our hosts, and
// position must be one of the two anchors.
function sanitize(entry: any): Decoration | null {
    if (!entry || typeof entry !== "object") return null;
    const { id, name, character, borderColor, backgroundColor, textColor, position, anchor } = entry;

    if (!ID_RE.test(id)) return null;
    if (!isSafeAssetUrl(character)) return null;
    if (![borderColor, backgroundColor, textColor].every(c => COLOR_RE.test(c))) return null;
    if (position !== "left" && position !== "right") return null;

    return {
        id,
        name: typeof name === "string" && name.trim() ? name.slice(0, 64) : id,
        character,
        borderColor,
        backgroundColor,
        textColor,
        position,
        anchor: anchor === "bottom" ? "bottom" : "top"
    };
}

// In-memory catalog cache. `byId` is the lookup the renderer uses per message.
// The catalog always starts with the bundled built-ins, so the plugin shows
// decorations immediately and keeps working even if the backend is down or absent.
const builtinIds = new Set(BUILTIN_DECORATIONS.map(d => d.id));
let catalog: Decoration[] = [...BUILTIN_DECORATIONS];
let byId = new Map<string, Decoration>(BUILTIN_DECORATIONS.map(d => [d.id, d]));
let remoteLoaded = false;
let inflight: Promise<Decoration[]> | null = null;

export function getCatalog(): Decoration[] {
    return catalog;
}

export function getDecoration(id: string): Decoration | undefined {
    return byId.get(id);
}

/**
 * Loads the remote catalog and merges it onto the built-ins, validating every remote
 * entry. Cached in memory; pass `force` to revalidate (e.g. when the picker opens).
 * Concurrent calls share one request, and a failed refresh keeps whatever we had (at
 * least the built-ins). Built-ins win id collisions so their trusted art can't be
 * shadowed by the server.
 */
export async function loadCatalog(force = false): Promise<Decoration[]> {
    if (remoteLoaded && !force) return catalog;
    if (inflight) return inflight;

    inflight = (async () => {
        try {
            const res = await fetch(`${BASE_URL}/api/message-decorations`);
            if (!res.ok) throw new Error(`catalog fetch failed (${res.status})`);

            const data = await res.json();
            const remote = Array.isArray(data)
                ? data.map(sanitize).filter((d): d is Decoration => d != null && !builtinIds.has(d.id))
                : [];

            catalog = [...BUILTIN_DECORATIONS, ...remote];
            byId = new Map(catalog.map(d => [d.id, d]));
            remoteLoaded = true;
            return catalog;
        } catch (e) {
            logger.error("Failed to load decoration catalog.", e);
            return catalog;
        } finally {
            inflight = null;
        }
    })();

    return inflight;
}
