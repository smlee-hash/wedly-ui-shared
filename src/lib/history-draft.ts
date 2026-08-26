// 치던 글(아직 안 보낸 히스토리 본문)을 브라우저 안에 담아 두고, 다시 열었을 때 되살릴지 판정한다.
//
// 왜 필요한가 — 치던 글은 화면에만 있어 새로고침·뒤로가기하면 사라진다.
//
// ★본질적 한계: 떠나는 순간 보낸 요청이 서버에 닿았는지는 어떤 방법으로도 알 수 없다.
//   그래서 "보냈다"를 믿지 않고, **다시 열 때 서버 목록과 대조해** 판정한다
//   (서버에 같은 글이 있으면 담아 둔 것을 버리고, 없으면 입력칸에 되살린다).
//
// 판정(shouldRestoreDraft·isDraftExpired)은 순수 함수라 단위 시험으로 못 박고,
// 보관 도우미(readDraft 등)는 브라우저가 없으면 조용히 아무 일도 안 한다.

export type HistoryDraft = { text: string; savedAt: string };

/** 담아 둔 글의 보관 기간 — 7일. 오래된 글이 뜬금없이 되살아나지 않게. */
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const PREFIX = "wedly-history-draft:";

export function draftKey(panelId: string): string {
  return `${PREFIX}${panelId}`;
}

/** 서버 목록에 같은 글이 이미 있으면 되살리지 않는다. */
export function shouldRestoreDraft(text: string, serverTexts: readonly string[]): boolean {
  const t = text.trim();
  if (!t) return false;
  return !serverTexts.some((s) => (s ?? "").trim() === t);
}

export function isDraftExpired(draft: HistoryDraft, nowMs: number): boolean {
  const saved = Date.parse(draft.savedAt);
  if (Number.isNaN(saved)) return true;
  return nowMs - saved > DRAFT_TTL_MS;
}

// ── 보관 도우미 (브라우저에서만 실제로 동작) ──────────────────────────────────

function store(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null; // 사생활 보호 모드 등에서 접근 자체가 막히는 경우
  }
}

export function readDraft(panelId: string): HistoryDraft | null {
  const s = store();
  if (!s) return null;
  try {
    const raw = s.getItem(draftKey(panelId));
    if (!raw) return null;
    const j = JSON.parse(raw) as Partial<HistoryDraft> | null;
    if (!j || typeof j.text !== "string" || typeof j.savedAt !== "string") return null;
    return { text: j.text, savedAt: j.savedAt };
  } catch {
    return null;
  }
}

export function writeDraft(panelId: string, text: string): void {
  const s = store();
  if (!s) return;
  try {
    if (!text.trim()) {
      s.removeItem(draftKey(panelId));
      return;
    }
    s.setItem(draftKey(panelId), JSON.stringify({ text, savedAt: new Date().toISOString() }));
  } catch {
    /* 보관 공간이 꽉 찼거나 막힌 경우 — 조용히 넘어간다(글 자체는 화면에 그대로 있다) */
  }
}

export function clearDraft(panelId: string): void {
  const s = store();
  if (!s) return;
  try {
    s.removeItem(draftKey(panelId));
  } catch {
    /* ignore */
  }
}
