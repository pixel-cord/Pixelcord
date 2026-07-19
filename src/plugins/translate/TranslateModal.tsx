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

import { Divider } from "@components/Divider";
import { FormSwitch } from "@components/FormSwitch";
import { HeadingSecondary } from "@components/Heading";
import { Margins } from "@utils/margins";
import { RenderModalProps } from "@vencord/discord-types";
import { Modal, openModal, SearchableSelect, useMemo } from "@webpack/common";

import { settings } from "./settings";
import { getLanguages } from "./utils";

const LanguageSettingKeys = ["receivedInput", "receivedOutput", "sentInput", "sentOutput"] as const;

function LanguageSelect({ settingsKey, includeAuto }: { settingsKey: typeof LanguageSettingKeys[number]; includeAuto: boolean; }) {
    const currentValue = settings.use([settingsKey])[settingsKey];

    const options = useMemo(
        () => {
            const options = Object.entries(getLanguages()).map(([value, label]) => ({ value, label }));
            if (!includeAuto)
                options.shift();

            return options;
        }, []
    );

    return (
        <section className={Margins.bottom16}>
            <HeadingSecondary>
                {settings.def[settingsKey].description}
            </HeadingSecondary>

            <SearchableSelect
                options={options}
                value={options.find(o => o.value === currentValue)?.value}
                placeholder="Select a language"
                maxVisibleItems={5}
                closeOnSelect={true}
                onChange={v => settings.store[settingsKey] = v}
            />
        </section>
    );
}

type ToggleKey = "autoTranslate" | "autoTranslateReceived" | "lowercase" | "naturalStyle";

function SettingToggle({ settingsKey, title }: { settingsKey: ToggleKey; title: string; }) {
    const value = settings.use([settingsKey])[settingsKey] as boolean;

    return (
        <FormSwitch
            title={title}
            description={settings.def[settingsKey].description}
            value={value}
            onChange={v => settings.store[settingsKey] = v}
            hideBorder
        />
    );
}

export function TranslateModal({ rootProps }: { rootProps: RenderModalProps; }) {
    return (
        <Modal
            {...rootProps}
            title="Translate"
        >
            {LanguageSettingKeys.map(s => (
                <LanguageSelect
                    key={s}
                    settingsKey={s}
                    includeAuto={s.endsWith("Input")}
                />
            ))}

            <Divider className={Margins.bottom16} />

            <SettingToggle settingsKey="autoTranslate" title="Auto-traduzir mensagens enviadas" />
            <SettingToggle settingsKey="autoTranslateReceived" title="Auto-traduzir mensagens recebidas" />
            <SettingToggle settingsKey="lowercase" title="Enviar tudo em minúsculo" />
            <SettingToggle settingsKey="naturalStyle" title="Estilo mais natural (sem ponto final / !)" />
        </Modal>
    );
}

export function openTranslateModal() {
    openModal(props => <TranslateModal rootProps={props} />);
}
