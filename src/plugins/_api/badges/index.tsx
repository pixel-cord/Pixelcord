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

import "./fixDiscordBadgePadding.css";

import { _getBadges, BadgePosition, BadgeUserArgs, ProfileBadge } from "@api/Badges";
import ErrorBoundary from "@components/ErrorBoundary";
import { openContributorModal } from "@components/settings/tabs";
import hideBadges from "@pixelcordplugins/hideBadges";
import { useUsersHiddenStore } from "@pixelcordplugins/hideBadges/lib/store";
import { Devs } from "@utils/constants";
import { copyWithToast } from "@utils/discord";
import { Logger } from "@utils/Logger";
import { shouldShowContributorBadge, shouldShowEquicordContributorBadge,shouldShowPixelCordContributorBadge } from "@utils/misc";
import definePlugin from "@utils/types";
import { ContextMenuApi, Menu, Toasts, UserStore } from "@webpack/common";

import Plugins, { PluginMeta } from "~plugins";

import { EquicordDonorModal, EquicordTranslatorModal, VencordDonorModal } from "./modals";

const CONTRIBUTOR_BADGE = "https://cdn.discordapp.com/emojis/1092089799109775453.png?size=64";
const EQUICORD_CONTRIBUTOR_BADGE = "https://equicord.org/assets/favicon.png";
const USERPLUGIN_CONTRIBUTOR_BADGE = "https://equicord.org/assets/icons/misc/userplugin.png";
const PIXELCORD_CONTRIBUTOR_BADGE = "https://cdn.pixelcord.com.br/uploads/image-a005087cdafda23dabae78aae6f81908.png";

const ContributorBadge: ProfileBadge = {
    id: "vencord_contributor_badge",
    description: "Vencord Contributor",
    iconSrc: CONTRIBUTOR_BADGE,
    position: BadgePosition.START,
    shouldShow: ({ userId }) => shouldShowContributorBadge(userId),
    onClick: (_, { userId }) => openContributorModal(UserStore.getUser(userId))
};

const EquicordContributorBadge: ProfileBadge = {
    id: "equicord_contributor_badge",
    description: "Equicord Contributor",
    iconSrc: EQUICORD_CONTRIBUTOR_BADGE,
    position: BadgePosition.START,
    shouldShow: ({ userId }) => shouldShowEquicordContributorBadge(userId),
    onClick: (_, { userId }) => openContributorModal(UserStore.getUser(userId)),
    props: {
        style: {
            borderRadius: "50%",
            transform: "scale(0.9)"
        }
    },
};

const PixelCordContributorBadge: ProfileBadge = {
    id: "pixelcord_contributor_badge",
    description: "Pixelcord Contributor",
    iconSrc: PIXELCORD_CONTRIBUTOR_BADGE,
    position: BadgePosition.START,
    shouldShow: ({ userId }) => shouldShowPixelCordContributorBadge(userId),
    onClick: (_, { userId }) => openContributorModal(UserStore.getUser(userId)),
    // No props.style: Pixelcord badges render at the native badge size and keep
    // the uploaded image's original shape (no scale-down, no circular crop).
};

const UserPluginContributorBadge: ProfileBadge = {
    id: "user_plugin_contributor_badge",
    description: "User Plugin Contributor",
    iconSrc: USERPLUGIN_CONTRIBUTOR_BADGE,
    position: BadgePosition.START,
    shouldShow: ({ userId }) => {
        if (!IS_DEV) return false;
        const allPlugins = Object.values(Plugins);
        return allPlugins.some(p => {
            const pluginMeta = PluginMeta[p.name];
            return pluginMeta?.userPlugin && p.authors.some(a => a.id.toString() === userId);
        });
    },
    onClick: (_, { userId }) => openContributorModal(UserStore.getUser(userId)),
    props: {
        style: {
            borderRadius: "50%",
            transform: "scale(0.9)"
        }
    },
};

const PIXELCORD_BADGES_URL = "https://api.pixelcord.com.br/badges.json";
const PIXELCORD_BADGES_VERSION_URL = PIXELCORD_BADGES_URL.replace("/badges.json", "/badges/version");

let DonorBadges = {} as Record<string, Array<Record<"tooltip" | "badge", string>>>;
let EquicordDonorBadges = {} as Record<string, Array<Record<"tooltip" | "badge", string>>>;
let PixelCordDonorBadges = {} as Record<string, Array<Record<"tooltip" | "badge", string>>>;

async function loadBadges(url: string, noCache = false) {
    const init = {} as RequestInit;
    if (noCache) init.cache = "no-cache";

    return await fetch(url, init).then(r => r.json());
}

async function loadAllBadges(noCache = false) {
    // Each feed loads independently: if one source is down or blocked, the others
    // still load. On failure we keep the previously loaded value (empty on first run).
    DonorBadges = await loadBadges("https://badges.vencord.dev/badges.json", noCache).catch(() => DonorBadges);
    EquicordDonorBadges = await loadBadges("https://badge.equicord.org/badges.json", noCache).catch(() => EquicordDonorBadges);
    PixelCordDonorBadges = await loadBadges(PIXELCORD_BADGES_URL, noCache).catch(() => PixelCordDonorBadges);
}

let intervalId: any;
let versionIntervalId: any;
let lastBadgesVersion: number | null = null;

// Rotating cache: poll the lightweight version counter; when Pixelcord badges change
// (approve / remove / edit), refetch just the Pixelcord feed so the change shows fast.
async function pollPixelCordBadgesVersion() {
    try {
        const { version } = await fetch(PIXELCORD_BADGES_VERSION_URL).then(r => r.json());
        if (typeof version !== "number") return;
        if (lastBadgesVersion === null) {
            lastBadgesVersion = version;
            return;
        }
        if (version !== lastBadgesVersion) {
            lastBadgesVersion = version;
            PixelCordDonorBadges = await loadBadges(PIXELCORD_BADGES_URL, true).catch(() => PixelCordDonorBadges);
            // The same version counter bumps when any hidden-set changes. Refresh cached
            // hidden sets here (this plugin is always-on) so hide/unhide reaches every
            // viewer, even those who never enabled the HideBadges plugin.
            useUsersHiddenStore.getState().refreshAll();
        }
    } catch {
        // backend unreachable; try again next tick
    }
}

export function BadgeContextMenu({ badge }: { badge: Omit<ProfileBadge, "id"> & BadgeUserArgs; }) {
    return (
        <Menu.Menu
            navId="vc-badge-context"
            onClose={ContextMenuApi.closeContextMenu}
            aria-label="Badge Options"
        >
            {badge.description && (
                <Menu.MenuItem
                    id="vc-badge-copy-name"
                    label="Copy Badge Name"
                    action={() => copyWithToast(badge.description!)}
                />
            )}
            {badge.iconSrc && (
                <Menu.MenuItem
                    id="vc-badge-copy-link"
                    label="Copy Badge Image Link"
                    action={() => copyWithToast(badge.iconSrc!)}
                />
            )}
        </Menu.Menu>
    );
}

export default definePlugin({
    name: "BadgeAPI",
    description: "API to add badges to users",
    authors: [Devs.Megu, Devs.Ven, Devs.TheSun],
    required: true,
    patches: [
        {
            find: "#{intl::PROFILE_USER_BADGES}",
            replacement: [
                {
                    match: /alt:" ","aria-hidden":!0,src:.{0,50}(\i).iconSrc/,
                    replace: "...$1.props,$&"
                },
                {
                    match: /(?<=forceOpen:.{0,40}?ariaHidden:!0,)children:(?=.{0,50}?(\i)\.id)/,
                    replace: "children:$1.component?$self.renderBadgeComponent({...$1}) :"
                },
                // handle onClick and onContextMenu
                {
                    match: /href:(\i)\.link/,
                    replace: "...$self.getBadgeMouseEventHandlers($1),$&"
                }
            ]
        },
        {
            find: "getLegacyUsername(){",
            replacement: [
                {
                    match: /getBadges\(\)\{.{0,100}?return\[/,
                    replace: "$&...$self.getBadges(this),"
                },
                {
                    match: /getBadges\(\)\{/,
                    replace: "getBadges(){return $self.filterBadges(this,this.vcGetBadgesRaw());}vcGetBadgesRaw(){"
                }
            ]
        }
    ],

    // for access from the console or other plugins
    get DonorBadges() {
        return DonorBadges;
    },

    get EquicordDonorBadges() {
        return EquicordDonorBadges;
    },

    get PixelCordDonorBadges() {
        return PixelCordDonorBadges;
    },

    toolboxActions: {
        async "Refetch Badges"() {
            await loadAllBadges(true);
            Toasts.show({
                id: Toasts.genId(),
                message: "Successfully refetched badges!",
                type: Toasts.Type.SUCCESS
            });
        }
    },

    userProfileBadges: [ContributorBadge, EquicordContributorBadge, PixelCordContributorBadge, UserPluginContributorBadge],

    async start() {
        await loadAllBadges();
        clearInterval(intervalId);
        intervalId = setInterval(loadAllBadges, 1000 * 60 * 30); // 30 minutes
        clearInterval(versionIntervalId);
        versionIntervalId = setInterval(pollPixelCordBadgesVersion, 1000 * 20); // rotating cache: 20s
    },

    async stop() {
        clearInterval(intervalId);
        clearInterval(versionIntervalId);
    },

    getBadges(profile: { userId: string; guildId: string; }) {
        if (!profile) return [];

        try {
            return _getBadges(profile);
        } catch (e) {
            new Logger("BadgeAPI#getBadges").error(e);
            return [];
        }
    },

    filterBadges(profile: { userId?: string; } | null, badges: { id: string; }[]) {
        const userId = profile?.userId;
        // Always apply the global hidden set: a badge a user hid must disappear for
        // EVERYONE on Pixelcord, not just viewers who enabled the HideBadges plugin.
        if (!Array.isArray(badges) || !userId) return badges;

        const hidden = hideBadges.getHiddenBadges(userId);
        return hidden.length ? badges.filter(badge => !hidden.includes(badge.id)) : badges;
    },

    getAllBadges(profile: { getBadges?(): unknown[]; vcGetBadgesRaw?(): unknown[]; } | null) {
        if (!profile) return [];
        const raw = profile.vcGetBadgesRaw ?? profile.getBadges;
        return typeof raw === "function" ? raw.call(profile) : [];
    },

    renderBadgeComponent: ErrorBoundary.wrap((badge: ProfileBadge & BadgeUserArgs) => {
        const Component = badge.component!;
        return <Component {...badge} />;
    }, { noop: true }),

    getBadgeMouseEventHandlers(badge: ProfileBadge & BadgeUserArgs) {
        const handlers = {} as Record<string, (e: React.MouseEvent) => void>;

        if (!badge) return handlers; // sanity check

        const { onClick, onContextMenu } = badge;

        if (onClick) handlers.onClick = e => onClick(e, badge);
        if (onContextMenu) handlers.onContextMenu = e => onContextMenu(e, badge);

        return handlers;
    },

    getDonorBadges(userId: string) {
        return DonorBadges[userId]?.map((badge, idx) => ({
            id: `vencord_donor_badge_${idx}`,
            iconSrc: badge.badge,
            description: badge.tooltip,
            position: BadgePosition.START,
            props: {
                style: {
                    borderRadius: "50%",
                    transform: "scale(0.9)" // The image is a bit too big compared to default badges
                }
            },
            onContextMenu(event, badge) {
                ContextMenuApi.openContextMenu(event, () => <BadgeContextMenu badge={badge} />);
            },
            onClick() {
                return VencordDonorModal();
            },
        } satisfies ProfileBadge));
    },

    getEquicordDonorBadges(userId: string) {
        return EquicordDonorBadges[userId]?.map((badge, idx) => ({
            id: `equicord_donor_badge_${idx}`,
            iconSrc: badge.badge,
            description: badge.tooltip,
            position: BadgePosition.START,
            props: {
                style: {
                    borderRadius: "50%",
                    transform: "scale(0.9)" // The image is a bit too big compared to default badges
                }
            },
            onContextMenu(event, badge) {
                ContextMenuApi.openContextMenu(event, () => <BadgeContextMenu badge={badge} />);
            },
            onClick() {
                return badge.tooltip === "Equicord Translator" ? EquicordTranslatorModal() : EquicordDonorModal();
            },
        } satisfies ProfileBadge));
    },

    getPixelCordDonorBadges(userId: string) {
        return PixelCordDonorBadges[userId]?.map((badge, idx) => ({
            id: `pixelcord_donor_badge_${idx}`,
            iconSrc: badge.badge,
            description: badge.tooltip,
            position: BadgePosition.START,
            // No props.style: render at native badge size, keep the uploaded
            // image's original shape (no scale-down, no circular crop).
            onContextMenu(event, badge) {
                ContextMenuApi.openContextMenu(event, () => <BadgeContextMenu badge={badge} />);
            }
        } satisfies ProfileBadge));
    }
});
