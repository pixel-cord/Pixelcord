/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { PixelCordDevs } from "@utils/constants";
import { classNameFactory } from "@utils/css";
import { classes } from "@utils/misc";
import { ModalCloseButton as RawModalCloseButton, ModalContent as RawModalContent, ModalHeader as RawModalHeader, ModalRoot as RawModalRoot, ModalSize, openModal } from "@utils/modal";
import definePlugin, { OptionType } from "@utils/types";
import { RenderModalProps } from "@vencord/discord-types";
import {
    Button,
    ChannelActionCreators,
    ChannelStore,
    GuildStore,
    NavigationRouter,
    openMediaModal,
    Parser,
    React,
    RestAPI,
    TextInput,
    useEffect,
    useRef,
    UserStore,
    useState } from "@webpack/common";
import type { ComponentType, PropsWithChildren } from "react";

type ModalShell = ComponentType<PropsWithChildren<{ className?: string; }>>;
const ModalRoot = RawModalRoot as ComponentType<PropsWithChildren<RenderModalProps & { size?: ModalSize; className?: string; }>>;
const ModalHeader = RawModalHeader as ModalShell;
const ModalContent = RawModalContent as ModalShell;
const ModalCloseButton = RawModalCloseButton as ComponentType<{ onClick(): void; }>;

const cl = classNameFactory("vc-msgsearch-");
const obcl = classNameFactory("vc-msgsearch-ob-");

const SEARCH_URL = "/users/@me/messages/search/tabs";
const PAGE_SIZE = 25;
const DEBOUNCE_MS = 400;
const SCROLL_THRESHOLD = 250;
const MEDIA_CACHE_TTL = 120_000;

type Locale = "en" | "pt" | "es";

// All user-facing strings live here. t() picks the table for Discord's current
// language (read from <html lang>), falling back to English for any missing key.
const I18N: Record<Locale, Record<string, string>> = {
    en: {
        tab_recent: "Recent",
        tab_people: "Go to",
        tab_messages: "Messages",
        tab_media: "Media",
        tab_pins: "Pinned",
        tab_links: "Links",
        tab_files: "Files",
        placeholder: "Search your messages",
        recentSearches: "Recent searches",
        clearAll: "Clear all",
        remove: "Remove",
        suggestions: "Suggestions",
        photosMedia: "Photos & media",
        emptyRecent: "Start typing to search through everything you've sent.",
        nothingFound: "Nothing found.",
        typeToSearch: "Type to search through everything you've sent.",
        searching: "Searching…",
        noResults: "No results.",
        loadingMore: "Loading more…",
        groupDm: "Group DM",
        server: "Server",
        channel: "channel",
        directMessage: "Direct Message",
        jumpToMessage: "Jump to message",
        searchMessages: "Search messages",
        filters: "Filters",
        f_has: "Has",
        f_authorType: "Type",
        f_author: "Author",
        f_mentions: "Mentions",
        f_channel: "Channel",
        f_date: "Date",
        has_image: "Image",
        has_video: "Video",
        has_file: "File",
        has_link: "Link",
        has_embed: "Embed",
        has_sound: "Sound",
        at_user: "User",
        at_bot: "Bot",
        pickPlaceholder: "Type a name…",
        clearFilters: "Clear filters",
        err_unknown: "Unknown error",
        err_rateLimitIn: "Rate limited by Discord. Try again in {s}s.",
        err_rateLimit: "Rate limited by Discord. Try again shortly.",
        err_unauthorized: "Discord rejected the request (not authorized).",
        err_failed: "Request failed (status {s}).",
        err_empty: "Search endpoint returned an empty response.",
        setting_showDmButton: "Show the search button next to the DM list's search bar",
        plugin_desc: "Search through every message you've sent on Discord — the mobile app's global search, on desktop. Adds a button that opens a tabbed search (Messages, Media, Files, Links, Pins, People).",
        ob_subtitle: "Search everything you've ever sent — the mobile app's search, on desktop.",
        ob_mockText: "Find or start a conversation",
        ob_label: "Open it with the 🔍 next to the DM list search bar",
        ob_skip: "Skip",
        ob_try: "Try it now"
    },
    pt: {
        tab_recent: "Recentes",
        tab_people: "Ir para",
        tab_messages: "Mensagens",
        tab_media: "Mídia",
        tab_pins: "Fixadas",
        tab_links: "Links",
        tab_files: "Arquivos",
        placeholder: "Pesquise suas mensagens",
        recentSearches: "Pesquisas recentes",
        clearAll: "Limpar tudo",
        remove: "Remover",
        suggestions: "Sugestões",
        photosMedia: "Fotos e mídia",
        emptyRecent: "Comece a digitar para pesquisar em tudo que você já enviou.",
        nothingFound: "Nada encontrado.",
        typeToSearch: "Digite para pesquisar em tudo que você já enviou.",
        searching: "Pesquisando…",
        noResults: "Nenhum resultado.",
        loadingMore: "Carregando mais…",
        groupDm: "Grupo",
        server: "Servidor",
        channel: "canal",
        directMessage: "Mensagem direta",
        jumpToMessage: "Ir para mensagem",
        searchMessages: "Pesquisar mensagens",
        filters: "Filtros",
        f_has: "Possui",
        f_authorType: "Tipo",
        f_author: "Autor",
        f_mentions: "Menciona",
        f_channel: "Canal",
        f_date: "Data",
        has_image: "Imagem",
        has_video: "Vídeo",
        has_file: "Arquivo",
        has_link: "Link",
        has_embed: "Embed",
        has_sound: "Áudio",
        at_user: "Usuário",
        at_bot: "Bot",
        pickPlaceholder: "Digite um nome…",
        clearFilters: "Limpar filtros",
        err_unknown: "Erro desconhecido",
        err_rateLimitIn: "Limite de requisições do Discord. Tente novamente em {s}s.",
        err_rateLimit: "Limite de requisições do Discord. Tente novamente em instantes.",
        err_unauthorized: "O Discord rejeitou a requisição (não autorizado).",
        err_failed: "Falha na requisição (status {s}).",
        err_empty: "O endpoint de pesquisa retornou uma resposta vazia.",
        setting_showDmButton: "Mostrar o botão de pesquisa ao lado da barra de pesquisa da lista de DMs",
        plugin_desc: "Pesquise todas as mensagens que você enviou no Discord — a pesquisa global do app de celular, no desktop. Adiciona um botão que abre uma pesquisa com abas (Mensagens, Mídia, Arquivos, Links, Fixadas, Ir para).",
        ob_subtitle: "Pesquise tudo que você já enviou — a pesquisa do app de celular, no desktop.",
        ob_mockText: "Encontre ou comece uma conversa",
        ob_label: "Abra com a 🔍 ao lado da barra de pesquisa da lista de DMs",
        ob_skip: "Pular",
        ob_try: "Experimentar agora"
    },
    es: {
        tab_recent: "Recientes",
        tab_people: "Ir a",
        tab_messages: "Mensajes",
        tab_media: "Multimedia",
        tab_pins: "Fijados",
        tab_links: "Enlaces",
        tab_files: "Archivos",
        placeholder: "Busca en tus mensajes",
        recentSearches: "Búsquedas recientes",
        clearAll: "Borrar todo",
        remove: "Quitar",
        suggestions: "Sugerencias",
        photosMedia: "Fotos y multimedia",
        emptyRecent: "Empieza a escribir para buscar en todo lo que has enviado.",
        nothingFound: "No se encontró nada.",
        typeToSearch: "Escribe para buscar en todo lo que has enviado.",
        searching: "Buscando…",
        noResults: "Sin resultados.",
        loadingMore: "Cargando más…",
        groupDm: "Grupo",
        server: "Servidor",
        channel: "canal",
        directMessage: "Mensaje directo",
        jumpToMessage: "Ir al mensaje",
        searchMessages: "Buscar mensajes",
        filters: "Filtros",
        f_has: "Contiene",
        f_authorType: "Tipo",
        f_author: "Autor",
        f_mentions: "Menciona",
        f_channel: "Canal",
        f_date: "Fecha",
        has_image: "Imagen",
        has_video: "Video",
        has_file: "Archivo",
        has_link: "Enlace",
        has_embed: "Embed",
        has_sound: "Audio",
        at_user: "Usuario",
        at_bot: "Bot",
        pickPlaceholder: "Escribe un nombre…",
        clearFilters: "Borrar filtros",
        err_unknown: "Error desconocido",
        err_rateLimitIn: "Límite de solicitudes de Discord. Inténtalo de nuevo en {s}s.",
        err_rateLimit: "Límite de solicitudes de Discord. Inténtalo de nuevo en un momento.",
        err_unauthorized: "Discord rechazó la solicitud (no autorizado).",
        err_failed: "La solicitud falló (estado {s}).",
        err_empty: "El endpoint de búsqueda devolvió una respuesta vacía.",
        setting_showDmButton: "Mostrar el botón de búsqueda junto a la barra de búsqueda de la lista de MD",
        plugin_desc: "Busca en todos los mensajes que has enviado en Discord — la búsqueda global de la app móvil, en el escritorio. Añade un botón que abre una búsqueda con pestañas (Mensajes, Multimedia, Archivos, Enlaces, Fijados, Ir a).",
        ob_subtitle: "Busca en todo lo que has enviado — la búsqueda de la app móvil, en el escritorio.",
        ob_mockText: "Encuentra o empieza una conversación",
        ob_label: "Ábrelo con la 🔍 junto a la barra de búsqueda de la lista de MD",
        ob_skip: "Omitir",
        ob_try: "Pruébalo ahora"
    }
};

function currentLocale(): Locale {
    const lang = (typeof document !== "undefined" ? document.documentElement.lang : "").toLowerCase();
    if (lang.startsWith("pt")) return "pt";
    if (lang.startsWith("es")) return "es";
    return "en";
}

function t(key: string, vars?: Record<string, string | number>): string {
    let s = I18N[currentLocale()][key] ?? I18N.en[key] ?? key;
    if (vars) for (const k in vars) s = s.split(`{${k}}`).join(String(vars[k]));
    return s;
}

type SortOrder = "asc" | "desc";
type ApiTab = "messages" | "media" | "pins" | "links" | "files";
type TabKey = "recent" | "people" | ApiTab;

interface SearchAuthor {
    id: string;
    username: string;
    global_name?: string | null;
    avatar: string | null;
    discriminator: string;
}

interface SearchAttachment {
    id: string;
    filename: string;
    content_type?: string;
    url: string;
    proxy_url?: string;
    size: number;
    width?: number;
    height?: number;
}

interface SearchMessage {
    id: string;
    channel_id: string;
    guild_id?: string;
    author: SearchAuthor;
    content: string;
    timestamp: string;
    attachments?: SearchAttachment[];
    embeds?: any[];
    type: number;
    hit?: boolean;
}

interface SearchCursor {
    timestamp: string;
    type: "timestamp";
}

interface TabResult {
    messages: SearchMessage[][];
    total_results?: number;
}

interface SearchTabsResponse {
    tabs: Partial<Record<ApiTab, TabResult>>;
}

type DestKind = "dm" | "group" | "text" | "voice" | "guild" | "user";

interface Destination {
    id: string;
    kind: DestKind;
    name: string;
    subtitle?: string; // username, for a 1:1 DM / user
    context?: string; // server name, for a guild channel
    avatar?: string; // DM/group/guild icon (empty string → initial fallback)
    guildId?: string; // needed to navigate to a guild channel/server
    userId?: string; // recipient id, for a 1:1 DM or a "user" result
}

interface TabData {
    query: string | null;
    fkey: string; // JSON of the filters this data was fetched with
    results: SearchMessage[];
    cursor: SearchCursor | null;
    loading: boolean;
}

const API_TABS: ApiTab[] = ["messages", "media", "files", "links", "pins"];
const BASE_TABS: TabKey[] = ["recent", "people", "media", "pins", "links", "files"];
const QUERY_TABS: TabKey[] = ["recent", "messages", "people", "media", "pins", "links", "files"];
function tabLabel(key: TabKey): string {
    return t(`tab_${key}`);
}

const settings = definePluginSettings({
    showDmButton: {
        type: OptionType.BOOLEAN,
        // Static English here on purpose: this runs at plugin-registration time
        // (module import), before the DOM/locale is guaranteed ready. t() is used
        // for every user-facing string inside the search UI, which renders later.
        description: I18N.en.setting_showDmButton,
        default: true,
        restartNeeded: true
    },
    recentSearches: {
        type: OptionType.CUSTOM,
        description: "Stores your recent searches.",
        default: [] as string[]
    },
    seenOnboarding: {
        type: OptionType.CUSTOM,
        description: "Tracks whether the onboarding modal has been shown.",
        default: false
    }
});

const HAS_OPTIONS = ["image", "video", "file", "link", "embed", "sound"] as const;
type HasKind = typeof HAS_OPTIONS[number];

interface PickRef {
    id: string;
    name: string;
    sub?: string;
    avatar?: string;
}

interface Filters {
    author: PickRef | null;
    mentions: PickRef | null;
    channel: PickRef | null;
    has: HasKind[];
    authorType: "user" | "bot" | null;
    dateFrom: string;
    dateTo: string;
}

const EMPTY_FILTERS: Filters = { author: null, mentions: null, channel: null, has: [], authorType: null, dateFrom: "", dateTo: "" };

function filtersActive(f: Filters): number {
    return (f.author ? 1 : 0) + (f.mentions ? 1 : 0) + (f.channel ? 1 : 0)
        + f.has.length + (f.authorType ? 1 : 0) + (f.dateFrom ? 1 : 0) + (f.dateTo ? 1 : 0);
}

// Snowflakes encode their creation time, so a date range maps to a min_id/max_id
// pair: ((unixMillis - DISCORD_EPOCH) << 22). Local midnight → start, 23:59:59 → end.
const DISCORD_EPOCH = 1420070400000n;
function dateToSnowflake(dateStr: string, endOfDay: boolean): string | null {
    if (!dateStr) return null;
    const d = new Date(`${dateStr}T00:00:00`);
    if (isNaN(d.getTime())) return null;
    if (endOfDay) d.setHours(23, 59, 59, 999);
    return ((BigInt(d.getTime()) - DISCORD_EPOCH) << 22n).toString();
}

function applyFilters(base: Record<string, any>, f: Filters): Record<string, any> {
    if (f.author) base.author_id = [f.author.id];
    if (f.mentions) base.mentions = [f.mentions.id];
    if (f.channel) base.channel_id = [f.channel.id];
    if (f.authorType) base.author_type = [f.authorType];
    const min = dateToSnowflake(f.dateFrom, false);
    const max = dateToSnowflake(f.dateTo, true);
    if (min) base.min_id = min;
    if (max) base.max_id = max;
    if (f.has.length) base.has = Array.from(new Set([...(base.has ?? []), ...f.has]));
    return base;
}

function buildTab(tab: ApiTab, content: string, sortOrder: SortOrder, limit: number, cursor: SearchCursor | null, filters: Filters) {
    const base: Record<string, any> = { sort_by: "timestamp", sort_order: sortOrder, content, cursor, limit };
    switch (tab) {
        case "media": base.has = ["image", "video"]; break;
        case "pins": base.pinned = true; break;
        case "links": base.has = ["link"]; break;
        case "files": base.has = ["file"]; break;
    }
    return applyFilters(base, filters);
}

async function searchTab(tab: ApiTab, content: string, sortOrder: SortOrder, limit: number, cursor: SearchCursor | null, filters: Filters = EMPTY_FILTERS, trackTotal = false): Promise<SearchTabsResponse> {
    const res = await RestAPI.post({
        url: SEARCH_URL,
        body: { tabs: { [tab]: buildTab(tab, content, sortOrder, limit, cursor, filters) }, track_exact_total_hits: trackTotal }
    });
    if (!res?.body) throw new Error(t("err_empty"));
    return res.body;
}

function flattenHits(tab?: TabResult): SearchMessage[] {
    if (!tab?.messages) return [];
    return tab.messages
        .map(group => group.find(m => m.hit) ?? group[0])
        .filter(Boolean) as SearchMessage[];
}

function nextCursor(page: SearchMessage[], prev: SearchCursor | null): SearchCursor | null {
    if (page.length === 0) return null;
    const lastId = page[page.length - 1].id;
    if (prev && prev.timestamp === lastId) return null;
    return { timestamp: lastId, type: "timestamp" };
}

function defaultAvatarUrl(author: Partial<SearchAuthor> | null | undefined): string {
    let index = 0;
    try {
        if (author?.discriminator && author.discriminator !== "0") {
            index = parseInt(author.discriminator, 10) % 5;
        } else if (author?.id) {
            index = Number((BigInt(author.id) >> 22n) % 6n);
        }
    } catch {
        index = 0;
    }
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

function getAvatarUrl(author: Partial<SearchAuthor> | null | undefined): string {
    if (author?.avatar && author?.id) {
        const ext = author.avatar.startsWith("a_") ? "gif" : "png";
        return `https://cdn.discordapp.com/avatars/${author.id}/${author.avatar}.${ext}?size=64`;
    }
    return defaultAvatarUrl(author);
}

function onAvatarError(author: Partial<SearchAuthor> | null | undefined) {
    return (e: React.SyntheticEvent<HTMLImageElement>) => {
        const img = e.currentTarget;
        const step = img.dataset.fb ?? "0";
        if (step === "0" && author?.avatar && author?.id) {
            img.dataset.fb = "1";
            img.src = `https://cdn.discordapp.com/avatars/${author.id}/${author.avatar}.png?size=64`;
        } else if (step !== "2") {
            img.dataset.fb = "2";
            img.src = defaultAvatarUrl(author);
        }
    };
}

function AuthorAvatar({ author, className }: { author: SearchAuthor; className: string; }) {
    return <img className={className} src={getAvatarUrl(author)} alt="" loading="lazy" onError={onAvatarError(author)} />;
}

function displayName(author: SearchAuthor): string {
    return author?.global_name || author?.username || "Unknown User";
}

function isImageAttachment(filename: string, contentType?: string): boolean {
    return Boolean(contentType?.startsWith("image")) || /\.(png|jpe?g|gif|webp|bmp)$/i.test(filename ?? "");
}

function isVideoAttachment(filename: string, contentType?: string): boolean {
    return Boolean(contentType?.startsWith("video")) || /\.(mp4|webm|mov|mkv|m4v)$/i.test(filename ?? "");
}

function isVid(a: SearchAttachment): boolean {
    return isVideoAttachment(a.filename, a.content_type);
}

function mediaOf(msg: SearchMessage): SearchAttachment[] {
    return (msg.attachments ?? []).filter(a => isImageAttachment(a.filename, a.content_type) || isVid(a));
}

// Open an attachment in Discord's native media viewer (lightbox) instead of
// navigating to the message. Images use the proxy URL (cached/resized); videos
// must use the original URL so the player can stream it.
function openMediaViewer(att: SearchAttachment) {
    const vid = isVid(att);
    openMediaModal({
        items: [{
            url: vid ? att.url : (att.proxy_url ?? att.url),
            type: vid ? "VIDEO" : "IMAGE",
            original: att.url,
            alt: att.filename,
            width: att.width,
            height: att.height
        }]
    });
}

function formatError(e: any): string {
    if (!e) return t("err_unknown");
    if (e.status === 429) {
        const retry = e.body?.retry_after;
        return retry ? t("err_rateLimitIn", { s: Math.ceil(retry) }) : t("err_rateLimit");
    }
    if (e.status === 401 || e.status === 403) return t("err_unauthorized");
    return e.body?.message || e.message || t("err_failed", { s: e.status ?? "?" });
}

function getRecent(): string[] {
    const v = settings.store.recentSearches;
    return Array.isArray(v) ? v as string[] : [];
}

function saveRecent(query: string) {
    const t = query.trim();
    if (t.length < 2) return;
    const list = getRecent().filter(x => x.toLowerCase() !== t.toLowerCase());
    list.unshift(t);
    settings.store.recentSearches = list.slice(0, 12);
}

function dropRecent(query: string) {
    settings.store.recentSearches = getRecent().filter(x => x.toLowerCase() !== query.toLowerCase());
}

function groupName(ch: any): string {
    if (ch.name) return ch.name;
    const names = (ch.rawRecipients ?? []).map((r: any) => r.global_name || r.username).filter(Boolean);
    return names.length ? names.join(", ") : t("groupDm");
}

function guildIconUrl(guild: any): string {
    return guild?.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64` : "";
}

function privateDestinations(): Destination[] {
    const out: Destination[] = [];
    const channels: any[] = (ChannelStore as any).getSortedPrivateChannels?.() ?? [];
    for (const ch of channels) {
        if (ch.type === 1) {
            const id = ch.recipients?.[0];
            const user = id ? UserStore.getUser(id) : null;
            const raw = ch.rawRecipients?.[0];
            if (user) out.push({ id: ch.id, kind: "dm", name: (user as any).globalName || user.username, subtitle: user.username, avatar: getAvatarUrl(user as any), userId: user.id });
            else if (raw?.id) out.push({ id: ch.id, kind: "dm", name: raw.global_name || raw.username, subtitle: raw.username, avatar: getAvatarUrl(raw), userId: raw.id });
        } else if (ch.type === 3) {
            out.push({ id: ch.id, kind: "group", name: groupName(ch), avatar: ch.icon ? `https://cdn.discordapp.com/channel-icons/${ch.id}/${ch.icon}.png?size=64` : "" });
        }
    }
    return out;
}

function guildChannelDestinations(): Destination[] {
    const out: Destination[] = [];
    const all = (ChannelStore as any).getMutableGuildAndPrivateChannels?.() ?? {};
    for (const key in all) {
        const ch = all[key];
        if (!ch?.guild_id) continue;
        const kind: DestKind | null =
            (ch.type === 0 || ch.type === 5 || ch.type === 15) ? "text"
                : (ch.type === 2 || ch.type === 13) ? "voice"
                    : null;
        if (!kind) continue;
        out.push({ id: ch.id, kind, name: ch.name, context: GuildStore.getGuild(ch.guild_id)?.name, guildId: ch.guild_id });
    }
    return out;
}

function guildDestinations(): Destination[] {
    const out: Destination[] = [];
    const guilds = (GuildStore as any).getGuilds?.() ?? {};
    for (const gid in guilds) {
        const g = guilds[gid];
        if (!g) continue;
        out.push({ id: g.id, kind: "guild", name: g.name, avatar: guildIconUrl(g), guildId: g.id });
    }
    return out;
}

// Everything you can jump to: DMs, group DMs, guild text/voice channels, servers.
// Built once when the modal opens, then filtered in memory.
function getAllDestinations(): Destination[] {
    const out: Destination[] = [];
    for (const collect of [privateDestinations, guildChannelDestinations, guildDestinations]) {
        try { out.push(...collect()); } catch { }
    }
    return out;
}

// Pool for the author/mentions filter pickers: every user currently in the client
// cache (friends, DM partners, recently seen). Resolved to id + display name once.
function getKnownUsers(): PickRef[] {
    const users: Record<string, any> = (UserStore as any).getUsers?.() ?? {};
    const out: PickRef[] = [];
    for (const id in users) {
        const u = users[id];
        if (!u) continue;
        out.push({ id, name: u.globalName || u.username || id, sub: u.username, avatar: getAvatarUrl(u) });
    }
    return out;
}

// Cached users as jump destinations for the "Go to" tab, so you can search anyone
// by name — not just conversations you already have open. `exclude` drops users
// who already appear as a DM, to avoid duplicate rows. Clicking ensures the DM.
function userDestinations(exclude: Set<string>): Destination[] {
    const users: Record<string, any> = (UserStore as any).getUsers?.() ?? {};
    const out: Destination[] = [];
    for (const id in users) {
        if (exclude.has(id)) continue;
        const u = users[id];
        if (!u) continue;
        out.push({ id, kind: "user", name: u.globalName || u.username || id, subtitle: u.username, avatar: getAvatarUrl(u), userId: id });
    }
    return out;
}

// Quick-Switcher-style prefixes to narrow the kind: @ people/DMs, # text, ! voice, * servers.
const DEST_PREFIX: Record<string, DestKind[]> = {
    "@": ["dm", "group", "user"],
    "#": ["text"],
    "!": ["voice"],
    "*": ["guild"]
};

function conversationDestinations(list: Destination[]): Destination[] {
    return list.filter(d => d.kind === "dm" || d.kind === "group");
}

function filterDestinations(list: Destination[], query: string): Destination[] {
    let q = query.trim();
    if (!q) return conversationDestinations(list).slice(0, 40);

    let pool = list;
    const kinds = DEST_PREFIX[q[0]];
    if (kinds) {
        pool = list.filter(d => kinds.includes(d.kind));
        q = q.slice(1).trim();
    }
    if (!q) return pool.slice(0, 50);

    const lc = q.toLowerCase();
    return pool.filter(d =>
        d.name.toLowerCase().includes(lc)
        || d.subtitle?.toLowerCase().includes(lc)
        || d.context?.toLowerCase().includes(lc)
    ).slice(0, 50);
}

async function goToMessage(msg: SearchMessage) {
    const channelId = msg.channel_id;
    const stored = ChannelStore.getChannel(channelId);
    const guildId = stored?.guild_id ?? msg.guild_id ?? null;

    // Mensagem de servidor: a rota do guild sempre resolve o canal, então navega direto.
    if (guildId) {
        NavigationRouter.transitionTo(`/channels/${guildId}/${channelId}/${msg.id}`);
        return;
    }

    // DM/grupo já aberto (canal no store): navegar direto reutiliza a conversa e deixa
    // o Discord buscar as mensagens ao redor do alvo (GET .../messages?around={msg}).
    if (stored) {
        NavigationRouter.transitionTo(`/channels/@me/${channelId}/${msg.id}`);
        return;
    }

    // DM/grupo fechado: o canal não está no store, então navegar pra /@me/{id} cai numa
    // tela vazia. Como a busca retorna *suas* mensagens, msg.author normalmente é você —
    // não dá pra tirar o destinatário do autor. Buscamos o canal pra descobrir os
    // recipientes e, numa DM 1:1, reabrimos via getOrEnsurePrivateChannel (que NÃO cria
    // grupo novo) antes de pular pra mensagem.
    let recipientId: string | null = null;
    try {
        const res = await RestAPI.get({ url: `/channels/${channelId}` });
        const recipients: any[] = res?.body?.recipients ?? [];
        if (recipients.length === 1) recipientId = recipients[0]?.id ?? recipients[0] ?? null;
    } catch { }

    if (recipientId) {
        try {
            const id = await ChannelActionCreators.getOrEnsurePrivateChannel(recipientId);
            NavigationRouter.transitionTo(`/channels/@me/${id ?? channelId}/${msg.id}`);
            return;
        } catch { }
    }

    // Grupo (ou fallback): navegar pelo id do canal; grupos dos quais você participa
    // continuam acessíveis mesmo fora da lista de DMs.
    NavigationRouter.transitionTo(`/channels/@me/${channelId}/${msg.id}`);
}

function onActivate(handler: () => void) {
    return (e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handler(); }
    };
}

function SearchGlyph({ size = 20 }: { size?: number; }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M21.707 20.293 16.314 14.9a8 8 0 1 0-1.414 1.414l5.393 5.393a1 1 0 0 0 1.414-1.414ZM4 10a6 6 0 1 1 12 0 6 6 0 0 1-12 0Z" />
        </svg>
    );
}

function ClockIcon({ size = 18 }: { size?: number; }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm1-13a1 1 0 1 0-2 0v5a1 1 0 0 0 .45.83l3 2a1 1 0 1 0 1.1-1.66L13 11.46V7Z" />
        </svg>
    );
}

function JumpIcon({ size = 18 }: { size?: number; }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M21.7 7.3a1 1 0 0 1 0 1.4l-5 5a1 1 0 0 1-1.4-1.4L18.58 9H13a7 7 0 0 0-7 7v4a1 1 0 1 1-2 0v-4a9 9 0 0 1 9-9h5.59l-3.3-3.3a1 1 0 0 1 1.42-1.4l5 5Z" />
        </svg>
    );
}

function PlayIcon({ size = 20 }: { size?: number; }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M9.5 6.5v11a1 1 0 0 0 1.54.84l8.5-5.5a1 1 0 0 0 0-1.68l-8.5-5.5A1 1 0 0 0 9.5 6.5Z" />
        </svg>
    );
}

// Same glyphs Discord uses for text/voice channels in the Quick Switcher.
function HashIcon({ size = 18 }: { size?: number; }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" clipRule="evenodd" d="M10.99 3.16A1 1 0 1 0 9 2.84L8.15 8H4a1 1 0 0 0 0 2h3.82l-.67 4H3a1 1 0 1 0 0 2h3.82l-.8 4.84a1 1 0 0 0 1.97.32L8.85 16h4.97l-.8 4.84a1 1 0 0 0 1.97.32l.86-5.16H20a1 1 0 1 0 0-2h-3.82l.67-4H21a1 1 0 1 0 0-2h-3.82l.8-4.84a1 1 0 1 0-1.97-.32L15.15 8h-4.97l.8-4.84ZM14.15 14l.67-4H9.85l-.67 4h4.97Z" />
        </svg>
    );
}

function VoiceIcon({ size = 18 }: { size?: number; }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 3a1 1 0 0 0-1-1h-.06a1 1 0 0 0-.74.32L5.92 7H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2.92l4.28 4.68a1 1 0 0 0 .74.32H11a1 1 0 0 0 1-1V3ZM15.1 20.75c-.58.14-1.1-.33-1.1-.92v-.03c0-.5.37-.92.85-1.05a7 7 0 0 0 0-13.5A1.11 1.11 0 0 1 14 4.2v-.03c0-.6.52-1.06 1.1-.92a9 9 0 0 1 0 17.5Z" />
            <path d="M15.16 16.51c-.57.28-1.16-.2-1.16-.83v-.14c0-.43.28-.8.63-1.02a3 3 0 0 0 0-5.04c-.35-.23-.63-.6-.63-1.02v-.14c0-.63.59-1.1 1.16-.83a5 5 0 0 1 0 9.02Z" />
        </svg>
    );
}

function FilterIcon({ size = 18 }: { size?: number; }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M3 5a1 1 0 0 1 1-1h16a1 1 0 0 1 .78 1.63L14 13.35V19a1 1 0 0 1-1.45.9l-3-1.5A1 1 0 0 1 9 17.5v-4.15L3.22 5.63A1 1 0 0 1 3 5Z" />
        </svg>
    );
}

function Attachments({ msg }: { msg: SearchMessage; }) {
    if (!msg.attachments?.length) return null;
    return (
        <div className={cl("attachments")}>
            {msg.attachments.map(a => {
                if (isImageAttachment(a.filename, a.content_type))
                    return <img key={a.id} className={cl("thumb")} src={a.proxy_url ?? a.url} loading="lazy" alt={a.filename} onClick={e => { e.stopPropagation(); openMediaViewer(a); }} />;
                if (isVid(a))
                    return (
                        <div key={a.id} className={cl("video-wrap")} onClick={e => { e.stopPropagation(); openMediaViewer(a); }}>
                            <video className={cl("thumb")} src={a.url} muted preload="metadata" />
                            <div className={cl("video-badge")}><PlayIcon size={16} /></div>
                        </div>
                    );
                return (
                    <a key={a.id} className={cl("file")} href={a.url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>
                        📎 {a.filename}
                    </a>
                );
            })}
        </div>
    );
}

const ResultRow = ErrorBoundary.wrap(function ResultRow({ msg, onJump }: { msg: SearchMessage; onJump: (msg: SearchMessage) => void; }) {
    const channel = ChannelStore.getChannel(msg.channel_id);
    const guildId = channel?.guild_id ?? msg.guild_id ?? null;
    const guild = guildId ? GuildStore.getGuild(guildId) : null;

    const location = guild
        ? `${guild.name || t("server")} › #${channel?.name ?? t("channel")}`
        : guildId
            ? `${t("server")} · #${channel?.name ?? t("channel")}`
            : channel?.name
                ? `#${channel.name}`
                : t("directMessage");

    return (
        <div className={cl("result")} onClick={() => onJump(msg)} onKeyDown={onActivate(() => onJump(msg))} role="button" tabIndex={0}>
            <AuthorAvatar author={msg.author} className={cl("avatar")} />
            <div className={cl("body")}>
                <div className={cl("meta")}>
                    <span className={cl("author")}>{displayName(msg.author)}</span>
                    <span className={cl("location")}>{location}</span>
                    <span className={cl("time")}>{new Date(msg.timestamp).toLocaleString()}</span>
                </div>
                {msg.content && (
                    <div className={cl("msg-content")}>
                        <ErrorBoundary fallback={() => <>{msg.content}</>}>{Parser.parse(msg.content)}</ErrorBoundary>
                    </div>
                )}
                <Attachments msg={msg} />
            </div>
        </div>
    );
}, { noop: true });

const MediaTile = ErrorBoundary.wrap(function MediaTile({ msg, onJump }: { msg: SearchMessage; onJump: (msg: SearchMessage) => void; }) {
    const att = mediaOf(msg)[0];
    if (!att) return null;
    const vid = isVid(att);
    return (
        <div className={cl("media-tile")} onClick={() => openMediaViewer(att)} onKeyDown={onActivate(() => openMediaViewer(att))} role="button" tabIndex={0} title={att.filename}>
            {vid
                ? <video className={cl("media-img")} src={att.url} muted preload="metadata" />
                : <img className={cl("media-img")} src={att.proxy_url ?? att.url} loading="lazy" alt={att.filename} />}
            {vid && <div className={cl("media-play")}><PlayIcon size={22} /></div>}
            <button
                type="button"
                className={cl("media-jumpbtn")}
                title={t("jumpToMessage")}
                onClick={e => { e.stopPropagation(); onJump(msg); }}
            >
                <JumpIcon size={15} />
            </button>
        </div>
    );
}, { noop: true });

const GUILD_FALLBACK = "https://cdn.discordapp.com/embed/avatars/0.png";

const DestinationRow = ErrorBoundary.wrap(function DestinationRow({ dest, onOpen }: { dest: Destination; onOpen: (dest: Destination) => void; }) {
    const icon =
        dest.kind === "text" ? <span className={cl("dest-icon")}><HashIcon size={18} /></span>
            : dest.kind === "voice" ? <span className={cl("dest-icon")}><VoiceIcon size={18} /></span>
                : dest.avatar
                    ? <img className={cl("dest-avatar")} src={dest.avatar} alt="" loading="lazy" onError={e => { const img = e.currentTarget; if (img.src !== GUILD_FALLBACK) img.src = GUILD_FALLBACK; }} />
                    : <span className={cl("dest-fallback")}>{(dest.name || "?").slice(0, 1)}</span>;

    return (
        <div className={cl("recent-item")} onClick={() => onOpen(dest)} onKeyDown={onActivate(() => onOpen(dest))} role="button" tabIndex={0}>
            {icon}
            <div className={cl("person-text")}>
                <span className={cl("person-name")}>{dest.name}</span>
                {dest.subtitle && <span className={cl("person-username")}>{dest.subtitle}</span>}
            </div>
            {dest.context && <span className={cl("dest-context")}>{dest.context}</span>}
        </div>
    );
}, { noop: true });

// Autocomplete picker for the author/mentions/channel filters. Shows a selected
// chip once something is picked; otherwise a text input with a filtered dropdown.
function FilterCombo({ label, placeholder, value, list, onPick }: { label: string; placeholder: string; value: PickRef | null; list: PickRef[]; onPick: (v: PickRef | null) => void; }) {
    const [q, setQ] = useState("");
    const [open, setOpen] = useState(false);
    const lc = q.trim().toLowerCase();
    const matches = (lc
        ? list.filter(x => x.name.toLowerCase().includes(lc) || x.sub?.toLowerCase().includes(lc))
        : list).slice(0, 8);

    return (
        <div className={cl("combo")}>
            <span className={cl("filter-label")}>{label}</span>
            {value
                ? (
                    <div className={cl("combo-chip")}>
                        {value.avatar && <img className={cl("combo-avatar")} src={value.avatar} alt="" />}
                        <span className={cl("combo-chip-name")}>{value.name}</span>
                        <span className={cl("combo-chip-x")} onClick={() => onPick(null)} role="button" tabIndex={0}>✕</span>
                    </div>
                )
                : (
                    <div className={cl("combo-box")}>
                        <input
                            className={cl("combo-input")}
                            value={q}
                            placeholder={placeholder}
                            onChange={e => setQ(e.currentTarget.value)}
                            onFocus={() => setOpen(true)}
                            onBlur={() => setTimeout(() => setOpen(false), 120)}
                        />
                        {open && matches.length > 0 && (
                            <div className={cl("combo-list")}>
                                {matches.map(m => (
                                    <div key={m.id} className={cl("combo-opt")} onMouseDown={e => { e.preventDefault(); onPick(m); setQ(""); setOpen(false); }}>
                                        {m.avatar && <img className={cl("combo-avatar")} src={m.avatar} alt="" />}
                                        <span className={cl("combo-opt-name")}>{m.name}</span>
                                        {m.sub && <span className={cl("combo-opt-sub")}>{m.sub}</span>}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
        </div>
    );
}

const FilterPanel = ErrorBoundary.wrap(function FilterPanel({ filters, setFilters, people, channels }: { filters: Filters; setFilters: (fn: (f: Filters) => Filters) => void; people: PickRef[]; channels: PickRef[]; }) {
    const set = (patch: Partial<Filters>) => setFilters(f => ({ ...f, ...patch }));
    const toggleHas = (h: HasKind) => set({ has: filters.has.includes(h) ? filters.has.filter(x => x !== h) : [...filters.has, h] });

    return (
        <div className={cl("filters")}>
            <div className={cl("filter-row")}>
                <span className={cl("filter-label")}>{t("f_has")}</span>
                <div className={cl("chips")}>
                    {HAS_OPTIONS.map(h => (
                        <button key={h} type="button" className={classes(cl("chip"), filters.has.includes(h) && cl("chip-on"))} onClick={() => toggleHas(h)}>{t(`has_${h}`)}</button>
                    ))}
                </div>
            </div>

            <div className={cl("filter-row")}>
                <span className={cl("filter-label")}>{t("f_authorType")}</span>
                <div className={cl("chips")}>
                    <button type="button" className={classes(cl("chip"), filters.authorType === "user" && cl("chip-on"))} onClick={() => set({ authorType: filters.authorType === "user" ? null : "user" })}>{t("at_user")}</button>
                    <button type="button" className={classes(cl("chip"), filters.authorType === "bot" && cl("chip-on"))} onClick={() => set({ authorType: filters.authorType === "bot" ? null : "bot" })}>{t("at_bot")}</button>
                </div>
            </div>

            <div className={cl("filter-grid")}>
                <FilterCombo label={t("f_author")} placeholder={t("pickPlaceholder")} value={filters.author} list={people} onPick={v => set({ author: v })} />
                <FilterCombo label={t("f_mentions")} placeholder={t("pickPlaceholder")} value={filters.mentions} list={people} onPick={v => set({ mentions: v })} />
                <FilterCombo label={t("f_channel")} placeholder={t("pickPlaceholder")} value={filters.channel} list={channels} onPick={v => set({ channel: v })} />
            </div>

            <div className={cl("filter-row")}>
                <span className={cl("filter-label")}>{t("f_date")}</span>
                <input type="date" className={cl("date")} value={filters.dateFrom} max={filters.dateTo || undefined} onChange={e => set({ dateFrom: e.currentTarget.value })} />
                <span className={cl("filter-sep")}>→</span>
                <input type="date" className={cl("date")} value={filters.dateTo} min={filters.dateFrom || undefined} onChange={e => set({ dateTo: e.currentTarget.value })} />
                {filtersActive(filters) > 0 && (
                    <button type="button" className={cl("filter-clear")} onClick={() => setFilters(() => EMPTY_FILTERS)}>{t("clearFilters")}</button>
                )}
            </div>
        </div>
    );
}, { noop: true });

let mediaCache: { at: number; data: SearchMessage[]; } | null = null;

function initTabData(): Record<ApiTab, TabData> {
    return Object.fromEntries(
        API_TABS.map((t): [ApiTab, TabData] => [t, { query: null, fkey: "", results: [], cursor: null, loading: false }])
    ) as Record<ApiTab, TabData>;
}

export const SearchModal = ErrorBoundary.wrap(function SearchModal({ modalProps }: { modalProps: RenderModalProps; }) {
    const [query, setQuery] = useState("");
    const [debouncedQuery, setDebouncedQuery] = useState("");
    const [activeTab, setActiveTab] = useState<TabKey>("recent");
    const [tabData, setTabData] = useState<Record<ApiTab, TabData>>(initTabData);
    const [error, setError] = useState<string | null>(null);
    const [recent, setRecent] = useState<string[]>(getRecent());
    const [recentMedia, setRecentMedia] = useState<SearchMessage[]>(mediaCache?.data ?? []);
    const [allDest] = useState(getAllDestinations);
    const [userDest] = useState(() => {
        const dmIds = new Set<string>(allDest.filter(d => d.kind === "dm" && d.userId).map(d => d.userId!));
        return userDestinations(dmIds);
    });
    const [people] = useState(getKnownUsers);
    const [channels] = useState(() => allDest.map(d => ({ id: d.id, name: d.name, sub: d.subtitle ?? d.context, avatar: d.avatar }) as PickRef));
    const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
    const [showFilters, setShowFilters] = useState(false);

    const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
    const loadSeq = useRef(0);
    const loadingMoreRef = useRef(false);
    const resultsRef = useRef<HTMLDivElement | null>(null);

    const apiTab: ApiTab | null = (activeTab === "recent" || activeTab === "people") ? null : activeTab;
    const td = apiTab ? tabData[apiTab] : null;
    const tabSettled = !!td && td.query === query.trim() && !td.loading;
    const destResults = activeTab === "people" ? filterDestinations([...allDest, ...userDest], query) : [];
    const convoSuggestions = conversationDestinations(allDest);
    const filtersKey = JSON.stringify(filters);
    const anyFilters = filtersActive(filters) > 0;
    const tabStrip = (query.trim() || anyFilters) ? QUERY_TABS : BASE_TABS;

    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (mediaCache && Date.now() - mediaCache.at < MEDIA_CACHE_TTL) {
                setRecentMedia(mediaCache.data);
                return;
            }
            try {
                const data = await searchTab("media", "", "desc", PAGE_SIZE, null);
                if (cancelled) return;
                const media = flattenHits(data.tabs?.media).filter(m => mediaOf(m).length > 0);
                mediaCache = { at: Date.now(), data: media };
                setRecentMedia(media);
            } catch { }
        })();
        return () => { cancelled = true; };
    }, []);

    useEffect(() => () => { if (debounce.current) clearTimeout(debounce.current); }, []);

    useEffect(() => {
        if (!apiTab) return;
        if (apiTab === "messages" && !debouncedQuery && !anyFilters) return;
        const current = tabData[apiTab];
        if (current.query === debouncedQuery && current.fkey === filtersKey && (current.results.length > 0 || current.loading)) return;
        loadTab(apiTab, debouncedQuery);
    }, [activeTab, debouncedQuery, filtersKey]);

    useEffect(() => {
        const el = resultsRef.current;
        if (!el || !td || !td.cursor || td.loading) return;
        if (el.scrollHeight <= el.clientHeight + 4) loadMore();
    });

    async function loadTab(tab: ApiTab, q: string) {
        const seq = ++loadSeq.current;
        loadingMoreRef.current = false;
        setError(null);
        setTabData(prev => ({ ...prev, [tab]: { query: q, fkey: filtersKey, results: [], cursor: null, loading: true } }));
        try {
            const data = await searchTab(tab, q, "desc", PAGE_SIZE, null, filters);
            if (seq !== loadSeq.current) return;
            const results = flattenHits(data.tabs?.[tab]);
            setTabData(prev => ({ ...prev, [tab]: { query: q, fkey: filtersKey, results, cursor: nextCursor(results, null), loading: false } }));
        } catch (e) {
            if (seq !== loadSeq.current) return;
            setError(formatError(e));
            setTabData(prev => ({ ...prev, [tab]: { query: q, fkey: filtersKey, results: [], cursor: null, loading: false } }));
        }
    }

    async function loadMore() {
        if (!apiTab) return;
        const current = tabData[apiTab];
        if (!current.cursor || loadingMoreRef.current) return;

        const seq = loadSeq.current;
        loadingMoreRef.current = true;
        setTabData(prev => ({ ...prev, [apiTab]: { ...prev[apiTab], loading: true } }));
        try {
            const data = await searchTab(apiTab, current.query ?? "", "desc", PAGE_SIZE, current.cursor, filters);
            if (seq !== loadSeq.current) return;
            const page = flattenHits(data.tabs?.[apiTab]);
            setTabData(prev => {
                const seen = new Set(prev[apiTab].results.map(m => m.id));
                const fresh = page.filter(m => !seen.has(m.id));
                return { ...prev, [apiTab]: { ...prev[apiTab], results: [...prev[apiTab].results, ...fresh], cursor: nextCursor(page, current.cursor), loading: false } };
            });
        } catch (e) {
            if (seq !== loadSeq.current) return;
            setError(formatError(e));
            setTabData(prev => ({ ...prev, [apiTab]: { ...prev[apiTab], loading: false } }));
        } finally {
            loadingMoreRef.current = false;
        }
    }

    function commitQuery(v: string) {
        const t = v.trim();
        if (debounce.current) clearTimeout(debounce.current);
        setDebouncedQuery(t);
    }

    function onQueryChange(v: string) {
        setQuery(v);
        if (v.trim() && activeTab === "recent") setActiveTab("messages");
        else if (!v.trim() && activeTab === "messages") setActiveTab("recent");
        if (debounce.current) clearTimeout(debounce.current);
        debounce.current = setTimeout(() => setDebouncedQuery(v.trim()), DEBOUNCE_MS);
    }

    function pickRecent(q: string) {
        setQuery(q);
        commitQuery(q);
        setActiveTab("messages");
    }

    function clearRecent() {
        settings.store.recentSearches = [];
        setRecent([]);
    }

    function jump(msg: SearchMessage) {
        saveRecent(debouncedQuery);
        modalProps.onClose();
        goToMessage(msg);
    }

    function openDestination(dest: Destination) {
        // A "user" result has no open DM yet — ensure the 1:1 channel (reuses the
        // existing DM, never creates a group), then navigate to it.
        if (dest.kind === "user") {
            modalProps.onClose();
            Promise.resolve(ChannelActionCreators.getOrEnsurePrivateChannel(dest.userId ?? dest.id))
                .then((id: string) => NavigationRouter.transitionTo(`/channels/@me/${id ?? dest.id}`))
                .catch(() => { });
            return;
        }
        if (dest.kind === "dm" || dest.kind === "group") NavigationRouter.transitionTo(`/channels/@me/${dest.id}`);
        else if (dest.kind === "guild") NavigationRouter.transitionTo(`/channels/${dest.id}`);
        else NavigationRouter.transitionTo(`/channels/${dest.guildId}/${dest.id}`);
        modalProps.onClose();
    }

    function onScroll(e: React.UIEvent<HTMLDivElement>) {
        const el = e.currentTarget;
        if (el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_THRESHOLD) loadMore();
    }

    return (
        <ModalRoot {...modalProps} size={ModalSize.LARGE} className={cl("modal")}>
            <ModalHeader className={cl("header")}>
                <form
                    className={cl("searchbar")}
                    onSubmit={e => { e.preventDefault(); commitQuery(query); saveRecent(query); setRecent(getRecent()); }}
                >
                    <span className={cl("search-icon")}><SearchGlyph size={20} /></span>
                    <TextInput autoFocus value={query} onChange={onQueryChange} placeholder={t("placeholder")} className={cl("input")} />
                </form>
                <button
                    type="button"
                    className={classes(cl("filter-toggle"), (showFilters || anyFilters) && cl("filter-toggle-active"))}
                    onClick={() => setShowFilters(v => !v)}
                    title={t("filters")}
                >
                    <FilterIcon size={18} />
                    {anyFilters && <span className={cl("filter-badge")}>{filtersActive(filters)}</span>}
                </button>
                <ModalCloseButton onClick={modalProps.onClose} />
            </ModalHeader>

            <div className={cl("tabs")}>
                {tabStrip.map(key => (
                    <button
                        key={key}
                        type="button"
                        className={classes(cl("tab"), key === activeTab && cl("tab-active"))}
                        onClick={() => { setError(null); setActiveTab(key); }}
                    >
                        {tabLabel(key)}
                    </button>
                ))}
            </div>

            {showFilters && <FilterPanel filters={filters} setFilters={setFilters} people={people} channels={channels} />}

            <ModalContent className={cl("content")}>
                <div className={cl("results")} ref={resultsRef} onScroll={onScroll}>
                    {error && <div className={classes(cl("status"), cl("error"))}>{error}</div>}

                    {activeTab === "recent" && (
                        <>
                            {recent.length > 0 && (
                                <div className={cl("section")}>
                                    <div className={cl("section-head")}>
                                        <span className={cl("section-title")}>{t("recentSearches")}</span>
                                        <span className={cl("section-action")} onClick={clearRecent}>{t("clearAll")}</span>
                                    </div>
                                    {recent.map(q => (
                                        <div key={q} className={cl("recent-item")} onClick={() => pickRecent(q)} onKeyDown={onActivate(() => pickRecent(q))} role="button" tabIndex={0}>
                                            <span className={cl("recent-icon")}><ClockIcon size={18} /></span>
                                            <span className={cl("recent-text")}>{q}</span>
                                            <span className={cl("recent-remove")} onClick={e => { e.stopPropagation(); dropRecent(q); setRecent(getRecent()); }} title={t("remove")}>✕</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {convoSuggestions.length > 0 && (
                                <div className={cl("section")}>
                                    <div className={cl("section-head")}><span className={cl("section-title")}>{t("suggestions")}</span></div>
                                    {convoSuggestions.slice(0, 8).map(d => <DestinationRow key={d.id} dest={d} onOpen={openDestination} />)}
                                </div>
                            )}
                            {recentMedia.length > 0 && (
                                <div className={cl("section")}>
                                    <div className={cl("section-head")}><span className={cl("section-title")}>{t("photosMedia")}</span></div>
                                    <div className={cl("media-grid")}>
                                        {recentMedia.map(m => <MediaTile key={`${m.channel_id}-${m.id}`} msg={m} onJump={jump} />)}
                                    </div>
                                </div>
                            )}
                            {recent.length === 0 && convoSuggestions.length === 0 && recentMedia.length === 0 && (
                                <div className={cl("status")}>{t("emptyRecent")}</div>
                            )}
                        </>
                    )}

                    {activeTab === "people" && (
                        destResults.length > 0
                            ? destResults.map(d => <DestinationRow key={`${d.kind}-${d.id}`} dest={d} onOpen={openDestination} />)
                            : <div className={cl("status")}>{t("nothingFound")}</div>
                    )}

                    {apiTab === "messages" && !debouncedQuery && !anyFilters && (
                        <div className={cl("status")}>{t("typeToSearch")}</div>
                    )}

                    {apiTab && td && !(apiTab === "messages" && !debouncedQuery && !anyFilters) && (
                        <>
                            {!tabSettled && td.results.length === 0 && <div className={cl("status")}>{t("searching")}</div>}
                            {tabSettled && td.results.length === 0 && <div className={cl("status")}>{t("noResults")}</div>}

                            {apiTab === "media"
                                ? <div className={cl("media-grid")}>{td.results.filter(m => mediaOf(m).length > 0).map(m => <MediaTile key={`${m.channel_id}-${m.id}`} msg={m} onJump={jump} />)}</div>
                                : td.results.map(m => <ResultRow key={`${m.channel_id}-${m.id}`} msg={m} onJump={jump} />)}

                            {td.loading && td.results.length > 0 && (
                                <div className={cl("loadmore")}>{t("loadingMore")}</div>
                            )}
                        </>
                    )}
                </div>
            </ModalContent>
        </ModalRoot>
    );
});

export function openSearchModal() {
    openModal(modalProps => <SearchModal modalProps={modalProps} />);
}

function OnboardingModal({ modalProps }: { modalProps: RenderModalProps; }) {
    const finish = (open: boolean) => {
        settings.store.seenOnboarding = true;
        modalProps.onClose();
        if (open) openSearchModal();
    };

    return (
        <ModalRoot {...modalProps} size={ModalSize.MEDIUM} className={obcl("modal")}>
            <div className={obcl("hero")}>
                <div className={obcl("logo")}><SearchGlyph size={34} /></div>
                <div className={obcl("title")}>MessageSearch</div>
                <div className={obcl("subtitle")}>
                    {t("ob_subtitle")}
                </div>
            </div>

            <ErrorBoundary noop>
                <div className={obcl("cards")}>
                    <div className={obcl("card")} style={{ animationDelay: "0.25s" }}>
                        <div className={obcl("mock")}>
                            <div className={obcl("mock-bar")}>
                                <span className={obcl("mock-text")}>{t("ob_mockText")}</span>
                                <span className={obcl("mock-btn")}><SearchGlyph size={14} /></span>
                            </div>
                        </div>
                        <div className={obcl("label")}>{t("ob_label")}</div>
                    </div>
                </div>
            </ErrorBoundary>

            <div className={obcl("actions")}>
                <Button look={Button.Looks.LINK} color={Button.Colors.PRIMARY} onClick={() => finish(false)}>{t("ob_skip")}</Button>
                <Button onClick={() => finish(true)}>{t("ob_try")}</Button>
            </div>
        </ModalRoot>
    );
}

function maybeShowOnboarding() {
    if (settings.store.seenOnboarding) return;
    openModal(modalProps => <OnboardingModal modalProps={modalProps} />);
}

const ICON_SVG =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
    '<path d="M21.707 20.293 16.314 14.9a8 8 0 1 0-1.414 1.414l5.393 5.393a1 1 0 0 0 1.414-1.414ZM4 10a6 6 0 1 1 12 0 6 6 0 0 1-12 0Z" />' +
    "</svg>";
const DM_BTN_CLASS = "vc-msgsearch-dmbtn";
const DM_SELECTORS = [
    '[class*="privateChannels_"] [class*="searchBar_"]',
    'nav[class*="privateChannels"] [class*="searchBar"]',
    '[class*="privateChannels"] [class*="searchBar"]',
    '[class*="privateChannels"] [class*="searchBarComponent"]'
];

let intervalId: ReturnType<typeof setInterval> | null = null;

function makeButton(className: string): HTMLDivElement {
    const btn = document.createElement("div");
    btn.className = className;
    btn.setAttribute("role", "button");
    btn.setAttribute("tabindex", "0");
    btn.setAttribute("aria-label", t("searchMessages"));
    btn.title = t("searchMessages");
    btn.innerHTML = ICON_SVG;
    return btn;
}

function injectDmButton() {
    if (!settings.store.showDmButton) return;

    let bar: HTMLElement | null = null;
    for (const selector of DM_SELECTORS) {
        bar = document.querySelector<HTMLElement>(selector);
        if (bar) break;
    }
    if (!bar || bar.querySelector("." + DM_BTN_CLASS)) return;

    const btn = makeButton(DM_BTN_CLASS);
    btn.addEventListener("click", e => {
        e.stopPropagation();
        e.preventDefault();
        openSearchModal();
    });

    if (getComputedStyle(bar).position === "static") bar.style.position = "relative";
    bar.appendChild(btn);
}

function tick() {
    injectDmButton();
}

function injectDomButtons() {
    tick();
    intervalId = setInterval(tick, 1000);
}

function removeDomButtons() {
    if (intervalId != null) clearInterval(intervalId);
    intervalId = null;
    document.querySelectorAll(".vc-msgsearch-dmbtn, .vc-msgsearch-toolbtn").forEach(el => el.remove());
}

const STYLE_ID = "vc-msgsearch-style";
const STYLE = `
/* Modern, dark, fixed-size shell. Height is locked so the modal never resizes as
   results stream in — the results list fills the remaining space and scrolls inside. */
.vc-msgsearch-modal { width: 780px !important; max-width: 94vw !important; height: 80vh !important; max-height: 840px !important; min-height: 560px !important; display: flex; flex-direction: column; overflow: hidden; border-radius: 16px; background: #0e0f13; border: 1px solid rgba(255,255,255,.06); box-shadow: 0 24px 70px rgba(0,0,0,.6); }
.vc-msgsearch-header, .vc-msgsearch-tabs, .vc-msgsearch-content { color: var(--text-normal, #e7e8ec); }

.vc-msgsearch-header { display: flex; align-items: center; gap: 12px; padding: 18px 20px 12px; flex: 0 0 auto; }
.vc-msgsearch-searchbar { display: flex; align-items: center; gap: 11px; flex: 1; min-width: 0; height: 44px; background: #15161b; border: 1px solid rgba(255,255,255,.07); border-radius: 12px; padding: 0 15px; transition: border-color .15s ease, background .15s ease; }
.vc-msgsearch-searchbar:focus-within { border-color: var(--brand-500, #5865f2); background: #181920; }
.vc-msgsearch-search-icon { display: flex; flex: 0 0 auto; color: var(--text-muted, #868b94); transition: color .15s ease; }
.vc-msgsearch-searchbar:focus-within .vc-msgsearch-search-icon { color: var(--brand-500, #6571f4); }
.vc-msgsearch-input { flex: 1; min-width: 0; }
.vc-msgsearch-searchbar * { background: transparent !important; border: none !important; box-shadow: none !important; outline: none !important; }
.vc-msgsearch-input input { color: var(--text-normal, #e7e8ec) !important; font-size: 15px !important; padding: 0 !important; }
.vc-msgsearch-input input::placeholder { color: var(--text-muted, #6f747d) !important; }
/* Force light text + caret on every input in the modal (search box, filter
   pickers, date fields) so typed text is never rendered black on the dark bg. */
.vc-msgsearch-modal input, .vc-msgsearch-modal input[type="date"] { color: #e7e8ec !important; caret-color: #e7e8ec !important; -webkit-text-fill-color: #e7e8ec !important; }
.vc-msgsearch-modal input::placeholder { color: #6f747d !important; -webkit-text-fill-color: #6f747d !important; }

.vc-msgsearch-tabs { display: flex; gap: 6px; padding: 2px 20px 14px; flex: 0 0 auto; overflow-x: auto; scrollbar-width: none; border-bottom: 1px solid rgba(255,255,255,.05); }
.vc-msgsearch-tabs::-webkit-scrollbar { display: none; }
.vc-msgsearch-tab { appearance: none; background: transparent; border: none; cursor: pointer; padding: 7px 14px; border-radius: 9px; color: var(--text-muted, #9aa0a8); font-size: 13px; font-weight: 600; white-space: nowrap; transition: color .12s ease, background .12s ease; }
.vc-msgsearch-tab:hover { color: #e7e8ec; background: rgba(255,255,255,.045); }
.vc-msgsearch-tab-active, .vc-msgsearch-tab-active:hover { color: #fff; background: var(--brand-500, #5865f2); }

.vc-msgsearch-content { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; padding: 8px 10px 14px 20px; }
.vc-msgsearch-results { flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden; display: flex; flex-direction: column; gap: 3px; padding-right: 10px; overflow-anchor: none; }
.vc-msgsearch-results::-webkit-scrollbar { width: 8px; }
.vc-msgsearch-results::-webkit-scrollbar-thumb { background: rgba(255,255,255,.1); border-radius: 8px; }
.vc-msgsearch-results::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,.16); }
.vc-msgsearch-results::-webkit-scrollbar-track { background: transparent; }
.vc-msgsearch-status { color: var(--text-muted, #8b909a); text-align: center; padding: 48px 16px; font-size: 14px; margin: auto 0; }
.vc-msgsearch-error { color: var(--text-danger, #f5555f); }

.vc-msgsearch-section { display: flex; flex-direction: column; gap: 2px; margin-top: 10px; }
.vc-msgsearch-section-head { display: flex; align-items: center; justify-content: space-between; padding: 4px 6px; }
.vc-msgsearch-section-title { color: var(--header-secondary, #9aa0a8); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
.vc-msgsearch-section-action { color: var(--text-link, #5d8cff); font-size: 12px; font-weight: 600; cursor: pointer; }
.vc-msgsearch-section-action:hover { text-decoration: underline; }

.vc-msgsearch-recent-item { display: flex; align-items: center; gap: 12px; padding: 9px 10px; border-radius: 10px; cursor: pointer; transition: background .1s ease; }
.vc-msgsearch-recent-item:hover { background: rgba(255,255,255,.05); }
.vc-msgsearch-recent-icon { color: var(--text-muted, #868b94); width: 20px; display: flex; justify-content: center; flex: 0 0 auto; }
.vc-msgsearch-recent-text { flex: 1; min-width: 0; color: var(--text-normal, #e7e8ec); font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vc-msgsearch-recent-remove { color: var(--text-muted, #868b94); cursor: pointer; padding: 0 4px; font-size: 12px; flex: 0 0 auto; border-radius: 4px; }
.vc-msgsearch-recent-remove:hover { color: #fff; }
.vc-msgsearch-suggest-avatar { width: 32px; height: 32px; border-radius: 50%; flex: 0 0 auto; object-fit: cover; }
.vc-msgsearch-person-text { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.vc-msgsearch-person-name { color: var(--text-normal, #e7e8ec); font-size: 14px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vc-msgsearch-person-username { color: var(--text-muted, #868b94); font-size: 12px; }

.vc-msgsearch-dest-icon { color: var(--text-muted, #868b94); width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; flex: 0 0 auto; background: rgba(255,255,255,.04); border-radius: 50%; }
.vc-msgsearch-dest-avatar { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; flex: 0 0 auto; }
.vc-msgsearch-dest-fallback { width: 32px; height: 32px; border-radius: 50%; flex: 0 0 auto; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; color: #fff; background: var(--brand-experiment, #5865f2); text-transform: uppercase; }
.vc-msgsearch-dest-context { margin-left: auto; padding-left: 8px; color: var(--text-muted, #868b94); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 45%; flex: 0 0 auto; }

.vc-msgsearch-media-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; margin-top: 6px; }
.vc-msgsearch-media-tile { position: relative; aspect-ratio: 1 / 1; border-radius: 10px; overflow: hidden; cursor: pointer; background: #15161b; }
.vc-msgsearch-media-img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform .18s ease; }
.vc-msgsearch-media-tile:hover .vc-msgsearch-media-img { transform: scale(1.06); }
.vc-msgsearch-media-play { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #fff; background: rgba(0,0,0,.32); pointer-events: none; }
.vc-msgsearch-media-jumpbtn { position: absolute; top: 6px; right: 6px; display: flex; align-items: center; justify-content: center; width: 26px; height: 26px; padding: 0; border: none; border-radius: 8px; color: #fff; background: rgba(0,0,0,.55); backdrop-filter: blur(2px); cursor: pointer; opacity: 0; transition: opacity .12s ease, background .12s ease; }
.vc-msgsearch-media-tile:hover .vc-msgsearch-media-jumpbtn { opacity: 1; }
.vc-msgsearch-media-jumpbtn:hover { background: rgba(0,0,0,.82); }

.vc-msgsearch-result { display: flex; gap: 12px; padding: 10px; border-radius: 12px; cursor: pointer; transition: background-color .1s ease; }
.vc-msgsearch-result:hover { background: rgba(255,255,255,.05); }
.vc-msgsearch-avatar { width: 38px; height: 38px; border-radius: 50%; flex: 0 0 auto; object-fit: cover; }
.vc-msgsearch-body { flex: 1; min-width: 0; }
.vc-msgsearch-meta { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.vc-msgsearch-author { color: var(--header-primary, #f5f6f8); font-weight: 600; font-size: 14px; }
.vc-msgsearch-location { color: var(--text-muted, #868b94); font-size: 12px; }
.vc-msgsearch-time { color: var(--text-muted, #6f747d); font-size: 11px; margin-left: auto; }
.vc-msgsearch-msg-content { color: var(--text-normal, #d6d8dd); font-size: 14px; line-height: 1.4; word-break: break-word; margin-top: 3px; }
.vc-msgsearch-attachments { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.vc-msgsearch-thumb { max-width: 150px; max-height: 110px; border-radius: 8px; object-fit: cover; cursor: zoom-in; }
.vc-msgsearch-video-wrap { position: relative; display: inline-flex; cursor: pointer; }
.vc-msgsearch-video-badge { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #fff; background: rgba(0,0,0,.3); border-radius: 8px; pointer-events: none; }
.vc-msgsearch-file { display: inline-flex; align-items: center; gap: 4px; color: var(--text-link, #5d8cff); font-size: 13px; text-decoration: none; background: rgba(255,255,255,.04); padding: 6px 10px; border-radius: 8px; }
.vc-msgsearch-file:hover { background: rgba(255,255,255,.08); }
.vc-msgsearch-loadmore { align-self: center; margin: 12px 0; color: var(--text-muted, #868b94); font-size: 13px; }

.vc-msgsearch-filter-toggle { position: relative; display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; flex: 0 0 auto; border: none; border-radius: 12px; background: #15161b; color: var(--text-muted, #9aa0a8); cursor: pointer; transition: color .12s ease, background .12s ease; }
.vc-msgsearch-filter-toggle:hover { color: #e7e8ec; background: #191a20; }
.vc-msgsearch-filter-toggle-active { color: #fff; background: var(--brand-500, #5865f2); }
.vc-msgsearch-filter-toggle-active:hover { color: #fff; background: var(--brand-560, #4752c4); }
.vc-msgsearch-filter-badge { position: absolute; top: -3px; right: -3px; min-width: 17px; height: 17px; padding: 0 4px; box-sizing: border-box; border-radius: 9px; background: var(--brand-500, #5865f2); color: #fff; font-size: 10px; font-weight: 700; display: flex; align-items: center; justify-content: center; border: 2px solid #0e0f13; }
.vc-msgsearch-filter-toggle-active .vc-msgsearch-filter-badge { background: #fff; color: var(--brand-500, #5865f2); }

.vc-msgsearch-filters { display: flex; flex-direction: column; gap: 11px; padding: 14px 20px; flex: 0 0 auto; background: #121317; border-bottom: 1px solid rgba(255,255,255,.05); }
.vc-msgsearch-filter-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.vc-msgsearch-filter-label { color: var(--text-muted, #9aa0a8); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; min-width: 58px; }
.vc-msgsearch-chips { display: flex; gap: 6px; flex-wrap: wrap; }
.vc-msgsearch-chip { appearance: none; border: 1px solid rgba(255,255,255,.1); background: transparent; color: var(--text-muted, #9aa0a8); border-radius: 8px; padding: 5px 11px; font-size: 12px; font-weight: 600; cursor: pointer; transition: color .12s ease, background .12s ease, border-color .12s ease; }
.vc-msgsearch-chip:hover { color: #e7e8ec; border-color: rgba(255,255,255,.22); }
.vc-msgsearch-chip-on, .vc-msgsearch-chip-on:hover { color: #fff; background: var(--brand-500, #5865f2); border-color: var(--brand-500, #5865f2); }

.vc-msgsearch-filter-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.vc-msgsearch-combo { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.vc-msgsearch-combo-box { position: relative; }
.vc-msgsearch-combo-input { width: 100%; height: 34px; box-sizing: border-box; background: #1b1c22; border: 1px solid rgba(255,255,255,.08); border-radius: 9px; padding: 0 12px; color: #e7e8ec; font-size: 13px; outline: none; }
.vc-msgsearch-combo-input:focus { border-color: var(--brand-500, #5865f2); }
.vc-msgsearch-combo-input::placeholder { color: #6f747d; }
.vc-msgsearch-combo-list { position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 30; max-height: 230px; overflow-y: auto; background: #1b1c22; border: 1px solid rgba(255,255,255,.1); border-radius: 10px; box-shadow: 0 14px 34px rgba(0,0,0,.55); padding: 4px; }
.vc-msgsearch-combo-list::-webkit-scrollbar { width: 8px; }
.vc-msgsearch-combo-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,.12); border-radius: 8px; }
.vc-msgsearch-combo-opt { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 7px; cursor: pointer; }
.vc-msgsearch-combo-opt:hover { background: rgba(255,255,255,.06); }
.vc-msgsearch-combo-avatar { width: 22px; height: 22px; border-radius: 50%; object-fit: cover; flex: 0 0 auto; }
.vc-msgsearch-combo-opt-name { color: #e7e8ec; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vc-msgsearch-combo-opt-sub { color: #6f747d; font-size: 11px; margin-left: auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 48%; }
.vc-msgsearch-combo-chip { display: flex; align-items: center; gap: 8px; height: 34px; box-sizing: border-box; background: var(--brand-500, #5865f2); color: #fff; border-radius: 9px; padding: 0 6px 0 10px; }
.vc-msgsearch-combo-chip-name { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.vc-msgsearch-combo-chip-x { cursor: pointer; font-size: 12px; padding: 0 5px; opacity: .85; }
.vc-msgsearch-combo-chip-x:hover { opacity: 1; }
.vc-msgsearch-date { height: 34px; box-sizing: border-box; background: #1b1c22; border: 1px solid rgba(255,255,255,.08); border-radius: 9px; padding: 0 10px; color: #e7e8ec; font-size: 13px; outline: none; color-scheme: dark; cursor: text; }
.vc-msgsearch-date:focus { border-color: var(--brand-500, #5865f2); }
.vc-msgsearch-filter-sep { color: #6f747d; }
.vc-msgsearch-filter-clear { margin-left: auto; appearance: none; border: none; background: transparent; color: var(--text-link, #5d8cff); font-size: 12px; font-weight: 600; cursor: pointer; }
.vc-msgsearch-filter-clear:hover { text-decoration: underline; }

.vc-msgsearch-ob-modal { overflow: hidden; }
.vc-msgsearch-ob-hero { text-align: center; padding: 28px 24px 6px; background: radial-gradient(120% 120% at 50% -10%, rgba(88,101,242,.25), transparent 65%); }
.vc-msgsearch-ob-logo { width: 64px; height: 64px; margin: 0 auto 12px; display: flex; align-items: center; justify-content: center; border-radius: 50%; color: #fff; background: var(--brand-experiment, #5865f2); animation: vc-ob-pop .5s cubic-bezier(.2,.8,.2,1) both, vc-ob-glow 2.4s ease-in-out .7s infinite; }
.vc-msgsearch-ob-title { font-size: 22px; font-weight: 800; color: var(--header-primary, #f2f3f5); animation: vc-ob-pop .5s .08s both; }
.vc-msgsearch-ob-subtitle { color: var(--text-muted, #b5bac1); font-size: 14px; max-width: 430px; margin: 6px auto 0; animation: vc-ob-pop .5s .14s both; }
.vc-msgsearch-ob-cards { display: flex; gap: 14px; padding: 18px 24px; flex-wrap: wrap; justify-content: center; }
.vc-msgsearch-ob-card { position: relative; flex: 1 1 200px; background: var(--background-secondary, #2b2d31); border-radius: 10px; padding: 14px; opacity: 0; animation: vc-ob-rise .55s cubic-bezier(.2,.8,.2,1) both; }
.vc-msgsearch-ob-badge { position: absolute; top: -8px; left: -8px; width: 24px; height: 24px; border-radius: 50%; background: var(--brand-experiment, #5865f2); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; }
.vc-msgsearch-ob-mock { background: var(--background-tertiary, #1e1f22); border-radius: 8px; padding: 8px; }
.vc-msgsearch-ob-mock-bar { display: flex; align-items: center; gap: 8px; }
.vc-msgsearch-ob-mock-text { flex: 1; color: var(--text-muted, #80848e); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.vc-msgsearch-ob-mock-btn { display: flex; align-items: center; justify-content: center; color: #fff; background: var(--brand-experiment, #5865f2); border-radius: 6px; padding: 4px; flex: 0 0 auto; animation: vc-ob-bounce 1.6s ease-in-out infinite; }
.vc-msgsearch-ob-mock-dim { color: var(--text-muted, #80848e); font-size: 11px; flex: 0 0 auto; }
.vc-msgsearch-ob-label { margin-top: 10px; color: var(--header-primary, #f2f3f5); font-weight: 600; font-size: 13px; text-align: center; }
.vc-msgsearch-ob-actions { display: flex; justify-content: flex-end; align-items: center; gap: 10px; padding: 8px 24px 22px; }

@keyframes vc-ob-pop { from { opacity: 0; transform: scale(.7); } to { opacity: 1; transform: none; } }
@keyframes vc-ob-rise { from { opacity: 0; transform: translateY(16px) scale(.96); } to { opacity: 1; transform: none; } }
@keyframes vc-ob-glow { 0%, 100% { box-shadow: 0 0 0 0 rgba(88,101,242,.55); } 50% { box-shadow: 0 0 0 12px rgba(88,101,242,0); } }
@keyframes vc-ob-bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }

.vc-msgsearch-dmbtn { position: absolute; right: 16px; top: 50%; transform: translateY(-50%); display: flex; align-items: center; justify-content: center; color: var(--interactive-normal, #b5bac1); cursor: pointer; padding: 3px; border-radius: 4px; z-index: 2; }
.vc-msgsearch-dmbtn:hover { color: var(--interactive-hover, #dbdee1); background: var(--background-modifier-hover, rgba(255,255,255,.04)); }
.vc-msgsearch-dmbtn svg { width: 18px; height: 18px; }
`;

function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const el = document.createElement("style");
    el.id = STYLE_ID;
    el.textContent = STYLE;
    document.head.appendChild(el);
}

function removeStyle() {
    document.getElementById(STYLE_ID)?.remove();
}

let onboardingTimer: ReturnType<typeof setTimeout> | undefined;

export default definePlugin({
    name: "MessageSearch",
    // Static English here on purpose — see the note on the settings description above.
    // String literal (not I18N.en.plugin_desc) so the plugin-list generator can parse it.
    description: "Search through every message you've sent on Discord — the mobile app's global search, on desktop. Adds a button that opens a tabbed search (Messages, Media, Files, Links, Pins, People).",
    authors: [PixelCordDevs.outlayer, PixelCordDevs.myvings],
    settings,

    start() {
        injectStyle();
        injectDomButtons();
        onboardingTimer = setTimeout(maybeShowOnboarding, 2500);
    },

    stop() {
        removeDomButtons();
        removeStyle();
        if (onboardingTimer) clearTimeout(onboardingTimer);
    }
});
