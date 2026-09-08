/* Turns each agent's `schedule:` cron expression into a real OS schedule.
 *
 * macOS gets launchd agents (they survive reboots and catch up on missed runs
 * when the laptop was asleep). Linux gets crontab lines. Both are generated
 * from the same frontmatter, so there is nothing to keep in sync by hand.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");

const LABEL_PREFIX = "com.jarvis.agent.";

function parseCron(expr) {
  const parts = String(expr).trim().split(/\s+/);
  if (parts.length < 5) return null;
  const [minute, hour, dom, month, dow] = parts;
  const num = (v) => (v === "*" ? null : Number(v));
  if ([minute, hour].some((v) => v === "*")) return null; // sub-hourly is out of scope
  return { minute: num(minute), hour: num(hour), dom: num(dom), month: num(month), dow: num(dow) };
}

function plistPath(name) {
  return path.join(os.homedir(), "Library", "LaunchAgents", `${LABEL_PREFIX}${name}.plist`);
}

function plistBody(name, cron, root, nodeBin) {
  const cal = [
    `      <key>Minute</key><integer>${cron.minute}</integer>`,
    `      <key>Hour</key><integer>${cron.hour}</integer>`,
    cron.dow != null ? `      <key>Weekday</key><integer>${cron.dow}</integer>` : "",
    cron.dom != null ? `      <key>Day</key><integer>${cron.dom}</integer>` : "",
  ].filter(Boolean).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL_PREFIX}${name}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${nodeBin}</string>
    <string>${path.join(root, "bin", "jarvis")}</string>
    <string>agent</string>
    <string>${name}</string>
  </array>
  <key>WorkingDirectory</key><string>${root}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${path.join(os.homedir(), ".local", "bin")}</string>
    <key>JARVIS_TRIGGER</key><string>schedule</string>
  </dict>
  <key>StartCalendarInterval</key>
  <dict>
${cal}
  </dict>
  <key>StandardOutPath</key><string>${path.join(root, "data", `${name}.launchd.log`)}</string>
  <key>StandardErrorPath</key><string>${path.join(root, "data", `${name}.launchd.log`)}</string>
  <key>RunAtLoad</key><false/>
</dict>
</plist>
`;
}

const launchctl = (args) =>
  new Promise((resolve) => execFile("launchctl", args, () => resolve()));

async function installMac(agents, root) {
  const dir = path.join(os.homedir(), "Library", "LaunchAgents");
  fs.mkdirSync(dir, { recursive: true });
  const done = [];
  for (const a of agents) {
    const cron = parseCron(a.schedule);
    if (!cron) continue;
    const file = plistPath(a.name);
    fs.writeFileSync(file, plistBody(a.name, cron, root, process.execPath));
    await launchctl(["unload", file]);
    await launchctl(["load", file]);
    done.push(`${a.name} (${a.schedule})`);
  }
  return done;
}

async function uninstallMac(agents) {
  const removed = [];
  for (const a of agents) {
    const file = plistPath(a.name);
    if (!fs.existsSync(file)) continue;
    await launchctl(["unload", file]);
    fs.unlinkSync(file);
    removed.push(a.name);
  }
  return removed;
}

const MARK = "# jarvis-agent";

function readCrontab() {
  return new Promise((resolve) =>
    execFile("crontab", ["-l"], (err, stdout) => resolve(err ? "" : stdout)));
}

function writeCrontab(text) {
  return new Promise((resolve, reject) => {
    const child = execFile("crontab", ["-"], (err) => (err ? reject(err) : resolve()));
    child.stdin.end(text.endsWith("\n") ? text : text + "\n");
  });
}

async function installCron(agents, root) {
  const existing = (await readCrontab())
    .split("\n")
    .filter((l) => !l.includes(MARK))
    .filter((l) => l.trim() !== "");
  const lines = [];
  for (const a of agents) {
    if (!parseCron(a.schedule)) continue;
    // JARVIS_TRIGGER tells the run ledger this was the scheduler, not a
    // person: the retry-once rule and the doctor's lateness math only apply
    // to scheduled runs
    lines.push(`${a.schedule} cd ${root} && JARVIS_TRIGGER=schedule ${process.execPath} bin/jarvis agent ${a.name} >> ${root}/data/${a.name}.cron.log 2>&1 ${MARK}`);
  }
  await writeCrontab([...existing, ...lines].join("\n"));
  return lines.map((l) => l.split(" ").slice(5, 6).join(""));
}

async function uninstallCron() {
  const existing = (await readCrontab()).split("\n").filter((l) => !l.includes(MARK));
  await writeCrontab(existing.join("\n"));
  return ["all jarvis cron entries"];
}

/* ---------- Windows: Task Scheduler ----------
 *
 * schtasks rather than a .xml definition: the XML route needs a temp file per
 * task and an encoding dance that trips over non-ASCII agent names, while
 * /SC and /ST cover everything a five-field cron expression can express here.
 *
 * Cron's day-of-week is 0-6 with 0 = Sunday; schtasks wants three-letter
 * names, so the mapping is explicit rather than arithmetic.
 */
const WIN_DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function winTaskName(name) {
  return `${LABEL_PREFIX}${name}`;
}

async function installWindows(agents, root) {
  const made = [];
  for (const a of agents) {
    const c = parseCron(a.schedule);
    if (!c) continue;
    const hhmm = `${String(c.hour).padStart(2, "0")}:${String(c.minute).padStart(2, "0")}`;
    // quote the whole command: repo paths on Windows routinely contain spaces
    // cmd /c so the trigger variable can be set for this one command; the
    // same JARVIS_TRIGGER=schedule the plist and the cron line carry
    const cmd = `cmd /c "set JARVIS_TRIGGER=schedule && \"${process.execPath}\" \"${path.join(root, "bin", "jarvis")}\" agent ${a.name}"`;
    const args = ["/Create", "/F", "/TN", winTaskName(a.name), "/TR", cmd, "/ST", hhmm];
    // parseCron gives null for "*", not the literal star. Testing for the
    // string sent every daily agent down the WEEKLY branch with an undefined
    // day name - caught by running it, not by reading it.
    const dow = c.dow;
    if (dow == null || !Number.isInteger(Number(dow))) args.push("/SC", "DAILY");
    else args.push("/SC", "WEEKLY", "/D", WIN_DOW[Number(dow) % 7]);

    const r = await new Promise((resolve) =>
      execFile("schtasks", args, (err, stdout, stderr) =>
        resolve({ ok: !err, msg: String(stderr || stdout || "") })));
    if (r.ok) made.push(a.name);
    else made.push(`${a.name} (failed: ${r.msg.trim().split("\n")[0] || "schtasks error"})`);
  }
  return made;
}

async function uninstallWindows(agents) {
  const gone = [];
  for (const a of agents) {
    await new Promise((resolve) =>
      execFile("schtasks", ["/Delete", "/F", "/TN", winTaskName(a.name)], () => resolve()));
    gone.push(a.name);
  }
  return gone;
}

async function install(cfg, agents) {
  const scheduled = agents.filter((a) => a.enabled && a.schedule);
  if (!scheduled.length) return { platform: process.platform, installed: [] };
  const installed =
    process.platform === "darwin" ? await installMac(scheduled, cfg.paths.root)
    : process.platform === "win32" ? await installWindows(scheduled, cfg.paths.root)
    : await installCron(scheduled, cfg.paths.root);
  return { platform: process.platform, installed };
}

async function uninstall(cfg, agents) {
  const removed =
    process.platform === "darwin" ? await uninstallMac(agents)
    : process.platform === "win32" ? await uninstallWindows(agents)
    : await uninstallCron();
  return { platform: process.platform, removed };
}

/* ---------- keep-alive jobs ----------
 *
 * A second kind of job: not "run at 07:00" but "keep this process running".
 * The Telegram inbox bridge is the one user. launchd gets KeepAlive, cron
 * gets an @reboot line, schtasks gets ONLOGON. The command is always
 * `node bin/jarvis <args>` so the same env loading applies as everywhere.
 *
 * Generation and installation are separate functions on purpose:
 * `jarvis inbox install --show` prints the file without writing it, and the
 * tests read the plist without touching ~/Library. */
const SERVICE_PREFIX = "com.jarvis.";
// Its own mark, not MARK: `jarvis agents install|uninstall` rewrite every
// line carrying MARK, and a keep-alive line must survive that.
const SERVICE_MARK = "# jarvis-service";

function servicePlistPath(name) {
  return path.join(os.homedir(), "Library", "LaunchAgents", `${SERVICE_PREFIX}${name}.plist`);
}

function servicePlistBody(name, args, root, nodeBin) {
  const argv = [nodeBin, path.join(root, "bin", "jarvis"), ...args]
    .map((a) => `    <string>${a}</string>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${SERVICE_PREFIX}${name}</string>
  <key>ProgramArguments</key>
  <array>
${argv}
  </array>
  <key>WorkingDirectory</key><string>${root}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${path.join(os.homedir(), ".local", "bin")}</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>60</integer>
  <key>StandardOutPath</key><string>${path.join(root, "data", `${name}.launchd.log`)}</string>
  <key>StandardErrorPath</key><string>${path.join(root, "data", `${name}.launchd.log`)}</string>
</dict>
</plist>
`;
}

function serviceCronLine(name, args, root) {
  return `@reboot cd ${root} && ${process.execPath} bin/jarvis ${args.join(" ")} >> ${root}/data/${name}.cron.log 2>&1 ${SERVICE_MARK}-${name}`;
}

/* What `install` would write, as text, for the current platform. */
function servicePreview(cfg, name, args) {
  if (process.platform === "darwin")
    return { platform: "launchd", file: servicePlistPath(name), text: servicePlistBody(name, args, cfg.paths.root, process.execPath) };
  if (process.platform === "win32")
    return { platform: "schtasks", file: null,
      text: `schtasks /Create /F /TN ${SERVICE_PREFIX}${name} /SC ONLOGON /TR "\\"${process.execPath}\\" \\"${path.join(cfg.paths.root, "bin", "jarvis")}\\" ${args.join(" ")}"` };
  return { platform: "cron", file: null, text: serviceCronLine(name, args, cfg.paths.root) };
}

async function installService(cfg, name, args) {
  const p = servicePreview(cfg, name, args);
  if (process.platform === "darwin") {
    fs.mkdirSync(path.dirname(p.file), { recursive: true });
    fs.writeFileSync(p.file, p.text);
    await launchctl(["unload", p.file]);
    await launchctl(["load", p.file]);
    return p;
  }
  if (process.platform === "win32") {
    const cmd = `"${process.execPath}" "${path.join(cfg.paths.root, "bin", "jarvis")}" ${args.join(" ")}`;
    await new Promise((resolve) =>
      execFile("schtasks", ["/Create", "/F", "/TN", `${SERVICE_PREFIX}${name}`, "/SC", "ONLOGON", "/TR", cmd], () => resolve()));
    return p;
  }
  const tag = `${SERVICE_MARK}-${name}`;
  const existing = (await readCrontab()).split("\n").filter((l) => !l.includes(tag)).filter((l) => l.trim() !== "");
  await writeCrontab([...existing, p.text].join("\n"));
  return p;
}

async function uninstallService(cfg, name) {
  if (process.platform === "darwin") {
    const file = servicePlistPath(name);
    if (!fs.existsSync(file)) return false;
    await launchctl(["unload", file]);
    fs.unlinkSync(file);
    return true;
  }
  if (process.platform === "win32") {
    await new Promise((resolve) =>
      execFile("schtasks", ["/Delete", "/F", "/TN", `${SERVICE_PREFIX}${name}`], () => resolve()));
    return true;
  }
  const tag = `${SERVICE_MARK}-${name}`;
  const all = (await readCrontab()).split("\n");
  const kept = all.filter((l) => !l.includes(tag));
  if (kept.length === all.length) return false;
  await writeCrontab(kept.join("\n"));
  return true;
}

/* Is the keep-alive job present on this platform. Reads the OS, not a
 * config flag, for the reason doctor reads the run ledger: the file can
 * exist while the job is unloaded. */
async function serviceInstalled(name) {
  if (process.platform === "darwin") {
    if (!fs.existsSync(servicePlistPath(name))) return false;
    return new Promise((resolve) =>
      execFile("launchctl", ["list"], (err, stdout) => resolve(!err && String(stdout).includes(`${SERVICE_PREFIX}${name}`))));
  }
  if (process.platform === "win32") {
    return new Promise((resolve) =>
      execFile("schtasks", ["/Query", "/TN", `${SERVICE_PREFIX}${name}`], (err) => resolve(!err)));
  }
  return (await readCrontab()).includes(`${SERVICE_MARK}-${name}`);
}

module.exports = { install, uninstall, parseCron, LABEL_PREFIX, MARK,
  servicePreview, installService, uninstallService, serviceInstalled, SERVICE_PREFIX };
