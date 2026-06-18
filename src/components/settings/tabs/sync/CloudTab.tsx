/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2023 Vendicated and contributors
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

import { useSettings } from "@api/Settings";
import { authorizeCloud, deauthorizeCloud } from "@api/SettingsSync/cloudSetup";
import { setCloudSyncDirection } from "@api/SettingsSync/cloudSync";
import { FormSwitch } from "@components/FormSwitch";
import { Heading } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import { Margins } from "@utils/margins";

// PixelCord's own backend (pixelcord-api). Dev uses the local instance; prod uses
// your deployed origin. The cloud sync protocol hangs off /v1 on this origin.
const CLOUD_URL = IS_DEV ? "http://localhost:8088/" : "https://pixelcord-api.example/";

function CloudTab() {
    const settings = useSettings(["cloud.authenticated", "cloud.settingsSync", "cloud.url"]);
    const { cloud } = settings;

    return (
        <SettingsTab>
            <Heading className={Margins.top16}>Cloud Sync</Heading>
            <Paragraph className={Margins.bottom16}>
                Sincronize suas configurações do PixelCord — plugins ativados e suas opções, temas e o QuickCSS — com o backend do PixelCord, pra manter tudo igual entre seus dispositivos. É só ligar.
            </Paragraph>

            <FormSwitch
                title="Ativar Cloud Sync"
                description="Conecta com sua conta PixelCord (login via Discord) e mantém suas configurações sincronizadas automaticamente. Desligue pra parar de sincronizar."
                value={cloud.authenticated}
                onChange={async v => {
                    if (v) {
                        // Always (re)point at our backend before authorizing, in case an
                        // older value (e.g. a previous Equicloud URL) is still stored.
                        cloud.url = CLOUD_URL;
                        cloud.settingsSync = true;
                        setCloudSyncDirection("both");
                        await authorizeCloud();
                    } else {
                        cloud.authenticated = false;
                        cloud.settingsSync = false;
                        await deauthorizeCloud();
                    }
                }}
                hideBorder
            />
        </SettingsTab>
    );
}

export default wrapTab(CloudTab, "Cloud");
