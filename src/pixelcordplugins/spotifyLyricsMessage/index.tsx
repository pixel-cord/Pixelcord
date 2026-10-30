/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { ChatBarButton, ChatBarButtonFactory } from "@api/ChatButtons";
import { definePluginSettings } from "@api/Settings";
import { Paragraph } from "@components/Paragraph";
import { Switch } from "@components/Switch";
import { PixelCordDevs } from "@utils/constants";
import { classNameFactory } from "@utils/css";
import { sendMessage } from "@utils/discord";
import { Logger } from "@utils/Logger";
import { classes } from "@utils/misc";
import { ModalCloseButton as RawModalCloseButton, ModalContent as RawModalContent, ModalFooter as RawModalFooter, ModalHeader as RawModalHeader, ModalRoot as RawModalRoot, ModalSize, openModal } from "@utils/modal";
import definePlugin, { IconComponent, OptionType } from "@utils/types";
import { RenderModalProps } from "@vencord/discord-types";
import { Button, FluxDispatcher, PresenceStore, React, showToast, Slider, Text, TextInput, UserStore } from "@webpack/common";
import type { ComponentType, PropsWithChildren } from "react";

const logger = new Logger("SpotifyLyricsMessage");
const cl = classNameFactory("vc-slmsg-");

type ModalShell = ComponentType<PropsWithChildren<{ className?: string; }>>;
const ModalRoot = RawModalRoot as ComponentType<PropsWithChildren<RenderModalProps & { size?: ModalSize; className?: string; }>>;
const ModalHeader = RawModalHeader as ModalShell;
const ModalContent = RawModalContent as ModalShell;
const ModalFooter = RawModalFooter as ModalShell;
const ModalCloseButton = RawModalCloseButton as ComponentType<{ onClick(): void; }>;

interface SyncedLyric { time: number; text: string | null; }
interface Track { id: string; name: string; duration: number; isLocal: boolean; artists: { name: string; }[]; }
interface PlayerState { track: Track | null; isPlaying: boolean; position: number; }

const settings = definePluginSettings({
    emoji: {
        type: OptionType.STRING,
        description: "Prefixo/emoji antes de cada linha (vazio = nenhum)",
        default: "🎵"
    },
    minGap: {
        type: OptionType.NUMBER,
        description: "Intervalo mínimo entre mensagens em ms (protege contra rate-limit; linhas mais rápidas são puladas)",
        default: 2000
    },
    offset: {
        type: OptionType.NUMBER,
        description: "Ajuste de sincronia em ms (positivo = adianta a letra, negativo = atrasa)",
        default: 0
    },
    ignoreParens: {
        type: OptionType.BOOLEAN,
        description: "Ignorar partes entre parênteses — ex: (what?), (yeah), (strapped) — e pular linhas que são só isso",
        default: true
    },
    onlySyncedLyrics: {
        type: OptionType.BOOLEAN,
        description: "Só cantar se a música tiver letra realmente sincronizada",
        default: true
    },
    lowercase: {
        type: OptionType.BOOLEAN,
        description: "Enviar as letras tudo em minúsculo",
        default: false
    },
    uppercase: {
        type: OptionType.BOOLEAN,
        description: "Enviar as letras tudo em maiúsculo",
        default: false
    },
    removeAccents: {
        type: OptionType.BOOLEAN,
        description: "Remover acentos das letras",
        default: false
    },
    naturalStyle: {
        type: OptionType.BOOLEAN,
        description: "Mais natural — remove o ponto final (.) e ! do fim das linhas",
        default: false
    }
});

// Formats a lyric line before it is sent without affecting the source lyric data.
function styleText(text: string): string {
    let formatted = settings.store.removeAccents
        ? text.normalize("NFD").replace(/\p{M}/gu, "")
        : text;

    if (settings.store.uppercase) formatted = formatted.toUpperCase();
    else if (settings.store.lowercase) formatted = formatted.toLowerCase();
    if (settings.store.naturalStyle) formatted = formatted.replace(/[.!]+$/g, "").trimEnd();
    return formatted;
}

// Strips backing-vocal parentheticals like "(what?)" when the option is on. If a
// whole line is just a parenthetical (backing/echo line), the result is empty and
// the caller skips it.
function cleanLyric(text: string): string {
    if (!settings.store.ignoreParens) return text;
    return text.replace(/\([^)]*\)/g, "").replace(/\s{2,}/g, " ").trim();
}

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
let lyricsController: AbortController | undefined;

let lastSentLineTime: number | null = null;
let lastSentAt = 0;
let tickHandle: number | undefined;
let sending = false;

const TICK_MS = 400;

// ── active pub/sub so the button + modal reflect on/off ──────────────
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
    const adjusted = pos + (settings.store.offset || 0);
    let current: SyncedLyric | null = null;
    for (const line of lyrics) {
        if (line.time <= adjusted) current = line;
        else break;
    }
    return current;
}

async function fetchLyrics(trackId: string): Promise<SyncedLyric[] | null> {
    lyricsController?.abort();
    const controller = new AbortController();
    lyricsController = controller;
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
        const res = await fetch(LYRICS_API + encodeURIComponent(trackId), { signal: controller.signal });
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
        if (!controller.signal.aborted) logger.error("Failed to fetch lyrics for", trackId, e);
        return null;
    } finally {
        clearTimeout(timeout);
        if (lyricsController === controller) lyricsController = undefined;
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
        lyricsController?.abort();
        return;
    }

    currentDuration = track.duration ?? 0;
    if (track.id === currentTrackId) return; // same song, just a position update

    currentTrackId = track.id;
    lyrics = null;
    lastSentLineTime = null;

    lyricsController?.abort();
    const token = ++fetchToken;
    const fetched = track.isLocal ? null : await fetchLyrics(track.id);
    if (token !== fetchToken) return;
    lyrics = fetched;
}

// Ground truth for "where is the song RIGHT NOW": the Spotify LISTENING activity
// carries timestamps.start, so position = now - start. Used to seed accurately on
// activation (SPOTIFY_PLAYER_STATE only fires on changes, so a mid-song toggle
// would otherwise start from a stale/zero position and "sing the past").
function seedFromActivity() {
    try {
        const uid = UserStore.getCurrentUser?.()?.id;
        if (!uid) return;
        const acts: any[] = (PresenceStore as any).getActivities?.(uid) ?? [];
        const sp = acts.find(a => a?.type === 2 && a?.sync_id && a?.timestamps?.start);
        if (!sp) return;
        const start = Number(sp.timestamps.start);
        const end = Number(sp.timestamps.end);
        onPlayerState({
            track: {
                id: sp.sync_id,
                name: sp.details ?? "",
                duration: Number.isFinite(end - start) ? end - start : 0,
                isLocal: false,
                artists: sp.state ? [{ name: sp.state }] : []
            },
            isPlaying: true,
            position: Date.now() - start
        });
    } catch (e) {
        logger.error("seed from activity failed", e);
    }
}

function isSpotifyPlaying(): boolean {
    try {
        const uid = UserStore.getCurrentUser?.()?.id;
        const acts: any[] = (PresenceStore as any).getActivities?.(uid) ?? [];
        return acts.some(a => a?.type === 2 && a?.sync_id);
    } catch {
        return false;
    }
}

async function tick() {
    if (!active || !isPlaying || !targetChannelId || !currentTrackId || !lyrics || sending) return;

    const pos = currentPosition();
    if (currentDuration > 0) {
        const endMargin = isPlaying ? 250 : 2500;
        if (pos >= currentDuration - endMargin) return; // song ended → wait for the next
    }

    const line = findCurrentLine(pos);
    if (!line || line.text === null) return;
    if (line.time === lastSentLineTime) return; // already handled this line

    lastSentLineTime = line.time; // mark seen even if we skip below

    const text = styleText(cleanLyric(line.text));
    if (!text) return; // whole line was a parenthetical (backing vocal) → skip

    const now = Date.now();
    if (now - lastSentAt < Math.max(settings.store.minGap || 0, 1000)) return; // rate-limit guard
    lastSentAt = now;

    const prefix = settings.store.emoji ? `${settings.store.emoji} ` : "";
    try {
        sending = true;
        await sendMessage(targetChannelId, { content: `${prefix}${text}`.slice(0, 2000) });
    } catch (e) {
        logger.error("Failed to send lyric", e);
        stopSinging();
        showToast("Não foi possível enviar a letra. O envio foi interrompido.");
    } finally {
        sending = false;
    }
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
    seedFromActivity();
}

function stopSinging() {
    fetchToken++;
    lyricsController?.abort();
    if (!active && !tickHandle) return;
    setActive(false);
    FluxDispatcher.unsubscribe("SPOTIFY_PLAYER_STATE", onPlayerState);
    if (tickHandle) window.clearInterval(tickHandle);
    tickHandle = undefined;
    targetChannelId = null;
    currentTrackId = null;
    lyrics = null;
}

// ── config + activate modal (left click) ─────────────────────────────
function SingModal({ modalProps, channelId }: { modalProps: RenderModalProps; channelId: string; }) {
    const isActive = useActive();
    const { emoji, minGap, offset, ignoreParens, lowercase, uppercase, removeAccents, naturalStyle } = settings.use(["emoji", "minGap", "offset", "ignoreParens", "lowercase", "uppercase", "removeAccents", "naturalStyle"]);

    return (
        <ModalRoot {...modalProps} size={ModalSize.SMALL}>
            <ModalHeader>
                <Text variant="heading-lg/semibold">Cantar a música do Spotify</Text>
                <ModalCloseButton onClick={modalProps.onClose} />
            </ModalHeader>
            <ModalContent>
                <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
                <Paragraph>
                    Envia as letras sincronizadas da música do Spotify como mensagens neste chat, seguindo a música.
                </Paragraph>
                <Paragraph style={{ color: "var(--text-warning, #f0b232)" }}>
                    ⚠️ Isso é spam de mensagens — pode gerar aviso/ban na conta. Use por sua conta e risco.
                </Paragraph>

                <div>
                    <Paragraph>Prefixo / emoji</Paragraph>
                    <TextInput value={emoji} onChange={(v: string) => (settings.store.emoji = v)} placeholder="🎵" />
                </div>

                <div>
                    <Paragraph>Ajuste de sincronia: {offset > 0 ? "+" : ""}{offset} ms (positivo = adianta, negativo = atrasa)</Paragraph>
                    <Slider
                        minValue={-3000}
                        maxValue={3000}
                        initialValue={offset}
                        markers={[-3000, -1500, 0, 1500, 3000]}
                        onValueChange={(v: number) => (settings.store.offset = Math.round(v / 250) * 250)}
                    />
                </div>

                <div>
                    <Paragraph>Intervalo mínimo entre mensagens: {minGap} ms</Paragraph>
                    <Slider
                        minValue={1000}
                        maxValue={5000}
                        initialValue={minGap}
                        markers={[1000, 2000, 3000, 4000, 5000]}
                        stickToMarkers
                        onValueChange={(v: number) => (settings.store.minGap = Math.round(v))}
                    />
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <Paragraph>Ignorar partes entre parênteses — (what?), (yeah)</Paragraph>
                    <Switch checked={ignoreParens} onChange={(v: boolean) => (settings.store.ignoreParens = v)} />
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <Paragraph>Tudo em minúsculo</Paragraph>
                    <Switch
                        checked={lowercase}
                        onChange={(v: boolean) => {
                            settings.store.lowercase = v;
                            if (v) settings.store.uppercase = false;
                        }}
                    />
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <Paragraph>Tudo em maiúsculo</Paragraph>
                    <Switch
                        checked={uppercase}
                        onChange={(v: boolean) => {
                            settings.store.uppercase = v;
                            if (v) settings.store.lowercase = false;
                        }}
                    />
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <Paragraph>Remover acentos das letras</Paragraph>
                    <Switch checked={removeAccents} onChange={(v: boolean) => (settings.store.removeAccents = v)} />
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <Paragraph>Mais natural (sem ponto final / !)</Paragraph>
                    <Switch checked={naturalStyle} onChange={(v: boolean) => (settings.store.naturalStyle = v)} />
                </div>

                </div>
            </ModalContent>
            <ModalFooter>
                <Button
                    color={isActive ? Button.Colors.RED : Button.Colors.BRAND}
                    onClick={() => {
                        if (active) {
                            stopSinging();
                            showToast("🎤 Parou de cantar");
                            return;
                        }
                        if (!isSpotifyPlaying()) {
                            showToast("Nada tocando no Spotify");
                            return;
                        }
                        startSinging(channelId);
                        showToast("🎤 Cantando a música no chat…");
                        modalProps.onClose?.();
                    }}
                >
                    {isActive ? "Parar de cantar" : "Começar a cantar 🎤"}
                </Button>
            </ModalFooter>
        </ModalRoot>
    );
}

function openSingModal(channelId: string) {
    openModal(props => <SingModal modalProps={props} channelId={channelId} />);
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
            tooltip={isActive ? "Cantando (esq: config/parar · dir: parar)" : "Cantar Spotify (esq: config · dir: ativar direto)"}
            onClick={() => openSingModal(channel.id)}
            onContextMenu={() => {
                if (active) {
                    stopSinging();
                    showToast("🎤 Parou de cantar");
                    return;
                }
                if (!isSpotifyPlaying()) {
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
    description: "Botão na barra de chat que canta a música do Spotify enviando as letras sincronizadas como mensagens. Esquerdo abre config, direito ativa direto. Viola o ToS do Discord (spam) — use por sua conta e risco.",
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
