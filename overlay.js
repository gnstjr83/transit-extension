const ACCENT = "#14B8A6"; // 차분한 민트/틸 — 경고색이 아니라 "도와주는" 느낌

function ensureStyles() {
  if (document.getElementById("transit-style")) return;
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
    background: rgba(15, 23, 42, 0.45);
    backdrop-filter: blur(6px);
    display: flex; align-items: center; justify-content: center;
    font-family: -apple-system, "Segoe UI", system-ui, sans-serif;
  `;
  const card = document.createElement("div");
  card.style.cssText = `
    background: #fff; color: #1f2937; width: 440px; max-width: 92vw;
    max-height: 85vh; overflow-y: auto;
    padding: 32px; border-radius: 20px;
    box-shadow: 0 20px 60px rgba(15, 23, 42, 0.2);
    font-size: 17px; line-height: 1.65;
    animation: transit-fade-in 220ms ease-out;
  `;
  overlay.appendChild(card);

  const badge = document.createElement("div");
  badge.textContent = "🌱 Transit";
  badge.style.cssText = `
    display: inline-block; font-size: 13px; font-weight: 600;
    color: ${ACCENT}; background: #F0FDFA;
    padding: 4px 10px; border-radius: 999px; margin-bottom: 14px;
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
        font-family: "Courier New", monospace; font-size: 14px; white-space: pre;
        overflow-x: auto; background: #F8FAFC; border: 1px solid #E2E8F0;
        border-radius: 8px; padding: 10px 12px; margin: 8px 0;
      `;
      pre.textContent = part.trim();
      container.appendChild(pre);
    } else if (part.trim()) {
      const span = document.createElement("div");
      span.style.whiteSpace = "pre-line";
      span.style.fontFamily = "Georgia, Cambria, 'Times New Roman', serif"; // 교재/논문 느낌
      span.textContent = part;
      container.appendChild(span);
    }
  });
}

function makeButton(id, label, variant) {
  const btn = document.createElement("button");
  btn.id = id;
  btn.textContent = label;
  const base = "padding:11px 22px; margin-top:16px; margin-right:8px; font-size:15px; font-weight:600; border-radius:999px; cursor:pointer; border:none; transition: opacity .15s;";
  btn.style.cssText =
    variant === "primary"
      ? `${base} background:${ACCENT}; color:#fff;`
      : `${base} background:transparent; color:#6b7280;`;
  btn.onmouseenter = () => (btn.style.opacity = "0.85");
  btn.onmouseleave = () => (btn.style.opacity = "1");
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
    qTitle.style.cssText = "font-weight:700; margin:0 0 10px; color:#111827;";
    renderRichText(qTitle, `Q${qi + 1}. ${q.question}`);
    qBlock.appendChild(qTitle);

    (q.choices ?? []).forEach((choice, ci) => {
      const chip = document.createElement("div");
      chip.style.cssText = `
        background:#F8FAFC; border:1px solid #E2E8F0; border-radius:10px;
        padding:10px 14px; margin-bottom:8px; font-size:16px;
      `;
      renderRichText(chip, `${circled[ci] ?? ci + 1} ${choice}`);
      qBlock.appendChild(chip);
    });
    wrap.appendChild(qBlock);
  });

  return wrap;
}

// LLM 응답 기다리는 동안 (idea.md 리스크: 로딩 중 이탈 방지용 짧은 대기 화면)
function showLoadingOverlay() {
  clearOverlay();
  const { overlay, card } = baseOverlay();
  const p = document.createElement("p");
  p.style.cssText = "margin:0; color:#6b7280;";
  p.textContent = "전환 활동 준비 중...";
  card.appendChild(p);
  document.body.appendChild(overlay);
}

// task는 항상 존재 (할 일 없을 때는 content.js가 애초에 이 함수를 안 부름).
// activity: llm.js의 generateActivity() 결과. 텍스트형 {activityText, nextAction} 또는
// 퀴즈형 {questions, nextAction}. null이면 실패/키 미설정 → 더미로 대체.
function showOverlay(task, activity, onDismiss) {
  clearOverlay();
  const { overlay, card } = baseOverlay();

  const h2 = document.createElement("h2");
  h2.style.cssText = "margin:0 0 12px; font-size:21px;";
  h2.textContent =
    task.status === "ongoing"
      ? `지금 "${task.title}" 시간이에요`
      : `곧 "${task.title}" 시간이에요`;
  card.appendChild(h2);

  if (activity?.questions) {
    card.appendChild(renderQuiz(activity.questions));
  } else {
    const wrap = document.createElement("div");
    wrap.style.color = "#374151";
    renderRichText(
      wrap,
      activity?.activityText ??
        `(더미 — API 키 미설정 또는 생성 실패) ${task.topic}에 관해 흥미로운 질문 하나: "이걸 3문장으로 설명한다면?"`
    );
    card.appendChild(wrap);
  }

  const nextBox = document.createElement("div");
  nextBox.style.cssText = `
    background:#F0FDFA; border-radius:12px; padding:14px 16px; margin-top:16px;
  `;
  const label = document.createElement("div");
  label.style.cssText = `font-size:13px; font-weight:700; color:${ACCENT}; margin-bottom:4px;`;
  label.textContent = "다음 행동";
  const nextText = document.createElement("div");
  nextText.style.color = "#111827";
  nextText.textContent = activity?.nextAction ?? `${task.title} 관련 자료 펴고 3분만 훑어보기`;
  nextBox.appendChild(label);
  nextBox.appendChild(nextText);
  card.appendChild(nextBox);

  card.appendChild(makeButton("transit-start", "25분 집중 시작", "primary"));
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
