// idea.md의 4개 활동 유형. 주제당 이 4개를 딱 한 번씩만 생성하고, 그 뒤로는
// 새로 만들지 않고 이미 만든 것들 중에서만 골라 재사용한다 (LLM 호출 상한 = 주제당 4회).
const LENGTH_HINTS = {
  "읽을거리+질문": "읽을거리 3분 + 질문 2개",
  "미니 퀴즈": "정확히 2문항",
  "사고 미션": "산출형 과제 1개 (예: 이 개념을 초등학생에게 3문장으로 설명해보기 같은 형식)",
  "실행 미션": "지금 당장 손으로 할 수 있는 아주 작은 실행 과제 1개 (예: 교재 목차 펴서 오늘 볼 부분 표시하기)",
};
const ACTIVITY_TYPES = Object.keys(LENGTH_HINTS);

const TEXT_SCHEMA = {
  type: "object",
  properties: {
    activityText: { type: "string" },
    nextAction: { type: "string" },
  },
  required: ["activityText", "nextAction"],
  additionalProperties: false,
};

// 미니 퀴즈는 실제 문제처럼 보기 나열해서 보여주려고 구조화된 스키마로 따로 받음.
const QUIZ_SCHEMA = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question: { type: "string" },
          choices: { type: "array", items: { type: "string" } },
        },
        required: ["question", "choices"],
        additionalProperties: false,
      },
    },
    nextAction: { type: "string" },
  },
  required: ["questions", "nextAction"],
  additionalProperties: false,
};

function pickActivityType(topic, cache) {
  const missing = ACTIVITY_TYPES.filter((t) => !cache[`${topic}::${t}`]);
  if (missing.length > 0) {
    return { type: missing[Math.floor(Math.random() * missing.length)], needsGeneration: true };
  }
  // 4개 다 만들어져 있으면 새로 생성하지 않고 그중에서만 랜덤 재사용.
  return { type: ACTIVITY_TYPES[Math.floor(Math.random() * ACTIVITY_TYPES.length)], needsGeneration: false };
}

// idea.md: 활동 생성은 (주제, 활동유형, 남은시간) -> 활동 콘텐츠 1개 + 고정 포맷 종료 행동.
async function generateActivity(task) {
  const { apiKey: rawApiKey, activityCache } = await chrome.storage.local.get({
    apiKey: "",
    activityCache: {},
  });
  const apiKey = rawApiKey.trim(); // 복붙 때 앞뒤 공백/줄바꿈 섞여도 자동 정리
  if (!apiKey) {
    console.warn("[Transit] API 키 없음 — 옵션 페이지에서 저장 필요");
    return null;
  }

  const { type: activityType, needsGeneration } = pickActivityType(task.topic, activityCache);
  const cacheKey = `${task.topic}::${activityType}`;

  if (!needsGeneration) {
    console.log("[Transit] 캐시 재사용 (주제당 4개 상한 도달):", cacheKey);
    return activityCache[cacheKey];
  }

  const isQuiz = activityType === "미니 퀴즈";
  const prompt = `주제: ${task.topic}
할 일 제목: ${task.title}
활동 유형: ${activityType}

위 주제로 5~10분짜리 "${activityType}" 전환 활동을 만들어줘.
- 분량: ${LENGTH_HINTS[activityType]}
${isQuiz ? "- 각 문항은 4지선다(choices 4개)로 (정답 표시는 필요 없음, 채점보다 감 잡기가 목적)" : "- activityText는 600자 이내로 간결하게 (장문 에세이 금지)"}
${activityType === "읽을거리+질문" ? '- 질문이 여러 개면 "질문 1: ...", "질문 2: ..."처럼 각각 새 줄(\\n)로 구분해서 써줘' : ""}
- 수식이 필요하면 LaTeX 문법(\\frac, \\leq, \\sum, $...$, \\(...\\) 등) 쓰지 말고 렌더링 안 해도 되는
  일반 텍스트로 쓸 것. 예: "x1 + 2x2 <= 10", "max Z = 3x1 + 5x2", 부등호는 <=, >=, 합계는 Σ 사용.
  제약식이 여러 줄이면 줄바꿈(\\n)으로 하나씩 구분.
- 행렬/배열처럼 줄맞춤이 중요한 표현은 앞뒤를 \`\`\`로 감싸고, 각 행마다 줄바꿈(\\n)을 넣고,
  숫자마다 공백을 채워서 자릿수를 맞출 것 (고정폭 폰트로 그대로 렌더링됨). 예:
  \`\`\`
  [  1   2   3 ]
  [  4   5   6 ]
  [  7   8   9 ]
  \`\`\`
- 반드시 이 주제와 직접 관련된 내용 (무주제 게임 금지)
- 흥미롭고 정확할 것
- 마지막은 "지금 할 구체적 첫 행동 1개"로 이어지게`;

  let res;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5", // idea.md 명시 모델
        max_tokens: 1400, // 600자 제한 + 수식/제약식 여러 줄 들어갈 여유
        output_config: {
          effort: "low", // 5~10초 이탈 방지, 짧은 활동이라 low로 충분
          format: {
            type: "json_schema",
            schema: isQuiz ? QUIZ_SCHEMA : TEXT_SCHEMA,
          },
        },
        messages: [{ role: "user", content: prompt }],
      }),
    });
  } catch (err) {
    console.error("[Transit] LLM 요청 네트워크 오류", err);
    return null;
  }

  if (!res.ok) {
    console.error("[Transit] LLM 요청 실패", res.status, await res.text());
    return null;
  }

  const data = await res.json();
  const text = data.content?.[0]?.text ?? "";
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    console.error("[Transit] LLM 응답 JSON 파싱 실패:", text);
    return null;
  }

  const entry = { ...parsed, activityType };
  await chrome.storage.local.set({
    activityCache: { ...activityCache, [cacheKey]: entry },
  });
  return entry;
}
