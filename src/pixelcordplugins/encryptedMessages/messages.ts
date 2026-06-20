/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { updateMessage } from "@api/MessageUpdater";
import { MessageStore, SelectedChannelStore } from "@webpack/common";

import { decrypt, decryptLegacy, encrypt } from "./crypto";
import { settings } from "./settings";

// An encrypted message is just its base64 ciphertext — no marker. We only try to
// decrypt content that looks like pure base64 of plausible length, so normal
// messages are skipped cheaply.
const LOOKS_BASE64 = /^[A-Za-z0-9+/]{32,}={0,2}$/;
// Strip a leading marker left by older versions (🔐 or zero-width chars).
const LEADING_MARKER = /^[\u200B-\u200F\uFEFF\u{1F510}]+/u;

export async function encryptContent(text: string): Promise<string | null> {
    const { key } = settings.store;
    if (!key) return null;
    return encrypt(text, key);
}

export async function tryDecrypt(message: any) {
    const { key } = settings.store;
    if (!key || typeof message?.content !== "string") return;

    const content = message.content.replace(LEADING_MARKER, "").trim();
    if (!LOOKS_BASE64.test(content)) return;

    // Current format first, then the older salt-based one.
    const plain = await decrypt(content, key) ?? await decryptLegacy(content, key);
    if (plain == null) return; // not our ciphertext / wrong key

    updateMessage(message.channel_id, message.id, { content: plain });
}

// Re-decrypt the already-loaded messages in the open channel — used after the key
// is set, so old messages decrypt without needing to reopen the channel.
export function redecryptVisible() {
    const channelId = SelectedChannelStore.getChannelId();
    if (!channelId) return;

    const messages: any[] = (MessageStore.getMessages(channelId) as any)?._array ?? [];
    for (const message of messages) tryDecrypt(message);
}
