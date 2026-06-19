/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { insertTextIntoChatInputBox } from "@utils/discord";
import { ComponentDispatch, DraftStore, DraftType, SelectedChannelStore } from "@webpack/common";

import { setShouldShowCorrectEnabledTooltip } from "./CorrectorIcon";
import { settings } from "./settings";
import { correctSilent } from "./utils";

let timer: any;
// Text we last wrote ourselves, so re-correcting our own output is skipped.
let lastApplied = "";

function getDraft(channelId: string): string {
    return DraftStore.getDraft(channelId, DraftType.ChannelMessage) ?? "";
}

function onDraftChange() {
    if (!settings.store.autoCorrect) return;
    clearTimeout(timer);
    timer = setTimeout(runCorrection, Math.max(400, settings.store.correctDelay || 1200));
}

async function runCorrection() {
    const channelId = SelectedChannelStore.getChannelId();
    if (!channelId) return;

    const text = getDraft(channelId);
    if (text.trim().length < 2 || text === lastApplied) return;

    // Leave the word currently being typed (no trailing whitespace) untouched, so
    // we never "autocorrect" a half-typed word out from under the cursor.
    let head = text;
    let tail = "";
    if (!/\s$/.test(text)) {
        const m = /\S+$/.exec(text);
        if (m) {
            head = text.slice(0, m.index);
            tail = text.slice(m.index);
        }
    }
    if (head.trim().length < 2) return;

    const result = await correctSilent(head);
    if (!result) return;

    const corrected = result.text + tail;
    if (corrected === text) return;

    // Bail if the user kept typing or switched channels while we were waiting.
    if (SelectedChannelStore.getChannelId() !== channelId) return;
    if (getDraft(channelId) !== text) return;

    lastApplied = corrected;
    ComponentDispatch.dispatchToLastSubscribed("CLEAR_TEXT");
    insertTextIntoChatInputBox(corrected);

    setShouldShowCorrectEnabledTooltip?.(true);
    setTimeout(() => setShouldShowCorrectEnabledTooltip?.(false), 2000);
}

export function startTypingCorrection() {
    DraftStore.addChangeListener(onDraftChange);
}

export function stopTypingCorrection() {
    DraftStore.removeChangeListener(onDraftChange);
    clearTimeout(timer);
    lastApplied = "";
}
