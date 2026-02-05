const statusEl = document.getElementById("status");
const pidEl = document.getElementById("pid");
const statusLargeEl = document.getElementById("statusLarge");
const pidLargeEl = document.getElementById("pidLarge");
const statusDot = document.getElementById("statusDot");
const logEl = document.getElementById("log");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const deleteBtn = document.getElementById("deleteBtn");
const saveAppBtn = document.getElementById("saveAppBtn");
const savePropsBtn = document.getElementById("savePropsBtn");
const propsEl = document.getElementById("props");
const xmsEl = document.getElementById("xms");
const xmxEl = document.getElementById("xmx");
const logLinesEl = document.getElementById("logLines");
const localConnectEl = document.getElementById("localConnect");
const externalIpEl = document.getElementById("externalIp");
const serverVersionEl = document.getElementById("serverVersion");
const localIpsEl = document.getElementById("localIps");
const toastHost = document.getElementById("toastHost");
const commandInput = document.getElementById("commandInput");
const sendCommandBtn = document.getElementById("sendCommandBtn");

const whitelistList = document.getElementById("whitelistList");
const bannedPlayersList = document.getElementById("bannedPlayersList");
const bannedIpsList = document.getElementById("bannedIpsList");
const opsList = document.getElementById("opsList");

const addWhitelistRow = document.getElementById("addWhitelistRow");
const addBannedPlayersRow = document.getElementById("addBannedPlayersRow");
const addBannedIpsRow = document.getElementById("addBannedIpsRow");
const addOpsRow = document.getElementById("addOpsRow");

const saveWhitelistBtn = document.getElementById("saveWhitelistBtn");
const saveBannedPlayersBtn = document.getElementById("saveBannedPlayersBtn");
const saveBannedIpsBtn = document.getElementById("saveBannedIpsBtn");
const saveOpsBtn = document.getElementById("saveOpsBtn");

const setupCard = document.getElementById("setupCard");
const serverTypeSelect = document.getElementById("serverTypeSelect");
const serverVersionSelect = document.getElementById("serverVersionSelect");
const serverBuildSelect = document.getElementById("serverBuildSelect");
const buildRow = document.getElementById("buildRow");
const installBtn = document.getElementById("installBtn");
const installStatus = document.getElementById("installStatus");
const eulaCheck = document.getElementById("eulaCheck");
const themeToggle = document.getElementById("themeToggle");

const logLinesMax = 500;
let logLines = [];
let autoStartAfterInstall = false;
let serverRunning = false;

function toast(message, type = "info", ms = 2200) {
  if (!toastHost) return;
  const el = document.createElement("div");
  el.className = "toast " + type;
  el.textContent = message;
  toastHost.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateY(-4px)";
    el.style.transition = "160ms ease";
    setTimeout(() => el.remove(), 180);
  }, ms);
}
const propHints = {
  "accepts-transfers": { desc: "다른 서버에서 이 서버로 플레이어를 이동(transfer)시키는 요청을 허용할지 정하는 설정입니다.", example: "true/false" },
  "allow-flight": { desc: "플레이어가 비행할 수 있게 할지 여부입니다. 허용하지 않으면 비행이 감지될 때 킥될 수 있습니다.", example: "true/false" },
  "broadcast-console-to-ops": { desc: "콘솔에서 실행된 명령어 로그를 OP에게 보여줄지 설정합니다.", example: "true/false" },
  "broadcast-rcon-to-ops": { desc: "RCON으로 실행된 명령어 로그를 OP에게 보여줄지 설정합니다.", example: "true/false" },
  "bug-report-link": { desc: "클라이언트에 노출될 버그 신고 링크를 지정합니다.", example: "https://example.com" },
  "difficulty": { desc: "서버 기본 난이도를 지정합니다. 월드에 적용되는 몹 난이도와 전투 난이도에 영향을 줍니다.", example: "peaceful/easy/normal/hard" },
  "enable-code-of-conduct": { desc: "접속 시 행동 강령(Code of Conduct) 화면을 표시할지 결정합니다.", example: "true/false" },
  "enable-jmx-monitoring": { desc: "JMX 모니터링을 활성화할지 여부입니다. 서버 성능 모니터링용입니다.", example: "true/false" },
  "enable-query": { desc: "게임 서버 쿼리 프로토콜 사용 여부입니다. 서버 상태를 외부에서 질의할 때 사용됩니다.", example: "true/false" },
  "enable-rcon": { desc: "RCON 원격 콘솔 접속을 허용할지 설정합니다.", example: "true/false" },
  "enable-status": { desc: "서버 상태 정보(핑/아이콘/플레이어 수) 응답을 켤지 설정합니다.", example: "true/false" },
  "enforce-secure-profile": { desc: "보안 프로필(서명된 채팅)을 강제할지 설정합니다.", example: "true/false" },
  "enforce-whitelist": { desc: "화이트리스트가 켜져 있을 때 반드시 목록에 있어야만 접속되도록 강제합니다.", example: "true/false" },
  "entity-broadcast-range-percentage": { desc: "엔티티 정보를 플레이어에게 전송하는 범위를 기본값의 몇 %로 쓸지 설정합니다.", example: "100" },
  "force-gamemode": { desc: "플레이어가 접속할 때 지정된 게임모드로 강제로 변경할지 설정합니다.", example: "true/false" },
  "function-permission-level": { desc: "데이터팩 함수가 실행할 수 있는 명령 권한 레벨을 설정합니다.", example: "2" },
  "gamemode": { desc: "새로 접속하는 플레이어의 기본 게임모드를 지정합니다.", example: "survival/creative/adventure/spectator" },
  "generate-structures": { desc: "마을, 요새 등 구조물 생성 여부를 설정합니다.", example: "true/false" },
  "generator-settings": { desc: "월드 생성 세부 옵션을 JSON 형태로 지정합니다.", example: "{}" },
  "hardcore": { desc: "하드코어 모드 활성화 여부입니다. 사망 시 관전 모드로 전환됩니다.", example: "true/false" },
  "hide-online-players": { desc: "서버 상태 응답에서 플레이어 목록을 숨길지 설정합니다.", example: "true/false" },
  "initial-disabled-packs": { desc: "서버 생성 시 비활성화할 데이터팩을 지정합니다.", example: "pack1,pack2" },
  "initial-enabled-packs": { desc: "서버 생성 시 기본 활성화할 데이터팩을 지정합니다.", example: "vanilla" },
  "level-name": { desc: "월드 폴더 이름을 지정합니다. 변경 시 다른 월드를 생성/로드합니다.", example: "world" },
  "level-seed": { desc: "월드 생성 시 사용할 시드를 지정합니다. 비우면 랜덤입니다.", example: "12345" },
  "level-type": { desc: "월드 타입을 지정합니다. 일반/평지/대형 바이옴 등.", example: "minecraft:normal/flat/largeBiomes/amplified" },
  "log-ips": { desc: "서버 로그에 접속자의 IP를 기록할지 설정합니다.", example: "true/false" },
  "management-server-allowed-origins": { desc: "관리 서버에 접근할 수 있는 Origin 목록입니다.", example: "https://example.com" },
  "management-server-enabled": { desc: "내장 관리 서버 기능을 사용할지 설정합니다.", example: "true/false" },
  "management-server-host": { desc: "관리 서버가 바인딩할 호스트 주소입니다.", example: "localhost" },
  "management-server-port": { desc: "관리 서버가 사용할 포트입니다. 0이면 비활성.", example: "0" },
  "management-server-secret": { desc: "관리 서버 인증에 쓰이는 시크릿 키입니다.", example: "랜덤문자열" },
  "management-server-tls-enabled": { desc: "관리 서버에서 TLS(HTTPS)를 사용할지 설정합니다.", example: "true/false" },
  "management-server-tls-keystore": { desc: "TLS 키스토어 파일 경로입니다.", example: "keystore.jks" },
  "management-server-tls-keystore-password": { desc: "TLS 키스토어 비밀번호입니다.", example: "password" },
  "max-chained-neighbor-updates": { desc: "연쇄 블록 업데이트의 최대 횟수를 제한합니다.", example: "1000000" },
  "max-players": { desc: "동시에 접속 가능한 최대 플레이어 수입니다.", example: "20" },
  "max-tick-time": { desc: "틱이 이 시간(ms)을 넘으면 서버가 멈춘 것으로 판단합니다.", example: "60000" },
  "max-world-size": { desc: "월드 경계 최대 크기를 지정합니다.", example: "29999984" },
  "motd": { desc: "멀티플레이 목록에 표시되는 서버 설명 문구입니다.", example: "A Minecraft Server" },
  "network-compression-threshold": { desc: "패킷 압축을 시작하는 크기 임계값입니다.", example: "256" },
  "online-mode": { desc: "정품 인증(온라인 모드)을 사용할지 결정합니다.", example: "true/false" },
  "op-permission-level": { desc: "OP 권한 레벨을 설정합니다. 숫자가 높을수록 권한이 큽니다.", example: "4" },
  "pause-when-empty-seconds": { desc: "접속자가 없을 때 서버를 일시정지하기까지의 시간(초)입니다.", example: "60" },
  "player-idle-timeout": { desc: "유휴 상태인 플레이어를 자동 퇴장시키는 시간(분)입니다.", example: "0" },
  "prevent-proxy-connections": { desc: "프록시(예: VPN) 접속을 차단할지 설정합니다.", example: "true/false" },
  "query.port": { desc: "쿼리 프로토콜이 사용할 포트입니다.", example: "25565" },
  "rate-limit": { desc: "연결 요청에 대한 속도 제한 값입니다. 0이면 제한 없음.", example: "0" },
  "rcon.password": { desc: "RCON 접속 비밀번호를 지정합니다.", example: "secret" },
  "rcon.port": { desc: "RCON이 사용할 포트입니다.", example: "25575" },
  "region-file-compression": { desc: "지역 파일 압축 방식을 설정합니다.", example: "deflate" },
  "require-resource-pack": { desc: "리소스팩 사용을 강제할지 설정합니다.", example: "true/false" },
  "resource-pack": { desc: "클라이언트에 배포할 리소스팩 URL입니다.", example: "https://example.com/pack.zip" },
  "resource-pack-id": { desc: "리소스팩 식별자(UUID)입니다.", example: "uuid" },
  "resource-pack-prompt": { desc: "리소스팩 안내 팝업에 표시할 문구입니다.", example: "문구 입력" },
  "resource-pack-sha1": { desc: "리소스팩 파일의 SHA1 해시입니다.", example: "hash값" },
  "server-ip": { desc: "서버가 바인딩할 IP입니다. 보통 비워둡니다.", example: "" },
  "server-port": { desc: "서버가 사용할 포트입니다.", example: "25565" },
  "simulation-distance": { desc: "시뮬레이션 거리(활성 영역)를 설정합니다.", example: "10" },
  "spawn-protection": { desc: "스폰 보호 반경(블록)을 설정합니다.", example: "16" },
  "status-heartbeat-interval": { desc: "서버 상태 하트비트 간격(초)입니다.", example: "0" },
  "sync-chunk-writes": { desc: "청크 저장을 동기 방식으로 할지 설정합니다.", example: "true/false" },
  "text-filtering-config": { desc: "텍스트 필터링 설정 파일 경로입니다.", example: "config.json" },
  "text-filtering-version": { desc: "텍스트 필터링 버전 값입니다.", example: "0" },
  "use-native-transport": { desc: "네이티브 네트워크 전송 사용 여부입니다.", example: "true/false" },
  "view-distance": { desc: "클라이언트에게 보내는 시야 거리입니다.", example: "10" },
  "white-list": { desc: "화이트리스트를 사용할지 설정합니다.", example: "true/false" }
};

function setStatus(running, pid) {
  serverRunning = running;
  statusEl.textContent = running ? "온라인" : "오프라인";
  statusEl.className = running ? "status online" : "status offline";
  pidEl.textContent = running && pid ? `PID: ${pid}` : "";

  if (statusLargeEl) {
    statusLargeEl.textContent = running ? "온라인" : "오프라인";
    statusLargeEl.className = running ? "status large online" : "status large offline";
  }

  if (pidLargeEl) {
    pidLargeEl.textContent = running && pid ? `PID: ${pid}` : "대기 중";
  }

  if (statusDot) {
    statusDot.style.background = running ? "#16a34a" : "#9ca3af";
  }

  startBtn.disabled = running;
  stopBtn.disabled = !running;
}

function appendLog(line) {
  if (!line) return;
  logLines.push(line);
  if (logLines.length > logLinesMax) {
    logLines = logLines.slice(logLines.length - logLinesMax);
  }
  logEl.textContent = logLines.join("\n");
  logEl.scrollTop = logEl.scrollHeight;
}

async function fetchStatus() {
  const res = await fetch("/api/status");
  const data = await res.json();
  setStatus(data.running, data.pid);
}

async function fetchLogs() {
  const res = await fetch("/api/logs");
  const data = await res.json();
  logLines = data.lines || [];
  logEl.textContent = logLines.join("\n");
  logEl.scrollTop = logEl.scrollHeight;
}

async function fetchConfig() {
  const res = await fetch("/api/config");
  const data = await res.json();
  const app = data.app || {};
  const mem = app.memory || {};

  xmsEl.value = mem.xms || "";
  xmxEl.value = mem.xmx || "";
  logLinesEl.value = app.logLines || 500;

  renderProperties(data.properties || {});
}

async function fetchInfo() {
  const res = await fetch("/api/info");
  const data = await res.json();
  const serverPort = data.serverPort || 25565;
  if (localConnectEl) localConnectEl.textContent = "127.0.0.1";
  if (externalIpEl) {
    externalIpEl.textContent = data.externalIp ? `${data.externalIp}` : "알 수 없음";
  }
  if (serverVersionEl) {
    const version = data.runningVersion || data.configuredVersion || "알 수 없음";
    serverVersionEl.textContent = version;
  }
  if (localIpsEl) {
    if (data.localIps && data.localIps.length > 0) {
      localIpsEl.textContent = `로컬 IP: ${data.localIps.join(", ")}`;
    } else {
      localIpsEl.textContent = "";
    }
  }
}

const listSchemas = {
  whitelist: [
    { key: "name", label: "이름", type: "text" },
    { key: "uuid", label: "UUID", type: "text" },
  ],
  bannedPlayers: [
    { key: "name", label: "이름", type: "text" },
    { key: "uuid", label: "UUID", type: "text" },
    { key: "reason", label: "사유", type: "text" },
    { key: "expires", label: "만료", type: "text", placeholder: "예: 2026-12-31 23:59:59 +0900 / forever" },
  ],
  bannedIps: [
    { key: "ip", label: "IP", type: "text" },
    { key: "reason", label: "사유", type: "text" },
    { key: "expires", label: "만료", type: "text", placeholder: "예: 2026-12-31 23:59:59 +0900 / forever" },
  ],
  ops: [
    { key: "name", label: "이름", type: "text" },
    { key: "uuid", label: "UUID", type: "text" },
    { key: "level", label: "권한", type: "select", options: ["1", "2", "3", "4"] },
    { key: "bypassesPlayerLimit", label: "정원무시", type: "checkbox" },
  ],
};

function createInput(field, value) {
  if (field.type === "select") {
    const select = document.createElement("select");
    field.options.forEach((opt) => {
      const option = document.createElement("option");
      option.value = opt;
      option.textContent = opt;
      if (String(value) === opt) option.selected = true;
      select.appendChild(option);
    });
    select.dataset.key = field.key;
    return select;
  }

  if (field.type === "checkbox") {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = Boolean(value);
    input.dataset.key = field.key;
    return input;
  }

  const input = document.createElement("input");
  input.type = "text";
  input.value = value || "";
  if (field.placeholder) input.placeholder = field.placeholder;
  if (field.key === "uuid") input.disabled = true;
  input.dataset.key = field.key;
  return input;
}

function renderList(container, items, schema, metaKeys = []) {
  container.innerHTML = "";
  (items || []).forEach((item) => {
    const row = document.createElement("div");
    row.className = "list-row";

    schema.forEach((field) => {
      const value = item[field.key];
      const input = createInput(field, value);
      const pair = document.createElement("div");
      pair.className = "kv";
      const label = document.createElement("span");
      label.className = "kv-label";
      label.textContent = field.label;
      pair.appendChild(label);
      pair.appendChild(input);
      row.appendChild(pair);
    });

    metaKeys.forEach((key) => {
      if (item[key]) row.dataset[key] = item[key];
    });

    const actions = document.createElement("div");
    actions.className = "list-actions";
    const del = document.createElement("button");
    del.className = "danger";
    del.textContent = "삭제";
    del.addEventListener("click", () => row.remove());
    actions.appendChild(del);
    row.appendChild(actions);
    container.appendChild(row);
  });
}

function addEmptyRow(container, schema, meta = {}) {
  const row = document.createElement("div");
  row.className = "list-row";
  schema.forEach((field) => {
    const input = createInput(field, "");
    const pair = document.createElement("div");
    pair.className = "kv";
    const label = document.createElement("span");
    label.className = "kv-label";
    label.textContent = field.label;
    pair.appendChild(label);
    pair.appendChild(input);
    row.appendChild(pair);
  });
  Object.keys(meta).forEach((k) => (row.dataset[k] = meta[k]));
  const actions = document.createElement("div");
  actions.className = "list-actions";
  const del = document.createElement("button");
  del.className = "danger";
  del.textContent = "삭제";
  del.addEventListener("click", () => row.remove());
  actions.appendChild(del);
  row.appendChild(actions);
  container.appendChild(row);
}

function collectList(container, schema, options = {}) {
  const rows = Array.from(container.querySelectorAll(".list-row"));
  const items = [];
  rows.forEach((row) => {
    const item = {};
    schema.forEach((field) => {
      const input = row.querySelector(`[data-key="${field.key}"]`);
      if (!input) return;
      if (field.type === "checkbox") item[field.key] = input.checked;
      else item[field.key] = input.value.trim();
    });
    if (options.metaKeys) {
      options.metaKeys.forEach((k) => {
        if (row.dataset[k]) item[k] = row.dataset[k];
      });
    }
    if (options.primary && !options.primary(item)) return;
    items.push(item);
  });
  return items;
}

async function lookupUuid(name) {
  const res = await fetch(`/api/uuid?name=${encodeURIComponent(name)}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.uuid || null;
}

async function handleUuidLookup(event) {
  const target = event.target;
  if (!target || target.dataset.key !== "name") return;
  const row = target.closest(".list-row");
  if (!row) return;
  const name = target.value.trim();
  if (!name) return;
  const uuidInput = row.querySelector('[data-key="uuid"]');
  if (!uuidInput || uuidInput.value.trim()) return;
  if (uuidInput.dataset.lookuping === "1") return;
  uuidInput.dataset.lookuping = "1";
  uuidInput.placeholder = "UUID 조회중...";
  try {
    const uuid = await lookupUuid(name);
    if (uuid) uuidInput.value = uuid;
  } finally {
    uuidInput.dataset.lookuping = "0";
    uuidInput.placeholder = "";
  }
}

async function fetchLists() {
  const res = await fetch("/api/lists");
  const data = await res.json();
  renderList(whitelistList, data.whitelist || [], listSchemas.whitelist);
  renderList(bannedPlayersList, data.bannedPlayers || [], listSchemas.bannedPlayers, ["created", "source"]);
  renderList(bannedIpsList, data.bannedIps || [], listSchemas.bannedIps, ["created", "source"]);
  renderList(opsList, data.ops || [], listSchemas.ops);
}

function nowString() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const tz = -d.getTimezoneOffset();
  const sign = tz >= 0 ? "+" : "-";
  const hh = pad(Math.floor(Math.abs(tz) / 60));
  const mm = pad(Math.abs(tz) % 60);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${sign}${hh}${mm}`;
}

async function saveList(kind) {
  let payload = [];

  if (kind === "whitelist") {
    payload = collectList(whitelistList, listSchemas.whitelist, {
      primary: (item) => item.name || item.uuid,
    });
  }

  if (kind === "ops") {
    payload = collectList(opsList, listSchemas.ops, {
      primary: (item) => item.name || item.uuid,
    }).map((item) => ({
      ...item,
      level: Number(item.level || 4),
      bypassesPlayerLimit: Boolean(item.bypassesPlayerLimit),
    }));
  }

  if (kind === "bannedPlayers") {
    payload = collectList(bannedPlayersList, listSchemas.bannedPlayers, {
      metaKeys: ["created", "source"],
      primary: (item) => item.name || item.uuid,
    }).map((item) => ({
      ...item,
      created: item.created || nowString(),
      source: item.source || "web-ui",
      expires: item.expires || "forever",
      reason: item.reason || "banned",
    }));
  }

  if (kind === "bannedIps") {
    payload = collectList(bannedIpsList, listSchemas.bannedIps, {
      metaKeys: ["created", "source"],
      primary: (item) => item.ip,
    }).map((item) => ({
      ...item,
      created: item.created || nowString(),
      source: item.source || "web-ui",
      expires: item.expires || "forever",
      reason: item.reason || "banned",
    }));
  }

  const body = { [kind]: payload };
  const res = await fetch("/api/lists", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const msg = await res.json();
    toast(msg.error || "저장 실패");
    return;
  }

  toast("저장되었습니다.");
}

function renderProperties(values) {
  propsEl.innerHTML = "";
  const keys = Object.keys(values).sort();
  if (keys.length === 0) {
    propsEl.innerHTML = "<div class=\"helper\">server.properties가 없습니다. 서버를 한 번 실행하면 생성됩니다.</div>";
    return;
  }
  for (const key of keys) {
    const hint = propHints[key] || {};
    const row = document.createElement("div");
    row.className = "prop-row";

    const meta = document.createElement("div");
    const label = document.createElement("div");
    label.className = "prop-key";
    label.textContent = key;

    const desc = document.createElement("div");
    desc.className = "prop-desc";
    desc.textContent = hint.desc || "설정 값";

    const example = document.createElement("div");
    example.className = "prop-example";
    const fallbackExample = values[key] !== undefined && values[key] !== "" ? values[key] : "값 입력";
    example.textContent = `예: ${hint.example || fallbackExample}`;

    const input = document.createElement("input");
    input.type = "text";
    input.value = values[key];
    input.dataset.key = key;
    if (hint.example) input.placeholder = hint.example;

    meta.appendChild(label);
    meta.appendChild(desc);
    meta.appendChild(example);
    row.appendChild(meta);
    row.appendChild(input);
    propsEl.appendChild(row);
  }
}

function setOptions(select, items, selected) {
  select.innerHTML = "";
  for (const item of items) {
    const option = document.createElement("option");
    option.value = item.value;
    option.textContent = item.label;
    if (selected && selected === item.value) option.selected = true;
    select.appendChild(option);
  }
}

function setBuildVisibility(isPaper) {
  if (!isPaper) {
    buildRow.classList.add("hidden");
    setOptions(serverBuildSelect, [{ value: "", label: "" }], "");
    return;
  }
  buildRow.classList.remove("hidden");
}

async function fetchSetupStatus() {
  const res = await fetch("/api/setup/status");
  return res.json();
}

async function loadVersions() {
  const type = serverTypeSelect.value;
  setBuildVisibility(type === "paper");
  const res = await fetch(`/api/server/versions?type=${type}`);
  const data = await res.json();
  const versions = (data.versions || []).map((v) => ({ value: v, label: v }));
  setOptions(serverVersionSelect, versions, data.latest);
  await loadBuilds();
}

async function loadBuilds() {
  const type = serverTypeSelect.value;
  const version = serverVersionSelect.value;
  if (type !== "paper") {
    setBuildVisibility(false);
    return;
  }
  setBuildVisibility(true);
  try {
    const res = await fetch(`/api/server/builds?type=paper&version=${version}`);
    const data = await res.json();
    const builds = (data.builds || []).map((b) => ({ value: String(b), label: `#${b}` }));
    if (builds.length === 0) {
      setOptions(serverBuildSelect, [{ value: "", label: "빌드 없음" }], "");
      return;
    }
    setOptions(serverBuildSelect, builds, builds[builds.length - 1]?.value);
  } catch {
    setOptions(serverBuildSelect, [{ value: "", label: "불러오기 실패" }], "");
  }
}

async function setupUI() {
  const status = await fetchSetupStatus();
  if (status.missingJar) {
    setupCard.classList.remove("hidden");
    installStatus.textContent = "";
    const types = [
      { value: "vanilla", label: "Vanilla (공식)" },
      { value: "paper", label: "Paper (최적화)" },
    ];
    setOptions(serverTypeSelect, types, status.serverType || "paper");
    await loadVersions();
  } else {
    setupCard.classList.add("hidden");
  }
}

async function saveAppConfig() {
  const body = {
    app: {
      memory: {
        xms: xmsEl.value.trim(),
        xmx: xmxEl.value.trim(),
      },
      logLines: Number(logLinesEl.value) || 500,
    },
  };

  const res = await fetch("/api/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const msg = await res.json();
    toast(msg.error || "앱 설정 저장 실패");
    return;
  }

  toast("앱 설정이 저장되었습니다.");
}

async function saveServerProperties() {
  const propInputs = propsEl.querySelectorAll("input[data-key]");
  const props = {};
  propInputs.forEach((input) => {
    props[input.dataset.key] = input.value;
  });

  const res = await fetch("/api/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ properties: props }),
  });

  if (!res.ok) {
    const msg = await res.json();
    toast(msg.error || "server.properties 저장 실패");
    return;
  }

  toast("server.properties가 저장되었습니다.");
}

async function startServer() {
  const res = await fetch("/api/start", { method: "POST" });
  if (!res.ok) {
    const msg = await res.json();
    if (msg.code === "JAR_MISSING") {
      autoStartAfterInstall = true;
      openTab("tab-control");
      setupCard.classList.remove("hidden");
      installStatus.textContent = "server.jar이 없어 설치가 필요합니다.";
      return;
    }
    if (msg.code === "EULA_REQUIRED") {
      autoStartAfterInstall = false;
      openTab("tab-control");
      setupCard.classList.remove("hidden");
      installStatus.textContent = "EULA 동의가 필요합니다.";
      return;
    }
    toast(msg.error || "서버 시작 실패");
    return;
  }
  await fetchStatus();
}

startBtn.addEventListener("click", startServer);

stopBtn.addEventListener("click", async () => {
  await fetch("/api/stop", { method: "POST" });
  await fetchStatus();
});

deleteBtn.addEventListener("click", async () => {
  const ok = confirm("정말 서버 폴더(./server)를 삭제할까요? 월드/설정/로그가 모두 삭제됩니다.");
  if (!ok) return;
  const res = await fetch("/api/server/delete", { method: "POST" });
  if (!res.ok) {
    const msg = await res.json();
    toast(msg.error || "삭제 실패");
    return;
  }
  toast("서버 폴더가 삭제되었습니다.");
  await fetchStatus();
  await fetchConfig();
  await fetchLogs();
  await setupUI();
  openTab("tab-control");
});

saveAppBtn.addEventListener("click", saveAppConfig);
savePropsBtn.addEventListener("click", saveServerProperties);
addWhitelistRow.addEventListener("click", () => addEmptyRow(whitelistList, listSchemas.whitelist));
addBannedPlayersRow.addEventListener("click", () => addEmptyRow(bannedPlayersList, listSchemas.bannedPlayers, { created: nowString(), source: "web-ui" }));
addBannedIpsRow.addEventListener("click", () => addEmptyRow(bannedIpsList, listSchemas.bannedIps, { created: nowString(), source: "web-ui" }));
addOpsRow.addEventListener("click", () => addEmptyRow(opsList, listSchemas.ops));

saveWhitelistBtn.addEventListener("click", () => saveList("whitelist"));
saveBannedPlayersBtn.addEventListener("click", () => saveList("bannedPlayers"));
saveBannedIpsBtn.addEventListener("click", () => saveList("bannedIps"));
saveOpsBtn.addEventListener("click", () => saveList("ops"));

whitelistList.addEventListener("focusout", handleUuidLookup);
bannedPlayersList.addEventListener("focusout", handleUuidLookup);
opsList.addEventListener("focusout", handleUuidLookup);
sendCommandBtn.addEventListener("click", sendCommand);
commandInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendCommand();
});

serverTypeSelect.addEventListener("change", loadVersions);
serverVersionSelect.addEventListener("change", loadBuilds);

installBtn.addEventListener("click", async () => {
  if (!eulaCheck.checked) {
    toast("EULA에 동의해야 서버를 실행할 수 있습니다.");
    return;
  }
  const type = serverTypeSelect.value;
  const version = serverVersionSelect.value;
  const build = serverBuildSelect.value ? Number(serverBuildSelect.value) : null;

  installStatus.textContent = "다운로드 중입니다. 잠시만 기다려 주세요...";
  installBtn.disabled = true;

  const res = await fetch("/api/server/install", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, version, build, acceptEula: true }),
  });

  installBtn.disabled = false;

  if (!res.ok) {
    const msg = await res.json();
    installStatus.textContent = msg.error || "다운로드 실패";
    return;
  }

  installStatus.textContent = "설치 완료. 서버를 시작합니다.";
  await setupUI();
  if (autoStartAfterInstall) {
    autoStartAfterInstall = false;
    await startServer();
  }
});

function startStream() {
  const es = new EventSource("/api/logs/stream");
  es.onmessage = (evt) => {
    try {
      const data = JSON.parse(evt.data);
      appendLog(data.line);
    } catch {
      // ignore
    }
  };
}

async function sendCommand() {
  const cmd = commandInput.value.trim();
  if (!cmd) {
    toast("명령어를 입력해 주세요.", "warn");
    return;
  }
  if (!serverRunning) {
    toast("서버가 꺼져있습니다.", "warn");
    return;
  }
  const res = await fetch("/api/command", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command: cmd }),
  });
  if (!res.ok) {
    const msg = await res.json();
    toast(msg.error || "명령 전송 실패", "error");
    return;
  }
  commandInput.value = "";
}

function openTab(id) {
  const tabs = document.querySelectorAll(".tab");
  const panels = document.querySelectorAll(".tab-panel");
  tabs.forEach((tab) => {
    const selected = tab.dataset.tab === id;
    tab.classList.toggle("active", selected);
    tab.setAttribute("aria-selected", selected ? "true" : "false");
  });
  panels.forEach((panel) => {
    panel.classList.toggle("active", panel.id === id);
  });
}

(function initTabs() {
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      openTab(tab.dataset.tab);
    });
  });
})();

function openSubtab(id) {
  const subtabs = document.querySelectorAll(".subtab");
  const panels = document.querySelectorAll(".subtab-panel");
  subtabs.forEach((tab) => {
    const selected = tab.dataset.subtab === id;
    tab.classList.toggle("active", selected);
    tab.setAttribute("aria-selected", selected ? "true" : "false");
  });
  panels.forEach((panel) => {
    panel.classList.toggle("active", panel.id === id);
  });
}

(function initSubtabs() {
  const subtabs = document.querySelectorAll(".subtab");
  if (subtabs.length === 0) return;
  subtabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      openSubtab(tab.dataset.subtab);
    });
  });
})();

(async function init() {
  const savedTheme = localStorage.getItem("theme") || "dark";
  document.body.classList.toggle("light", savedTheme === "light");
  themeToggle.checked = savedTheme === "dark";
  themeToggle.addEventListener("change", () => {
    const isDark = themeToggle.checked;
    document.body.classList.toggle("light", !isDark);
    localStorage.setItem("theme", isDark ? "dark" : "light");
  });

  await fetchStatus();
  await fetchLogs();
  await fetchConfig();
  await fetchInfo();
  await fetchLists();
  await setupUI();
  startStream();
  setInterval(fetchStatus, 3000);
  setInterval(fetchInfo, 15000);
})();

