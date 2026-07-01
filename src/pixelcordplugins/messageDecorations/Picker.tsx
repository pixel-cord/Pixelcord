/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Paragraph } from "@components/Paragraph";
import { classNameFactory } from "@utils/css";
import { Margins } from "@utils/margins";
import { RenderModalProps } from "@vencord/discord-types";
import { Modal, openModal, showToast, Toasts, useEffect, useState } from "@webpack/common";

import { Decoration, getCatalog, loadCatalog } from "./api";
import { settings } from "./settings";

const cl = classNameFactory("vc-msgdeco-");

function PickerModal({ modalProps }: { modalProps: RenderModalProps; }) {
    const { activeDecorationId, style: activeStyle } = settings.use(["activeDecorationId", "style"]);
    const [items, setItems] = useState<Decoration[]>(getCatalog());
    const [loading, setLoading] = useState(!getCatalog().length);

    // Revalidate against the API every time the picker opens, so new decorations show up.
    useEffect(() => {
        loadCatalog(true)
            .then(setItems)
            .catch(() => showToast("Failed to load decorations.", Toasts.Type.FAILURE))
            .finally(() => setLoading(false));
    }, []);

    function choose(id: string) {
        // Re-picking the active one (or the "None" tile) turns decorations off.
        const next = activeDecorationId === id ? "" : id;
        settings.store.activeDecorationId = next;
        showToast(next ? "✨ Decoration on — applied to your next messages" : "Decoration off");
        modalProps.onClose();
    }

    return (
        <Modal {...modalProps} size="md" title="Message decorations">
            <div style={{ padding: 16 }}>
                <Paragraph className={Margins.bottom16}>
                    Pick a frame for your next messages. Everyone using Pixelcord sees it; everyone else just
                    sees your normal text.
                </Paragraph>

                <div className={cl("styles")}>
                    <span className={cl("styles-label")}>Style</span>
                    <div className={cl("styles-seg")}>
                        <button
                            type="button"
                            className={cl("styles-opt", activeStyle === "tiktok" && "styles-opt-active")}
                            onClick={() => { settings.store.style = "tiktok"; }}
                            title="Your normal Discord avatar stays outside the bubble"
                        >
                            TikTok
                        </button>
                        <button
                            type="button"
                            className={cl("styles-opt", activeStyle === "pixelcord" && "styles-opt-active")}
                            onClick={() => { settings.store.style = "pixelcord"; }}
                            title="Avatar tucked inside the bubble with the character"
                        >
                            Pixelcord
                        </button>
                    </div>
                </div>

                {loading && !items.length
                    ? <Paragraph>Loading…</Paragraph>
                    : (
                        <div className={cl("grid")}>
                            <button
                                type="button"
                                className={cl("tile", activeDecorationId === "" && "tile-active")}
                                onClick={() => choose("")}
                            >
                                <div className={cl("none")}>None</div>
                            </button>

                            {items.map(d => (
                                <button
                                    key={d.id}
                                    type="button"
                                    className={cl("tile", activeDecorationId === d.id && "tile-active")}
                                    onClick={() => choose(d.id)}
                                    title={d.name}
                                >
                                    <div
                                        className={cl("preview")}
                                        data-vc-msgdeco-pos={d.position}
                                        // Colours are validated hex from the API, safe to inline.
                                        style={{
                                            borderColor: d.borderColor,
                                            background: d.backgroundColor,
                                            color: d.textColor
                                        }}
                                    >
                                        Aa
                                        <img className={cl("preview-char")} src={d.character} alt="" aria-hidden />
                                    </div>
                                    <span className={cl("tile-name")}>{d.name}</span>
                                </button>
                            ))}
                        </div>
                    )
                }
            </div>
        </Modal>
    );
}

export function openPicker() {
    openModal(props => <PickerModal modalProps={props} />);
}
