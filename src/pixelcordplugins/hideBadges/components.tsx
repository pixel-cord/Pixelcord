/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Paragraph } from "@components/Paragraph";
import { Switch } from "@components/Switch";
import BadgeAPIPlugin from "@plugins/_api/badges";
import { Margins } from "@utils/margins";
import { RenderModalProps } from "@vencord/discord-types";
import { Button, DisplayProfileUtils, Modal, openModal, showToast, Toasts, useEffect, useMemo, UserStore, useState } from "@webpack/common";

import { getMyHidden, setMyHidden } from "./lib/api";
import { useAuthorizationStore } from "./lib/auth";
import { useUsersHiddenStore } from "./lib/store";

interface RawBadge {
    id: string;
    description?: string;
    iconSrc?: string;
    icon?: string;
    link?: string;
}

function badgeIconUrl(badge: RawBadge): string | null {
    if (badge.iconSrc) return badge.iconSrc;
    if (badge.icon) return `https://cdn.discordapp.com/badge-icons/${badge.icon}.png`;
    return null;
}

function ManageModal({ modalProps }: { modalProps: RenderModalProps; }) {
    const me = UserStore.getCurrentUser();
    const allBadges = useMemo(() => {
        const profile = DisplayProfileUtils.getDisplayProfile(me.id);
        return BadgeAPIPlugin.getAllBadges(profile) as RawBadge[];
    }, [me.id]);

    const [hidden, setHidden] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getMyHidden()
            .then(setHidden)
            .catch(() => showToast("Failed to load your hidden badges.", Toasts.Type.FAILURE))
            .finally(() => setLoading(false));
    }, []);

    function persist(next: string[]) {
        setHidden(next);
        useUsersHiddenStore.getState().setLocal(me.id, next);
        setMyHidden(next).catch(e => showToast(`Failed to save: ${e instanceof Error ? e.message : e}`, Toasts.Type.FAILURE));
    }

    return (
        <Modal {...modalProps} size="md" title="Hide your badges">
            <div style={{ padding: 16 }}>
                <Paragraph className={Margins.bottom16}>
                    Badges you hide here disappear for everyone using PixelCord. This covers both native Discord badges and PixelCord rendered ones, but only for people running PixelCord.
                </Paragraph>
                {loading
                    ? <Paragraph>Loading…</Paragraph>
                    : allBadges.length === 0
                        ? <Paragraph>No badges found on your profile.</Paragraph>
                        : allBadges.map(badge => {
                            const icon = badgeIconUrl(badge);
                            return (
                                <div key={badge.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 0" }}>
                                    {icon && <img src={icon} width={24} height={24} alt="" style={{ borderRadius: 6 }} />}
                                    <Paragraph style={{ flex: 1 }}>{badge.description ?? badge.id}</Paragraph>
                                    <Switch
                                        checked={hidden.includes(badge.id)}
                                        onChange={value => persist(value ? [...hidden, badge.id] : hidden.filter(id => id !== badge.id))}
                                    />
                                </div>
                            );
                        })
                }
            </div>
        </Modal>
    );
}

export function SettingsComponent() {
    const auth = useAuthorizationStore();

    if (!auth.isAuthorized()) {
        return <Button onClick={() => auth.authorize().catch(() => { })}>Authorize with Discord</Button>;
    }

    return (
        <div style={{ display: "flex", gap: 8 }}>
            <Button onClick={() => openModal(props => <ManageModal modalProps={props} />)}>Manage hidden badges</Button>
            <Button color={Button.Colors.RED} onClick={() => auth.remove(UserStore.getCurrentUser().id)}>Log out</Button>
        </div>
    );
}
