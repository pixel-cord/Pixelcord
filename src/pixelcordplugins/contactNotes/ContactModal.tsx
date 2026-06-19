/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { HeadingSecondary } from "@components/Heading";
import { classNameFactory } from "@utils/css";
import { classes } from "@utils/misc";
import { RenderModalProps, User } from "@vencord/discord-types";
import { Modal, openModal, TextArea, TextInput, useState } from "@webpack/common";

import { scheduleReminder } from "./reminders";
import { Contact, getContact, saveContact } from "./settings";

const cl = classNameFactory("vc-contactnotes-");

// "keep" = leave the existing reminder untouched, a number = ms offset from now
// (0 clears it), "custom" = use the date/time the user picked below.
type ReminderMode = "keep" | "custom" | number;

const REMINDER_PRESETS: { label: string; mode: ReminderMode; }[] = [
    { label: "None", mode: 0 },
    { label: "In 1 hour", mode: 60 * 60_000 },
    { label: "Tomorrow", mode: 24 * 60 * 60_000 },
    { label: "In 3 days", mode: 3 * 24 * 60 * 60_000 },
    { label: "In 1 week", mode: 7 * 24 * 60 * 60_000 },
    { label: "Custom…", mode: "custom" }
];

export function openContactModal(user: User) {
    openModal(modalProps => <ContactDialog user={user} modalProps={modalProps} />);
}

function ContactDialog({ user, modalProps }: { user: User; modalProps: RenderModalProps; }) {
    const existing = getContact(user.id);

    const [notes, setNotes] = useState(existing.notes);
    const [tags, setTags] = useState<string[]>(existing.tags);
    const [tagDraft, setTagDraft] = useState("");
    const [reminderMode, setReminderMode] = useState<ReminderMode>("keep");
    const [customAt, setCustomAt] = useState("");
    const [reminderText, setReminderText] = useState(existing.reminderText);

    const hasPendingReminder = existing.reminderAt != null;

    const willHaveReminder =
        reminderMode === "keep" ? hasPendingReminder
            : reminderMode === "custom" ? Boolean(customAt)
                : reminderMode > 0;

    const customInPast = reminderMode === "custom" && Boolean(customAt) && new Date(customAt).getTime() <= Date.now();

    function addTag() {
        const tag = tagDraft.trim();
        if (tag && !tags.includes(tag)) setTags([...tags, tag]);
        setTagDraft("");
    }

    function resolveReminderAt(): number | null {
        if (reminderMode === "keep") return existing.reminderAt;
        if (reminderMode === "custom") return customAt ? new Date(customAt).getTime() : existing.reminderAt;
        return reminderMode === 0 ? null : Date.now() + reminderMode;
    }

    function save() {
        const contact: Contact = { notes, tags, reminderAt: resolveReminderAt(), reminderText };
        saveContact(user.id, contact);
        scheduleReminder(user.id);
        modalProps.onClose();
    }

    return (
        <Modal
            {...modalProps}
            title={`Notes · ${user.username}`}
            subtitle="Private notes, tags and reminders — only visible to you."
            actions={[
                { text: "Cancel", variant: "secondary", onClick: modalProps.onClose },
                { text: "Save", variant: "primary", onClick: save, disabled: customInPast }
            ]}
            notice={customInPast ? { message: "That time is already in the past.", type: "critical" } : undefined}
        >
            <div className={cl("body")}>
                <section>
                    <HeadingSecondary>Notes</HeadingSecondary>
                    <TextArea value={notes} onChange={setNotes} placeholder="How you met, what they owe you, timezone…" rows={4} autosize />
                </section>

                <section>
                    <HeadingSecondary>Tags</HeadingSecondary>
                    {tags.length > 0 && (
                        <div className={cl("tags")}>
                            {tags.map(tag => (
                                <button key={tag} className={cl("tag")} onClick={() => setTags(tags.filter(t => t !== tag))}>
                                    {tag} <span className={cl("tag-x")}>×</span>
                                </button>
                            ))}
                        </div>
                    )}
                    <div className={cl("tag-add")}>
                        <TextInput value={tagDraft} onChange={setTagDraft} placeholder="friend, work, owes me…" />
                        <button className={cl("add-btn")} onClick={addTag} disabled={!tagDraft.trim()}>Add</button>
                    </div>
                </section>

                <section>
                    <HeadingSecondary>Reminder</HeadingSecondary>
                    {hasPendingReminder && reminderMode === "keep" && (
                        <span className={cl("pending")}>
                            Active reminder for {new Date(existing.reminderAt!).toLocaleString()}
                        </span>
                    )}
                    <div className={cl("presets")}>
                        {REMINDER_PRESETS.map(preset => (
                            <button
                                key={preset.label}
                                className={classes(cl("preset"), reminderMode === preset.mode && cl("preset-on"))}
                                onClick={() => setReminderMode(preset.mode)}
                            >
                                {preset.label}
                            </button>
                        ))}
                    </div>

                    {reminderMode === "custom" && (
                        <input
                            type="datetime-local"
                            className={cl("datetime")}
                            value={customAt}
                            onChange={e => setCustomAt(e.currentTarget.value)}
                        />
                    )}

                    {willHaveReminder && (
                        <TextInput
                            value={reminderText}
                            onChange={setReminderText}
                            placeholder="What should the reminder say?"
                        />
                    )}
                </section>
            </div>
        </Modal>
    );
}
