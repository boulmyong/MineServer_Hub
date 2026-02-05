import express from "express";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import https from "https";

const app = express();
const PORT = 3030;
const HOST = "127.0.0.1";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data");
const CONFIG_PATH = path.join(DATA_DIR, "app-config.json");
const USER_AGENT = "minecraft-server-ui/0.1 (contact: local@localhost)";
const uuidCache = new Map();

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(ROOT, "public")));

let serverProc = null;
let serverPid = null;
let logBuffer = [];
let sseClients = new Set();

function defaultConfig() {
  return {
    serverDir: "./server",
    jar: "server.jar",
    memory: { xms: "1G", xmx: "2G" },
    nogui: true,
    logLines: 500,
    serverType: null,
    serverVersion: null,
    serverBuild: null,
  };
}

function readTextFile(filePath) {
  const raw = fs.readFileSync(filePath);
  let text = raw.toString("utf8");
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }
  return text;
}

function loadConfig() {
  try {
    const raw = readTextFile(CONFIG_PATH);
    return JSON.parse(raw);
  } catch {
    const fallback = defaultConfig();
    saveConfig(fallback);
    return fallback;
  }
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf8");
}

function serverPaths(cfg) {
  const serverDir = path.resolve(ROOT, cfg.serverDir || "./server");
  const jarPath = path.join(serverDir, cfg.jar || "server.jar");
  const propsPath = path.join(serverDir, "server.properties");
  const logPath = path.join(serverDir, "logs", "latest.log");
  const eulaPath = path.join(serverDir, "eula.txt");
  const whitelistPath = path.join(serverDir, "whitelist.json");
  const bannedPlayersPath = path.join(serverDir, "banned-players.json");
  const bannedIpsPath = path.join(serverDir, "banned-ips.json");
  const opsPath = path.join(serverDir, "ops.json");
  return {
    serverDir,
    jarPath,
    propsPath,
    logPath,
    eulaPath,
    whitelistPath,
    bannedPlayersPath,
    bannedIpsPath,
    opsPath,
  };
}

function pushLog(line) {
  if (!line) return;
  logBuffer.push(line);
  const max = loadConfig().logLines || 500;
  if (logBuffer.length > max) {
    logBuffer = logBuffer.slice(logBuffer.length - max);
  }
  for (const res of sseClients) {
    res.write(`data: ${JSON.stringify({ line })}\n\n`);
  }
}

function pushSystemLog(line) {
  pushLog(`[UI] ${line}`);
}

function readAllLines(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  return lines.filter((l) => l.length > 0);
}

function tailLines(filePath, count) {
  const lines = readAllLines(filePath);
  if (lines.length <= count) return lines;
  return lines.slice(lines.length - count);
}

function getLocalIps() {
  const nets = os.networkInterfaces();
  const results = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal) {
        results.push(net.address);
      }
    }
  }
  return results;
}

function parseVersionFromLog(logPath) {
  const lines = tailLines(logPath, 200);
  for (const line of lines) {
    const match = line.match(/Starting minecraft server version ([0-9.]+)/i);
    if (match) return match[1];
  }
  return null;
}

function fetchExternalIp() {
  return new Promise((resolve) => {
    https
      .get("https://api.ipify.org?format=json", { headers: { "User-Agent": USER_AGENT } }, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            resolve(json.ip || null);
          } catch {
            resolve(null);
          }
        });
      })
      .on("error", () => resolve(null));
  });
}

function parseProperties(content) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const entries = [];

  for (const line of lines) {
    if (line.trim().length === 0) {
      entries.push({ type: "blank", raw: line });
      continue;
    }
    if (line.trim().startsWith("#")) {
      entries.push({ type: "comment", raw: line });
      continue;
    }
    const idx = line.indexOf("=");
    if (idx === -1) {
      entries.push({ type: "other", raw: line });
      continue;
    }
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    entries.push({ type: "pair", key, value, raw: line });
  }

  return entries;
}

function buildProperties(entries, values) {
  return entries
    .map((e) => {
      if (e.type !== "pair") return e.raw;
      const v = values[e.key];
      if (typeof v === "string") return `${e.key}=${v}`;
      return e.raw;
    })
    .join(os.EOL);
}

function loadProperties(propsPath) {
  if (!fs.existsSync(propsPath)) return { entries: [], values: {} };
  const raw = fs.readFileSync(propsPath, "utf8");
  const entries = parseProperties(raw);
  const values = {};
  for (const e of entries) {
    if (e.type === "pair") values[e.key] = e.value;
  }
  return { entries, values };
}

function saveProperties(propsPath, entries, values) {
  const text = buildProperties(entries, values);
  fs.writeFileSync(propsPath, text, "utf8");
}

function readJsonArray(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const raw = readTextFile(filePath);
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeJsonArray(filePath, value) {
  if (!Array.isArray(value)) throw new Error("Not an array");
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readEula(eulaPath) {
  if (!fs.existsSync(eulaPath)) return false;
  const raw = fs.readFileSync(eulaPath, "utf8");
  const match = raw.match(/eula\s*=\s*(true|false)/i);
  return match ? match[1].toLowerCase() === "true" : false;
}

function writeEula(eulaPath, accepted) {
  const content = `# Generated by minecraft-server-ui\n# https://aka.ms/MinecraftEULA\n\neula=${accepted ? "true" : "false"}\n`;
  fs.writeFileSync(eulaPath, content, "utf8");
}

function fetchJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      { headers: { "User-Agent": USER_AGENT, ...headers } },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data));
            } catch (err) {
              reject(err);
            }
            return;
          }
          reject(new Error(`HTTP ${res.statusCode}`));
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

function downloadFile(url, destPath, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      { headers: { "User-Agent": USER_AGENT, ...headers } },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          downloadFile(res.headers.location, destPath, headers).then(resolve).catch(reject);
          return;
        }
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`Download failed (${res.statusCode})`));
          return;
        }
        const file = fs.createWriteStream(destPath);
        res.pipe(file);
        file.on("finish", () => file.close(resolve));
        file.on("error", reject);
      }
    );
    request.on("error", reject);
  });
}

async function fetchUuidByName(name) {
  const key = name.toLowerCase();
  if (uuidCache.has(key)) return uuidCache.get(key);
  const url = `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`;
  return new Promise((resolve, reject) => {
    const req = https.request(url, { headers: { "User-Agent": USER_AGENT } }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode === 204) return resolve(null);
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        try {
          const json = JSON.parse(data);
          const uuid = json?.id || null;
          if (uuid) uuidCache.set(key, uuid);
          resolve(uuid);
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

async function getVanillaVersions() {
  const manifestUrl = "https://piston-meta.mojang.com/mc/game/version_manifest.json";
  const manifest = await fetchJson(manifestUrl);
  const versions = (manifest.versions || [])
    .filter((v) => v.type === "release")
    .map((v) => v.id);
  return { versions, latest: manifest.latest?.release };
}

async function getVanillaServerUrl(version) {
  const manifestUrl = "https://piston-meta.mojang.com/mc/game/version_manifest.json";
  const manifest = await fetchJson(manifestUrl);
  const entry = (manifest.versions || []).find((v) => v.id === version);
  if (!entry?.url) throw new Error("Version not found");
  const detail = await fetchJson(entry.url);
  return detail?.downloads?.server?.url;
}

function sortVersions(list) {
  return list.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

async function getPaperVersions() {
  const data = await fetchJson("https://api.papermc.io/v2/projects/paper");
  const versions = sortVersions(data?.versions || []);
  return { versions, latest: versions[versions.length - 1] };
}

async function getPaperBuilds(version) {
  const data = await fetchJson(`https://api.papermc.io/v2/projects/paper/versions/${version}`);
  const builds = data?.builds || [];
  return builds;
}

async function getPaperDownloadUrl(version, build) {
  const buildData = await fetchJson(
    `https://api.papermc.io/v2/projects/paper/versions/${version}/builds/${build}`
  );
  const downloadName = buildData?.downloads?.application?.name;
  if (!downloadName) throw new Error("Download not found");
  return `https://api.papermc.io/v2/projects/paper/versions/${version}/builds/${build}/downloads/${downloadName}`;
}

function isRunning() {
  return !!serverProc && !serverProc.killed;
}

function sendStopSignal() {
  if (!serverProc) return;
  try {
    serverProc.stdin.write("stop\n");
  } catch {
    // ignore
  }
}

function sendCommand(cmd) {
  if (!serverProc) return false;
  try {
    serverProc.stdin.write(cmd.trim() + "\n");
    return true;
  } catch {
    return false;
  }
}

function hardKillAfter(ms) {
  setTimeout(() => {
    if (serverProc && !serverProc.killed) {
      serverProc.kill("SIGKILL");
    }
  }, ms);
}

function isSafeToDelete(dir) {
  const resolved = path.resolve(dir);
  const root = path.resolve(ROOT);
  if (!resolved.startsWith(root)) return false;
  const base = path.basename(resolved).toLowerCase();
  return base === "server";
}

app.get("/api/status", (req, res) => {
  res.json({
    running: isRunning(),
    pid: serverPid,
  });
});

app.get("/api/info", async (req, res) => {
  const cfg = loadConfig();
  const { logPath, propsPath } = serverPaths(cfg);
  const { values } = loadProperties(propsPath);
  const externalIp = await fetchExternalIp();
  const logVersion = parseVersionFromLog(logPath);
  res.json({
    host: HOST,
    port: PORT,
    serverPort: values["server-port"] || 25565,
    localIps: getLocalIps(),
    externalIp,
    configuredVersion: cfg.serverVersion || null,
    runningVersion: logVersion,
  });
});

app.get("/api/setup/status", (req, res) => {
  const cfg = loadConfig();
  const { serverDir, jarPath, eulaPath } = serverPaths(cfg);
  res.json({
    missingJar: !fs.existsSync(jarPath),
    eulaAccepted: readEula(eulaPath),
    serverDir,
    jarPath,
    serverType: cfg.serverType || null,
    serverVersion: cfg.serverVersion || null,
    serverBuild: cfg.serverBuild || null,
  });
});

app.get("/api/server/versions", async (req, res) => {
  try {
    const type = (req.query.type || "").toString();
    if (type === "vanilla") return res.json(await getVanillaVersions());
    if (type === "paper") return res.json(await getPaperVersions());
    return res.status(400).json({ error: "Unknown server type" });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch versions" });
  }
});

app.get("/api/server/builds", async (req, res) => {
  try {
    const type = (req.query.type || "").toString();
    const version = (req.query.version || "").toString();
    if (type !== "paper") return res.status(400).json({ error: "Builds only for paper" });
    const builds = await getPaperBuilds(version);
    return res.json({ builds });
  } catch {
    return res.status(500).json({ error: "Failed to fetch builds" });
  }
});

app.get("/api/lists", (req, res) => {
  const cfg = loadConfig();
  const { whitelistPath, bannedPlayersPath, bannedIpsPath, opsPath } = serverPaths(cfg);
  res.json({
    whitelist: readJsonArray(whitelistPath),
    bannedPlayers: readJsonArray(bannedPlayersPath),
    bannedIps: readJsonArray(bannedIpsPath),
    ops: readJsonArray(opsPath),
  });
});

app.post("/api/lists", (req, res) => {
  const cfg = loadConfig();
  const { whitelistPath, bannedPlayersPath, bannedIpsPath, opsPath } = serverPaths(cfg);
  const { whitelist, bannedPlayers, bannedIps, ops } = req.body || {};
  try {
    if (whitelist) writeJsonArray(whitelistPath, whitelist);
    if (bannedPlayers) writeJsonArray(bannedPlayersPath, bannedPlayers);
    if (bannedIps) writeJsonArray(bannedIpsPath, bannedIps);
    if (ops) writeJsonArray(opsPath, ops);
    return res.json({ ok: true });
  } catch {
    return res.status(400).json({ error: "Invalid list format (must be JSON array)" });
  }
});

app.get("/api/uuid", async (req, res) => {
  const name = (req.query.name || "").toString().trim();
  if (!name) return res.status(400).json({ error: "name required" });
  try {
    const uuid = await fetchUuidByName(name);
    if (!uuid) return res.status(404).json({ error: "not found" });
    return res.json({ uuid });
  } catch {
    return res.status(500).json({ error: "lookup failed" });
  }
});

app.post("/api/server/install", async (req, res) => {
  const cfg = loadConfig();
  const { type, version, build, acceptEula } = req.body || {};
  const { serverDir, jarPath, eulaPath } = serverPaths(cfg);
  if (!type || !version) return res.status(400).json({ error: "type and version required" });

  try {
    ensureDir(serverDir);

    let downloadUrl = "";
    let selectedBuild = build;

    if (type === "vanilla") {
      downloadUrl = await getVanillaServerUrl(version);
    } else if (type === "paper") {
      if (!selectedBuild) {
        const builds = await getPaperBuilds(version);
        selectedBuild = builds[builds.length - 1];
      }
      downloadUrl = await getPaperDownloadUrl(version, selectedBuild);
    } else {
      return res.status(400).json({ error: "Unknown server type" });
    }

    if (!downloadUrl) return res.status(400).json({ error: "Download URL not found" });

    pushSystemLog(`Downloading ${type} ${version}...`);
    await downloadFile(downloadUrl, jarPath);
    pushSystemLog("Download completed.");

    saveConfig({
      ...cfg,
      serverType: type,
      serverVersion: version,
      serverBuild: selectedBuild || null,
    });

    if (acceptEula) {
      writeEula(eulaPath, true);
    }

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Download failed" });
  }
});

app.get("/api/config", (req, res) => {
  const cfg = loadConfig();
  const { propsPath } = serverPaths(cfg);
  const { values } = loadProperties(propsPath);
  res.json({
    app: cfg,
    properties: values,
  });
});

app.post("/api/config", (req, res) => {
  const cfg = loadConfig();
  const { app: appCfg, properties } = req.body || {};
  if (appCfg) {
    const merged = {
      ...cfg,
      ...appCfg,
      memory: {
        ...cfg.memory,
        ...(appCfg.memory || {}),
      },
    };
    saveConfig(merged);
  }

  const nextCfg = loadConfig();
  const { propsPath } = serverPaths(nextCfg);
  if (properties && typeof properties === "object") {
    const { entries } = loadProperties(propsPath);
    if (entries.length === 0) {
      return res.status(400).json({ error: "server.properties not found" });
    }
    saveProperties(propsPath, entries, properties);
  }

  res.json({ ok: true });
});

app.post("/api/start", (req, res) => {
  if (isRunning()) return res.json({ ok: true, running: true });

  const cfg = loadConfig();
  const { serverDir, jarPath, logPath, eulaPath } = serverPaths(cfg);

  if (!fs.existsSync(jarPath)) {
    return res.status(400).json({ error: "server.jar not found", code: "JAR_MISSING" });
  }

  if (!readEula(eulaPath)) {
    return res.status(400).json({ error: "EULA not accepted", code: "EULA_REQUIRED" });
  }

  const mem = cfg.memory || { xms: "1G", xmx: "2G" };
  const args = [];
  if (mem.xms) args.push(`-Xms${mem.xms}`);
  if (mem.xmx) args.push(`-Xmx${mem.xmx}`);
  args.push("-jar", jarPath);
  if (cfg.nogui) args.push("nogui");

  serverProc = spawn("java", args, {
    cwd: serverDir,
    stdio: ["pipe", "pipe", "pipe"],
  });

  serverPid = serverProc.pid;
  logBuffer = [];

  pushSystemLog("Server starting...");

  serverProc.stdout.on("data", (data) => {
    const text = data.toString("utf8");
    text.split(/\r?\n/).forEach((line) => pushLog(line));
  });

  serverProc.stderr.on("data", (data) => {
    const text = data.toString("utf8");
    text.split(/\r?\n/).forEach((line) => pushLog(line));
  });

  serverProc.on("close", (code) => {
    pushSystemLog(`Server stopped (code ${code}).`);
    serverProc = null;
    serverPid = null;

    // preload latest log lines for reconnect
    const tail = tailLines(logPath, cfg.logLines || 500);
    for (const line of tail) pushLog(line);
  });

  res.json({ ok: true, running: true });
});

app.post("/api/stop", (req, res) => {
  if (!isRunning()) return res.json({ ok: true, running: false });
  pushSystemLog("Stopping server...");
  sendStopSignal();
  hardKillAfter(10000);
  res.json({ ok: true, running: false });
});

app.post("/api/command", (req, res) => {
  if (!isRunning()) return res.status(400).json({ error: "Server not running" });
  const { command } = req.body || {};
  if (!command || typeof command !== "string") {
    return res.status(400).json({ error: "command required" });
  }
  const ok = sendCommand(command);
  if (!ok) return res.status(500).json({ error: "Command failed" });
  return res.json({ ok: true });
});

app.post("/api/server/delete", async (req, res) => {
  const cfg = loadConfig();
  const { serverDir } = serverPaths(cfg);
  if (!isSafeToDelete(serverDir)) {
    return res.status(400).json({ error: "Unsafe delete path" });
  }

  try {
    if (isRunning()) {
      pushSystemLog("Stopping server for delete...");
      sendStopSignal();
      hardKillAfter(5000);
      await new Promise((r) => setTimeout(r, 1500));
    }

    fs.rmSync(serverDir, { recursive: true, force: true });
    pushSystemLog("Server folder deleted.");
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ error: "Delete failed" });
  }
});

app.get("/api/logs", (req, res) => {
  const cfg = loadConfig();
  const { logPath } = serverPaths(cfg);
  const tail = tailLines(logPath, cfg.logLines || 500);
  res.json({ lines: tail });
});

app.get("/api/logs/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  sseClients.add(res);

  req.on("close", () => {
    sseClients.delete(res);
  });
});

app.listen(PORT, HOST, () => {
  console.log(`UI running at http://${HOST}:${PORT}`);
});
