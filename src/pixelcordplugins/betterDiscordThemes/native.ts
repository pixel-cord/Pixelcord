/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ensureSafePath } from "@main/ipcMain";
import { THEMES_DIR } from "@main/utils/constants";
import { IpcMainInvokeEvent } from "electron";
import { existsSync, writeFileSync } from "fs";

const BASE = "https://betterdiscord.app";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const RAW_GITHUB = /^https:\/\/raw\.githubusercontent\.com\//;

// SvelteKit __data.json is a devalue payload: a flat array where object/array
// values are indices into the same array. Walk the references to rebuild it.
function unflatten(flat: any[]): any {
    const hydrated = new Array(flat.length);
    const seen = new Array(flat.length).fill(false);

    function hydrate(index: any): any {
        if (typeof index !== "number") return index;
        if (index < 0) return undefined;
        if (seen[index]) return hydrated[index];

        const value = flat[index];
        if (value === null || typeof value !== "object") {
            seen[index] = true;
            hydrated[index] = value;
            return value;
        }

        if (Array.isArray(value)) {
            if (typeof value[0] === "string" && value[0] === "Date") {
                const date = new Date(value[1]);
                seen[index] = true;
                hydrated[index] = date;
                return date;
            }
            const arr: any[] = [];
            seen[index] = true;
            hydrated[index] = arr;
            for (const ref of value) arr.push(hydrate(ref));
            return arr;
        }

        const obj: any = {};
        seen[index] = true;
        hydrated[index] = obj;
        for (const key in value) obj[key] = hydrate(value[key]);
        return obj;
    }

    return hydrate(0);
}

async function fetchData(path: string): Promise<any> {
    const res = await fetch(`${BASE}${path}`, { headers: { "User-Agent": UA, Accept: "*/*" } });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const json: any = await res.json();
    const node = json?.nodes?.find((n: any) => n?.type === "data");
    if (!node?.data) throw new Error("unexpected response shape");
    return unflatten(node.data);
}

function simplify(addon: any) {
    return {
        id: addon.id,
        name: addon.name,
        description: addon.description ?? "",
        downloads: addon.downloads ?? 0,
        likes: Number(addon.likes) || 0,
        thumbnailId: addon.thumbnailId,
        tags: Array.isArray(addon.tags) ? addon.tags : [],
        author: addon.author?.login?.displayName ?? addon.author?.githubName ?? "unknown",
        releaseDate: addon.releaseDate ?? addon.creationDate ?? ""
    };
}

async function resolveRelease(name: string): Promise<any> {
    const data = await fetchData(`/themes/${encodeURIComponent(name)}/__data.json?x-sveltekit-invalidated=01`);
    return (data?.addon ?? data)?.latestApprovedRelease;
}

function fileFor(name: string): string | null {
    const safe = name.replace(/[^\w.-]+/g, "_").replace(/^[._]+/, "").slice(0, 80);
    if (!safe) return null;
    return ensureSafePath(THEMES_DIR, `${safe}.theme.css`);
}

export async function getThemes(_: IpcMainInvokeEvent) {
    try {
        const data = await fetchData("/themes/__data.json?x-sveltekit-invalidated=01");
        const addons = Array.isArray(data?.addons) ? data.addons : [];
        return { success: true as const, themes: addons.map(simplify) };
    } catch (e) {
        return { success: false as const, error: e instanceof Error ? e.message : String(e) };
    }
}

export async function getThemeMeta(_: IpcMainInvokeEvent, name: string) {
    if (typeof name !== "string" || !name || name.length > 120) return { success: false as const, error: "invalid name" };
    try {
        const release = await resolveRelease(name);
        return { success: true as const, rawPath: release?.rawPath ?? null, meta: release?.meta ?? null };
    } catch (e) {
        return { success: false as const, error: e instanceof Error ? e.message : String(e) };
    }
}

export async function themeExists(_: IpcMainInvokeEvent, name: string) {
    if (typeof name !== "string") return false;
    const path = fileFor(name);
    return path ? existsSync(path) : false;
}

export async function installTheme(_: IpcMainInvokeEvent, name: string) {
    if (typeof name !== "string" || !name || name.length > 120) return { success: false as const, error: "invalid name" };

    const path = fileFor(name);
    if (!path) return { success: false as const, error: "invalid name" };

    try {
        const release = await resolveRelease(name);
        const rawPath: string | undefined = release?.rawPath;
        if (!rawPath || !RAW_GITHUB.test(rawPath)) {
            return { success: false as const, error: "no valid GitHub source for this theme" };
        }

        const download = await fetch(rawPath, { headers: { "User-Agent": UA } });
        if (!download.ok) return { success: false as const, error: `download failed (${download.status})` };

        const css = await download.text();
        if (css.length > 5_000_000) return { success: false as const, error: "theme file too large" };

        writeFileSync(path, css);
        return { success: true as const };
    } catch (e) {
        return { success: false as const, error: e instanceof Error ? e.message : String(e) };
    }
}
