/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { classNameFactory } from "@utils/css";
import { PluginNative } from "@utils/types";
import { showToast, Toasts } from "@webpack/common";

import { settings } from "./settings";

export const cl = classNameFactory("vc-correct-");

const Native = VencordNative.pluginHelpers.Corrector as PluginNative<typeof import("./native")>;

interface LanguageToolMatch {
    offset: number;
    length: number;
    replacements: { value: string; }[];
    rule?: {
        issueType?: string;
        category?: { id?: string; };
    };
}

export interface CorrectionValue {
    text: string;
    fixes: number;
}

// "Style" suggestions that make an autocorrect feel intrusive — skipped unless
// the user picks "Everything".
const STYLE_CATEGORIES = new Set(["STYLE", "TYPOGRAPHY", "CASING", "REDUNDANCY", "COLLOQUIALISMS", "PLAIN_ENGLISH", "CREATIVE_WRITING"]);
const STYLE_ISSUE_TYPES = new Set(["style", "typographical", "register", "locale-violation"]);

function inScope(m: LanguageToolMatch, scope: string): boolean {
    if (scope === "all") return true;
    const category = m.rule?.category?.id ?? "";
    const issue = m.rule?.issueType ?? "";
    if (scope === "spelling") return issue === "misspelling" || category === "TYPOS";
    // "grammar": everything except the noisy style/casing/typography rules.
    return !STYLE_CATEGORIES.has(category) && !STYLE_ISSUE_TYPES.has(issue);
}

// Spans that must never be touched (correcting inside them would break the
// mention/emoji/link/code), so any match overlapping one is dropped.
function protectedRanges(text: string): Array<[number, number]> {
    const ranges: Array<[number, number]> = [];
    const patterns = [
        /```[\s\S]*?```/g,        // code blocks
        /`[^`\n]+`/g,             // inline code
        /<a?:\w+:\d+>/g,          // custom / animated emoji
        /<[@#][!&]?\d+>/g,        // user / role / channel mentions
        /:[a-z0-9_+-]+:/gi,       // :shortcode: emoji
        /https?:\/\/\S+/gi,       // links
        /@(?:everyone|here)\b/gi  // @everyone / @here
    ];
    for (const re of patterns) {
        let m: RegExpExecArray | null;
        while ((m = re.exec(text))) ranges.push([m.index, m.index + m[0].length]);
    }
    return ranges;
}

// Apply LanguageTool's suggested replacements. Walk from the end so earlier
// offsets stay valid as we splice. Skip matches with no replacement, ones out of
// the chosen scope, and ones overlapping a protected span.
function applyMatches(text: string, matches: LanguageToolMatch[], scope: string): CorrectionValue {
    const ranges = protectedRanges(text);
    let result = text;
    let fixes = 0;

    for (const m of [...matches].sort((a, b) => b.offset - a.offset)) {
        const replacement = m.replacements?.[0]?.value;
        if (replacement == null) continue;
        if (!inScope(m, scope)) continue;
        const end = m.offset + m.length;
        if (ranges.some(([s, e]) => m.offset < e && end > s)) continue;
        result = result.slice(0, m.offset) + replacement + result.slice(end);
        fixes++;
    }

    return { text: result, fixes };
}

async function rawCheck(baseUrl: string, text: string, language: string): Promise<{ status: number; data: string; }> {
    // Desktop: go through the native helper (no CSP). Web: LanguageTool's public
    // API sends permissive CORS headers, so a direct fetch works.
    if (Native?.makeLanguageToolRequest) {
        return Native.makeLanguageToolRequest(baseUrl, text, language);
    }

    try {
        const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/v2/check`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ text, language, enabledOnly: "false" }).toString()
        });
        return { status: res.status, data: await res.text() };
    } catch (e) {
        return { status: -1, data: String(e) };
    }
}

// Returns null on any failure (no toast). Used by the while-typing path so a
// rate-limited or offline service never spams the user.
export async function correctSilent(text: string): Promise<CorrectionValue | null> {
    try {
        const { status, data } = await rawCheck(
            settings.store.apiBaseUrl || "https://api.languagetool.org",
            text,
            settings.store.language || "auto"
        );
        if (status !== 200) return null;
        return applyMatches(text, JSON.parse(data).matches ?? [], settings.store.scope || "grammar");
    } catch {
        return null;
    }
}

// On-demand correction (context menu / popover): surfaces failures via a toast.
export async function correct(text: string): Promise<CorrectionValue> {
    const result = await correctSilent(text);
    if (!result) {
        showToast("Correction failed — the service may be offline or rate-limited.", Toasts.Type.FAILURE);
        throw new Error("correction failed");
    }
    return result;
}
