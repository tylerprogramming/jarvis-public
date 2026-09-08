# Hooking up chat delivery

Jarvis can post what an agent wrote to a Discord channel, a Telegram chat, a
Slack channel, an ntfy topic, or any URL that takes a JSON POST. This is the
walkthrough for each one, in order of how long it takes. Nothing here is
required; skip it entirely and Jarvis writes files and stops.

Every provider ends the same way, so here is the shape once:

1. Get one secret from the platform (a webhook URL, a bot token, a topic name).
2. Put it in `.env` beside the repo. Never in `config.json`.
3. Name a channel in `config.json`:
   ```json
   { "notify": { "channels": { "phone": { "provider": "telegram" } } } }
   ```
   The name (`phone`) is yours to pick; it is what agents refer to.
4. Prove it works: `jarvis notify test phone`. This really sends one line.
5. Point an agent at it, in `config.json` so a `git pull` never undoes it:
   ```json
   { "agents": { "radar": { "notify": ["phone"] } } }
   ```
6. `jarvis agents check` says `notify: phone (report, summary)` under that
   agent. If it says a problem instead, read it; it names the missing piece.

Which agents to wire first: `radar` (only pings when something broke out),
`watchdog` (only pings when an agent failed or went quiet), and `journal`
(every night, the day's recap). Everything else you can read on the HUD.

If you are running Jarvis with Claude Code as the brain, you can ask it in
the HUD command bar: "help me hook up telegram". It walks you through this
page and runs the test for you. It cannot read your screen, so it will ask you
to paste the token.

---

## ntfy (about one minute, no account)

ntfy is a free push service with an app for iPhone and Android. A "topic" is
just a name; anyone who knows it can subscribe, so pick something nobody
would guess.

1. Install the ntfy app, tap `+`, subscribe to a topic, e.g.
   `jarvis-4f7a9c2b`.
2. `.env`:
   ```
   NTFY_TOPIC=jarvis-4f7a9c2b
   ```
   Self-hosting ntfy? Add `NTFY_URL=https://ntfy.yourdomain.com`.
3. `config.json`: `"push": { "provider": "ntfy" }`
4. `jarvis notify test push`. Your phone buzzes.

Limits: 4096 characters, cut with a note. Markdown renders in the app.

## Discord (about thirty seconds)

A webhook is a URL that posts into one channel. No bot, no developer portal.

1. In Discord, open the channel you want, click the gear (Edit Channel),
   then **Integrations**, then **Webhooks**, then **New Webhook**. Name it
   Jarvis. **Copy Webhook URL**.
2. `.env`:
   ```
   DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/1234.../abcd...
   ```
3. `config.json`: `"team": { "provider": "discord" }`
4. `jarvis notify test team`.

Two channels (say, alerts in one, the nightly recap in another) need two
webhooks. Give the second channel an `env` so it reads its own variable:

```json
"alerts": { "provider": "discord", "env": "DISCORD_WEBHOOK_URL_ALERTS" }
```

Limits: 2000 characters per message; longer reports arrive as a few messages
with a `(N more lines in ...)` tail. The webhook URL is a secret: anyone with
it can post to that channel. If it leaks, delete the webhook in Discord and
make a new one.

## Slack (about five minutes)

Slack needs an app to own the webhook, but it is a form, not code.

1. Go to https://api.slack.com/apps and click **Create New App**, then
   **From scratch**. Name it Jarvis, pick your workspace.
2. In the app's sidebar click **Incoming Webhooks**, switch it **On**, then
   **Add New Webhook to Workspace**, choose the channel, **Allow**.
3. Copy the webhook URL (starts with `https://hooks.slack.com/services/`).
4. `.env`:
   ```
   SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T000/B000/xxxx
   ```
5. `config.json`: `"slack": { "provider": "slack" }`
6. `jarvis notify test slack`.

Limits: Jarvis sends 3000 characters per message. Slack's markdown is its own
dialect; bold and lists come through, tables do not.

## Telegram (about five minutes, the fiddly part is the chat id)

Telegram bots cannot message you until you message them first. Two secrets:
the bot's token, and the id of the chat it should post into.

1. In Telegram, open a chat with **@BotFather**, send `/newbot`, answer the
   two questions (a display name, then a username ending in `bot`). It
   replies with a token like `123456789:AAF...`. That is `TELEGRAM_BOT_TOKEN`.
2. Open a chat with your new bot (BotFather gives you a link) and send it any
   message, `hi` is fine. For a group, add the bot to the group and send a
   message there.
3. Find the chat id. Put the token in `.env` first, then:
   ```
   jarvis notify telegram-id
   ```
   It asks Telegram for recent updates and prints every chat that messaged
   the bot, with its id. Private chats have a positive id (your user id);
   groups are negative (`-100...`). If it prints nothing, send the bot another
   message and run it again; Telegram only keeps updates for 24 hours.

   Without Jarvis: open
   `https://api.telegram.org/bot<TOKEN>/getUpdates` in a browser and read
   `"chat": {"id": ...}`.
4. `.env`:
   ```
   TELEGRAM_BOT_TOKEN=123456789:AAF...
   TELEGRAM_CHAT_ID=987654321
   ```
5. `config.json`: `"phone": { "provider": "telegram" }`
6. `jarvis notify test phone`.

Limits: 4096 characters, chunked. Jarvis sends Markdown and falls back to
plain text if Telegram rejects the formatting, so a report with odd
characters still arrives. A second Telegram target uses
`"env": {"TELEGRAM_CHAT_ID": "TELEGRAM_CHAT_ID_ALERTS"}`.

## Generic webhook (for n8n, Zapier, Make, your own server)

Jarvis POSTs JSON: `{"title", "text", "file", "mode"}`. No auth header; put
a secret in the URL path if the receiver needs one.

1. `.env`: `NOTIFY_WEBHOOK_URL=https://hooks.example.com/jarvis/<secret>`
2. `config.json`: `"hook": { "provider": "webhook" }`
3. `jarvis notify test hook`.

---

## When it does not work

`jarvis notify test <channel>` prints the platform's actual answer, which is
almost always the diagnosis:

| It says | It means |
|---|---|
| `not configured: set DISCORD_WEBHOOK_URL in .env` | `.env` is missing the line, or the line is commented out with `#`. |
| `refused it (401): Unauthorized` (Telegram) | The bot token is wrong or was revoked in BotFather. |
| `refused it (400): chat not found` (Telegram) | The chat id is wrong, or you never messaged the bot. Run `jarvis notify telegram-id`. |
| `refused it (403)` or `Invalid Webhook Token` (Discord) | The webhook was deleted. Make a new one. |
| `refused it (404): no_service` (Slack) | The webhook was removed from the app, or the app was uninstalled. |
| `could not reach ...` | No network, or a self-hosted URL is wrong. |

An agent that delivers writes the outcome into its log,
`data/logs/<agent>.log`, as `notify <channel>: ...`. A `FAILED` line there
never stops the agent; the report is still on disk. `jarvis doctor` lists
every channel and whether its secret is set, but does not send.

## What gets sent

Per agent, `notify_mode` is `summary` (title, first line, path), `full` (the
whole report, cut to the platform's limit) or `link` (a URL that opens it in
the HUD on the same machine). `notify_when` is `report` (only when the run
wrote a new file, the default) or `always`. A failed run never sends
anything. See [AGENTS.md](AGENTS.md#notify).
