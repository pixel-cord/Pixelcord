/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { NotesIcon } from "@components/Icons";
import { PixelCordDevs } from "@utils/constants";
import definePlugin from "@utils/types";
import type { User } from "@vencord/discord-types";
import { Menu } from "@webpack/common";

import { openContactModal } from "./ContactModal";
import { clearAll, scheduleAll } from "./reminders";
import { hasContact, settings } from "./settings";

const UserContextMenuPatch: NavContextMenuPatchCallback = (children, { user }: { user?: User; }) => {
    if (!user) return;

    children.push(
        <Menu.MenuItem
            id="vc-contact-notes"
            label={hasContact(user.id) ? "Notes & Reminder ●" : "Notes & Reminder"}
            icon={NotesIcon}
            action={() => openContactModal(user)}
        />
    );
};

export default definePlugin({
    name: "ContactNotes",
    description: "Right-click any user to keep private notes, tags and reminders about them. Reminders ping you with a shortcut to their DM.",
    authors: [PixelCordDevs.myvings],
    tags: ["Friends", "Utility"],
    settings,

    contextMenus: {
        "user-context": UserContextMenuPatch
    },

    start() {
        scheduleAll();
    },

    stop() {
        clearAll();
    }
});
