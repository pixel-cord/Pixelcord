/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { PixelCordDevs } from "@utils/constants";
import definePlugin from "@utils/types";
import { Message } from "@vencord/discord-types";
import { ChannelStore, Menu } from "@webpack/common";

import { CorrectionAccessory, handleCorrection } from "./CorrectionAccessory";
import { CorrectChatBarIcon, CorrectIcon, setShouldShowCorrectEnabledTooltip } from "./CorrectorIcon";
import { settings } from "./settings";
import { correct } from "./utils";

function getMessageContent(message: Message): string {
    return message.content || message.messageSnapshots?.[0]?.message.content || "";
}

const messageCtxPatch: NavContextMenuPatchCallback = (children, { message }: { message: Message; }) => {
    const content = getMessageContent(message);
    if (!content) return;

    const group = findGroupChildrenByChildId("copy-text", children);
    if (!group) return;

    group.splice(group.findIndex(c => c?.props?.id === "copy-text") + 1, 0, (
        <Menu.MenuItem
            id="vc-correct"
            label="Correct"
            icon={CorrectIcon}
            action={async () => handleCorrection(message.id, await correct(content))}
        />
    ));
};

let tooltipTimeout: any;

export default definePlugin({
    name: "Corrector",
    description: "Fix spelling and grammar in your messages with LanguageTool — auto-correct before sending or on demand.",
    dependencies: ["ChatInputButtonAPI", "MessageAccessoriesAPI", "MessagePopoverAPI"],
    tags: ["Chat", "Utility"],
    authors: [PixelCordDevs.myvings],
    settings,

    contextMenus: {
        "message": messageCtxPatch
    },

    // exposed in case another plugin wants it
    correct,

    renderMessageAccessory: props => <CorrectionAccessory message={props.message} />,

    chatBarButton: {
        icon: CorrectIcon,
        render: CorrectChatBarIcon
    },

    messagePopoverButton: {
        icon: CorrectIcon,
        render(message: Message) {
            const content = getMessageContent(message);
            if (!content) return null;

            return {
                label: "Correct",
                icon: CorrectIcon,
                message,
                channel: ChannelStore.getChannel(message.channel_id),
                onClick: async () => handleCorrection(message.id, await correct(content))
            };
        }
    },

    async onBeforeMessageSend(_, message) {
        if (!settings.store.autoCorrect) return;
        if (!message.content) return;

        setShouldShowCorrectEnabledTooltip?.(true);
        clearTimeout(tooltipTimeout);
        tooltipTimeout = setTimeout(() => setShouldShowCorrectEnabledTooltip?.(false), 2000);

        const { text } = await correct(message.content);
        message.content = text;
    }
});
