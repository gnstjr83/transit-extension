const ALARM_NAME = "transit-focus-end";
const NOTIF_ID = "transit-retro";

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== "START_FOCUS") return;
  chrome.alarms.create(ALARM_NAME, { delayInMinutes: msg.minutes });
  chrome.storage.local.set({
    focusSession: { taskTitle: msg.taskTitle, startedAt: Date.now(), minutes: msg.minutes },
  });
  console.log("[Transit] 포커스 타이머 시작:", msg.taskTitle, msg.minutes, "분");
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ALARM_NAME) return;

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
  });
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
  chrome.notifications.clear(notifId);
});
