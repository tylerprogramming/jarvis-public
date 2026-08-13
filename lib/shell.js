/* One place that knows how to run a shell command on this machine.
 *
 * Two callers used to hardcode `/bin/bash -lc`: agent `pre:` commands and the
 * brain's shell tool. That file does not exist on Windows, so both failed with
 * ENOENT rather than anything a user could act on.
 *
 * The `-l` in the original mattered and is preserved: a login shell sources
 * the user's profile, which is how `yt-dlp`, `uv` and friends end up on PATH
 * for a process launched by launchd or by a double-clicked terminal. Dropping
 * it would make agents work when run by hand and fail when run on a schedule,
 * which is the worst kind of bug to own.
 *
 * On Windows there is no login-shell equivalent. PowerShell reads the user's
 * profile by default, so `powershell -NoProfile` would be wrong here for the
 * same reason `bash -c` would be: we WANT the profile.
 */
const os = require("os");
const fs = require("fs");
const { execFile } = require("child_process");

/* Returns [command, args] for running `script` through a shell.
 *
 * Exported so `jarvis doctor` can print what it will actually use rather than
 * guessing, and so tests can assert the shape without spawning anything. */
function shellFor(script) {
  if (process.platform === "win32") {
    // PowerShell over cmd.exe: cmd cannot express `&&`, quoting is a minefield,
    // and every install instruction anyone writes for Windows assumes pwsh.
    // pwsh (7+) if present, else the Windows PowerShell every install has.
    const pwsh = process.env.JARVIS_SHELL || "powershell.exe";
    return [pwsh, ["-ExecutionPolicy", "Bypass", "-Command", script]];
  }
  // Respect an explicit choice, then the user's login shell, then bash, then sh.
  // A user on zsh or fish still gets their own profile sourced this way.
  const candidates = [process.env.JARVIS_SHELL, process.env.SHELL, "/bin/bash", "/bin/sh"];
  const sh = candidates.find((c) => c && (c === "/bin/sh" || safeExists(c))) || "/bin/sh";
  return [sh, ["-lc", script]];
}

function safeExists(p) {
  try { return fs.existsSync(p); } catch { return false; }
}

/* Run a command and resolve with { code, stdout, stderr }. Never rejects:
 * every caller here wants to report the failure, not crash on it. */
function run(script, opts = {}) {
  const [cmd, args] = shellFor(script);
  return new Promise((resolve) => {
    execFile(cmd, args, {
      cwd: opts.cwd,
      timeout: opts.timeout ?? 600000,
      maxBuffer: opts.maxBuffer ?? 10 * 1024 * 1024,
      env: opts.env || process.env,
    }, (err, stdout, stderr) => {
      resolve({
        code: err ? (err.code ?? 1) : 0,
        stdout: String(stdout || ""),
        stderr: String(stderr || ""),
        error: err || null,
      });
    });
  });
}

/* Is a program on PATH? `where` on Windows, `command -v` elsewhere. */
function which(bin) {
  return new Promise((resolve) => {
    const [cmd, args] = process.platform === "win32"
      ? ["where", [bin]]
      : ["/bin/sh", ["-lc", `command -v ${JSON.stringify(bin)}`]];
    execFile(cmd, args, (err, stdout) => resolve(err ? null : String(stdout).trim().split("\n")[0] || null));
  });
}

/* Where a venv puts its interpreter. Windows uses Scripts\\python.exe, every
 * other platform bin/python3 - a difference that has silently broken more
 * cross-platform installers than it has any right to. */
function venvPython(venvDir) {
  const path = require("path");
  return process.platform === "win32"
    ? path.join(venvDir, "Scripts", "python.exe")
    : path.join(venvDir, "bin", "python3");
}

/* Open a URL in the user's browser. */
function openUrl(url) {
  const [cmd, args] = process.platform === "win32" ? ["cmd", ["/c", "start", "", url]]
    : process.platform === "darwin" ? ["open", [url]]
    : ["xdg-open", [url]];
  try { execFile(cmd, args, () => {}); } catch { /* not fatal, the URL is printed anyway */ }
}

const isWindows = process.platform === "win32";
const homedir = () => os.homedir();

module.exports = { shellFor, run, which, venvPython, openUrl, isWindows, homedir };
