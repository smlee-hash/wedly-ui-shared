// 저장·불러오기 실패를 "무슨 실패인가"로 가르고, 사람이 읽을 안내 문구를 만든다.
//
// 왜 따로 두나 —
//   ① 화면 부품 3곳(히스토리 부품·분야 히스토리 부품·통합 상세창)이 같은 판정을 써야 한다.
//   ② React·DOM 의존이 없어 node 환경 단위 시험으로 규칙을 못 박을 수 있다.
//
// ★상태코드 405 를 로그인 만료로 보는 이유: 세션이 풀리면 요청이 로그인 화면으로 넘겨져
//   405(Method Not Allowed)로 돌아온다. 401 만 보면 "저장 실패"로만 안내해 사용자가
//   다시 로그인할 생각을 못 한다(실측 기록).

/** 통신 결과 판정. "none" 이면 성공. */
export type PersistFailureKind = "auth" | "server" | "network" | "none";

/** 로그인이 풀렸다고 볼 상태코드. */
const AUTH_STATUSES: readonly number[] = [401, 403, 405];

/** 우리가 만든 오류 — 종류 꼬리표가 붙어 있다. */
export type PersistError = Error & { persistKind: PersistFailureKind };

export function makePersistError(kind: PersistFailureKind, message: string): PersistError {
  const e = new Error(message) as PersistError;
  e.name = "PersistError";
  e.persistKind = kind;
  return e;
}

/** 오류에서 종류를 꺼낸다. 꼬리표가 없으면 연결 끊김으로 본다(통신 자체가 실패한 경우). */
export function persistKindOf(err: unknown): PersistFailureKind {
  const k = (err as { persistKind?: unknown } | null | undefined)?.persistKind;
  if (k === "auth" || k === "server" || k === "network") return k;
  return "network";
}

export function classifyHttpStatus(status: number): PersistFailureKind {
  if (AUTH_STATUSES.includes(status)) return "auth";
  if (status >= 400) return "server";
  return "none";
}

/**
 * 응답 하나를 판정한다.
 *
 * ★주의: `success:true` 인데 `data` 가 비어 있는 것은 **실패가 아니다**.
 * 공용 보관함에 아직 아무것도 저장 안 한 회사가 정상적으로 그렇게 온다.
 * 그 경우 부르는 쪽이 기존대로 "행에 있던 옛 값"으로 채워야 한다(이사 통로).
 */
export function checkApiResult(
  res: { ok: boolean; status: number },
  json: unknown,
): PersistFailureKind {
  if (!res.ok) return classifyHttpStatus(res.status);
  const ok = (json as { success?: unknown } | null | undefined)?.success;
  if (ok !== true) return "server";
  return "none";
}

/** 종류별 이유 한 문장. */
export function failureReason(kind: PersistFailureKind): string {
  switch (kind) {
    case "auth":
      return "로그인이 풀렸습니다. 화면을 새로 고쳐 다시 로그인한 뒤 시도해 주세요.";
    case "server":
      return "서버가 요청을 받지 못했습니다. 잠시 후 다시 시도해 주세요.";
    case "network":
      return "연결이 끊겼습니다. 인터넷 상태를 확인한 뒤 다시 시도해 주세요.";
    default:
      return "";
  }
}

/** 오류에 자기 안내 문구가 붙어 있나(어댑터가 준 안내 — 뭉개면 안 된다). */
function ownMessage(err: unknown): string {
  const kind = (err as { persistKind?: unknown } | null | undefined)?.persistKind;
  if (kind === "auth" || kind === "server" || kind === "network") return "";
  const m = (err as { message?: unknown } | null | undefined)?.message;
  return typeof m === "string" ? m.trim() : "";
}

/** 저장 실패 안내. `label` 은 무엇을 저장하려 했는지("히스토리"·"정산정보"). */
export function saveFailureMessage(err: unknown, label: string): string {
  const own = ownMessage(err);
  const head = own || `${label} 저장에 실패했습니다.\n\n${failureReason(persistKindOf(err))}`;
  return `${head}\n\n입력한 내용은 지우지 않았습니다. 다시 시도해 주세요.`;
}

/** 불러오기 실패 안내. 입력칸 얘기가 아니므로 "지우지 않았습니다" 를 붙이지 않는다. */
export function loadFailureMessage(err: unknown): string {
  const own = ownMessage(err);
  return own || failureReason(persistKindOf(err));
}
