/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { ErrorCard } from "@components/ErrorCard";
import { Link } from "@components/Link";
import { Paragraph } from "@components/Paragraph";
import { SettingsTab, wrapTab } from "@components/settings";
import { classNameFactory } from "@utils/css";
import { Logger } from "@utils/Logger";
import { classes } from "@utils/misc";
import { PluginNative } from "@utils/types";
import { RenderModalProps } from "@vencord/discord-types";
import { Button, Modal, openModal, Select, showToast, TextInput, Toasts, useEffect, useMemo, useState } from "@webpack/common";

const Native = VencordNative.pluginHelpers.BetterDiscordThemes as PluginNative<typeof import("./native")>;
const logger = new Logger("BetterDiscordThemes");
const cl = classNameFactory("vc-bdthemes-");

interface StoreTheme {
    id: number;
    name: string;
    description: string;
    downloads: number;
    likes: number;
    thumbnailId: number;
    tags: string[];
    author: string;
    releaseDate: string;
}

type SortKey = "downloads" | "likes" | "recent";

const SORT_OPTIONS = [
    { label: "Most downloaded", value: "downloads", default: true },
    { label: "Most liked", value: "likes" },
    { label: "Newest", value: "recent" }
];

function formatNum(n: number): string {
    return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n);
}

function thumbUrl(theme: StoreTheme): string {
    return `https://betterdiscord.app/image/${theme.thumbnailId}`;
}

function bdPage(theme: StoreTheme): string {
    return `https://betterdiscord.app/themes/${encodeURIComponent(theme.name)}`;
}

function PreviewModal({ modalProps, theme, onInstall }: { modalProps: RenderModalProps; theme: StoreTheme; onInstall: () => void; }) {
    return (
        <Modal {...modalProps} size="md" title={theme.name}>
            <div className={cl("preview")}>
                <img className={cl("preview-img")} src={thumbUrl(theme)} alt="" />
                <span className={cl("author")}>by {theme.author}</span>
                <Paragraph>{theme.description}</Paragraph>
                <div className={cl("tags")}>
                    {theme.tags.map(tag => <span key={tag} className={cl("tag")}>{tag}</span>)}
                </div>
                <div className={cl("divider")} />
                <div className={cl("preview-foot")}>
                    <span className={cl("stats")}>↓ {formatNum(theme.downloads)} · ♥ {theme.likes}</span>
                    <div className={cl("preview-actions")}>
                        <Link href={bdPage(theme)}>View on BetterDiscord</Link>
                        <Button color={Button.Colors.BRAND} onClick={() => { onInstall(); modalProps.onClose(); }}>Install</Button>
                    </div>
                </div>
            </div>
        </Modal>
    );
}

function openPreviewModal(theme: StoreTheme, onInstall: () => void) {
    openModal(props => <PreviewModal modalProps={props} theme={theme} onInstall={onInstall} />);
}

function ThemeCard({ theme, installed, installing, onInstall }: { theme: StoreTheme; installed: boolean; installing: boolean; onInstall: () => void; }) {
    return (
        <div className={cl("card")}>
            <div className={cl("thumb-wrap")} onClick={() => openPreviewModal(theme, onInstall)}>
                <img className={cl("thumb")} src={thumbUrl(theme)} alt="" loading="lazy" />
                <span className={cl("thumb-hint")}>Pré-visualizar</span>
            </div>
            <div className={cl("body")}>
                <div className={cl("head")}>
                    <span className={cl("name")} title={theme.name}>{theme.name}</span>
                    <Link className={cl("ext")} href={bdPage(theme)}>↗</Link>
                </div>
                <span className={cl("author")}>by {theme.author}</span>
                <Paragraph className={cl("desc")}>{theme.description}</Paragraph>
                <div className={cl("tags")}>
                    {theme.tags.slice(0, 3).map(tag => <span key={tag} className={cl("tag")}>{tag}</span>)}
                </div>
            </div>
            <div className={cl("foot")}>
                <span className={cl("stats")}>↓ {formatNum(theme.downloads)} · ♥ {formatNum(theme.likes)}</span>
                <Button
                    size={Button.Sizes.SMALL}
                    color={installed ? Button.Colors.GREEN : Button.Colors.BRAND}
                    disabled={installing || installed}
                    onClick={onInstall}
                >
                    {installed ? "Installed" : installing ? "…" : "Install"}
                </Button>
            </div>
        </div>
    );
}

function ThemeStore() {
    const [themes, setThemes] = useState<StoreTheme[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [sort, setSort] = useState<SortKey>("downloads");
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [installed, setInstalled] = useState<Set<string>>(new Set());
    const [installing, setInstalling] = useState<string | null>(null);

    useEffect(() => {
        if (!Native) {
            setError("Theme Store backend not loaded. Fully quit Discord (from the tray, not just Ctrl+R) and reopen.");
            return;
        }
        Native.getThemes()
            .then(res => res.success ? setThemes(res.themes) : setError(res.error))
            .catch(e => { setError(String(e)); logger.error(e); });
    }, []);

    const allTags = useMemo(() => {
        const counts = new Map<string, number>();
        for (const theme of themes ?? [])
            for (const tag of theme.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
        return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18).map(([tag]) => tag);
    }, [themes]);

    const visible = useMemo(() => {
        const q = search.toLowerCase().trim();
        const list = (themes ?? []).filter(theme =>
            selectedTags.every(tag => theme.tags.includes(tag))
            && (!q
                || theme.name.toLowerCase().includes(q)
                || theme.author.toLowerCase().includes(q)
                || theme.description.toLowerCase().includes(q)
                || theme.tags.some(tag => tag.toLowerCase().includes(q)))
        );
        return list.sort((a, b) =>
            sort === "likes" ? b.likes - a.likes
                : sort === "recent" ? new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime()
                    : b.downloads - a.downloads
        );
    }, [themes, search, selectedTags, sort]);

    function toggleTag(tag: string) {
        setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
    }

    async function install(theme: StoreTheme) {
        setInstalling(theme.name);
        try {
            const res = await Native.installTheme(theme.name);
            if (res.success) {
                setInstalled(prev => new Set(prev).add(theme.name));
                showToast(`Installed "${theme.name}". Enable it in Settings → Themes.`, Toasts.Type.SUCCESS);
            } else {
                showToast(`Failed to install: ${res.error}`, Toasts.Type.FAILURE);
            }
        } finally {
            setInstalling(null);
        }
    }

    return (
        <SettingsTab>
            <Paragraph className={cl("credit")}>
                Themes from <Link href="https://betterdiscord.app/themes">betterdiscord.app</Link>. All themes and credits belong to their original authors.
            </Paragraph>

            <div className={cl("filterbar")}>
                <div className={cl("search")}>
                    <TextInput value={search} onChange={setSearch} placeholder="Search themes…" />
                </div>
                <div className={cl("sort")}>
                    <Select
                        options={SORT_OPTIONS}
                        serialize={String}
                        isSelected={value => value === sort}
                        select={value => setSort(value as SortKey)}
                        closeOnSelect={true}
                    />
                </div>
            </div>

            {allTags.length > 0 && (
                <div className={cl("tagsfilter")}>
                    {allTags.map(tag => (
                        <button
                            key={tag}
                            className={classes(cl("filter-tag"), selectedTags.includes(tag) && cl("filter-tag-on"))}
                            onClick={() => toggleTag(tag)}
                        >
                            {tag}
                        </button>
                    ))}
                    {selectedTags.length > 0 && (
                        <button className={cl("clear")} onClick={() => setSelectedTags([])}>Clear filters</button>
                    )}
                </div>
            )}

            {error
                ? <ErrorCard className={cl("status")}>{error}</ErrorCard>
                : themes === null
                    ? <Paragraph className={cl("status")}>Loading themes…</Paragraph>
                    : (
                        <>
                            <Paragraph className={cl("count")}>{visible.length} {visible.length === 1 ? "theme" : "themes"}</Paragraph>
                            {visible.length === 0
                                ? <Paragraph className={cl("status")}>No themes match your filters.</Paragraph>
                                : (
                                    <div className={cl("grid")}>
                                        {visible.map(theme => (
                                            <ThemeCard
                                                key={theme.id}
                                                theme={theme}
                                                installed={installed.has(theme.name)}
                                                installing={installing === theme.name}
                                                onInstall={() => install(theme)}
                                            />
                                        ))}
                                    </div>
                                )}
                        </>
                    )
            }
        </SettingsTab>
    );
}

export default wrapTab(ThemeStore, "BetterDiscord Themes");
