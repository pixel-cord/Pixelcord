/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { updateMessage } from "@api/MessageUpdater";
import { MessageStore, SelectedChannelStore } from "@webpack/common";

import { decrypt, encrypt } from "./crypto";
import { settings } from "./settings";

// Invisible (zero-width) prefix marking an encrypted message; the rest is base64
// ciphertext. No visible lock is added to the message.
export const MARKER = "\u200b\u200c";

export async function encryptContent(text: string): Promise<string | null> {
    const { key } = settings.store;
    if (!key) return null;
    return MARKER + await encrypt(text, key);
}

export async function tryDecrypt(message: any) {
    const { key } = settings.store;
    if (!key || typeof message?.content !== "string" || !message.content.startsWith(MARKER)) return;

    const plain = await decrypt(message.content.slice(MARKER.length), key);
    if (plain == null) return; // wrong key / unreadable

    updateMessage(message.channel_id, message.id, { content: plain });
}

// Re-decrypt the already-loaded messages in the open channel — used after the key
// is set, so old messages decrypt without needing to reopen the channel.
export function redecryptVisible() {
    const channelId = SelectedChannelStore.getChannelId();
    if (!channelId) return;

    const collection: any = MessageStore.getMessages(channelId);
    const messages: any[] = collection?.toArray?.() ?? collection?._array ?? [];
    for (const message of messages) tryDecrypt(message);
}
