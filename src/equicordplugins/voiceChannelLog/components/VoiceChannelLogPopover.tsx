/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./VoiceChannelLogPopover.css";

import { Channel } from "@vencord/discord-types";
import { IconUtils, React, ScrollerThin, UserStore } from "@webpack/common";

import { getVcLogs, vcLogSubscribe } from "../logs";
import { VoiceChannelLogEntry } from "../types";
import { cl } from "../utils";
import EventIcon from "./VoiceChannelLogEntryIcons";

const MAX_ENTRIES = 30;

function describe(entry: VoiceChannelLogEntry): string {
    switch (entry.type) {
        case "join": return "joined";
        case "leave": return "left";
        case "move": return entry.channelId === entry.oldChannelId ? "moved out" : "moved in";
        case "soundboard": return "played a sound";
        case "server_mute": return entry.enabled ? "was muted" : "was unmuted";
        case "server_deafen": return entry.enabled ? "was deafened" : "was undeafened";
        case "self_video": return entry.enabled ? "turned camera on" : "turned camera off";
        case "self_stream": return entry.enabled ? "started streaming" : "stopped streaming";
        case "activity": return `started ${entry.activityName ?? "an activity"}`;
        case "activity_stop": return `stopped ${entry.activityName ?? "an activity"}`;
        default: return "";
    }
}

function Row({ entry, channel }: { entry: VoiceChannelLogEntry; channel: Channel; }) {
    const user = UserStore.getUser(entry.userId);
    const name = user?.globalName ?? user?.username ?? "Unknown";
    const avatar = user ? user.getAvatarURL(channel.getGuildId?.()) : IconUtils.getDefaultAvatarURL(entry.userId);
    const time = new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    return (
        <div className={cl("pop-row")}>
            <span className={cl("pop-time")}>{time}</span>
            <EventIcon type={entry.type} />
            <img className={cl("pop-avatar")} src={avatar} alt="" />
            <span className={cl("pop-text")}>
                <span className={cl("pop-name")}>{name}</span> {describe(entry)}
            </span>
        </div>
    );
}

export function VoiceChannelLogPopover({ channel, style, onMouseEnter, onMouseLeave }: {
    channel: Channel;
    style?: React.CSSProperties;
    onMouseEnter: () => void;
    onMouseLeave: () => void;
}) {
    const logs = React.useSyncExternalStore(vcLogSubscribe, () => getVcLogs(channel.id));
    const recent = logs.slice(-MAX_ENTRIES).reverse(); // newest first

    return (
        <div className={cl("popover")} style={style} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
            <div className={cl("pop-header")}>Recent activity · {channel.name}</div>
            {recent.length > 0
                ? (
                    <ScrollerThin className={cl("pop-list")}>
                        {recent.map((entry, i) => <Row key={i} entry={entry} channel={channel} />)}
                    </ScrollerThin>
                )
                : <div className={cl("pop-empty")}>No activity yet.</div>}
        </div>
    );
}
