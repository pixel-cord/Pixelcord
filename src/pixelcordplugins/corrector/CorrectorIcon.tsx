/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChatBarButton, ChatBarButtonFactory } from "@api/ChatButtons";
import { TooltipContainer } from "@components/TooltipContainer";
import { classes } from "@utils/misc";
import { IconComponent } from "@utils/types";
import { useEffect, useState } from "@webpack/common";

import { settings } from "./settings";
import { cl } from "./utils";

export const CorrectIcon: IconComponent = ({ height = 20, width = 20, className }) => (
    <svg viewBox="0 0 24 24" height={height} width={width} className={classes(cl("icon"), className)}>
        <path
            fill="currentColor"
            d="M12.45 16h2.09L9.43 3H7.57L2.46 16h2.09l1.12-3h5.64l1.14 3zm-6.02-5L8.5 5.48 10.57 11H6.43zm15.16.59l-8.09 8.09L9.83 16l-1.41 1.41 5.09 5.09L23 13l-1.41-1.41z"
        />
    </svg>
);

export let setShouldShowCorrectEnabledTooltip: undefined | ((show: boolean) => void);

export const CorrectChatBarIcon: ChatBarButtonFactory = ({ isMainChat }) => {
    const { autoCorrect } = settings.use(["autoCorrect"]);

    const [shouldShow, setShouldShow] = useState(false);
    useEffect(() => {
        setShouldShowCorrectEnabledTooltip = setShouldShow;
        return () => setShouldShowCorrectEnabledTooltip = undefined;
    }, []);

    if (!isMainChat) return null;

    const toggle = () => settings.store.autoCorrect = !autoCorrect;

    const button = (
        <ChatBarButton
            tooltip={autoCorrect ? "Auto-correct is ON (click to disable)" : "Auto-correct is OFF (click to enable)"}
            onClick={toggle}
        >
            <CorrectIcon className={cl({ "auto-correct": autoCorrect, "chat-button": true })} />
        </ChatBarButton>
    );

    if (shouldShow && settings.store.showAutoCorrectTooltip)
        return (
            <TooltipContainer text="Message corrected" forceOpen>
                {button}
            </TooltipContainer>
        );

    return button;
};
