const form = document.getElementById("task-form");
const list = document.getElementById("task-list");
const keyForm = document.getElementById("key-form");
const apiKeyInput = document.getElementById("apiKey");

// 저장 버튼 누르면 잠깐 "저장됨"으로 바뀌면서 통통 튀는 모션
function flashSaved(btn) {
  const original = btn.textContent;
  btn.textContent = "저장됨 ✓";
  btn.classList.add("btn-saved");
  setTimeout(() => {
    btn.textContent = original;
    btn.classList.remove("btn-saved");
  }, 1100);
}

chrome.storage.local.get({ apiKey: "" }, ({ apiKey }) => {
  apiKeyInput.value = apiKey;
});

const keySubmitBtn = document.getElementById("key-submit");
keyForm.addEventListener("submit", (e) => {
  e.preventDefault();
  chrome.storage.local.set({ apiKey: apiKeyInput.value.trim() }, () => flashSaved(keySubmitBtn));
});

// --- 트리거 설정: 시청 제한 시간 / 집중 타이머 (기본값: 실사용 기준 20분/25분) ---
const settingsForm = document.getElementById("settings-form");
const settingsSubmitBtn = document.getElementById("settings-submit");
const thresholdSecInput = document.getElementById("thresholdSec");
const focusMinutesInput = document.getElementById("focusMinutes");

chrome.storage.sync.get({ thresholdSec: 1200, focusMinutes: 25 }, ({ thresholdSec, focusMinutes }) => {
  thresholdSecInput.value = thresholdSec;
  focusMinutesInput.value = focusMinutes;
});

settingsForm.addEventListener("submit", (e) => {
  e.preventDefault();
  chrome.storage.sync.set(
    {
      thresholdSec: Number(thresholdSecInput.value),
      focusMinutes: Number(focusMinutesInput.value),
    },
    () => flashSaved(settingsSubmitBtn)
  );
});

// --- 튜토리얼: API 키가 아직 없으면(첫 실행 추정) 확대 + 자동으로 보여줌 ---
const guideCard = document.getElementById("guide-card");
const toggleGuideBtn = document.getElementById("toggle-guide");

function showGuide() {
  guideCard.style.display = "block";
}
function hideGuide() {
  guideCard.style.display = "none";
}
toggleGuideBtn.addEventListener("click", () => {
  guideCard.style.display === "none" ? showGuide() : hideGuide();
});
document.getElementById("close-guide").addEventListener("click", hideGuide);

// --- 전환 성공률 (idea.md 핵심 지표: retroLog의 예/아니오 응답) ---
const retroSummaryEl = document.getElementById("retro-summary");
const retroListEl = document.getElementById("retro-list");

function renderRetroStats() {
  chrome.storage.sync.get({ retroLog: [] }, ({ retroLog }) => {
    if (retroLog.length === 0) {
      retroSummaryEl.innerHTML = `<div class="stat-sub">아직 기록 없음 — 알림에서 예/아니오를 누르면 쌓여요.</div>`;
      retroListEl.innerHTML = "";
      return;
    }

    const started = retroLog.filter((r) => r.started).length;
    const rate = Math.round((started / retroLog.length) * 100);
    retroSummaryEl.innerHTML = `
      <div class="stat-rate">${rate}%</div>
      <div class="stat-sub">${retroLog.length}번 중 ${started}번 시작함</div>
    `;

    retroListEl.innerHTML = "";
    retroLog
      .slice()
      .reverse()
      .slice(0, 2)
      .forEach((r) => {
        const li = document.createElement("li");
        const label = document.createElement("span");
        label.textContent = `${r.taskTitle ?? "(제목 없음)"} · ${new Date(r.at).toLocaleString("ko-KR")}`;
        const mark = document.createElement("span");
        mark.className = r.started ? "retro-yes" : "retro-no";
        mark.textContent = r.started ? "시작함" : "안 함";
        li.appendChild(label);
        li.appendChild(mark);
        retroListEl.appendChild(li);
      });
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.retroLog) renderRetroStats();
});

document.getElementById("clear-retro").addEventListener("click", () => {
  if (!confirm("전환 성공률 기록을 초기화할까요?")) return;
  chrome.storage.sync.remove("retroLog", renderRetroStats);
});

renderRetroStats();

// --- 창 크기: 처음엔 컴팩트(시간표만), 확대 누르면 절반 화면으로 ---
const COMPACT_SIZE = { width: 380, height: 560 };
const EXPANDED_SIZE = { width: Math.round(screen.availWidth / 2), height: Math.round(screen.availHeight * 0.75) };
const toggleBtn = document.getElementById("toggle-size");
let expanded = false;

function resizeWindowTo({ width, height }) {
  const left = Math.max(0, screen.availWidth - width - 10);
  const top = Math.max(0, screen.availHeight - height - 10);
  chrome.windows.getCurrent((win) => {
    chrome.windows.update(win.id, { width, height, left, top });
  });
}

function setExpanded(next) {
  expanded = next;
  document.body.classList.toggle("compact", !expanded);
  toggleBtn.textContent = expanded ? "축소" : "확대";
  resizeWindowTo(expanded ? EXPANDED_SIZE : COMPACT_SIZE);
}

toggleBtn.addEventListener("click", () => setExpanded(!expanded));

// 크롬이 마지막 창 크기/위치를 기억했다가 그걸로 열어버리는 걸 막기 위해,
// 열릴 때마다 무조건 컴팩트 크기로 강제로 맞춤 (작업표시줄/시작프로그램 등 경로 무관).
resizeWindowTo(COMPACT_SIZE);

// 첫 실행 추정(API 키 없음): 확대 + 튜토리얼 자동으로 보여줌
chrome.storage.local.get({ apiKey: "" }, ({ apiKey }) => {
  if (!apiKey) {
    setExpanded(true);
    showGuide();
  }
});

// --- 오늘/내일 타임라인 ---
const START_HOUR = 0;
const END_HOUR = 24;
const HOUR_PX = 60;
const trackHeight = (END_HOUR - START_HOUR) * HOUR_PX;

// .tl-wrap[data-day="0"]=오늘, "1"=내일. day뷰의 .tl-wrap은 data-day가 없어서 여기서 제외됨.
const sections = Array.from(document.querySelectorAll(".tl-wrap[data-day]")).map((wrap) => ({
  dayOffset: Number(wrap.dataset.day),
  wrap,
  hoursEl: wrap.querySelector(".tl-hours"),
  trackEl: wrap.querySelector(".tl-track"),
  nowEl: wrap.querySelector(".tl-now"),
}));

function pad(n) {
  return String(n).padStart(2, "0");
}
function localISO(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function addDays(d, n) {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}
function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function minutesFromStart(date) {
  return (date.getHours() - START_HOUR) * 60 + date.getMinutes();
}

// 0~4시간: 빨강 -> 노랑. 4~12시간: 노랑 -> 초록. 12시간 이후는 초록 고정. (스티커 톤, 쨍하게)
const RED_RGB = [255, 82, 82]; // 비비드 레드
const YELLOW_RGB = [255, 193, 7]; // 비비드 옐로
const GREEN_RGB = [56, 193, 114]; // 비비드 그린
const NEAR_WINDOW_MIN = 240; // 4시간
const FAR_WINDOW_MIN = 720; // 12시간
const BLOCK_TEXT = "#2B2620";

function lerpRGB(a, b, t) {
  return a.map((c, i) => Math.round(c + (b[i] - c) * t));
}

function urgencyColor(minutesAway) {
  const [r, g, b] =
    minutesAway <= NEAR_WINDOW_MIN
      ? lerpRGB(RED_RGB, YELLOW_RGB, Math.min(1, Math.max(0, minutesAway / NEAR_WINDOW_MIN)))
      : lerpRGB(
          YELLOW_RGB,
          GREEN_RGB,
          Math.min(1, Math.max(0, (minutesAway - NEAR_WINDOW_MIN) / (FAR_WINDOW_MIN - NEAR_WINDOW_MIN)))
        );
  return {
    accent: `rgb(${r}, ${g}, ${b})`,
    fill: `rgba(${r}, ${g}, ${b}, 0.22)`,
    text: BLOCK_TEXT,
  };
}

// task.id 기반 고정 각도(-1.8~1.8deg) — 새로고침마다 안 바뀌고, 블록마다 다르게 삐뚤어짐
function rotationForId(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) % 1000;
  return ((hash / 1000) * 3.6 - 1.8).toFixed(2);
}

function renderHourLabels(hoursEl) {
  hoursEl.style.height = `${trackHeight}px`;
  hoursEl.innerHTML = "";
  for (let h = START_HOUR; h <= END_HOUR; h++) {
    const label = document.createElement("span");
    label.style.top = `${(h - START_HOUR) * HOUR_PX}px`;
    label.textContent = h === 24 ? "24" : `${pad(h)}:00`;
    hoursEl.appendChild(label);
  }
}

function renderSection(trackEl, hoursEl, nowEl, targetDate, now, tasks) {
  trackEl.style.height = `${trackHeight}px`;

  if (nowEl) {
    const showNow = isSameDay(targetDate, now);
    if (showNow) {
      const nowMin = minutesFromStart(now);
      nowEl.style.top = `${Math.max(0, Math.min(trackHeight, (nowMin / 60) * HOUR_PX))}px`;
    }
    nowEl.style.display = showNow ? "block" : "none";
  }

  trackEl.querySelectorAll(".tl-block").forEach((el) => el.remove());

  tasks
    .filter((t) => isSameDay(new Date(t.time), targetDate))
    .forEach((task) => {
      const start = new Date(task.time);
      const end = new Date(start.getTime() + task.durationMin * 60000);
      const startMin = Math.max(0, minutesFromStart(start));
      const endMin = Math.min((END_HOUR - START_HOUR) * 60, minutesFromStart(end));
      if (endMin <= 0 || startMin >= (END_HOUR - START_HOUR) * 60) return; // 표시 범위 밖

      const status = now >= end ? "past" : now >= start ? "ongoing" : "future";

      const block = document.createElement("div");
      block.className = `tl-block status-${status}`;
      block.style.top = `${(startMin / 60) * HOUR_PX}px`;
      block.style.height = `${Math.max(18, ((endMin - startMin) / 60) * HOUR_PX)}px`;
      block.style.transform = `rotate(${rotationForId(task.id)}deg)`; // 코르크보드에 핀으로 대충 꽂은 느낌
      if (status !== "past") {
        const minutesAway = status === "ongoing" ? 0 : (start - now) / 60000;
        const { accent, text } = urgencyColor(minutesAway);
        block.style.border = `2.5px solid ${accent}`;
        block.style.color = text;
      }
      block.title = `${task.title} (${task.topic})`;
      const titleEl = document.createElement("div");
      titleEl.className = "tl-title";
      titleEl.textContent = `📌 ${task.title}`;
      const timeEl = document.createElement("div");
      timeEl.className = "tl-time";
      timeEl.textContent = `${pad(start.getHours())}:${pad(start.getMinutes())}–${pad(end.getHours())}:${pad(end.getMinutes())}`;
      block.appendChild(titleEl);
      block.appendChild(timeEl);
      block.onclick = (e) => e.stopPropagation(); // TODO: 나중에 클릭해서 수정/삭제
      trackEl.appendChild(block);
    });
}

// 시간표 빈칸 클릭하면 그 시각으로 "할 일 추가" 폼 프리필. baseDateFn()으로 기준 날짜를
// 그때그때 다시 구함 — day뷰는 selectedDate가 계속 바뀌니까 클릭 시점에 읽어야 함.
function bindTrackClickForAdd(trackEl, baseDateFn) {
  trackEl.addEventListener("click", (e) => {
    const clickY = e.offsetY;
    const rawMin = (clickY / HOUR_PX) * 60 + START_HOUR * 60;
    const rounded = Math.round(rawMin / 5) * 5; // 5분 단위로 스냅
    const d = new Date(baseDateFn());
    d.setHours(0, rounded, 0, 0);
    document.getElementById("time").value = localISO(d);
    document.getElementById("title").focus();
    document.getElementById("task-form").scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

sections.forEach((section) => {
  bindTrackClickForAdd(section.trackEl, () => addDays(new Date(), section.dayOffset));
  renderHourLabels(section.hoursEl);
});

// --- 특정 날짜(day) 뷰 ---
const dayHoursEl = document.getElementById("day-hours");
const dayTrackEl = document.getElementById("day-track");
const dayNowEl = document.getElementById("day-now");
const dayLabelEl = document.getElementById("tl-day-label-text");
renderHourLabels(dayHoursEl);
bindTrackClickForAdd(dayTrackEl, () => selectedDate);

function renderDayView() {
  dayLabelEl.textContent = selectedDate.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
  const now = new Date();
  chrome.storage.sync.get({ tasks: [] }, ({ tasks }) => {
    renderSection(dayTrackEl, dayHoursEl, dayNowEl, selectedDate, now, tasks);
  });
}

// --- 월별 캘린더 뷰 ---
const monthGrid = document.getElementById("month-grid");
const monthLabel = document.getElementById("month-label");
const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function renderMonthView() {
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  monthLabel.textContent = `${year}년 ${month + 1}월`;

  chrome.storage.sync.get({ tasks: [] }, ({ tasks }) => {
    const countByDay = {};
    tasks.forEach((t) => {
      const d = new Date(t.time);
      if (d.getFullYear() === year && d.getMonth() === month) {
        countByDay[d.getDate()] = (countByDay[d.getDate()] ?? 0) + 1;
      }
    });

    monthGrid.innerHTML = "";
    WEEKDAY_LABELS.forEach((w) => {
      const el = document.createElement("div");
      el.className = "month-weekday";
      el.textContent = w;
      monthGrid.appendChild(el);
    });

    const startOffset = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();

    for (let i = 0; i < startOffset; i++) {
      monthGrid.appendChild(document.createElement("div"));
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const cellDate = new Date(year, month, day);
      const cell = document.createElement("div");
      cell.className = "month-day";
      if (isSameDay(cellDate, today)) cell.classList.add("month-day-today");

      const num = document.createElement("div");
      num.textContent = day;
      cell.appendChild(num);

      if (countByDay[day]) {
        const dot = document.createElement("div");
        dot.className = "month-day-dot";
        dot.textContent = countByDay[day];
        cell.appendChild(dot);
      }

      cell.onclick = () => {
        selectedDate = cellDate;
        setViewMode("day");
      };
      monthGrid.appendChild(cell);
    }
  });
}

document.getElementById("month-prev").addEventListener("click", () => {
  calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
  renderMonthView();
});
document.getElementById("month-next").addEventListener("click", () => {
  calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
  renderMonthView();
});

// --- 뷰 전환 ---
let viewMode = "default"; // "default" | "day" | "month"
let selectedDate = new Date();
let calendarMonth = new Date();

const defaultViewEl = document.getElementById("tl-default-view");
const dayViewEl = document.getElementById("tl-day-view");
const monthViewEl = document.getElementById("tl-month-view");

function setViewMode(mode) {
  viewMode = mode;
  defaultViewEl.style.display = mode === "default" ? "block" : "none";
  dayViewEl.style.display = mode === "day" ? "block" : "none";
  monthViewEl.style.display = mode === "month" ? "block" : "none";
  if (mode === "day") renderDayView();
  if (mode === "month") renderMonthView();
}

document.getElementById("tl-today-btn").addEventListener("click", () => setViewMode("default"));
document.getElementById("tl-calendar-btn").addEventListener("click", () => setViewMode("month"));

function renderTimeline() {
  const now = new Date();
  if (viewMode === "default") {
    chrome.storage.sync.get({ tasks: [] }, ({ tasks }) => {
      sections.forEach((section) =>
        renderSection(section.trackEl, section.hoursEl, section.nowEl, addDays(now, section.dayOffset), now, tasks)
      );
    });
  } else if (viewMode === "day") {
    renderDayView();
  } else if (viewMode === "month") {
    renderMonthView(); // 할 일 추가/삭제 시 날짜별 점 개수도 같이 갱신되게
  }
}

renderTimeline();
setInterval(renderTimeline, 60 * 1000); // 지금 시각 표시선 + 상태색 갱신

// 처음 열었을 때 스크롤이 0시부터 시작하지 않고, 지금 시각이 위쪽 근처에 오게 맞춤 (딱 한 번만).
(() => {
  const scrollEl = document.getElementById("timeline-scroll");
  const nowMin = minutesFromStart(new Date());
  scrollEl.scrollTop = Math.max(0, (nowMin / 60) * HOUR_PX - 40);
})();

const pastList = document.getElementById("task-list-past");
const pastSummary = document.getElementById("past-summary");

function isTaskPast(task, now) {
  return now.getTime() >= new Date(task.time).getTime() + task.durationMin * 60000;
}

function buildTaskRow(task) {
  const li = document.createElement("li");

  const main = document.createElement("div");
  main.className = "task-main";
  const title = document.createElement("div");
  title.className = "title";
  title.textContent = task.title;
  const meta = document.createElement("div");
  meta.className = "meta";
  const when = new Date(task.time).toLocaleString("ko-KR");
  meta.textContent = `${when} · ${task.durationMin}분 · ${task.topic}`;
  main.appendChild(title);
  main.appendChild(meta);

  const actions = document.createElement("div");
  const editBtn = document.createElement("button");
  editBtn.className = "btn-ghost";
  editBtn.textContent = "수정";
  editBtn.onclick = () => startEdit(task);
  const delBtn = document.createElement("button");
  delBtn.className = "btn-ghost";
  delBtn.textContent = "삭제";
  delBtn.onclick = () => removeTask(task.id);
  actions.appendChild(editBtn);
  actions.appendChild(delBtn);

  li.appendChild(main);
  li.appendChild(actions);
  return li;
}

function loadTasks() {
  chrome.storage.sync.get({ tasks: [] }, ({ tasks }) => {
    const now = new Date();
    const upcoming = tasks.filter((t) => !isTaskPast(t, now));
    const past = tasks.filter((t) => isTaskPast(t, now));

    list.innerHTML = "";
    upcoming.forEach((task) => list.appendChild(buildTaskRow(task)));

    pastList.innerHTML = "";
    past.forEach((task) => pastList.appendChild(buildTaskRow(task)));
    pastSummary.textContent = `지난 할 일 (${past.length})`;
  });
}

function removeTask(id) {
  chrome.storage.sync.get({ tasks: [] }, ({ tasks }) => {
    chrome.storage.sync.set({ tasks: tasks.filter((t) => t.id !== id) }, () => {
      loadTasks();
      renderTimeline();
    });
  });
}

document.getElementById("clear-past").addEventListener("click", () => {
  chrome.storage.sync.get({ tasks: [] }, ({ tasks }) => {
    const now = new Date();
    const remaining = tasks.filter((t) => !isTaskPast(t, now));
    const removedCount = tasks.length - remaining.length;
    if (removedCount === 0) return;
    if (!confirm(`지난 할 일 ${removedCount}개를 삭제할까요?`)) return;
    chrome.storage.sync.set({ tasks: remaining }, () => {
      loadTasks();
      renderTimeline();
    });
  });
});

// --- 할 일 수정 ---
let editingId = null;
const submitBtn = document.getElementById("task-submit");
const cancelBtn = document.getElementById("cancel-edit");
const formTitleEl = document.getElementById("task-form-title");

function startEdit(task) {
  editingId = task.id;
  document.getElementById("title").value = task.title;
  document.getElementById("time").value = task.time;
  document.getElementById("duration").value = task.durationMin;
  document.getElementById("topic").value = task.topic;
  formTitleEl.textContent = "할 일 수정";
  submitBtn.textContent = "수정 완료";
  cancelBtn.style.display = "inline-block";
  form.scrollIntoView({ behavior: "smooth", block: "center" });
}

function stopEdit() {
  editingId = null;
  form.reset();
  formTitleEl.textContent = "할 일 추가";
  submitBtn.textContent = "추가";
  cancelBtn.style.display = "none";
}

cancelBtn.addEventListener("click", stopEdit);

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const taskData = {
    title: document.getElementById("title").value,
    time: document.getElementById("time").value,
    durationMin: Number(document.getElementById("duration").value),
    topic: document.getElementById("topic").value,
  };
  chrome.storage.sync.get({ tasks: [] }, ({ tasks }) => {
    const newTasks = editingId
      ? tasks.map((t) => (t.id === editingId ? { ...t, ...taskData } : t))
      : [...tasks, { id: crypto.randomUUID(), ...taskData }];
    chrome.storage.sync.set({ tasks: newTasks }, () => {
      stopEdit();
      loadTasks();
      renderTimeline();
    });
  });
});

document.getElementById("clear-cache").addEventListener("click", () => {
  chrome.storage.local.remove("activityCache", () => alert("활동 캐시 초기화됨"));
});

document.getElementById("import-tasks").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  let imported;
  try {
    imported = JSON.parse(await file.text());
  } catch {
    alert("JSON 파싱 실패 — 파일 형식을 확인해줘");
    return;
  }

  const tasks = imported.map((t) => ({ id: t.id ?? crypto.randomUUID(), ...t }));
  chrome.storage.sync.set({ tasks }, () => {
    alert(`${tasks.length}개 할 일 불러옴`);
    loadTasks();
    renderTimeline();
  });
  e.target.value = ""; // 같은 파일 다시 골라도 change 이벤트 뜨게
});

loadTasks();

// --- 감시 사이트 관리 ---
// background.js의 DEFAULT_SITES와 동일 (첫 로드 시 기본값 표시용, 실제 시드는 background에서 함).
const DEFAULT_SITES = [
  { id: "site-youtube", label: "youtube.com", pattern: "*://*.youtube.com/*", enabled: true, builtin: true },
  { id: "site-netflix", label: "netflix.com", pattern: "*://*.netflix.com/*", enabled: true, builtin: true },
  { id: "site-instagram", label: "instagram.com", pattern: "*://*.instagram.com/*", enabled: true, builtin: true },
];

const siteList = document.getElementById("site-list");
const siteForm = document.getElementById("site-form");
const siteUrlInput = document.getElementById("site-url");

function hostnameFromInput(raw) {
  try {
    const url = raw.includes("://") ? raw : `https://${raw}`;
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function renderSites() {
  chrome.storage.sync.get({ sites: DEFAULT_SITES }, ({ sites }) => {
    siteList.innerHTML = "";
    sites.forEach((site) => {
      const li = document.createElement("li");

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = site.enabled;
      checkbox.onchange = () => toggleSite(site.id, checkbox.checked);

      const label = document.createElement("span");
      label.textContent = site.label;

      li.appendChild(checkbox);
      li.appendChild(label);

      if (!site.builtin) {
        const delBtn = document.createElement("button");
        delBtn.className = "btn-ghost";
        delBtn.textContent = "삭제";
        delBtn.onclick = () => removeSite(site.id);
        li.appendChild(delBtn);
      }

      siteList.appendChild(li);
    });
  });
}

function toggleSite(id, enabled) {
  chrome.storage.sync.get({ sites: DEFAULT_SITES }, ({ sites }) => {
    const next = sites.map((s) => (s.id === id ? { ...s, enabled } : s));
    chrome.storage.sync.set({ sites: next }, renderSites);
  });
}

function removeSite(id) {
  chrome.storage.sync.get({ sites: DEFAULT_SITES }, ({ sites }) => {
    chrome.storage.sync.set({ sites: sites.filter((s) => s.id !== id) }, renderSites);
  });
}

siteForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const hostname = hostnameFromInput(siteUrlInput.value.trim());
  if (!hostname) {
    alert("올바른 URL이나 도메인을 입력해줘 (예: tiktok.com)");
    return;
  }
  const pattern = `*://*.${hostname}/*`;

  // 새 도메인은 옵션 페이지(사용자 제스처 안)에서 직접 권한 요청해야 함 — background에선 안 됨.
  const granted = await chrome.permissions.request({ origins: [pattern] });
  if (!granted) {
    alert("권한을 허용해야 그 사이트에서 동작해");
    return;
  }

  chrome.storage.sync.get({ sites: DEFAULT_SITES }, ({ sites }) => {
    if (sites.some((s) => s.pattern === pattern)) {
      alert("이미 추가된 사이트야");
      return;
    }
    const newSite = {
      id: `site-${crypto.randomUUID()}`,
      label: hostname,
      pattern,
      enabled: true,
      builtin: false,
    };
    chrome.storage.sync.set({ sites: [...sites, newSite] }, () => {
      siteUrlInput.value = "";
      renderSites();
    });
  });
});

renderSites();
