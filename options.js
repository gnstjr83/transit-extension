const form = document.getElementById("task-form");
const list = document.getElementById("task-list");
const keyForm = document.getElementById("key-form");
const apiKeyInput = document.getElementById("apiKey");

chrome.storage.local.get({ apiKey: "" }, ({ apiKey }) => {
  apiKeyInput.value = apiKey;
});

keyForm.addEventListener("submit", (e) => {
  e.preventDefault();
  chrome.storage.local.set({ apiKey: apiKeyInput.value });
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
  chrome.storage.local.get({ retroLog: [] }, ({ retroLog }) => {
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
  if (area === "local" && changes.retroLog) renderRetroStats();
});

document.getElementById("clear-retro").addEventListener("click", () => {
  if (!confirm("전환 성공률 기록을 초기화할까요?")) return;
  chrome.storage.local.remove("retroLog", renderRetroStats);
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

// .tl-wrap[data-day="0"]=오늘, "1"=내일. 각각 자기 hours/track/now(있으면)를 가짐.
const sections = Array.from(document.querySelectorAll(".tl-wrap")).map((wrap) => ({
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

// 0~4시간: 빨강 -> 노랑. 4~12시간: 노랑 -> 초록. 12시간 이후는 초록 고정.
// 구글 캘린더 스타일: 왼쪽 굵은 색 바(진한 색) + 옅은 틴트 배경. 단색으로 꽉 채우지 않음.
const RED_RGB = [239, 68, 68]; // red-500
const YELLOW_RGB = [234, 179, 8]; // yellow-500
const GREEN_RGB = [34, 197, 94]; // green-500
const NEAR_WINDOW_MIN = 240; // 4시간
const FAR_WINDOW_MIN = 720; // 12시간
const BLOCK_TEXT = "#1f2937";

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
    fill: `rgba(${r}, ${g}, ${b}, 0.12)`,
    text: BLOCK_TEXT,
  };
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

function renderSection(section, now, tasks) {
  const { dayOffset, trackEl, nowEl } = section;
  const dayDate = addDays(now, dayOffset);
  trackEl.style.height = `${trackHeight}px`;

  if (nowEl) {
    const nowMin = minutesFromStart(now);
    nowEl.style.top = `${Math.max(0, Math.min(trackHeight, (nowMin / 60) * HOUR_PX))}px`;
    nowEl.style.display = nowMin >= 0 && nowMin <= (END_HOUR - START_HOUR) * 60 ? "block" : "none";
  }

  trackEl.querySelectorAll(".tl-block").forEach((el) => el.remove());

  tasks
    .filter((t) => isSameDay(new Date(t.time), dayDate))
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
      if (status !== "past") {
        const minutesAway = status === "ongoing" ? 0 : (start - now) / 60000;
        const { accent, fill, text } = urgencyColor(minutesAway);
        block.style.background = fill;
        block.style.borderLeft = `3px solid ${accent}`;
        block.style.color = text;
      }
      block.title = `${task.title} (${task.topic})`;
      const titleEl = document.createElement("div");
      titleEl.className = "tl-title";
      titleEl.textContent = task.title;
      const timeEl = document.createElement("div");
      timeEl.className = "tl-time";
      timeEl.textContent = `${pad(start.getHours())}:${pad(start.getMinutes())}–${pad(end.getHours())}:${pad(end.getMinutes())}`;
      block.appendChild(titleEl);
      block.appendChild(timeEl);
      block.onclick = (e) => e.stopPropagation(); // TODO: 나중에 클릭해서 수정/삭제
      trackEl.appendChild(block);
    });
}

function renderTimeline() {
  const now = new Date();
  chrome.storage.local.get({ tasks: [] }, ({ tasks }) => {
    sections.forEach((section) => renderSection(section, now, tasks));
  });
}

sections.forEach((section) => {
  section.trackEl.addEventListener("click", (e) => {
    const clickY = e.offsetY;
    const rawMin = (clickY / HOUR_PX) * 60 + START_HOUR * 60;
    const rounded = Math.round(rawMin / 5) * 5; // 5분 단위로 스냅
    const d = addDays(new Date(), section.dayOffset);
    d.setHours(0, rounded, 0, 0);
    document.getElementById("time").value = localISO(d);
    document.getElementById("title").focus();
    document.getElementById("task-form").scrollIntoView({ behavior: "smooth", block: "center" });
  });
  renderHourLabels(section.hoursEl);
});

renderTimeline();
setInterval(renderTimeline, 60 * 1000); // 지금 시각 표시선 + 상태색 갱신

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
  chrome.storage.local.get({ tasks: [] }, ({ tasks }) => {
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
  chrome.storage.local.get({ tasks: [] }, ({ tasks }) => {
    chrome.storage.local.set({ tasks: tasks.filter((t) => t.id !== id) }, () => {
      loadTasks();
      renderTimeline();
    });
  });
}

document.getElementById("clear-past").addEventListener("click", () => {
  chrome.storage.local.get({ tasks: [] }, ({ tasks }) => {
    const now = new Date();
    const remaining = tasks.filter((t) => !isTaskPast(t, now));
    const removedCount = tasks.length - remaining.length;
    if (removedCount === 0) return;
    if (!confirm(`지난 할 일 ${removedCount}개를 삭제할까요?`)) return;
    chrome.storage.local.set({ tasks: remaining }, () => {
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
  chrome.storage.local.get({ tasks: [] }, ({ tasks }) => {
    const newTasks = editingId
      ? tasks.map((t) => (t.id === editingId ? { ...t, ...taskData } : t))
      : [...tasks, { id: crypto.randomUUID(), ...taskData }];
    chrome.storage.local.set({ tasks: newTasks }, () => {
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
  chrome.storage.local.set({ tasks }, () => {
    alert(`${tasks.length}개 할 일 불러옴`);
    loadTasks();
    renderTimeline();
  });
  e.target.value = ""; // 같은 파일 다시 골라도 change 이벤트 뜨게
});

loadTasks();
