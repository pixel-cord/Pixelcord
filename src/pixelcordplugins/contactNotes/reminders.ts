/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showNotification } from "@api/Notifications";
import { openPrivateChannel } from "@utils/discord";
import { UserStore } from "@webpack/common";

import { getContact, saveContact, settings } from "./settings";

// setTimeout overflows past this; reschedule on the next launch instead.
const MAX_DELAY = 2_147_483_647;

const timers = new Map<string, ReturnType<typeof setTimeout>>();

function clear(userId: string) {
    const t = timers.get(userId);
    if (t) {
        clearTimeout(t);
        timers.delete(userId);
    }
}

function buildBody(contact: ReturnType<typeof getContact>): string {
    const reminder = contact.reminderText.trim();
    const note = contact.notes.trim();

    if (reminder && note) return `${reminder}\n\n📝 ${note}`;
    if (reminder) return reminder;
    if (note) return `📝 ${note}`;
    return "You set a reminder about this person. Click to open the DM.";
}

function fire(userId: string) {
    timers.delete(userId);

    const contact = getContact(userId);
    const user = UserStore.getUser(userId);
    const name = user?.username ?? "a contact";

    showNotification({
        title: `Reminder · ${name}`,
        body: buildBody(contact),
        icon: user?.getAvatarURL?.(undefined, 128),
        onClick: () => openPrivateChannel(userId)
    });

    // Clear the fired reminder but keep the notes and tags around.
    saveContact(userId, { ...contact, reminderAt: null, reminderText: "" });
}

export function scheduleReminder(userId: string) {
    clear(userId);

    const { reminderAt } = getContact(userId);
    if (reminderAt == null) return;

    const delay = reminderAt - Date.now();
    if (delay <= 0) {
        fire(userId);
        return;
    }
    if (delay > MAX_DELAY) return; // too far out; picked up on next start

    timers.set(userId, setTimeout(() => fire(userId), delay));
}

export function scheduleAll() {
    for (const userId of Object.keys(settings.store.contacts)) {
        scheduleReminder(userId);
    }
}

export function clearAll() {
    for (const t of timers.values()) clearTimeout(t);
    timers.clear();
}
