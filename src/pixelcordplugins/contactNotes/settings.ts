/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export interface Contact {
    notes: string;
    tags: string[];
    reminderAt: number | null;
    reminderText: string;
}

export const settings = definePluginSettings({
    contacts: {
        type: OptionType.CUSTOM,
        description: "",
        default: {} as Record<string, Contact>
    }
});

export const emptyContact = (): Contact => ({ notes: "", tags: [], reminderAt: null, reminderText: "" });

export function getContact(userId: string): Contact {
    return settings.store.contacts[userId] ?? emptyContact();
}

export function hasContact(userId: string): boolean {
    const c = settings.store.contacts[userId];
    return Boolean(c && (c.notes || c.tags.length || c.reminderAt));
}

export function saveContact(userId: string, contact: Contact) {
    const isEmpty = !contact.notes && contact.tags.length === 0 && contact.reminderAt == null;
    if (isEmpty) {
        delete settings.store.contacts[userId];
    } else {
        settings.store.contacts[userId] = contact;
    }
}
