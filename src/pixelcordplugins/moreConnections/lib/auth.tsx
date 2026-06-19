/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { proxyLazy } from "@utils/lazy";
import { Logger } from "@utils/Logger";
import { OAuth2AuthorizeModal, openModal, showToast, Toasts, UserStore, zustandCreate, zustandPersist } from "@webpack/common";

import { AUTHORIZE_URL, CLIENT_ID, loadApiConfig } from "./constants";

interface AuthorizationState {
    token: string | null;
    tokens: Record<string, string>;
    init: () => void;
    authorize: () => Promise<void>;
    setToken: (token: string) => void;
    remove: (id: string) => void;
    isAuthorized: () => boolean;
}

const indexedDBStorage = {
    async getItem(name: string): Promise<string | null> {
        return DataStore.get(name).then(v => v ?? null);
    },
    async setItem(name: string, value: string): Promise<void> {
        await DataStore.set(name, value);
    },
    async removeItem(name: string): Promise<void> {
        await DataStore.del(name);
    },
};

export const useAuthorizationStore = proxyLazy(() => zustandCreate(
    zustandPersist(
        (set: any, get: any) => ({
            token: null,
            tokens: {},
            init: () => { set({ token: get().tokens[UserStore.getCurrentUser()?.id] ?? null }); },
            setToken: (token: string) => set({ token, tokens: { ...get().tokens, [UserStore.getCurrentUser().id]: token } }),
            remove: (id: string) => {
                const { tokens } = get();
                const newTokens = { ...tokens };
                delete newTokens[id];
                set({ tokens: newTokens });
                get().init();
            },
            async authorize() {
                if (!CLIENT_ID) await loadApiConfig();
                if (!CLIENT_ID) {
                    showToast("Could not reach the Pixelcord API. Is the backend running?", Toasts.Type.FAILURE);
                    return;
                }

                return new Promise<void>((resolve, reject) => openModal(props =>
                    <OAuth2AuthorizeModal
                        {...props}
                        scopes={["identify"]}
                        responseType="code"
                        redirectUri={AUTHORIZE_URL}
                        permissions={0n}
                        clientId={CLIENT_ID}
                        cancelCompletesFlow={false}
                        callback={async (response: any) => {
                            try {
                                const url = new URL(response.location);
                                url.searchParams.append("client", "pixelcord");

                                const req = await fetch(url);
                                if (req.ok) {
                                    get().setToken(await req.text());
                                    resolve();
                                } else {
                                    throw new Error("Request not OK");
                                }
                            } catch (e) {
                                showToast(`Failed to authorize: ${e instanceof Error ? e.message : e}`, Toasts.Type.FAILURE);
                                new Logger("MoreConnections").error("Failed to authorize", e);
                                reject(e);
                            }
                        }}
                    />, {
                    onCloseCallback() {
                        reject(new Error("Authorization cancelled"));
                    },
                }));
            },
            isAuthorized: () => !!get().token,
        } as AuthorizationState),
        {
            name: "pixelcord-moreconnections-auth",
            storage: indexedDBStorage,
            partialize: (state: any) => ({ tokens: state.tokens }),
            onRehydrateStorage: () => (state: any) => state?.init()
        }
    )
));
