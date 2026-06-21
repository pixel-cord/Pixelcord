/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { proxyLazy } from "@utils/lazy";
import { Logger } from "@utils/Logger";
import { sleep } from "@utils/misc";
import { Constants, lodash, RestAPI, UserStore, zustandCreate } from "@webpack/common";

const logger = new Logger("MessageCleaner");

export interface CleanFilters {
    has: string[];
    content: string;
    limit: number | null;
}

export type JobStatus = "queued" | "scanning" | "running" | "done" | "cancelled" | "error";

export interface CleanJob {
    channelId: string;
    guildId: string | null;
    label: string;
    filters: CleanFilters;
    blocks: number;
    delay: number;
    deleted: number;
    total: number | null;
    status: JobStatus;
    error?: string;
}

interface CleanerState {
    jobs: CleanJob[];
    enqueue: (job: CleanJob) => void;
    cancel: (channelId: string) => void;
    clearFinished: () => void;
}

let processing = false;

export const useCleanerStore = proxyLazy(() => zustandCreate((set: any, get: any) => ({
    jobs: [] as CleanJob[],

    enqueue(job: CleanJob) {
        const active = get().jobs.find((j: CleanJob) => j.channelId === job.channelId && isActive(j.status));
        if (active) return;

        set({ jobs: [...get().jobs.filter((j: CleanJob) => j.channelId !== job.channelId), job] });
        if (!processing) processQueue(get, set);
    },

    cancel(channelId: string) {
        update(get, set, channelId, j => isActive(j.status) ? { ...j, status: "cancelled" } : j);
        scheduleRemoval(get, set, channelId);
    },

    clearFinished() {
        set({ jobs: get().jobs.filter((j: CleanJob) => isActive(j.status)) });
    }
} as CleanerState)));

// "Active" = still queued or in progress (scanning or deleting).
function isActive(status: JobStatus): boolean {
    return status === "queued" || status === "scanning" || status === "running";
}

function update(get: any, set: any, channelId: string, fn: (job: CleanJob) => CleanJob) {
    set({ jobs: get().jobs.map((j: CleanJob) => j.channelId === channelId ? fn(j) : j) });
}

function statusOf(get: any, channelId: string): JobStatus | undefined {
    return get().jobs.find((j: CleanJob) => j.channelId === channelId)?.status;
}

function scheduleRemoval(get: any, set: any, channelId: string) {
    setTimeout(() => {
        const job = get().jobs.find((j: CleanJob) => j.channelId === channelId);
        if (job && !isActive(job.status)) {
            set({ jobs: get().jobs.filter((j: CleanJob) => j.channelId !== channelId) });
        }
    }, 4000);
}

async function processQueue(get: any, set: any) {
    processing = true;
    try {
        for (let job = nextQueued(get); job; job = nextQueued(get)) {
            await runJob(job, get, set);
        }
    } finally {
        processing = false;
    }
}

function nextQueued(get: any): CleanJob | undefined {
    return get().jobs.find((j: CleanJob) => j.status === "queued");
}

async function runJob(job: CleanJob, get: any, set: any) {
    update(get, set, job.channelId, j => ({ ...j, status: "scanning", total: 0, deleted: 0 }));

    try {
        // Phase 1 — scan the whole history first and collect every matching message
        // of ours, so we know the full set before touching anything. This makes the
        // total accurate and lets the delete phase retry failures reliably.
        const ids = await collectMessages(job, get, set);

        if (statusOf(get, job.channelId) === "cancelled") {
            scheduleRemoval(get, set, job.channelId);
            return;
        }

        // Phase 2 — delete from the known list, retrying anything that fails.
        update(get, set, job.channelId, j => ({ ...j, status: "running", total: ids.length, deleted: 0 }));

        let deleted = 0;
        let pending = ids;

        for (let attempt = 0; attempt < 3 && pending.length && statusOf(get, job.channelId) !== "cancelled"; attempt++) {
            const failed: string[] = [];

            for (const batch of lodash.chunk(pending, job.blocks)) {
                if (statusOf(get, job.channelId) === "cancelled") break;

                const results = await Promise.allSettled(batch.map((id: string) => deleteMessage(job.channelId, id)));
                results.forEach((res, i) => {
                    // A 404 / "Unknown Message" means it's already gone — count it as done.
                    if (res.status === "fulfilled" || isAlreadyGone(res.reason)) deleted++;
                    else failed.push(batch[i]);
                });

                update(get, set, job.channelId, j => ({ ...j, deleted }));
                await sleep(job.delay + Math.floor(Math.random() * 400));
            }

            pending = failed;
            if (pending.length) await sleep(1000); // brief backoff before retrying failures
        }

        if (statusOf(get, job.channelId) === "cancelled") {
            // leave as cancelled
        } else if (pending.length) {
            update(get, set, job.channelId, j => ({ ...j, status: "error", error: `${pending.length} message(s) could not be deleted` }));
        } else {
            update(get, set, job.channelId, j => ({ ...j, status: "done" }));
        }
    } catch (e) {
        update(get, set, job.channelId, j => ({ ...j, status: "error", error: e instanceof Error ? e.message : String(e) }));
        logger.error(`Failed cleaning ${job.label}`, e);
    }

    scheduleRemoval(get, set, job.channelId);
}

// Phase 1: paginate the entire channel (read-only) and gather the ids of our own
// messages that match the filters, up to the optional limit.
async function collectMessages(job: CleanJob, get: any, set: any): Promise<string[]> {
    const me = UserStore.getCurrentUser().id;
    const limit = job.filters.limit ?? Infinity;
    const ids: string[] = [];
    let before: string | undefined;

    while (ids.length < limit && statusOf(get, job.channelId) !== "cancelled") {
        const query: Record<string, any> = { limit: 100 };
        if (before) query.before = before;

        const res = await RestAPI.get({ url: Constants.Endpoints.MESSAGES(job.channelId), query });
        const page: any[] = res.body ?? [];
        if (!page.length) break;

        before = page[page.length - 1].id;

        for (const m of page) {
            if (m.author?.id === me && matchesFilters(m, job.filters)) {
                ids.push(m.id);
                if (ids.length >= limit) break;
            }
        }

        // Surface scan progress live (shown as "Scanning… N found").
        update(get, set, job.channelId, j => ({ ...j, total: ids.length }));

        // Fewer than a full page means we reached the start of the channel.
        if (page.length < 100) break;
        await sleep(250 + Math.floor(Math.random() * 200)); // gentle pacing while scanning
    }

    return ids;
}

function isAlreadyGone(reason: any): boolean {
    return reason?.status === 404 || reason?.body?.code === 10008;
}

function matchesFilters(msg: any, filters: CleanFilters): boolean {
    const content = filters.content.trim().toLowerCase();
    if (content && !(msg.content ?? "").toLowerCase().includes(content)) return false;

    if (!filters.has.length) return true;

    const attachments: any[] = msg.attachments ?? [];
    const embeds: any[] = msg.embeds ?? [];

    const isImage = (a: any) => (a.content_type ?? "").startsWith("image") || /\.(png|jpe?g|gif|webp|bmp)$/i.test(a.filename ?? "");
    const isVideo = (a: any) => (a.content_type ?? "").startsWith("video") || /\.(mp4|webm|mov|mkv|m4v)$/i.test(a.filename ?? "");
    const isAudio = (a: any) => (a.content_type ?? "").startsWith("audio") || /\.(mp3|ogg|wav|m4a|flac)$/i.test(a.filename ?? "");

    const present: Record<string, boolean> = {
        image: attachments.some(isImage) || embeds.some(e => e.type === "image" || e.image),
        video: attachments.some(isVideo) || embeds.some(e => e.type === "video" || e.video),
        file: attachments.some(a => !isImage(a) && !isVideo(a) && !isAudio(a)),
        sound: attachments.some(isAudio),
        embed: embeds.length > 0,
        link: /https?:\/\/\S+/.test(msg.content ?? "")
    };

    return filters.has.some(has => present[has]);
}

async function deleteMessage(channelId: string, messageId: string) {
    await RestAPI.del({ url: Constants.Endpoints.MESSAGE(channelId, messageId) });
}
