const ALARM_NAME = "transit-focus-end";
const TIMEOUT_ALARM_NAME = "transit-retro-timeout";
const NOTIF_ID = "transit-retro";
const TIMEOUT_MIN = 10; // 이 시간 안에 예/아니오 응답 없으면 "예"로 간주

// --- 감시 사이트 동적 등록 ---
// manifest.json엔 더 이상 content_scripts를 고정으로 안 박아두고, 옵션 페이지에서
// 관리하는 storage.sites 목록 기준으로 여기서 그때그때 등록/해제함.
const SCRIPT_FILES = ["taskSelector.js", "overlay.js", "llm.js", "content.js"];
const DEFAULT_SITES = [
  { id: "site-youtube", label: "youtube.com", pattern: "*://*.youtube.com/*", enabled: true, builtin: true },
  { id: "site-netflix", label: "netflix.com", pattern: "*://*.netflix.com/*", enabled: true, builtin: true },
  { id: "site-instagram", label: "instagram.com", pattern: "*://*.instagram.com/*", enabled: true, builtin: true },
];

async function syncContentScripts() {
  const { sites } = await chrome.storage.sync.get({ sites: DEFAULT_SITES });
  const existing = await chrome.scripting.getRegisteredContentScripts();
  if (existing.length) {
    await chrome.scripting.unregisterContentScripts({ ids: existing.map((s) => s.id) });
  }
  const toRegister = sites
    .filter((s) => s.enabled)
    .map((s) => ({ id: s.id, matches: [s.pattern], js: SCRIPT_FILES, runAt: "document_idle" }));
  if (toRegister.length) {
    await chrome.scripting.registerContentScripts(toRegister);
  }
  console.log(
    "[Transit] 감시 사이트 갱신:",
    toRegister.map((s) => s.id)
  );
}

// tasks/thresholdSec/focusMinutes/sites를 local -> sync로 옮기던 이전 버전 사용자를 위한
// 1회성 마이그레이션. sync에 아직 없고 local에만 있으면 그대로 복사 (local 쪽은 안 지움, 무해하게 방치).
async function migrateLocalToSync() {
  const KEYS = ["tasks", "thresholdSec", "focusMinutes", "sites"];
  // undefined는 storage API 기본값으로 못 씀(조용히 실패함) — null을 "없음" 표시로 사용.
  const empty = Object.fromEntries(KEYS.map((k) => [k, null]));
  const [local, sync] = await Promise.all([
    chrome.storage.local.get(empty),
    chrome.storage.sync.get(empty),
  ]);

  const toMigrate = {};
  for (const key of KEYS) {
    if (sync[key] === null && local[key] !== null) toMigrate[key] = local[key];
  }
  if (Object.keys(toMigrate).length > 0) {
    await chrome.storage.sync.set(toMigrate);
    console.log("[Transit] local -> sync 마이그레이션:", Object.keys(toMigrate));
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  try {
    await migrateLocalToSync();
  } catch (err) {
    console.error("[Transit] local -> sync 마이그레이션 실패:", err);
  }
  chrome.storage.sync.get({ sites: null }, ({ sites }) => {
    if (!sites) chrome.storage.sync.set({ sites: DEFAULT_SITES }, syncContentScripts);
    else syncContentScripts();
  });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.sites) syncContentScripts();
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== "START_FOCUS") return;
  chrome.alarms.create(ALARM_NAME, { delayInMinutes: msg.minutes });
  chrome.storage.local.set({
    focusSession: { taskTitle: msg.taskTitle, startedAt: Date.now(), minutes: msg.minutes },
  });
  console.log("[Transit] 포커스 타이머 시작:", msg.taskTitle, msg.minutes, "분");
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    chrome.storage.local.get({ focusSession: null }, ({ focusSession }) => {
      const title = focusSession?.taskTitle ?? "할 일";
      chrome.notifications.create(NOTIF_ID, {
        type: "basic",
        iconUrl: "icon128.png",
        title: "Transit",
        message: `${focusSession?.minutes ?? ""}분 다 됐어요. "${title}" 시작했나요?`,
        buttons: [{ title: "예" }, { title: "아니오" }],
        requireInteraction: true,
      });
      chrome.alarms.create(TIMEOUT_ALARM_NAME, { delayInMinutes: TIMEOUT_MIN });
    });
    return;
  }

  if (alarm.name === TIMEOUT_ALARM_NAME) {
    // 응답했으면 focusSession이 이미 null로 지워져 있음 -> 무응답일 때만 "예"로 간주.
    chrome.storage.local.get({ retroLog: [], focusSession: null }, ({ retroLog, focusSession }) => {
      if (!focusSession) return;
      retroLog.push({ taskTitle: focusSession.taskTitle ?? null, started: true, at: Date.now(), auto: true });
      chrome.storage.local.set({ retroLog, focusSession: null });
      chrome.notifications.clear(NOTIF_ID);
    });
  }
});

// idea.md 8단계: "시작했나요?" 단일 회고 -> storage에 로깅 (전환 성공률 계산용)
chrome.notifications.onButtonClicked.addListener((notifId, buttonIndex) => {
  if (notifId !== NOTIF_ID) return;

  chrome.storage.local.get({ retroLog: [], focusSession: null }, ({ retroLog, focusSession }) => {
    retroLog.push({
      taskTitle: focusSession?.taskTitle ?? null,
      started: buttonIndex === 0, // 0: 예, 1: 아니오
      at: Date.now(),
    });
    chrome.storage.local.set({ retroLog, focusSession: null });
  });
  chrome.alarms.clear(TIMEOUT_ALARM_NAME);
  chrome.notifications.clear(notifId);
});
