/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { CspPolicies, ImageSrc } from "@main/csp";
import { IpcMainInvokeEvent } from "electron";

// codex-pets.net serves both its /api/pets manifest and the /assets sprites from
// the same host. img-src lets the renderer display the sprites; the JSON manifest
// is fetched here in the main process because codex-pets.net sends no
// Access-Control-Allow-Origin header, so a renderer-side fetch is blocked by CORS.
CspPolicies["codex-pets.net"] = ImageSrc;

const NET_API = "https://codex-pets.net/api/pets";
const NET_PAGE_SIZE = 50; // codex-pets.net rejects anything larger with HTTP 400
const NET_MAX_PAGES = 120; // safety cap so a misbehaving API can't loop forever
const NET_CONCURRENCY = 6; // parallel page requests while paginating
const REQUEST_TIMEOUT = 15_000;

export interface Pet {
    slug: string;
    name: string;
    url: string;
    desc: string;
}

async function fetchJson(url: string): Promise<any> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    try {
        const res = await fetch(url, { headers: { accept: "application/json" }, signal: controller.signal });
        if (!res.ok) throw new Error("HTTP " + res.status);
        return await res.json();
    } finally {
        clearTimeout(timeout);
    }
}

// codex-pets.net ships a standard 8x9 sprite atlas and keys each pet by `id`.
function toPet(raw: any): Pet | null {
    const slug = raw?.id ?? raw?.slug;
    if (!slug || !raw?.spritesheetUrl) return null;
    return {
        slug: String(slug),
        name: String(raw.displayName || slug),
        url: String(raw.spritesheetUrl),
        desc: raw.description ? String(raw.description) : ""
    };
}

function toPets(list: any): Pet[] {
    return (Array.isArray(list) ? list : []).map(toPet).filter((p): p is Pet => p !== null);
}

export async function getPets(_: IpcMainInvokeEvent): Promise<Pet[]> {
    const first = await fetchJson(`${NET_API}?page=1&pageSize=${NET_PAGE_SIZE}`);
    const collected = toPets(first?.pets);

    const pageSize = Number(first?.pageSize) || NET_PAGE_SIZE;
    const reported = Number(first?.totalPages) || Math.ceil((Number(first?.total) || 0) / pageSize) || 1;
    const totalPages = Math.min(reported, NET_MAX_PAGES);

    // Pages 2..totalPages, fetched in small concurrent batches.
    for (let start = 2; start <= totalPages; start += NET_CONCURRENCY) {
        const batch: Promise<Pet[]>[] = [];
        for (let p = start; p < start + NET_CONCURRENCY && p <= totalPages; p++) {
            batch.push(
                fetchJson(`${NET_API}?page=${p}&pageSize=${NET_PAGE_SIZE}`)
                    .then(j => toPets(j?.pets))
                    .catch(() => [])
            );
        }
        for (const part of await Promise.all(batch)) collected.push(...part);
    }

    // Drop repeats by id (safety across paginated requests) and sort by name.
    const byKey = new Map<string, Pet>();
    for (const p of collected) {
        const key = p.slug.toLowerCase();
        if (key && !byKey.has(key)) byKey.set(key, p);
    }
    return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}
