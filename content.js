console.log("[Transit] content script loaded on", location.hostname);

// ponytail: 테스트하기 쉽게 짧게 잡음. 실제 임계값(예: 20분)은 3단계에서 옵션으로 뺄 예정.
const THRESHOLD_MS = 15 * 1000; // 15초

// SPA(유튜브/넷플릭스/인스타)는 영상/게시물 넘겨도 페이지가 안 새로고침돼서
// content script가 안 죽음 → 반복 체크로 계속 감시.
// setInterval 대신 재귀 setTimeout: 오버레이가 "닫힌 시점"부터 다시 카운트해야
// 오버레이 보고 있던 시간만큼 다음 트리거가 당겨오지 않음.
async function tick() {
  const { tasks } = await chrome.storage.local.get({ tasks: [] });
  const task = selectRelevantTask(tasks);
  console.log("[Transit] threshold reached, selected task:", task);

  const onDismiss = (startedFocus) => {
    if (startedFocus) {
      // 타이머는 background로 넘기고 여기(탭)는 그냥 빠짐 — idea.md 7단계: "앱은 스스로 빠진다"
      // TODO: 테스트 끝나면 25로 되돌리기
      try {
        chrome.runtime.sendMessage({ type: "START_FOCUS", taskTitle: task.title, minutes: 0.25 }); // 0.25분 = 15초
      } catch (err) {
        // 확장 프로그램이 리로드된 뒤 이 탭을 새로고침 안 했을 때 여기서 던짐.
        // 이거 때문에 다음 트리거 예약까지 죽으면 안 되니 무시하고 계속 진행.
        console.error("[Transit] 포커스 타이머 시작 실패 (탭 새로고침 필요할 수 있음):", err);
      }
    }
    setTimeout(tick, THRESHOLD_MS);
  };

  if (!task) {
    // 관련 할 일이 없으면 오버레이 자체를 띄우지 않고 조용히 다음 체크로 넘어감
    // (idea.md 시나리오 C 원안은 가벼운 문구를 보여주는 거였는데, 실사용해보니
    // 내용 없는 팝업 반복이 오히려 방해로 느껴져서 무개입으로 바꿈)
    setTimeout(tick, THRESHOLD_MS);
    return;
  }

  showLoadingOverlay();
  const activity = await generateActivity(task);
  showOverlay(task, activity, onDismiss);
}

setTimeout(tick, THRESHOLD_MS);
