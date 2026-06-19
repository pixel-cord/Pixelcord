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
import { CorrectChatBarIcon, CorrectIcon } from "./CorrectorIcon";
import { settings } from "./settings";
import { setEditorRef, startTypingCorrection, stopTypingCorrection } from "./typing";
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

export default definePlugin({
    name: "Corrector",
    description: "Fix spelling and grammar in your messages with LanguageTool — auto-correct as you type or on demand.",
    dependencies: ["ChatInputButtonAPI", "MessageAccessoriesAPI", "MessagePopoverAPI"],
    tags: ["Chat", "Utility"],
    authors: [PixelCordDevs.myvings],
    settings,

    // Capture the chat input's editor ref so typing-correction can replace the
    // draft through Slate's own API. Zero-width insert after CharacterCounter's
    // anchor, so the two coexist (core plugins patch first).
    patches: [
        {
            find: ".CREATE_FORUM_POST||",
            replacement: {
                match: /(?<=,editorRef:(\i),.{0,200}channelId:\i\.id\}\))/,
                replace: ",$self.captureEditorRef($1)"
            }
        }
    ],

    captureEditorRef(ref: any) {
        setEditorRef(ref);
        return null;
    },

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

    start() {
        startTypingCorrection();
    },

    stop() {
        stopTypingCorrection();
    }
});
