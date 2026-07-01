/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { HeaderBarButton } from "@api/HeaderBar";
import { PixelCordDevs } from "@utils/constants";
import definePlugin, { IconComponent } from "@utils/types";
import { Popout, useRef, useState } from "@webpack/common";

import { FocusPanel } from "./FocusPanel";
import { settings } from "./settings";
import { resetFocus, useFocusStore } from "./store";

const FocusIcon: IconComponent = ({ width = 20, height = 20, className }) => (
    <svg width={width} height={height} viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2}>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="5" />
        <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </svg>
);

function FocusPopoutButton() {
    const buttonRef = useRef(null);
    const [show, setShow] = useState(false);
    const store = useFocusStore();

    return (
        <Popout
            position="bottom"
            align="right"
            spacing={4}
            animation={Popout.Animation.SCALE}
            shouldShow={show}
            onRequestClose={() => setShow(false)}
            targetElementRef={buttonRef}
            renderPopout={() => <FocusPanel />}
        >
            {(_, { isShown }) => (
                <HeaderBarButton
                    ref={buttonRef}
                    className={store.active ? "vc-focusmode-btn vc-focusmode-btn-active" : "vc-focusmode-btn"}
                    onClick={() => setShow(v => !v)}
                    tooltip={isShown ? null : store.active ? "Focus Mode — active" : "Focus Mode"}
                    icon={FocusIcon}
                    selected={isShown || store.active}
                />
            )}
        </Popout>
    );
}

export default definePlugin({
    name: "FocusMode",
    description: "A timed focus session that hides unread badges, the members list and dims the server list so you can concentrate.",
    authors: [PixelCordDevs.myvings],
    dependencies: ["HeaderBarAPI"],
    tags: ["Utility"],
    settings,

    headerBarButton: {
        icon: FocusIcon,
        render: FocusPopoutButton
    },

    stop() {
        resetFocus();
    }
});
