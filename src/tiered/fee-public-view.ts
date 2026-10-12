import type {
  FeeCalculationStateFieldV1,
  FeeCalculationStateReasonCode,
  FeeCalculationStateScope,
  FeeCalculationStateTarget,
} from "./fee-calculation-state";

/** Server-filtered display only. Never send this envelope back as row.data or use it as write authority. */
export interface FeePublicOwnerV1 {
  readonly sourceTable: "TaxAmendmentEntry" | "PolicyFundEntry" | "FreeSubsidyEntry";
  readonly entryId: string;
}

/** A missing event is ready/null. Damaged or unavailable evidence is invalid, never ready/null. */
export type FeePublicEditObservationV1 =
  | { readonly status: "ready"; readonly eventVersion: string | null }
  | { readonly status: "invalid" };

export type FeePublicReasonV1 = FeeCalculationStateReasonCode
  | "fee-definition-set-invalid"
  | "fee-definition-policy-invalid"
  | "fee-definition-set-mismatch";

export interface FeePublicTargetV1 {
  readonly scope: FeeCalculationStateScope;
  readonly target: FeeCalculationStateTarget;
  readonly status: "calculated" | "blocked" | "unmatched";
  /** Only fields allowed for the current viewer; no definitions, rule details, hashes or other partner values. */
  readonly fields: Readonly<Record<string, FeeCalculationStateFieldV1>>;
  readonly edits: Readonly<Record<string, FeePublicEditObservationV1>>;
  readonly reason?: FeePublicReasonV1;
  readonly message?: string;
}

/** domainRows[].feeView or feeViews[entryId], separate from stored business data. */
export type FeePublicViewV1 = { readonly version: 1; readonly owner: FeePublicOwnerV1 } & (
  | { readonly mode: "legacy"; readonly targets: readonly [] }
  | { readonly mode: "blocked"; readonly reason: FeePublicReasonV1; readonly message: string; readonly targets: readonly [] }
  | { readonly mode: "standard"; readonly targets: readonly FeePublicTargetV1[] }
);
