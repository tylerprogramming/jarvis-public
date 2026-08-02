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
    lines.push(`${a.schedule} cd ${root} && ${process.execPath} bin/jarvis agent ${a.name} >> ${root}/data/${a.name}.cron.log 2>&1 ${MARK}`);
  }
  await writeCrontab([...existing, ...lines].join("\n"));
  return lines.map((l) => l.split(" ").slice(5, 6).join(""));
}

async function uninstallCron() {
  const existing = (await readCrontab()).split("\n").filter((l) => !l.includes(MARK));
  await writeCrontab(existing.join("\n"));
  return ["all jarvis cron entries"];
}

async function install(cfg, agents) {
  const scheduled = agents.filter((a) => a.enabled && a.schedule);
  if (!scheduled.length) return { platform: process.platform, installed: [] };
  const installed =
    process.platform === "darwin"
      ? await installMac(scheduled, cfg.paths.root)
      : await installCron(scheduled, cfg.paths.root);
  return { platform: process.platform, installed };
}

async function uninstall(cfg, agents) {
  const removed =
    process.platform === "darwin" ? await uninstallMac(agents) : await uninstallCron();
  return { platform: process.platform, removed };
}

module.exports = { install, uninstall, parseCron, LABEL_PREFIX };
