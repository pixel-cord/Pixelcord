/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DraftStore, DraftType, SelectedChannelStore } from "@webpack/common";

import { setShouldShowCorrectEnabledTooltip } from "./CorrectorIcon";
import { settings } from "./settings";
import { correctSilent } from "./utils";

let timer: any;
// True while we're writing our own correction, so the draft change it produces
// doesn't re-trigger another correction (that feedback loop is what duplicated
// the text). lastApplied is a second guard against re-correcting our own output.
let applying = false;
let lastApplied = "";

function getDraft(channelId: string): string {
    return DraftStore.getDraft(channelId, DraftType.ChannelMessage) ?? "";
}

// Replace the WHOLE chat input. CLEAR_TEXT and the DOM-Selection + INSERT_TEXT
// combo both just appended (Slate ignores a programmatic DOM selection). Go
// through the native contenteditable editing commands instead: execCommand fires
// the `beforeinput` events Slate actually listens to, so selectAll + insertText
// replaces the content. Returns false if it couldn't run, so we never append.
function setChatInput(text: string): boolean {
    let editor = document.activeElement as HTMLElement | null;
    if (!editor?.matches?.('[data-slate-editor="true"]'))
        editor = document.querySelector<HTMLElement>('[data-slate-editor="true"]');
    if (!editor) return false;

    editor.focus();
    try {
        document.execCommand("selectAll", false);
        return document.execCommand("insertText", false, text);
    } catch {
        return false;
    }
}

function onDraftChange() {
    if (!settings.store.autoCorrect || applying) return;
    clearTimeout(timer);
    timer = setTimeout(runCorrection, Math.max(400, settings.store.correctDelay || 1200));
}

async function runCorrection() {
    const channelId = SelectedChannelStore.getChannelId();
    if (!channelId) return;

    const text = getDraft(channelId);
    if (text.trim().length < 2 || text === lastApplied) return;

    // Leave the word currently being typed (no trailing whitespace) untouched.
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

    applying = true;
    let ok = false;
    try {
        ok = setChatInput(corrected);
    } finally {
        // Let the draft-change events from our own write settle before re-listening.
        setTimeout(() => { applying = false; }, 250);
    }

    if (!ok) return;
    lastApplied = corrected;

    setShouldShowCorrectEnabledTooltip?.(true);
    setTimeout(() => setShouldShowCorrectEnabledTooltip?.(false), 2000);
}

export function startTypingCorrection() {
    DraftStore.addChangeListener(onDraftChange);
}

export function stopTypingCorrection() {
    DraftStore.removeChangeListener(onDraftChange);
    clearTimeout(timer);
    applying = false;
    lastApplied = "";
}
