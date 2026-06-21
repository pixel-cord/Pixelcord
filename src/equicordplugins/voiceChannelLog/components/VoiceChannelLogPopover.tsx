/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./VoiceChannelLogPopover.css";

import { Channel } from "@vencord/discord-types";
import { React } from "@webpack/common";

import { getVcLogs, vcLogSubscribe } from "../logs";
import { cl } from "../utils";
import { VoiceChannelLogEntryComponent } from "./VoiceChannelLogEntryComponent";

const MAX_ENTRIES = 15;

export function VoiceChannelLogPopover({ channel, style, onMouseEnter, onMouseLeave }: {
    channel: Channel;
    style?: React.CSSProperties;
    onMouseEnter: () => void;
    onMouseLeave: () => void;
}) {
    const logs = React.useSyncExternalStore(vcLogSubscribe, () => getVcLogs(channel.id));
    const recent = logs.slice(-MAX_ENTRIES);

    return (
        <div className={cl("popover")} style={style} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
            <div className={cl("popover-header")}>{channel.name} · recent activity</div>
            <div className={cl("popover-scroller")}>
                {recent.length > 0
                    ? recent.map((entry, i) => <VoiceChannelLogEntryComponent key={i} logEntry={entry} channel={channel} />)
                    : <div className={cl("popover-empty")}>No logs yet.</div>}
            </div>
        </div>
    );
}
