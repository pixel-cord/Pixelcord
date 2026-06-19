/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findByPropsLazy } from "@webpack";
import { DraftStore, DraftType, SelectedChannelStore } from "@webpack/common";

import { setShouldShowCorrectEnabledTooltip } from "./CorrectorIcon";
import { settings } from "./settings";
import { correctSilent } from "./utils";

// Slate's own editor API — the only thing the chat input reliably honours.
const Transforms = findByPropsLazy("insertNodes", "textToText");
const SlateEditor = findByPropsLazy("start", "end", "toSlateRange");

// The chat input's editor ref, captured by the patch in index.tsx.
let editorRef: any = null;
export function setEditorRef(ref: any) {
    editorRef = ref;
}

let timer: any;
// True while we're writing our own correction, so the draft change it produces
// doesn't re-trigger another correction (that feedback loop is what duplicated
// the text). lastApplied is a second guard against re-correcting our own output.
let applying = false;
let lastApplied = "";

function getDraft(channelId: string): string {
    return DraftStore.getDraft(channelId, DraftType.ChannelMessage) ?? "";
}

// Replace the WHOLE chat input through Slate's own editor API. Every DOM-level
// approach (CLEAR_TEXT, DOM-Selection + INSERT_TEXT, execCommand) just appended,
// because Slate keeps its own model and ignores them. Selecting the full document
// and inserting over it deletes the old content and inserts the new — a true
// replace. Returns false if the editor isn't available, so we never append.
function setChatInput(text: string): boolean {
    const editor = editorRef?.current?.getSlateEditor?.();
    if (!editor) return false;

    try {
        Transforms.select(editor, {
            anchor: SlateEditor.start(editor, []),
            focus: SlateEditor.end(editor, [])
        });
        Transforms.insertText(editor, text);
        return true;
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
