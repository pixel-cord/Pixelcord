# [<img src="./browser/icon.png" width="40" align="left" alt="PixelCord">](https://github.com/pixel-cord/pixelcord) PixelCord

PixelCord is a Discord client mod. It is a fork of [Equicord](https://github.com/Equicord/Equicord) (itself a fork of [Vencord](https://github.com/Vendicated/Vencord)), shipping everything from both plus its own PixelCord plugins and tweaks.

### Included Plugins

PixelCord includes every Vencord and Equicord plugin, plus the PixelCord plugins on top.

## Installing PixelCord (Devbuild)

### Dependencies

[Git](https://git-scm.com/download) and [Node.JS LTS](https://nodejs.dev/en/) are required.

Install `pnpm`:

> :exclamation: This next command may need to be run as admin/root depending on your system, and you may need to close and reopen your terminal for pnpm to be in your PATH.

```shell
npm i -g pnpm
```

> :exclamation: **IMPORTANT** Make sure you aren't using an admin/root terminal from here onwards. It **will** mess up your Discord/PixelCord instance and you **will** most likely have to reinstall.

Clone PixelCord:

```shell
git clone https://github.com/pixel-cord/pixelcord
cd pixelcord
```

Install dependencies:

```shell
pnpm install --frozen-lockfile
```

Build PixelCord:

```shell
pnpm build
```

Inject PixelCord into your desktop client:

```shell
pnpm inject
```

Build PixelCord for web:

```shell
pnpm buildWeb
```

After building the web extension, locate the appropriate ZIP file in the `dist` directory and follow your browser's guide for installing custom extensions, if supported.

Note: the Firefox extension zip requires Firefox for developers.

## Credits

PixelCord stands on the shoulders of [Equicord](https://github.com/Equicord/Equicord) by the Equicord team and [Vencord](https://github.com/Vendicated/Vencord) by [Vendicated](https://github.com/Vendicated). All upstream credit goes to them.

## Disclaimer

Discord is a trademark of Discord Inc., and is solely mentioned for the sake of descriptivity.
Mentioning it does not imply any affiliation with or endorsement by Discord Inc.

<details>
<summary>Using PixelCord violates Discord's terms of service</summary>

Client modifications are against Discord's Terms of Service.

However, Discord is pretty indifferent about them, and there are no known cases of users getting banned for using client mods! So you should generally be fine if you don't use plugins that implement abusive behaviour. But no worries, all inbuilt plugins are safe to use!

Regardless, if your account is essential to you and getting disabled would be a disaster for you, you should probably not use any client mods (not exclusive to PixelCord), just to be safe.

Additionally, make sure not to post screenshots with PixelCord in a server where you might get banned for it.

</details>
