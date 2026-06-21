/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { HeadingTertiary } from "@components/Heading";
import { classNameFactory } from "@utils/css";
import { classes } from "@utils/misc";
import { Channel, RenderModalProps } from "@vencord/discord-types";
import { Button, Modal, openModal, Slider, TextInput, UserStore, useState } from "@webpack/common";

import { CleanJob, useCleanerStore } from "./engine";
import { settings } from "./settings";

const cl = classNameFactory("vc-msgcleaner-");

const HAS_OPTIONS = [
    { key: "image", label: "Images" },
    { key: "video", label: "Videos" },
    { key: "file", label: "Files" },
    { key: "sound", label: "Audio" },
    { key: "embed", label: "Embeds" },
    { key: "link", label: "Links" }
];

function WarnIcon() {
    return (
        <svg className={cl("warn-icon")} width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
    );
}

function channelLabel(channel: Channel): string {
    if (channel.name) return `#${channel.name}`;
    const recipientId = channel.recipients?.[0];
    const user = recipientId ? UserStore.getUser(recipientId) : null;
    return user ? `@${user.username}` : "this chat";
}

function jobStatusText(job: CleanJob): string {
    switch (job.status) {
        case "queued": return "Queued";
        case "scanning": return `Scanning… ${job.total ?? 0} found`;
        case "running": return job.total != null ? `${job.deleted} / ${job.total}` : `${job.deleted}…`;
        case "done": return `Done · ${job.deleted}`;
        case "cancelled": return `Cancelled · ${job.deleted}`;
        default: return `Error: ${job.error ?? "unknown"}`;
    }
}

function JobRow({ job, onCancel }: { job: CleanJob; onCancel: () => void; }) {
    const pct = job.total ? Math.min(100, Math.round((job.deleted / job.total) * 100)) : 0;

    return (
        <div className={cl("job")}>
            <div className={cl("job-main")}>
                <span className={classes(cl("job-dot"), cl(`job-dot-${job.status}`))} />
                <span className={cl("job-label")}>{job.label}</span>
                <span className={cl("job-status")}>{jobStatusText(job)}</span>
                {(job.status === "running" || job.status === "queued" || job.status === "scanning") && (
                    <button className={cl("job-cancel")} onClick={onCancel}>Cancel</button>
                )}
            </div>
            {job.status === "running" && job.total != null && (
                <div className={cl("progress")}>
                    <div className={cl("progress-fill")} style={{ width: `${pct}%` }} />
                </div>
            )}
        </div>
    );
}

function CleanerModal({ modalProps, channel }: { modalProps: RenderModalProps; channel: Channel; }) {
    const [has, setHas] = useState<string[]>([]);
    const [content, setContent] = useState("");
    const [amount, setAmount] = useState("");
    const [blocks, setBlocks] = useState(1);
    const [delay, setDelay] = useState(settings.store.delay);

    const store = useCleanerStore();
    const label = channelLabel(channel);

    const toggleHas = (key: string) => setHas(has.includes(key) ? has.filter(k => k !== key) : [...has, key]);

    function start() {
        const limit = parseInt(amount, 10);
        store.enqueue({
            channelId: channel.id,
            guildId: channel.guild_id ?? null,
            label,
            filters: { has, content, limit: Number.isFinite(limit) && limit > 0 ? limit : null },
            blocks,
            delay,
            deleted: 0,
            total: null,
            status: "queued"
        });
    }

    return (
        <Modal {...modalProps} size="md" title={`Clean your messages — ${label}`}>
            <div className={cl("body")}>
                <div className={cl("warn")}>
                    <WarnIcon />
                    <span>Mass-deleting messages can rate-limit or flag your account. This only deletes your own messages — use at your own risk.</span>
                </div>

                <div className={cl("section")}>
                    <HeadingTertiary className={cl("label")}>Filters</HeadingTertiary>
                    <div className={cl("chips")}>
                        {HAS_OPTIONS.map(option => (
                            <button
                                key={option.key}
                                className={classes(cl("chip"), has.includes(option.key) && cl("chip-on"))}
                                onClick={() => toggleHas(option.key)}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                    <span className={cl("hint")}>No filter selected deletes every message type.</span>
                </div>

                <div className={cl("section")}>
                    <HeadingTertiary className={cl("label")}>Contains</HeadingTertiary>
                    <TextInput value={content} onChange={setContent} placeholder="Only messages with this text (optional)" />
                </div>

                <div className={cl("section")}>
                    <HeadingTertiary className={cl("label")}>Amount</HeadingTertiary>
                    <TextInput value={amount} onChange={value => setAmount(value.replace(/\D/g, ""))} placeholder="Leave empty to delete all" />
                </div>

                <div className={cl("section")}>
                    <div className={cl("blocks-head")}>
                        <HeadingTertiary className={cl("label")}>Blocks · delete at once</HeadingTertiary>
                        <span className={cl("blocks-val")}>{blocks}</span>
                    </div>
                    <Slider
                        minValue={1}
                        maxValue={10}
                        initialValue={blocks}
                        markers={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}
                        stickToMarkers={true}
                        onValueChange={(value: number) => setBlocks(Math.round(value))}
                    />
                    <span className={cl("hint")}>Higher = faster but more requests at once, so riskier.</span>
                </div>

                <div className={cl("section")}>
                    <div className={cl("blocks-head")}>
                        <HeadingTertiary className={cl("label")}>Delay between deletes</HeadingTertiary>
                        <span className={cl("blocks-val")}>{delay}ms</span>
                    </div>
                    <Slider
                        minValue={200}
                        maxValue={3000}
                        initialValue={delay}
                        markers={[200, 1000, 2000, 3000]}
                        onValueChange={(value: number) => {
                            const ms = Math.round(value / 50) * 50;
                            setDelay(ms);
                            settings.store.delay = ms;
                        }}
                    />
                    <span className={cl("hint")}>Longer delay = safer against rate-limits.</span>
                </div>

                <Button color={Button.Colors.BRAND} className={cl("start")} onClick={start}>
                    Start cleaning {label}
                </Button>

                {store.jobs.length > 0 && (
                    <div className={cl("section")}>
                        <HeadingTertiary className={cl("label")}>Queue</HeadingTertiary>
                        <div className={cl("queue")}>
                            {store.jobs.map(job => (
                                <JobRow key={job.channelId} job={job} onCancel={() => store.cancel(job.channelId)} />
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
}

export function openCleanerModal(channel: Channel) {
    openModal(props => <CleanerModal modalProps={props} channel={channel} />);
}
