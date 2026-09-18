// idea.md 우선순위 (a)진행중 (b)임박 을 실제 기간(시작~소요시간)으로 판단.
// (c)오늘마감/중요 표시, (d)자주 미룬 일은 아직 데이터에 없는 필드라 P1에서 추가.
const DEFAULT_DURATION_MIN = 60;
const UPCOMING_WINDOW_MS = 4 * 60 * 60 * 1000; // 4시간 내 예정이면 "임박"으로 간주

function selectRelevantTask(tasks, now = new Date()) {
  const nowMs = now.getTime();
  const withRange = tasks
    .map((t) => {
      const startTs = new Date(t.time).getTime();
      const durationMs = (t.durationMin ?? DEFAULT_DURATION_MIN) * 60 * 1000;
      return { ...t, startTs, endTs: startTs + durationMs };
    })
    .filter((t) => !Number.isNaN(t.startTs));

  // (a) 진행중: 지금이 시작~종료 사이. 여러 개 겹치면 더 늦게(최근에) 시작한 것부터
  // — 지금 실제로 하고 있을 가능성이 더 높다고 보고 우선.
  const ongoing = withRange
    .filter((t) => t.startTs <= nowMs && nowMs <= t.endTs)
    .sort((a, b) => b.startTs - a.startTs);
  if (ongoing.length > 0) return { ...ongoing[0], status: "ongoing" };

  // (b) 임박: 아직 시작 안 했지만 곧(4시간 내) 시작. 가장 빨리 시작하는 것부터.
  const upcoming = withRange
    .filter((t) => t.startTs > nowMs && t.startTs - nowMs <= UPCOMING_WINDOW_MS)
    .sort((a, b) => a.startTs - b.startTs);
  if (upcoming.length > 0) return { ...upcoming[0], status: "upcoming" };

  return null;
}
