# Security

Read this before you expose Jarvis to anything.

## The one thing that matters

`/api/chat` spawns Claude Code with `--permission-mode acceptEdits` and a set of
allowed tools that includes `Write`, `Edit`, and some `Bash`. Anyone who can
reach that endpoint can read and modify files on your machine. There is no
sandbox between the HTTP request and the agent.

That is the point of the tool, and it is fine on loopback. It is not fine on a
network you share.

## Defaults

- Jarvis binds `127.0.0.1`. Only this machine can reach it.
- If `server.host` is anything else and no token is set, **the server refuses
  to start**. This is deliberate and not a warning you can click through.
- Uploads are capped (1 MB for JSON, 25 MB for audio).
- `/api/doc` resolves symlinks and serves only files that genuinely sit inside
  a configured documents directory. `../` and symlink tricks return 404.
- `/api/config` refuses to write any key matching `token`, `key`, or `secret`.
  Credentials belong in `.env`.

## Putting it on your LAN

If you want the HUD on a tablet or a second machine:

```bash
# .env
JARVIS_TOKEN=<paste 32+ random characters>
JARVIS_HOST=0.0.0.0
```

Generate one with `openssl rand -hex 24`. Then load
`http://<your-ip>:4747/?token=<token>` once - the token is stored in an
HttpOnly cookie and later requests carry it automatically.

Understand what this is: a shared secret over plain HTTP on your local network.
It stops a housemate's laptop from stumbling into your agent. It is not
authentication in any serious sense, there is no TLS, and the token is visible
to anything sniffing the wire.

## Running it on a VPS, safely

A rented box is the obvious way to get agents that run whether or not your
laptop is open. The trap is that the HUD then lives on a public IP, and
`/api/chat` is a shell.

Do not bind it publicly. Tunnel instead - you already have SSH to the box, and
this needs no config change at all:

```bash
# on your laptop, leave it running
ssh -N -L 4747:127.0.0.1:4747 user@your-box
```

Then open `http://localhost:4747` on your laptop. Jarvis stays bound to
loopback on the server, nothing is published, and there is no token to leak.
Everything works exactly as it does locally, because as far as the server is
concerned the request came from itself.

Two things to know when the box is Linux rather than a Mac:

- Agents are scheduled with cron rather than launchd. `jarvis agents install`
  handles the difference; a server that never sleeps is the one environment
  where the schedule is actually kept to the minute.
- `python3 -m venv` fails on a stock Debian or Ubuntu until you install
  `python3.X-venv`. `jarvis voice install` checks for this and prints the exact
  package, but that is the one prerequisite the repo cannot install for you.

## Do not put this on the internet

Not behind a port forward, not on a public VPS with the port open. If you need
it remotely, use a VPN (Tailscale is the easy answer) so the machine is never
publicly reachable in the first place.

## Which brain you pick changes where your files go

Jarvis runs the command bar on Claude Code when it is installed, and on an
OpenAI-compatible endpoint otherwise. That choice is a data-flow decision:

- **Claude Code** brings its own tools and its own permission model. Its scope
  is whatever `chat.cwd` points at.
- **The OpenAI-compatible brain** has no tools of its own, so Jarvis gives it
  file read/write/search and an allowlisted shell. **Whatever those tools read
  is sent to whichever API is serving the model** — OpenAI, OpenRouter, or a
  local server, depending on `brain.openai.base_url`. Point it at Ollama or
  LM Studio and nothing leaves the machine.

Two gates bound those tools. First, every path is resolved and must land inside
`chat.cwd`, the Jarvis directory, or a configured documents/knowledge directory.
Second, `brain.denied_patterns` refuses obvious secrets even when the path is
otherwise allowed — `.ssh/`, `.aws/`, `.env`, `credentials.json`, `*.pem`,
private keys, keychains. This matters because **`chat.cwd` defaults to your
home directory**, which is a reasonable working scope and also full of things a
model has no reason to open.

Narrow it if you can. Pointing `chat.cwd` at the one folder you actually work
in is the single highest-value change here:

```json
{ "chat": { "cwd": "~/work/content" } }
```

Shell access for this brain is deny-by-default: `run_command` refuses anything
whose binary is not in `brain.allowed_commands`.

## Narrowing what the agent can do

`chat.allowed_tools` in `config.json` controls the blast radius. The shipped
default is already narrower than a full Claude Code session. To go further:

```json
{
  "chat": {
    "allowed_tools": "Read Glob Grep WebSearch",
    "permission_mode": "plan"
  }
}
```

That gives you a Jarvis that answers questions but changes nothing. You can
also block specific commands with `chat.disallowed_tools`, which is worth doing
for anything that publishes:

```json
{ "chat": { "disallowed_tools": "Bash(*publish*) Bash(*post*) mcp__email" } }
```

Scheduled agents get their own `tools:` line in their frontmatter, so an agent
can be restricted independently of the chat bar.

## MCP servers

Jarvis inherits the MCP servers your `claude` CLI is connected to, but cannot
call any of them until you list it in `chat.mcp_servers`. Default is none.

This matters more than the other tool settings. File tools are scoped and
read mostly local data; MCP servers send email, post to channels, move money in
some cases, and delete records. Allowing one gives the command bar that reach,
and the command bar is one prompt away from anything the model decides to do.

Turn on the ones you need rather than `allow all`, and remember the iron rule in
the persona (never post, send, or publish without an explicit go-ahead) is a
prompt instruction, not an enforced boundary. If a server can do something you
would not want done on a bad day, leave it off.

## Secrets

`.env` is gitignored, and so are `config.json` and `PERSONA.md`. Before you
publish a fork, check what you are shipping:

```bash
git ls-files | xargs grep -lE "sk-|api[_-]?key|token" 2>/dev/null
```

Remember that `git rm` does not erase history. If a secret or a private number
was ever committed, rewrite the history or start a fresh repository - making a
repo public exposes every commit in it, not just the current files.
