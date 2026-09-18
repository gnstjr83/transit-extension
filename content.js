console.log("[Transit] content script loaded on", location.hostname);

// SPA(유튜브/넷플릭스/인스타)는 영상/게시물 넘겨도 페이지가 안 새로고침돼서
// content script가 안 죽음 → 반복 체크로 계속 감시.
// setInterval 대신 재귀 setTimeout: 오버레이가 "닫힌 시점"부터 다시 카운트해야
// 오버레이 보고 있던 시간만큼 다음 트리거가 당겨오지 않음.
// 시청 제한 시간/집중 타이머는 옵션 페이지("트리거 설정")에서 바꿀 수 있음 — 매번 storage에서 새로 읽음.
async function tick() {
  const { tasks, thresholdSec, focusMinutes } = await chrome.storage.sync.get({
    tasks: [],
    thresholdSec: 1200, // 기본 20분
    focusMinutes: 25,
  });
  const thresholdMs = thresholdSec * 1000;
  const task = selectRelevantTask(tasks);
  console.log("[Transit] threshold reached, selected task:", task);

  const onDismiss = (startedFocus) => {
    if (startedFocus) {
      // 타이머는 background로 넘기고 여기(탭)는 그냥 빠짐 — idea.md 7단계: "앱은 스스로 빠진다"
      try {
        chrome.runtime.sendMessage({ type: "START_FOCUS", taskTitle: task.title, minutes: focusMinutes });
      } catch (err) {
        // 확장 프로그램이 리로드된 뒤 이 탭을 새로고침 안 했을 때 여기서 던짐.
        // 이거 때문에 다음 트리거 예약까지 죽으면 안 되니 무시하고 계속 진행.
        console.error("[Transit] 포커스 타이머 시작 실패 (탭 새로고침 필요할 수 있음):", err);
      }
    }
    setTimeout(tick, thresholdMs);
  };

  if (task && (location.hostname.includes("youtube.com") || location.hostname.includes("netflix.com"))) {
    document.querySelector("video")?.pause();
  }

  if (!task) {
    // 관련 할 일이 없으면 오버레이 자체를 띄우지 않고 조용히 다음 체크로 넘어감
    // (idea.md 시나리오 C 원안은 가벼운 문구를 보여주는 거였는데, 실사용해보니
    // 내용 없는 팝업 반복이 오히려 방해로 느껴져서 무개입으로 바꿈)
    setTimeout(tick, thresholdMs);
    return;
  }

  showLoadingOverlay();
  const activity = await generateActivity(task);
  showOverlay(task, activity, onDismiss, focusMinutes);
}

chrome.storage.sync.get({ thresholdSec: 1200 }, ({ thresholdSec }) => {
  setTimeout(tick, thresholdSec * 1000);
});

// 진행중인 할 일이 있는데 유튜브 영상을 (새로 들어가서든, 다시 눌러서든) 재생시키면 살짝 찔러줌.
// 'play' 이벤트는 버블링 안 해서 document에 캡처 단계로 걸어야 함 — 영상이 SPA로 바뀌어도 계속 잡힘.
if (location.hostname.includes("youtube.com")) {
  let lastNudgeAt = 0;
  let lastVideoKey = null;
  const NUDGE_COOLDOWN_MS = 30 * 1000; // 같은 영상에서 버퍼링 재개 등으로 play가 자주 뜨는 걸 방지

  document.addEventListener(
    "play",
    async (e) => {
      if (e.target.tagName !== "VIDEO") return;

      // 쇼츠 넘기는 것처럼 다른 영상으로 바뀐 거면 쿨다운 무시하고 매번 체크.
      // 같은 영상 안에서 재생만 다시 누른 거면(버퍼링 재개 포함) 쿨다운 적용.
      const videoKey = location.href;
      const isNewVideo = videoKey !== lastVideoKey;
      lastVideoKey = videoKey;
      console.log("[Transit] play 이벤트 감지됨", { isNewVideo, videoKey });

      if (!isNewVideo && Date.now() - lastNudgeAt < NUDGE_COOLDOWN_MS) {
        console.log("[Transit] 같은 영상 쿨다운 중이라 스킵");
        return;
      }

      const { tasks } = await chrome.storage.sync.get({ tasks: [] });
      const task = selectRelevantTask(tasks);
      console.log("[Transit] nudge 후보 task:", task);
      if (task?.status === "ongoing") {
        lastNudgeAt = Date.now();
        showNudge(task.title);
      }
    },
    true
  );
}
