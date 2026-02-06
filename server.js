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
const PLUGIN_EXT = ".jar";
const DISABLED_EXT = ".disabled";
const MODRINTH_BASE = "https://api.modrinth.com/v2";

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
    theme: "dark",
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
  ensureDir(DATA_DIR);
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf8");
}

function serverPaths(cfg) {
  const serverDir = path.resolve(ROOT, cfg.serverDir || "./server");
  const jarPath = path.join(serverDir, cfg.jar || "server.jar");
  const propsPath = path.join(serverDir, "server.properties");
  const logPath = path.join(serverDir, "logs", "latest.log");
  const eulaPath = path.join(serverDir, "eula.txt");
  const pluginsDir = path.join(serverDir, "plugins");
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
    pluginsDir,
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

function isPluginFileName(name) {
  const lower = name.toLowerCase();
  return lower.endsWith(PLUGIN_EXT) || lower.endsWith(`${PLUGIN_EXT}${DISABLED_EXT}`);
}

function sanitizeFileName(name) {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\s+/g, "_")
    .slice(0, 180);
}

function resolvePluginPath(pluginsDir, fileName) {
  const safeName = path.basename(fileName || "");
  if (!safeName || safeName !== fileName) return null;
  const full = path.join(pluginsDir, safeName);
  const resolved = path.resolve(full);
  const base = path.resolve(pluginsDir);
  if (!resolved.startsWith(base)) return null;
  return full;
}

function uniqueFileName(dir, baseName) {
  let name = baseName;
  const ext = path.extname(baseName);
  const stem = baseName.slice(0, baseName.length - ext.length);
  let idx = 1;
  while (fs.existsSync(path.join(dir, name))) {
    name = `${stem}-${idx}${ext}`;
    idx += 1;
  }
  return name;
}

function parsePluginEntry(fileName) {
  const lower = fileName.toLowerCase();
  let enabled = true;
  let displayName = fileName;
  if (lower.endsWith(`${PLUGIN_EXT}${DISABLED_EXT}`)) {
    enabled = false;
    displayName = fileName.slice(0, -DISABLED_EXT.length);
  }
  return { fileName, displayName, enabled };
}

function toInt(value, fallback) {
  const n = Number(value);
  if (Number.isFinite(n)) return Math.floor(n);
  return fallback;
}

function pickPluginFile(files = []) {
  if (!Array.isArray(files) || files.length === 0) return null;
  const primary = files.find((f) => f?.primary);
  const list = primary ? [primary, ...files.filter((f) => f !== primary)] : files;
  for (const file of list) {
    if (!file?.url || !file?.filename) continue;
    if (file.filename.toLowerCase().endsWith(PLUGIN_EXT)) return file;
  }
  return null;
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

app.get("/api/plugins", (req, res) => {
  const cfg = loadConfig();
  const { pluginsDir } = serverPaths(cfg);
  if (!fs.existsSync(pluginsDir)) {
    return res.json({ plugins: [], path: pluginsDir, exists: false });
  }

  const plugins = fs
    .readdirSync(pluginsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => isPluginFileName(name))
    .map((name) => {
      const entry = parsePluginEntry(name);
      const stat = fs.statSync(path.join(pluginsDir, name));
      return {
        ...entry,
        size: stat.size,
        modified: stat.mtimeMs,
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  return res.json({ plugins, path: pluginsDir, exists: true });
});

app.post("/api/plugins/disable", (req, res) => {
  const cfg = loadConfig();
  const { pluginsDir } = serverPaths(cfg);
  const { fileName } = req.body || {};
  if (!fileName || typeof fileName !== "string") {
    return res.status(400).json({ error: "fileName required" });
  }
  if (!fileName.toLowerCase().endsWith(PLUGIN_EXT)) {
    return res.status(400).json({ error: "Only .jar can be disabled" });
  }
  const src = resolvePluginPath(pluginsDir, fileName);
  if (!src || !fs.existsSync(src)) {
    return res.status(404).json({ error: "Plugin not found" });
  }
  const targetName = `${fileName}${DISABLED_EXT}`;
  const dest = resolvePluginPath(pluginsDir, targetName);
  if (!dest) return res.status(400).json({ error: "Invalid file name" });
  if (fs.existsSync(dest)) {
    return res.status(409).json({ error: "Disabled file already exists" });
  }
  fs.renameSync(src, dest);
  return res.json({ ok: true, fileName: targetName });
});

app.post("/api/plugins/enable", (req, res) => {
  const cfg = loadConfig();
  const { pluginsDir } = serverPaths(cfg);
  const { fileName } = req.body || {};
  if (!fileName || typeof fileName !== "string") {
    return res.status(400).json({ error: "fileName required" });
  }
  if (!fileName.toLowerCase().endsWith(`${PLUGIN_EXT}${DISABLED_EXT}`)) {
    return res.status(400).json({ error: "Only .jar.disabled can be enabled" });
  }
  const src = resolvePluginPath(pluginsDir, fileName);
  if (!src || !fs.existsSync(src)) {
    return res.status(404).json({ error: "Plugin not found" });
  }
  const targetName = fileName.slice(0, -DISABLED_EXT.length);
  const dest = resolvePluginPath(pluginsDir, targetName);
  if (!dest) return res.status(400).json({ error: "Invalid file name" });
  if (fs.existsSync(dest)) {
    return res.status(409).json({ error: "Enabled file already exists" });
  }
  fs.renameSync(src, dest);
  return res.json({ ok: true, fileName: targetName });
});

app.post("/api/plugins/delete", (req, res) => {
  const cfg = loadConfig();
  const { pluginsDir } = serverPaths(cfg);
  const { fileName } = req.body || {};
  if (!fileName || typeof fileName !== "string") {
    return res.status(400).json({ error: "fileName required" });
  }
  if (!isPluginFileName(fileName)) {
    return res.status(400).json({ error: "Invalid plugin file" });
  }
  const target = resolvePluginPath(pluginsDir, fileName);
  if (!target || !fs.existsSync(target)) {
    return res.status(404).json({ error: "Plugin not found" });
  }
  fs.unlinkSync(target);
  return res.json({ ok: true });
});

app.post("/api/plugins/install/url", async (req, res) => {
  const cfg = loadConfig();
  const { pluginsDir } = serverPaths(cfg);
  const { url } = req.body || {};
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "url required" });
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).json({ error: "Invalid URL" });
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    return res.status(400).json({ error: "Only http/https allowed" });
  }

  ensureDir(pluginsDir);
  let baseName = path.basename(parsed.pathname) || `plugin-${Date.now()}${PLUGIN_EXT}`;
  if (!baseName.toLowerCase().endsWith(PLUGIN_EXT)) {
    baseName = `plugin-${Date.now()}${PLUGIN_EXT}`;
  }
  baseName = sanitizeFileName(baseName);
  const finalName = uniqueFileName(pluginsDir, baseName);
  const dest = path.join(pluginsDir, finalName);

  try {
    await downloadFile(url, dest);
    return res.json({ ok: true, fileName: finalName });
  } catch {
    return res.status(500).json({ error: "Download failed" });
  }
});

app.post("/api/plugins/install/local", (req, res) => {
  const cfg = loadConfig();
  const { pluginsDir } = serverPaths(cfg);
  const { path: srcPath } = req.body || {};
  if (!srcPath || typeof srcPath !== "string") {
    return res.status(400).json({ error: "path required" });
  }
  const resolved = path.isAbsolute(srcPath) ? srcPath : path.resolve(ROOT, srcPath);
  if (!fs.existsSync(resolved)) {
    return res.status(404).json({ error: "File not found" });
  }
  if (!resolved.toLowerCase().endsWith(PLUGIN_EXT)) {
    return res.status(400).json({ error: "Only .jar files allowed" });
  }

  ensureDir(pluginsDir);
  const baseName = sanitizeFileName(path.basename(resolved));
  const finalName = uniqueFileName(pluginsDir, baseName);
  const dest = path.join(pluginsDir, finalName);

  try {
    fs.copyFileSync(resolved, dest);
    return res.json({ ok: true, fileName: finalName });
  } catch {
    return res.status(500).json({ error: "Copy failed" });
  }
});

app.get("/api/modrinth/versions", async (req, res) => {
  try {
    const data = await fetchJson(`${MODRINTH_BASE}/tag/game_version`);
    const list = Array.isArray(data) ? data : [];
    const releases = list.filter((entry) => entry?.version_type === "release");
    return res.json({ versions: releases.map((entry) => entry.version) });
  } catch {
    return res.status(500).json({ error: "Failed to fetch versions" });
  }
});

app.get("/api/modrinth/search", async (req, res) => {
  try {
    const query = (req.query.query || "").toString();
    const loader = (req.query.loader || "").toString().trim();
    const version = (req.query.version || "").toString().trim();
    const serverSide = (req.query.serverSide || "").toString().trim();
    const index = (req.query.sort || "downloads").toString();
    const offset = Math.max(0, toInt(req.query.offset, 0));
    const limit = Math.min(20, Math.max(1, toInt(req.query.limit, 10)));

    const facets = [];
    if (loader) facets.push([`categories:${loader}`]);
    if (version) facets.push([`versions:${version}`]);
    if (serverSide) facets.push([`server_side:${serverSide}`]);

    const params = new URLSearchParams();
    if (query) params.set("query", query);
    params.set("index", index);
    params.set("offset", String(offset));
    params.set("limit", String(limit));
    if (facets.length > 0) params.set("facets", JSON.stringify(facets));

    const url = `${MODRINTH_BASE}/search?${params.toString()}`;
    const data = await fetchJson(url);
    const hits = Array.isArray(data?.hits) ? data.hits : [];
    return res.json({
      total: data?.total_hits || 0,
      offset: data?.offset || offset,
      limit: data?.limit || limit,
      hits: hits.map((hit) => ({
        project_id: hit.project_id,
        slug: hit.slug,
        title: hit.title,
        description: hit.description,
        downloads: hit.downloads,
        icon_url: hit.icon_url,
        categories: hit.categories || [],
        server_side: hit.server_side,
        client_side: hit.client_side,
        date_modified: hit.date_modified,
      })),
    });
  } catch {
    return res.status(500).json({ error: "Failed to search Modrinth" });
  }
});

app.post("/api/modrinth/install", async (req, res) => {
  const cfg = loadConfig();
  const { pluginsDir } = serverPaths(cfg);
  const { projectId, loader, version } = req.body || {};
  if (!projectId || typeof projectId !== "string") {
    return res.status(400).json({ error: "projectId required" });
  }

  const params = new URLSearchParams();
  if (loader) params.set("loaders", JSON.stringify([loader]));
  if (version) params.set("game_versions", JSON.stringify([version]));
  params.set("limit", "20");

  try {
    const url = `${MODRINTH_BASE}/project/${encodeURIComponent(projectId)}/version?${params.toString()}`;
    const versions = await fetchJson(url);
    if (!Array.isArray(versions) || versions.length === 0) {
      return res.status(404).json({ error: "No compatible versions found" });
    }

    const selected = versions[0];
    const file = pickPluginFile(selected?.files || []);
    if (!file) {
      return res.status(404).json({ error: "No downloadable jar found" });
    }

    ensureDir(pluginsDir);
    const baseName = sanitizeFileName(file.filename);
    const finalName = uniqueFileName(pluginsDir, baseName);
    const dest = path.join(pluginsDir, finalName);

    await downloadFile(file.url, dest);
    return res.json({
      ok: true,
      fileName: finalName,
      versionName: selected?.name || selected?.version_number || null,
    });
  } catch {
    return res.status(500).json({ error: "Install failed" });
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
