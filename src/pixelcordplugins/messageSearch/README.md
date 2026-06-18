# MessageSearch

Desktop port of the Discord **mobile** "search your messages" feature for
[Vencord](https://vencord.dev) / [Equicord](https://equicord.org).

On mobile you can open a global search that pulls up every message you've ever
sent, across all servers and DMs, grouped into tabs (Messages, Media, Files,
Links, Pins, People). The desktop client doesn't expose this — this plugin adds
it, styled to match Discord.

The whole plugin lives in a single `index.tsx` (logic + injected styles), so you
can drop just that one file in.

## How it works

It calls the same endpoint the mobile app uses:

```
POST /users/@me/messages/search/tabs
```

via Vencord's `RestAPI`, so your token is **never** read or stored by the plugin —
the request is authenticated the same way every other Discord request is.

The response is paginated per tab with a snowflake cursor; scrolling to the
bottom (or "Load more") fetches the next page of the active tab.

### Jumping to old DMs

Clicking a result jumps straight to the original message. For old DMs with people
you no longer share a server with and aren't friends with, the conversation is
**closed** and not in your local channel store, so a plain navigation would land
nowhere. The plugin detects this case, looks up the recipient
(`GET /channels/{id}` when needed) and opens the private channel via
`ChannelActionCreators.openPrivateChannel` **before** navigating — so the jump
works even for conversations that no longer appear in your DM list.

## Usage

1. Drop `index.tsx` into a folder inside `src/userplugins/`
   (or `src/equicordplugins/` on Equicord).
2. Rebuild Vencord/Equicord (`pnpm build`) and reload Discord.
3. Enable **MessageSearch** in Settings → Plugins.
4. Click the 🔍 button next to the DM list search bar to open the search modal.
   You can also trigger it programmatically via the exported `openSearchModal()`.

## Settings

- **Show DM-list button** — toggle the button next to the DM list's search bar (restart required).

## Notes

- The search endpoint is rate-limited by Discord; spamming searches returns a
  429, which the modal surfaces as a friendly message.
- The **People** tab only matches conversations currently open in your DM list;
  old/closed DMs still surface through the **Messages** tab and jump correctly.
