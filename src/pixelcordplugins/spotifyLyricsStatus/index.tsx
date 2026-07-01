/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { getUserSettingLazy } from "@api/UserSettings";
import { PixelCordDevs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import { FluxDispatcher } from "@webpack/common";

const logger = new Logger("SpotifyLyricsStatus");

const CustomStatusSetting = getUserSettingLazy<CustomStatus>("status", "customStatus")!;

interface CustomStatus {
    text: string;
    expiresAtMs: string;
    emojiId: string;
    emojiName: string;
    createdAtMs: string;
}

interface SyncedLyric {
    /** start time in milliseconds */
    time: number;
    /** null = instrumental / empty line */
    text: string | null;
}

interface Track {
    id: string;
    name: string;
    duration: number;
    isLocal: boolean;
    artists: { name: string; }[];
}

interface PlayerState {
    track: Track | null;
    isPlaying: boolean;
    position: number;
}

const settings = definePluginSettings({
    emoji: {
        type: OptionType.STRING,
        description: "Emoji shown next to the lyric (leave empty for none)",
        default: "🎵"
    },
    onlySyncedLyrics: {
        type: OptionType.BOOLEAN,
        description: "Only use lyrics that are actually time-synced. When a song's lyrics aren't synced, don't show out-of-sync text (falls back to the track name or nothing)",
        default: true
    },
    fallbackToTrackName: {
        type: OptionType.BOOLEAN,
        description: "When a song has no synced lyrics, show \"Song — Artist\" instead of nothing",
        default: true
    },
    maxLength: {
        type: OptionType.NUMBER,
        description: "Max characters for the status text (Discord limit is 128)",
        default: 128
    }
});

const LYRICS_API = "https://api.cee.bio/spotify/lyrics/";

// ── live playback state ──────────────────────────────────────────────
let currentTrackId: string | null = null;
let currentDuration = 0;
let isPlaying = false;
let positionBase = 0; // ms reported by the last Flux event
let positionStamp = 0; // Date.now() when positionBase was captured

let lyrics: SyncedLyric[] | null = null;
let fetchToken = 0; // guards against stale async lyric fetches

let lastSetText: string | null = null;
let lastUpdateAt = 0;
let tickHandle: number | undefined;

// the user's status before we started messing with it, so we can restore on stop
let savedStatus: CustomStatus | null = null;
let hasOverridden = false;

const TICK_MS = 500;
const MIN_UPDATE_INTERVAL = 1200; // avoid hammering Discord's settings sync

function currentPosition(): number {
    return isPlaying ? positionBase + (Date.now() - positionStamp) : positionBase;
}

async function fetchLyrics(trackId: string): Promise<SyncedLyric[] | null> {
    try {
        const res = await fetch(LYRICS_API + trackId);
        if (!res.ok) return null;

        const json = await res.json();
        const data = json?.data;
        const lines = data?.lines;
        if (!Array.isArray(lines) || lines.length < 2) return null;

        const parsed: SyncedLyric[] = lines.map((l: any) => {
            const words = String(l.words ?? "").trim();
            return {
                time: Number(l.startTimeMs),
                text: (words === "" || words === "♪") ? null : words
            };
        }).filter((l: SyncedLyric) => Number.isFinite(l.time));

        // When the lyrics aren't actually time-synced, every line sits at 0ms —
        // showing them would just freeze on the wrong line. If the user only
        // wants synced lyrics, drop these so we fall back to the track name.
        if (settings.store.onlySyncedLyrics) {
            const isSynced = data?.syncType === "LINE_SYNCED" && parsed.some(l => l.time > 0);
            if (!isSynced) return null;
        }

        return parsed.length >= 2 ? parsed : null;
    } catch (e) {
        logger.error("Failed to fetch lyrics for", trackId, e);
        return null;
    }
}

function applyStatus(text: string) {
    if (text === lastSetText) return;
    lastSetText = text;
    hasOverridden = true;

    CustomStatusSetting.updateSetting({
        text,
        emojiId: "0",
        emojiName: text ? (settings.store.emoji ?? "") : "",
        expiresAtMs: "0",
        createdAtMs: String(Date.now())
    }).catch(e => logger.error("Failed to update status", e));
}

function clearStatus() {
    if (!hasOverridden) return;
    lastSetText = null;
    hasOverridden = false;

    CustomStatusSetting.updateSetting({
        text: "",
        emojiId: "0",
        emojiName: "",
        expiresAtMs: "0",
        createdAtMs: String(Date.now())
    }).catch(e => logger.error("Failed to clear status", e));
}

function findCurrentLine(pos: number): SyncedLyric | null {
    if (!lyrics) return null;
    let current: SyncedLyric | null = null;
    for (const line of lyrics) {
        if (line.time <= pos) current = line;
        else break;
    }
    return current;
}

let lastTrackName = "";

function tick() {
    // nothing playing → make sure the status is empty
    if (!currentTrackId) {
        clearStatus();
        return;
    }

    const pos = currentPosition();

    // Song finished → clear the status (back to nothing until a new song).
    // While playing we let the last lyric show right up to the end (tight 250ms
    // margin). When playback has stopped the reported position is frozen and may
    // sit a bit short of the real end, so we use a wider margin to still detect
    // the end. A genuine mid-song pause stays well below this and keeps the lyric.
    if (currentDuration > 0) {
        const endMargin = isPlaying ? 250 : 2500;
        if (pos >= currentDuration - endMargin) {
            clearStatus();
            return;
        }
    }

    const now = Date.now();

    // no synced lyrics available for this song
    if (!lyrics) {
        if (settings.store.fallbackToTrackName && lastTrackName) {
            if (now - lastUpdateAt >= MIN_UPDATE_INTERVAL || lastSetText === null) {
                lastUpdateAt = now;
                applyStatus(truncate(lastTrackName));
            }
        } else {
            clearStatus();
        }
        return;
    }

    const line = findCurrentLine(pos);
    const text = line?.text ?? null;

    // before the first lyric / instrumental gap: keep it empty (or fallback)
    if (text === null) {
        if (lastSetText === null && settings.store.fallbackToTrackName && lastTrackName)
            applyStatus(truncate(lastTrackName));
        return;
    }

    if (now - lastUpdateAt < MIN_UPDATE_INTERVAL && truncate(text) !== lastSetText) return;

    lastUpdateAt = now;
    applyStatus(truncate(text));
}

function truncate(text: string): string {
    const max = Math.min(settings.store.maxLength || 128, 128);
    return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

async function onPlayerState(state: PlayerState) {
    const { track } = state;

    isPlaying = state.isPlaying ?? false;
    positionBase = state.position ?? 0;
    positionStamp = Date.now();

    // playback stopped entirely
    if (!track) {
        currentTrackId = null;
        currentDuration = 0;
        lyrics = null;
        lastTrackName = "";
        fetchToken++;
        clearStatus();
        return;
    }

    currentDuration = track.duration ?? 0;
    lastTrackName = `${track.name} — ${track.artists?.map(a => a.name).join(", ")}`;

    // same song, just a position/play-state update → keep existing lyrics
    if (track.id === currentTrackId) return;

    // new song → reset and fetch its lyrics
    currentTrackId = track.id;
    lyrics = null;
    lastSetText = null;

    const token = ++fetchToken;
    const fetched = track.isLocal ? null : await fetchLyrics(track.id);
    if (token !== fetchToken) return; // a newer song started while we were fetching
    lyrics = fetched;
}

export default definePlugin({
    name: "SpotifyLyricsStatus",
    description: "Syncs your Discord custom status with the lyrics of the song you're playing on Spotify, line by line. Clears the status when the song ends.",
    authors: [PixelCordDevs.myvings],
    tags: ["Activity", "Media", "Customisation"],
    dependencies: ["UserSettingsAPI"],
    settings,

    start() {
        savedStatus = CustomStatusSetting.getSetting?.() ?? null;
        hasOverridden = false;
        lastSetText = null;
        FluxDispatcher.subscribe("SPOTIFY_PLAYER_STATE", onPlayerState);
        tickHandle = window.setInterval(tick, TICK_MS);
    },

    stop() {
        FluxDispatcher.unsubscribe("SPOTIFY_PLAYER_STATE", onPlayerState);
        if (tickHandle) window.clearInterval(tickHandle);
        tickHandle = undefined;

        // restore whatever the user had before the plugin took over
        if (hasOverridden && savedStatus) {
            CustomStatusSetting.updateSetting(savedStatus)
                .catch(e => logger.error("Failed to restore status", e));
        }
        currentTrackId = null;
        lyrics = null;
        hasOverridden = false;
    }
});
