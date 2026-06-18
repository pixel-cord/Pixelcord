/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChatBarButton, ChatBarButtonFactory } from "@api/ChatButtons";
import { PixelCordDevs } from "@utils/constants";
import definePlugin, { IconComponent } from "@utils/types";

import { openCleanerModal } from "./CleanerModal";
import { settings } from "./settings";

const CleanerIcon: IconComponent = ({ width = 20, height = 20, className }) => (
    <svg width={width} height={height} viewBox="0 0 24 24" className={className} fill="currentColor">
        <path d="M9 3v1H4v2h16V4h-5V3H9zM6 7v13c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6zm3 2h2v9H9V9zm4 0h2v9h-2V9z" />
    </svg>
);

const CleanerButton: ChatBarButtonFactory = ({ channel, isMainChat }) => {
    if (!isMainChat) return null;

    return (
        <ChatBarButton tooltip="Clean my messages" onClick={() => openCleanerModal(channel)}>
            <CleanerIcon />
        </ChatBarButton>
    );
};

export default definePlugin({
    name: "MessageCleaner",
    description: "Adds a chat bar button to bulk-delete your own messages in the current chat, with filters and a queue across channels. Violates Discord's ToS, use at your own risk.",
    authors: [PixelCordDevs.myvings],
    dependencies: ["ChatInputButtonAPI"],
    tags: ["Chat", "Utility"],
    settings,

    chatBarButton: {
        icon: CleanerIcon,
        render: CleanerButton
    }
});
