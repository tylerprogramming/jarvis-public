/* What a failed brain turn actually means, and what to do about it.
 *
 * The `claude` CLI reports trouble as a normal result with `is_error: true`
 * and prose in `result` - the process still exits 0 in some cases, and its
 * `subtype` says "success" even when it failed, so neither the exit code nor
 * the subtype can be trusted on its own. Without this, that prose renders in
 * the HUD as though the model had answered: a person who has run out of quota
 * sees a paragraph about usage limits sitting where their reply should be,
 * with no indication anything went wrong or what to do next.
 *
 * Each kind carries a short label for the UI, and a hint that names the exact
 * command or setting that fixes it. Anything unrecognised stays `unknown` and
 * shows the model's own words rather than a guess.
 */

const KINDS = [
  {
    /* `--resume <id>` with an id the CLI no longer has. The HUD keeps the
     * session id in localStorage and the server in data/session.json, and
     * either can outlive the conversation it names: a cleared ~/.claude, a
     * second Jarvis checkout on the same port (same origin, same
     * localStorage), or a chat started from a different cwd. The CLI prints
     * the reason on stderr and returns an empty error result, which used to
     * reach the HUD as "the brain failed" with no message at all. */
    kind: "no-session",
    label: "conversation not found",
    test: /no conversation found with session id/i,
    hint: "The saved conversation no longer exists. Press New conversation in the HUD,"
        + " or send the message again and Jarvis starts a fresh one.",
  },
  {
    kind: "usage-limit",
    label: "usage limit reached",
    test: /reached your .*limit|usage limit|rate.?limit|out of credits|insufficient credits|upgrade to continue/i,
    hint: "This model is capped for now. Set `chat.model` to another one you have left"
        + " (sonnet, haiku, opus) in config.json or Settings, or wait for the window to reset."
        + " Check what is left at claude.ai/settings/usage.",
  },
  {
    kind: "auth-expired",
    label: "not signed in",
    test: /oauth session expired|failed to authenticate|not logged in|please run .?claude login|invalid api key|authentication_error/i,
    hint: "Claude Code is signed out. Run `claude auth login --claudeai` in a terminal,"
        + " then `claude auth status` should say loggedIn: true.",
  },
  {
    kind: "bad-model",
    label: "no such model",
    test: /issue with the selected model|model .* (does not exist|not found)|invalid model|unknown model|model_not_found/i,
    hint: "`chat.model` names a model this account cannot use. Run `jarvis brain model`"
        + " to see which ones answer, then `jarvis brain model <name>` to switch,"
        + " or `jarvis brain model default` to let the CLI choose.",
  },
  {
    kind: "overloaded",
    label: "model overloaded",
    test: /overloaded|529|service unavailable|try again later|temporarily unavailable/i,
    hint: "Anthropic is busy, not you. Send it again in a moment.",
  },
  {
    kind: "timeout",
    label: "timed out",
    test: /timed out|timeout|deadline exceeded/i,
    hint: "The turn took longer than the limit. Ask for something smaller, or raise the timeout.",
  },
];

/* Returns {kind, label, message, hint} for any brain failure. `message` is
 * always the runner's own text, trimmed - never invented here. */
function classify(text, fallbackKind) {
  const message = String(text == null ? "" : text).trim();
  for (const k of KINDS) {
    if (k.test.test(message)) return { kind: k.kind, label: k.label, message, hint: k.hint };
  }
  return {
    kind: fallbackKind || "unknown",
    label: "the brain failed",
    message,
    hint: "Run `jarvis doctor` to see whether the brain answers at all.",
  };
}

/* True when a `result` event from the claude CLI is really a failure. The
 * flag is authoritative; the text scan catches older CLI builds that set no
 * flag at all. */
function isFailure(ev) {
  if (!ev) return false;
  if (ev.is_error === true) return true;
  const r = String(ev.result || "");
  if (!r) return false;
  return KINDS.some((k) => k.test.test(r)) && r.length < 400;
}

module.exports = { classify, isFailure, KINDS };
