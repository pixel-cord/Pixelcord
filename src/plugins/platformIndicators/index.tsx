/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import "./style.css";

import { definePluginSettings, migratePluginSetting } from "@api/Settings";
import { Devs, EquicordDevs } from "@utils/constants";
import { classes } from "@utils/misc";
import definePlugin, { OptionType } from "@utils/types";
import { DiscordPlatform, User } from "@vencord/discord-types";
import { filters, findStoreLazy, mapMangledModuleLazy } from "@webpack";
import { AuthenticationStore, PresenceStore, Tooltip, UserStore, useStateFromStores } from "@webpack/common";

export interface Session {
    sessionId: string;
    status: string;
    active: boolean;
    clientInfo: {
        version: number;
        os: string;
        client: string;
    };
}

const SessionsStore = findStoreLazy("SessionsStore") as {
    getSessions(): Record<string, Session>;
};

const { useStatusFillColor } = mapMangledModuleLazy([".5625*", "translate"], {
    useStatusFillColor: filters.byCode(".hex")
});

const platformMap = {
    embedded: "Console",
    vr: "VR"
};

function Icon(path: string, opts?: { viewBox?: string; width?: number; height?: number; fillRule?: "evenodd" | "nonzero"; }) {
    return ({ color, tooltip, small }: { color: string; tooltip: string; small: boolean; }) => (
        <Tooltip text={tooltip}>
            {tooltipProps => (
                <svg
                    {...tooltipProps}
                    height={(opts?.height ?? 20) - (small ? 3 : 0)}
                    width={(opts?.width ?? 20) - (small ? 3 : 0)}
                    viewBox={opts?.viewBox ?? "0 0 24 24"}
                    fill={color}
                >
                    <path d={path} fillRule={opts?.fillRule ?? "nonzero"} />
                </svg>
            )}
        </Tooltip>
    );
}

const Icons = {
    desktop: Icon("M5 3H19A3 3 0 0 1 22 6V14A3 3 0 0 1 19 17H5A3 3 0 0 1 2 14V6A3 3 0 0 1 5 3ZM6.5 6A1 1 0 0 0 5.5 7V13A1 1 0 0 0 6.5 14H17.5A1 1 0 0 0 18.5 13V7A1 1 0 0 0 17.5 6ZM10.5 17H13.5V19.5H10.5ZM8 19.5H16A1 1 0 0 1 16 21.5H8A1 1 0 0 1 8 19.5Z", { viewBox: "0 0 24 24", fillRule: "evenodd" }),
    web: Icon("M128,24h0A104,104,0,1,0,232,128,104.12,104.12,0,0,0,128,24Zm78.36,64H170.71a135.28,135.28,0,0,0-22.3-45.6A88.29,88.29,0,0,1,206.37,88ZM216,128a87.61,87.61,0,0,1-3.33,24H174.16a157.44,157.44,0,0,0,0-48h38.51A87.61,87.61,0,0,1,216,128ZM128,43a115.27,115.27,0,0,1,26,45H102A115.11,115.11,0,0,1,128,43ZM102,168H154a115.11,115.11,0,0,1-26,45A115.27,115.27,0,0,1,102,168Zm-3.9-16a140.84,140.84,0,0,1,0-48h59.88a140.84,140.84,0,0,1,0,48Zm50.35,61.6a135.28,135.28,0,0,0,22.3-45.6h35.66A88.29,88.29,0,0,1,148.41,213.6Z", { viewBox: "0 0 256 256" }),
    mobile: Icon("M176,16H80A24,24,0,0,0,56,40V216a24,24,0,0,0,24,24h96a24,24,0,0,0,24-24V40A24,24,0,0,0,176,16ZM80,32h96a8,8,0,0,1,8,8v8H72V40A8,8,0,0,1,80,32Zm96,192H80a8,8,0,0,1-8-8v-8H184v8A8,8,0,0,1,176,224Z", { viewBox: "0 0 256 256" }),
    embedded: Icon("M247.44,173.75a.68.68,0,0,0,0-.14L231.05,89.44c0-.06,0-.12,0-.18A60.08,60.08,0,0,0,172,40H83.89a59.88,59.88,0,0,0-59,49.52L8.58,173.61a.68.68,0,0,0,0,.14,36,36,0,0,0,60.9,31.71l.35-.37L109.52,160h37l39.71,45.09c.11.13.23.25.35.37A36.08,36.08,0,0,0,212,216a36,36,0,0,0,35.43-42.25ZM104,112H96v8a8,8,0,0,1-16,0v-8H72a8,8,0,0,1,0-16h8V88a8,8,0,0,1,16,0v8h8a8,8,0,0,1,0,16Zm40-8a8,8,0,0,1,8-8h24a8,8,0,0,1,0,16H152A8,8,0,0,1,144,104Zm84.37,87.47a19.84,19.84,0,0,1-12.9,8.23A20.09,20.09,0,0,1,198,194.31L167.8,160H172a60,60,0,0,0,51-28.38l8.74,45A19.82,19.82,0,0,1,228.37,191.47Z", { viewBox: "0 0 256 256" }),
    vr: Icon("M8.46 8.64a1 1 0 0 1 1 1c0 .44-.3.8-.72.92l-.11.07c-.08.06-.2.19-.2.41a.99.99 0 0 1-.98.86h-.06a1 1 0 0 1-.94-1.05l.02-.32c.05-1.06.92-1.9 1.99-1.9ZM15.55 5a5.5 5.5 0 0 1 5.15 3.67h.3a2 2 0 0 1 2 2v3.18a2 2 0 0 1-2 1.99h-.2A4.54 4.54 0 0 1 16.55 19a4.45 4.45 0 0 1-3.6-1.83 1.2 1.2 0 0 0-1.9 0 4.44 4.44 0 0 1-3.9 1.82 4.54 4.54 0 0 1-3.94-3.15H3a2 2 0 0 1-2-2v-3.18c0-1.1.9-1.99 2-1.99h.3A5.5 5.5 0 0 1 8.46 5h7.09Zm-7.1 2C6.6 7 5.06 8.5 4.97 10.41l-.02.66v3.18c0 1.43 1.05 2.66 2.34 2.74.85.06 1.63-.32 2.14-1.01a3.2 3.2 0 0 1 2.57-1.3c1 0 1.97.48 2.57 1.3.5.69 1.3 1.08 2.14 1.01 1.3-.08 2.34-1.31 2.34-2.74l-.02-3.84a3.54 3.54 0 0 0-3.49-3.43H8.45Z", { viewBox: "0 4 24 16", height: 20, width: 20 }),
    suncord: Icon("M7 4a6 6 0 00-6 6v4a6 6 0 006 6h10a6 6 0 006-6v-4a6 6 0 00-6-6H7zm0 11a1 1 0 01-1-1v-1H5a1 1 0 010-2h1v-1a1 1 0 012 0v1h1a1 1 0 010 2H8v1a1 1 0 01-1 1zm10-4a1 1 0 100-2 1 1 0 000 2zm1 3a1 1 0 11-2 0 1 1 0 012 0zm0-2a1 1 0 102 0 1 1 0 00-2 0zm-3 1a1 1 0 110-2 1 1 0 010 2z", { viewBox: "0 0 24 24", height: 24, width: 24 }),
    vencord: Icon("M14.8 2.7 9 3.1V47h3.3c1.7 0 6.2.3 10 .7l6.7.6V2l-4.2.2c-2.4.1-6.9.3-10 .5zm1.8 6.4c1 1.7-1.3 3.6-2.7 2.2C12.7 10.1 13.5 8 15 8c.5 0 1.2.5 1.6 1.1zM16 33c0 6-.4 10-1 10s-1-4-1-10 .4-10 1-10 1 4 1 10zm15-8v23.3l3.8-.7c2-.3 4.7-.6 6-.6H43V3h-2.2c-1.3 0-4-.3-6-.6L31 1.7V25z", { viewBox: "0 0 50 50" }),
};

const PlatformIcon = ({ platform, status, small }) => {
    const tooltip = platformMap[platform] ?? platform.charAt(0).toUpperCase() + platform.slice(1);
    let Icon = Icons[platform] ?? Icons.desktop;
    const { ConsoleIcon } = settings.store;
    if (platform === "embedded") {
        switch (ConsoleIcon) {
            case "equicord":
                Icon = Icons.embedded;
                break;
            case "suncord":
                Icon = Icons.suncord;
                break;
            case "vencord":
                Icon = Icons.vencord;
                break;
            default:
                Icon = Icons.embedded;
                break;
        }
    }

    return <Icon color={useStatusFillColor(status)} tooltip={tooltip} small={small} />;
};

function useEnsureOwnStatus(user: User) {
    if (user.id !== AuthenticationStore.getId()) {
        return;
    }

    const sessions = useStateFromStores([SessionsStore], () => SessionsStore.getSessions());
    if (typeof sessions !== "object") return null;
    const sortedSessions = Object.values(sessions).sort(({ status: a }, { status: b }) => {
        if (a === b) return 0;
        if (a === "online") return 1;
        if (b === "online") return -1;
        if (a === "idle") return 1;
        if (b === "idle") return -1;
        return 0;
    });

    const ownStatus = Object.values(sortedSessions).reduce((acc, curr) => {
        if (curr.clientInfo.client !== "unknown")
            acc[curr.clientInfo.client] = curr.status;
        return acc;
    }, {});

    const { clientStatuses } = PresenceStore.getState();
    clientStatuses[UserStore.getCurrentUser().id] = ownStatus;
}

interface PlatformIndicatorProps {
    user: User;
    isProfile?: boolean;
    isMessage?: boolean;
    isMemberList?: boolean;
}

const PlatformIndicator = ({ user, isProfile, isMessage, isMemberList }: PlatformIndicatorProps) => {
    if (user == null || (user.bot && !settings.store.showBots)) return null;
    useEnsureOwnStatus(user);

    const status = useStateFromStores([PresenceStore], () => PresenceStore.getClientStatus(user.id));
    if (!status) return null;

    const icons = Array.from(Object.entries(status), ([platform, status]) => (
        <PlatformIcon
            key={platform}
            platform={platform as DiscordPlatform}
            status={status}
            small={isProfile || isMemberList}
        />
    ));

    if (!icons.length) {
        return null;
    }

    return (
        <div
            className={classes("vc-platform-indicator", isProfile && "vc-platform-indicator-profile", isMessage && "vc-platform-indicator-message")}
            style={{ marginLeft: isMemberList ? "4px" : undefined }}
        >
            {icons}
        </div>
    );
};

migratePluginSetting("PlatformIndicators", "profiles", "badges");
const settings = definePluginSettings({
    list: {
        type: OptionType.BOOLEAN,
        description: "Show indicators in the member list",
        default: true,
    },
    profiles: {
        type: OptionType.BOOLEAN,
        description: "Show indicators in user profiles",
        default: true,
    },
    messages: {
        type: OptionType.BOOLEAN,
        description: "Show indicators inside messages",
        default: true,
    },
    colorMobileIndicator: {
        type: OptionType.BOOLEAN,
        description: "Whether to make the mobile indicator match the color of the user status.",
        default: true,
        restartNeeded: true
    },
    showBots: {
        type: OptionType.BOOLEAN,
        description: "Whether to show platform indicators on bots",
        default: false,
        restartNeeded: false
    },
    ConsoleIcon: {
        type: OptionType.SELECT,
        description: "What console icon to use",
        restartNeeded: true,
        options: [
            {
                label: "Pixelcord",
                value: "equicord",
                default: true
            },
            {
                label: "Suncord",
                value: "suncord",
            },
            {
                label: "Vencord",
                value: "vencord",
            },
        ],
    }
});

export default definePlugin({
    name: "PlatformIndicators",
    description: "Adds platform indicators (Desktop, Mobile, Web...) to users",
    dependencies: ["MemberListDecoratorsAPI", "MessageDecorationsAPI", "NicknameIconsAPI"],
    tags: ["Appearance"],
    authors: [Devs.kemo, Devs.TheSun, Devs.Nuckyz, Devs.Ven, EquicordDevs.neoarz],
    isModified: true,
    settings,
    renderNicknameIcon(props) {
        if (!settings.store.profiles) return null;
        return (
            <PlatformIndicator user={UserStore.getUser(props.userId)} isProfile />
        );
    },
    renderMemberListDecorator(props) {
        if (!settings.store.list) return null;
        return <PlatformIndicator user={props.user} isMemberList />;

    },
    renderMessageDecoration(props) {
        if (!settings.store.messages) return null;
        return <PlatformIndicator user={props.message?.author} isMessage />;
    },

    patches: [
        {
            find: ".Masks.STATUS_ONLINE_MOBILE",
            predicate: () => settings.store.colorMobileIndicator,
            replacement: [
                {
                    // Return the STATUS_ONLINE_MOBILE mask if the user is on mobile, no matter the status
                    match: /\.STATUS_TYPING;switch(?=.+?(if\(\i\)return \i\.\i\.Masks\.STATUS_ONLINE_MOBILE))/,
                    replace: ".STATUS_TYPING;$1;switch"
                },
                {
                    // Return the STATUS_ONLINE_MOBILE mask if the user is on mobile, no matter the status
                    match: /switch\(\i\)\{case \i\.\i\.ONLINE:(if\(\i\)return\{[^}]+\})/,
                    replace: "$1;$&"
                }
            ]
        },
        {
            find: ".AVATAR_STATUS_MOBILE_16;",
            predicate: () => settings.store.colorMobileIndicator,
            replacement: [
                {
                    // Return the AVATAR_STATUS_MOBILE size mask if the user is on mobile, no matter the status
                    match: /\i===\i\.\i\.ONLINE&&(?=.{0,70}\.AVATAR_STATUS_MOBILE_16;)/,
                    replace: ""
                },
                {
                    // Fix sizes for mobile indicators which aren't online
                    match: /(?<=\(\i\.status,)(\i)(?=,\{.{0,15}isMobile:(\i))/,
                    replace: '$2?"online":$1'
                },
                {
                    // Make isMobile true no matter the status
                    match: /(?<=\i&&!\i)&&\i===\i\.\i\.ONLINE/,
                    replace: ""
                }
            ]
        },
        {
            find: "}isMobileOnline(",
            predicate: () => settings.store.colorMobileIndicator,
            replacement: {
                // Make isMobileOnline return true no matter what is the user status
                match: /(?<=\i\[\i\.\i\.MOBILE\])===\i\.\i\.ONLINE/,
                replace: "!= null"
            }
        }
    ]
});
