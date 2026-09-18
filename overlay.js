const ACCENT = "#FF5A5F";
const INK = "#2B2620";
const INK_MUTED = "#8A8378";
const PAPER = "#FFFFFF";
const BORDER = "#2B2620";
const BORDER_SOFT = "#EFE2C8";
const FONT_DISPLAY = '"Black Han Sans", "Jua", sans-serif';
const FONT_BODY = '"Jua", sans-serif'; // 한글 지원 폰트 — Georgia 등은 한글 글리프가 없어서 조용히 대체됨
const FONT_CODE = '"Courier New", monospace'; // 행렬/수식 줄맞춤용 (숫자·영문이라 모노스페이스 유지)

function ensureStyles() {
  if (document.getElementById("transit-style")) return;

  // 문방구 스티커 톤 폰트 (호스트 페이지 <head>에 한 번만 주입, 실패해도 시스템 폰트로 대체됨)
  const fontLink = document.createElement("link");
  fontLink.rel = "stylesheet";
  fontLink.href = "https://fonts.googleapis.com/css2?family=Black+Han+Sans&family=Jua&display=swap";
  document.head.appendChild(fontLink);

  const style = document.createElement("style");
  style.id = "transit-style";
  style.textContent = `
    @keyframes transit-fade-in {
      from { opacity: 0; transform: translateY(6px) scale(.98); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }
  `;
  document.head.appendChild(style);
}

function clearOverlay() {
  document.getElementById("transit-overlay")?.remove();
}

function baseOverlay() {
  ensureStyles();
  const overlay = document.createElement("div");
  overlay.id = "transit-overlay";
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 2147483647;
    background: rgba(20, 16, 10, 0.55);
    backdrop-filter: blur(6px);
    display: flex; align-items: center; justify-content: center;
    font-family: ${FONT_BODY};
  `;
  const card = document.createElement("div");
  card.style.cssText = `
    background: ${PAPER}; color: ${INK}; width: 440px; max-width: 92vw;
    max-height: 85vh; overflow-y: auto;
    padding: 32px; border-radius: 20px; border: 2.5px solid ${BORDER};
    box-shadow: 6px 6px 0 ${BORDER};
    font-size: 17px; line-height: 1.65;
    animation: transit-fade-in 220ms ease-out;
  `;
  overlay.appendChild(card);

  const badge = document.createElement("div");
  badge.textContent = "🔍 CASE: TRANSIT";
  badge.style.cssText = `
    display: inline-block; font-family: ${FONT_DISPLAY}; font-size: 13px; font-weight: 700;
    color: #fff; background: ${ACCENT}; border: 2.5px solid ${BORDER};
    border-radius: 999px; padding: 4px 12px; margin-bottom: 14px;
    transform: rotate(-2deg); box-shadow: 2px 2px 0 ${BORDER};
  `;
  card.appendChild(badge);

  return { overlay, card };
}

// 텍스트 안에 ```로 감싼 구간(행렬 등)이 있으면 고정폭 폰트 <pre>로 렌더링해서
// 줄맞춤이 유지되게 함. 나머지는 평범한 텍스트(줄바꿈만 유지).
function renderRichText(container, text) {
  text.split("```").forEach((part, i) => {
    if (i % 2 === 1) {
      const pre = document.createElement("pre");
      pre.style.cssText = `
        font-family: ${FONT_CODE}; font-size: 14px; white-space: pre;
        overflow-x: auto; background: #FBF7EC; border: 2px solid ${BORDER_SOFT};
        border-radius: 8px; padding: 10px 12px; margin: 8px 0;
      `;
      pre.textContent = part.trim();
      container.appendChild(pre);
    } else if (part.trim()) {
      const span = document.createElement("div");
      span.style.whiteSpace = "pre-line";
      span.style.fontFamily = FONT_BODY;
      span.textContent = part;
      container.appendChild(span);
    }
  });
}

function makeButton(id, label, variant) {
  const btn = document.createElement("button");
  btn.id = id;
  btn.textContent = label;
  const base = `padding:12px 22px; margin-top:16px; margin-right:8px; font-family:${FONT_DISPLAY}; font-size:15px; font-weight:700; border-radius:999px; cursor:pointer; transition: transform .1s, box-shadow .1s;`;
  btn.style.cssText =
    variant === "primary"
      ? `${base} background:${ACCENT}; color:#fff; border:2.5px solid ${BORDER}; box-shadow:3px 3px 0 ${BORDER};`
      : `${base} background:transparent; color:${INK_MUTED}; border:2px solid ${BORDER_SOFT};`;
  if (variant === "primary") {
    btn.onmousedown = () => {
      btn.style.transform = "translate(2px, 2px)";
      btn.style.boxShadow = "1px 1px 0 " + BORDER;
    };
    btn.onmouseup = btn.onmouseleave = () => {
      btn.style.transform = "translate(0, 0)";
      btn.style.boxShadow = "3px 3px 0 " + BORDER;
    };
  }
  return btn;
}

// 미니 퀴즈 문항: 보기 하나하나를 독립된 칩(카드)으로 렌더링 — 텍스트가 뭉쳐서
// 줄바꿈이 안 보이는 문제를 구조적으로 막음.
function renderQuiz(questions) {
  const wrap = document.createElement("div");
  const circled = ["①", "②", "③", "④", "⑤"];

  questions.forEach((q, qi) => {
    const qBlock = document.createElement("div");
    qBlock.style.marginBottom = "20px";

    const qTitle = document.createElement("div");
    qTitle.style.cssText = `font-weight:700; margin:0 0 10px; color:${INK};`;
    renderRichText(qTitle, `Q${qi + 1}. ${q.question}`);
    qBlock.appendChild(qTitle);

    (q.choices ?? []).forEach((choice, ci) => {
      const chip = document.createElement("div");
      chip.style.cssText = `
        background:#FFF6E0; border:2px solid ${BORDER_SOFT}; border-radius:10px;
        padding:10px 14px; margin-bottom:8px; font-size:16px;
      `;
      renderRichText(chip, `${circled[ci] ?? ci + 1} ${choice}`);
      qBlock.appendChild(chip);
    });
    wrap.appendChild(qBlock);
  });

  return wrap;
}

const NUDGE_TEMPLATES = [
  (title) => `잠깐, "${title}" 할 시간 아니에요?`,
  (title) => `"${title}" 놔두고 또 딴짓이에요?`,
  (title) => `지금 볼 때가 아니라 "${title}" 할 때예요`,
  (title) => `"${title}" 기다리고 있어요`,
  (title) => `쉿, "${title}" 먼저요`,
];

// 진행중인 할 일이 있는데 영상을 (다시) 재생시켰을 때 뜨는 알림.
// 전체 오버레이(LLM 호출)까지 안 가지만, 눈에 띄어야 하니 크고 화면 위쪽 가운데에 띄움.
function showNudge(title) {
  ensureStyles();
  document.getElementById("transit-nudge")?.remove(); // 쇼츠 연속 스와이프 등으로 쌓이지 않게
  const message = pickHeadline(NUDGE_TEMPLATES, title);
  const toast = document.createElement("div");
  toast.id = "transit-nudge";
  toast.style.cssText = `
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    z-index: 2147483647; max-width: 90vw;
    background: ${ACCENT}; color: #fff; padding: 18px 26px; border-radius: 16px;
    border: 2.5px solid ${BORDER};
    font-family: ${FONT_DISPLAY};
    font-size: 20px; font-weight: 700;
    box-shadow: 5px 5px 0 ${BORDER};
    animation: transit-fade-in 220ms ease-out;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 6000);
}

// LLM 응답 기다리는 동안 (idea.md 리스크: 로딩 중 이탈 방지용 짧은 대기 화면)
function showLoadingOverlay() {
  clearOverlay();
  const { overlay, card } = baseOverlay();
  const p = document.createElement("p");
  p.style.cssText = `margin:0; font-family:${FONT_BODY}; color:${INK_MUTED};`;
  p.textContent = "전환 활동 준비 중...";
  card.appendChild(p);
  document.body.appendChild(overlay);
}

// task는 항상 존재 (할 일 없을 때는 content.js가 애초에 이 함수를 안 부름).
// activity: llm.js의 generateActivity() 결과. 텍스트형 {activityText, nextAction} 또는
// 퀴즈형 {questions, nextAction}. null이면 실패/키 미설정 → 더미로 대체.
function formatFocusLabel(focusMinutes) {
  return focusMinutes < 1 ? `${Math.round(focusMinutes * 60)}초 집중 시작` : `${focusMinutes}분 집중 시작`;
}

// 매번 똑같은 문구면 지겨우니까 샘플 중 랜덤으로.
const ONGOING_HEADLINES = [
  (title) => `"${title}", 이미 시작했어야 할 시간이에요`,
  (title) => `지금 "${title}" 하고 있어야 해요`,
  (title) => `"${title}" 시간이 벌써 지나가고 있어요`,
  (title) => `"${title}", 더 늦기 전에요`,
  (title) => `지금 안 하면 "${title}" 밀려요`,
];
const UPCOMING_HEADLINES = [
  (title) => `"${title}" 10분 전이에요, 첫 단추를 잘 맞춰볼까요?`,
  (title) => `10분 뒤 "${title}" 시작이에요 — 미리 준비해볼까요?`,
  (title) => `"${title}"까지 10분 남았어요, 슬슬 준비해봐요`,
];
function pickHeadline(templates, title) {
  return templates[Math.floor(Math.random() * templates.length)](title);
}

function showOverlay(task, activity, onDismiss, focusMinutes = 25) {
  clearOverlay();
  const { overlay, card } = baseOverlay();

  const h2 = document.createElement("h2");
  h2.style.cssText = `margin:0 0 12px; font-family:${FONT_DISPLAY}; font-size:23px; font-weight:700;`;
  h2.textContent = pickHeadline(
    task.status === "ongoing" ? ONGOING_HEADLINES : UPCOMING_HEADLINES,
    task.title
  );
  card.appendChild(h2);

  if (activity?.questions) {
    card.appendChild(renderQuiz(activity.questions));
  } else {
    const wrap = document.createElement("div");
    wrap.style.color = INK;
    renderRichText(
      wrap,
      activity?.activityText ??
        `(더미 — API 키 미설정 또는 생성 실패) ${task.topic}에 관해 흥미로운 질문 하나: "이걸 3문장으로 설명한다면?"`
    );
    card.appendChild(wrap);
  }

  const nextBox = document.createElement("div");
  nextBox.style.cssText = `
    background:#FFE3E4; border:2px solid ${ACCENT}; border-radius:12px; padding:14px 16px; margin-top:16px;
  `;
  const label = document.createElement("div");
  label.style.cssText = `font-family:${FONT_DISPLAY}; font-size:13px; font-weight:700; color:${ACCENT}; margin-bottom:4px;`;
  label.textContent = "다음 행동";
  const nextText = document.createElement("div");
  nextText.style.cssText = `font-family:${FONT_BODY}; color:${INK};`;
  nextText.textContent = activity?.nextAction ?? `${task.title} 관련 자료 펴고 3분만 훑어보기`;
  nextBox.appendChild(label);
  nextBox.appendChild(nextText);
  card.appendChild(nextBox);

  card.appendChild(makeButton("transit-start", formatFocusLabel(focusMinutes), "primary"));
  card.appendChild(makeButton("transit-skip", "닫기", "ghost"));
  document.body.appendChild(overlay);

  overlay.querySelector("#transit-skip").onclick = () => {
    overlay.remove();
    onDismiss?.(false);
  };

  const startBtn = overlay.querySelector("#transit-start");
  if (startBtn) {
    startBtn.onclick = () => {
      overlay.remove();
      onDismiss?.(true);
    };
  }
}
