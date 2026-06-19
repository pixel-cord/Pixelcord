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
}

export interface CorrectionValue {
    text: string;
    fixes: number;
}

// Apply LanguageTool's suggested replacements. Walk from the end so earlier
// offsets stay valid as we splice, and skip matches with no replacement.
function applyMatches(text: string, matches: LanguageToolMatch[]): CorrectionValue {
    let result = text;
    let fixes = 0;

    for (const m of [...matches].sort((a, b) => b.offset - a.offset)) {
        const replacement = m.replacements?.[0]?.value;
        if (replacement == null) continue;
        result = result.slice(0, m.offset) + replacement + result.slice(m.offset + m.length);
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
        return applyMatches(text, JSON.parse(data).matches ?? []);
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
