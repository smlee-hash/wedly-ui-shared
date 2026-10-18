export { basicRecoveryIdentity } from "./customer-detail";

/** 아직 끝나지 않은 같은 편집의 최초 고객·마지막 ACK·현재 입력을 대조한다. origin은 메모리에만 남는다. */
export function matchesBasicRecoveryIdentity(recovery: { identity?: string; sourceIdentity?: string; originIdentity?: string; confirmedIdentities?: string[] } | undefined, current: string): boolean {
  return !recovery?.identity || recovery.identity === current || recovery.sourceIdentity === current || recovery.originIdentity === current || !!recovery.confirmedIdentities?.includes(current);
}


type RecoveryLifetime = { active: boolean };
type RecoveryState = { confirmedIdentities?: string[]; originIdentity?: string; sourceIdentity?: string; draft?: unknown; lifetime?: RecoveryLifetime; pendingRefresh?: () => void };
/** 새 입력이 앞 입력의 종료보다 먼저 토큰을 교체한다. 오래된 완료가 새 입력을 끝내지 못한다. */
export function beginRecoveryLifetime(recovery: RecoveryState, parentIdentity?: string): RecoveryLifetime {
  if (!recovery.lifetime?.active) {
    recovery.originIdentity = parentIdentity;
    recovery.sourceIdentity ??= parentIdentity;
    recovery.confirmedIdentities = recovery.sourceIdentity ? [recovery.sourceIdentity] : [];
  }
  const lifetime = { active: true };
  recovery.lifetime = lifetime;
  return lifetime;
}
/** 확정값은 늦은 ACK를 위해 남기고, 끝난 입력의 고객 허용·draft만 제거한다. */
export function endRecoveryLifetime(recovery: RecoveryState, lifetime: RecoveryLifetime): void {
  lifetime.active = false;
  if (recovery.lifetime === lifetime) {
    delete recovery.originIdentity;
    delete recovery.confirmedIdentities;
    delete recovery.draft;
  }
}
/** 뒤 입력이 실패하면 앞선 성공의 부모 조회를 한 번만 돌린다. */
export function flushBasicRefresh(recovery: RecoveryState): void {
  const notify = recovery.pendingRefresh;
  delete recovery.pendingRefresh;
  notify?.();
}

/** 현재 연속 입력 중 실제 확인된 식별만 허용한다. 뒤 ACK가 앞 부모 조회의 권한을 없애지 않는다. */
export function acknowledgeBasicRecovery(recovery: RecoveryState, identity?: string): void {
  recovery.sourceIdentity = identity;
  if (identity && recovery.lifetime?.active && !recovery.confirmedIdentities?.includes(identity)) {
    recovery.confirmedIdentities = [...(recovery.confirmedIdentities ?? []), identity];
  }
}
