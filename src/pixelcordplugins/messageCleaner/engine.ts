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

export type JobStatus = "queued" | "running" | "done" | "cancelled" | "error";

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
        const active = get().jobs.find((j: CleanJob) => j.channelId === job.channelId && (j.status === "queued" || j.status === "running"));
        if (active) return;

        set({ jobs: [...get().jobs.filter((j: CleanJob) => j.channelId !== job.channelId), job] });
        if (!processing) processQueue(get, set);
    },

    cancel(channelId: string) {
        update(get, set, channelId, j => (j.status === "queued" || j.status === "running") ? { ...j, status: "cancelled" } : j);
        scheduleRemoval(get, set, channelId);
    },

    clearFinished() {
        set({ jobs: get().jobs.filter((j: CleanJob) => j.status === "queued" || j.status === "running") });
    }
} as CleanerState)));

function update(get: any, set: any, channelId: string, fn: (job: CleanJob) => CleanJob) {
    set({ jobs: get().jobs.map((j: CleanJob) => j.channelId === channelId ? fn(j) : j) });
}

function statusOf(get: any, channelId: string): JobStatus | undefined {
    return get().jobs.find((j: CleanJob) => j.channelId === channelId)?.status;
}

function scheduleRemoval(get: any, set: any, channelId: string) {
    setTimeout(() => {
        const job = get().jobs.find((j: CleanJob) => j.channelId === channelId);
        if (job && job.status !== "queued" && job.status !== "running") {
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
    update(get, set, job.channelId, j => ({ ...j, status: "running", total: job.filters.limit }));

    const me = UserStore.getCurrentUser().id;
    let remaining = job.filters.limit ?? Infinity;
    let deleted = 0;
    let before: string | undefined;

    try {
        while (remaining > 0 && statusOf(get, job.channelId) !== "cancelled") {
            const query: Record<string, any> = { limit: 100 };
            if (before) query.before = before;

            const res = await RestAPI.get({ url: Constants.Endpoints.MESSAGES(job.channelId), query });
            const page: any[] = res.body ?? [];
            if (!page.length) break;

            before = page[page.length - 1].id;

            const mine = page.filter((m: any) => m.author?.id === me && matchesFilters(m, job.filters));
            const take = remaining === Infinity ? mine : mine.slice(0, remaining);

            for (const batch of lodash.chunk(take, job.blocks)) {
                if (statusOf(get, job.channelId) === "cancelled") break;

                const results = await Promise.allSettled(batch.map((m: any) => deleteMessage(job.channelId, m.id)));
                const ok = results.filter(r => r.status === "fulfilled").length;

                deleted += ok;
                remaining -= ok;
                update(get, set, job.channelId, j => ({ ...j, deleted }));

                if (remaining <= 0) break;
                await sleep(job.delay + Math.floor(Math.random() * 400));
            }

            // Fewer than a full page means we reached the start of the channel.
            if (page.length < 100) break;
        }

        if (statusOf(get, job.channelId) !== "cancelled") {
            update(get, set, job.channelId, j => ({ ...j, status: "done" }));
        }
    } catch (e) {
        update(get, set, job.channelId, j => ({ ...j, status: "error", error: e instanceof Error ? e.message : String(e) }));
        logger.error(`Failed cleaning ${job.label}`, e);
    }

    scheduleRemoval(get, set, job.channelId);
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
