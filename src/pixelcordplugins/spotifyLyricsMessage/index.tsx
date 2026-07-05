/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { ChatBarButton, ChatBarButtonFactory } from "@api/ChatButtons";
import { definePluginSettings } from "@api/Settings";
import { PixelCordDevs } from "@utils/constants";
import { classNameFactory } from "@utils/css";
import { sendMessage } from "@utils/discord";
import { Logger } from "@utils/Logger";
import { classes } from "@utils/misc";
import definePlugin, { IconComponent, OptionType } from "@utils/types";
import { FluxDispatcher, React, showToast, SpotifyStore } from "@webpack/common";

const logger = new Logger("SpotifyLyricsMessage");
const cl = classNameFactory("vc-slmsg-");

interface SyncedLyric { time: number; text: string | null; }
interface Track { id: string; name: string; duration: number; isLocal: boolean; artists: { name: string; }[]; }
interface PlayerState { track: Track | null; isPlaying: boolean; position: number; }

const settings = definePluginSettings({
    emoji: {
        type: OptionType.STRING,
        description: "Prefixo/emoji antes de cada linha cantada (vazio = nenhum)",
        default: "🎵"
    },
    minGap: {
        type: OptionType.NUMBER,
        description: "Intervalo mínimo entre mensagens em ms (protege contra rate-limit/spam; linhas mais rápidas que isso são puladas)",
        default: 2000
    },
    onlySyncedLyrics: {
        type: OptionType.BOOLEAN,
        description: "Só cantar se a música tiver letra realmente sincronizada (senão não canta nada)",
        default: true
    }
});

const LYRICS_API = "https://api.cee.bio/spotify/lyrics/";

// ── singing state ────────────────────────────────────────────────────
let active = false;
let targetChannelId: string | null = null;

let currentTrackId: string | null = null;
let currentDuration = 0;
let isPlaying = false;
let positionBase = 0;
let positionStamp = 0;
let lyrics: SyncedLyric[] | null = null;
let fetchToken = 0;

let lastSentLineTime: number | null = null;
let lastSentAt = 0;
let tickHandle: number | undefined;

const TICK_MS = 400;

// ── active pub/sub so the chat button reflects on/off ────────────────
const listeners = new Set<() => void>();
function setActive(v: boolean) { active = v; listeners.forEach(l => l()); }
function useActive(): boolean {
    const [, force] = React.useReducer((x: number) => x + 1, 0);
    React.useEffect(() => { listeners.add(force); return () => void listeners.delete(force); }, []);
    return active;
}

function currentPosition(): number {
    return isPlaying ? positionBase + (Date.now() - positionStamp) : positionBase;
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
            return { time: Number(l.startTimeMs), text: (words === "" || words === "♪") ? null : words };
        }).filter((l: SyncedLyric) => Number.isFinite(l.time));

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

async function onPlayerState(state: PlayerState) {
    const { track } = state;
    isPlaying = state.isPlaying ?? false;
    positionBase = state.position ?? 0;
    positionStamp = Date.now();

    if (!track) {
        currentTrackId = null;
        currentDuration = 0;
        lyrics = null;
        fetchToken++;
        return;
    }

    currentDuration = track.duration ?? 0;
    if (track.id === currentTrackId) return; // same song, just a position update

    // new song → reset and fetch its lyrics
    currentTrackId = track.id;
    lyrics = null;
    lastSentLineTime = null;

    const token = ++fetchToken;
    const fetched = track.isLocal ? null : await fetchLyrics(track.id);
    if (token !== fetchToken) return;
    lyrics = fetched;
}

function tick() {
    if (!active || !targetChannelId || !currentTrackId || !lyrics) return;

    const pos = currentPosition();
    if (currentDuration > 0) {
        const endMargin = isPlaying ? 250 : 2500;
        if (pos >= currentDuration - endMargin) return; // song ended → wait for the next
    }

    const line = findCurrentLine(pos);
    if (!line || line.text === null) return;
    if (line.time === lastSentLineTime) return; // already handled this line

    lastSentLineTime = line.time; // mark seen even if we skip it below

    const now = Date.now();
    if (now - lastSentAt < Math.max(settings.store.minGap || 0, 1000)) return; // rate-limit guard
    lastSentAt = now;

    const prefix = settings.store.emoji ? `${settings.store.emoji} ` : "";
    try {
        sendMessage(targetChannelId, { content: `${prefix}${line.text}`.slice(0, 2000) });
    } catch (e) {
        logger.error("Failed to send lyric", e);
    }
}

function seedFromStore() {
    try {
        const track = (SpotifyStore as any)?.getTrack?.();
        if (!track) return;
        onPlayerState({
            track,
            isPlaying: (SpotifyStore as any).isPlaying?.() ?? true,
            position: (SpotifyStore as any).getPosition?.() ?? (SpotifyStore as any).position ?? 0
        });
    } catch { /* best effort */ }
}

function startSinging(channelId: string) {
    if (active) return;
    targetChannelId = channelId;
    currentTrackId = null;
    lyrics = null;
    lastSentLineTime = null;
    lastSentAt = 0;
    setActive(true);
    FluxDispatcher.subscribe("SPOTIFY_PLAYER_STATE", onPlayerState);
    tickHandle = window.setInterval(tick, TICK_MS);
    seedFromStore();
}

function stopSinging() {
    if (!active && !tickHandle) return;
    setActive(false);
    FluxDispatcher.unsubscribe("SPOTIFY_PLAYER_STATE", onPlayerState);
    if (tickHandle) window.clearInterval(tickHandle);
    tickHandle = undefined;
    targetChannelId = null;
    currentTrackId = null;
    lyrics = null;
}

const SingIcon: IconComponent = ({ height = 24, width = 24, className }) => (
    <svg viewBox="0 0 24 24" height={height} width={width} className={className} fill="currentColor" aria-hidden>
        <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z" />
        <path d="M19 11a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.92V21a1 1 0 1 0 2 0v-3.08A7 7 0 0 0 19 11z" />
    </svg>
);

const ChatBarRender: ChatBarButtonFactory = ({ channel, isMainChat }) => {
    const isActive = useActive();
    if (!isMainChat) return null;

    return (
        <ChatBarButton
            tooltip={isActive ? "Parar de cantar" : "Cantar a música do Spotify no chat"}
            onClick={() => {
                if (active) {
                    stopSinging();
                    showToast("🎤 Parou de cantar");
                    return;
                }
                if (!(SpotifyStore as any)?.getTrack?.()) {
                    showToast("Nada tocando no Spotify");
                    return;
                }
                startSinging(channel.id);
                showToast("🎤 Cantando a música no chat…");
            }}
        >
            <SingIcon className={classes(cl("icon"), isActive && cl("active"))} />
        </ChatBarButton>
    );
};

export default definePlugin({
    name: "SpotifyLyricsMessage",
    description: "Botão na barra de chat que, ao ativar, canta a música do Spotify enviando as letras sincronizadas como mensagens. Viola o ToS do Discord (spam) — use por sua conta e risco.",
    authors: [PixelCordDevs.myvings],
    tags: ["Activity", "Media", "Fun"],
    settings,

    chatBarButton: {
        icon: SingIcon,
        render: ChatBarRender
    },

    stop() {
        stopSinging();
    }
});
