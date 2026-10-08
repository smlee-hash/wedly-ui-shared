import type { FormulaEvalDetail } from "./index";

/** Stable codes only; adapters supply their own user-facing messages. */
export const FEE_CALCULATION_STATE_REASON_CODES = Object.freeze([
  "fee-base-vat-basis-unconfirmed",
  "fee-vat-basis-unconfirmed",
  "fee-context-invalid",
  "fee-value-invalid",
  "contract-amount-invalid",
  "fee-rule-blocked",
  "fee-rule-unmatched",
  "fee-base-amount-missing",
  "context-invalid",
  "contract-link-missing",
  "contract-link-ambiguous",
  "invalid-contract-context",
  "fee-calculation-state-invalid",
  "fee-calculation-state-stale",
  "fee-definition-unavailable",
  "fee-context-unavailable",
] as const);

export type FeeCalculationStateReasonCode = typeof FEE_CALCULATION_STATE_REASON_CODES[number];
export type FeeCalculationStateScope = "tax-contract" | "gov-contract" | "gov-settlement";

export interface FeeCalculationStateTarget {
  readonly area: "contract" | "settlement";
  readonly containerKey: string;
  readonly tierId: string;
}

export interface FeeCalculationStateFieldV1 {
  readonly value: number | string | null;
  readonly source: "automatic" | "manual" | "finalized" | "unverified-historical";
  readonly automaticValue: number | null;
}

/** Persisted evidence, not an authorization, freshness or VAT-confirmation token. */
export interface FeeCalculationStateV1 {
  readonly version: 1;
  readonly scope: FeeCalculationStateScope;
  readonly policyVersion: string;
  readonly definitionVersion: string;
  readonly definitionSetVersion: string;
  readonly contextPolicyVersion?: string;
  readonly owner: {
    readonly sourceTable: string;
    readonly entryId: string;
    /** Input CAS version; a later result self-write can change the current row version. */
    readonly version: string;
  };
  readonly target: FeeCalculationStateTarget;
  readonly inputSnapshotHash: string;
  readonly amountSource: {
    readonly sourceTable: string;
    readonly entryId: string;
    readonly containerKey: string;
    readonly tierId: string;
    readonly fieldKey: string;
    /** Null means unknown historic event evidence. */
    readonly amountEventVersion: string | null;
  };
  readonly result: {
    readonly status: "calculated" | "blocked" | "unmatched";
    readonly reason?: FeeCalculationStateReasonCode;
    readonly matchedRuleIds: readonly string[];
    readonly details: Readonly<Record<string, FormulaEvalDetail>>;
  };
  readonly fields: Readonly<Record<string, FeeCalculationStateFieldV1>>;
}

export interface FeeCalculationStateEnvelopeV1 {
  readonly version: 1;
  readonly entries: FeeCalculationStateV1[];
}

/** Bounds must come from the caller's trusted current row and selected definitions. */
export interface FeeCalculationStateValidationContext {
  readonly owner: {
    readonly sourceTable: string;
    readonly entryId: string;
    readonly version?: string;
  };
  readonly targets: readonly {
    readonly scope: FeeCalculationStateScope;
    readonly target: FeeCalculationStateTarget;
    readonly fieldKeys: readonly string[];
    readonly ruleIds: readonly string[];
  }[];
  /** The caller's existing request limit, in UTF-8 JSON bytes. */
  readonly maxBytes: number;
}

export type FeeCalculationStateValidationResult =
  | { readonly ok: true; readonly value: FeeCalculationStateEnvelopeV1 }
  | { readonly ok: false; readonly reason: FeeCalculationStateReasonCode };

type DataRecord = Record<string, unknown>;
type ByteBudget = { remaining: number };
const INVALID = Symbol("invalid-fee-calculation-state");
const REASONS = new Set<string>(FEE_CALCULATION_STATE_REASON_CODES);

function prototypeKey(key: string): boolean {
  return key === "__proto__" || key === "constructor" || key === "prototype";
}

/** All reads use data descriptors, including array elements, without calling getters. */
function own(value: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}

function isRecord(value: unknown): value is DataRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function shape(value: unknown, required: readonly string[], optional: readonly string[] = []): value is DataRecord {
  if (!isRecord(value)) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.length < required.length || keys.length > required.length + optional.length) return false;
  for (const key of keys) {
    if (typeof key !== "string" || prototypeKey(key) || (!required.includes(key) && !optional.includes(key))) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor) || descriptor.value === undefined) return false;
  }
  return required.every(key => Object.getOwnPropertyDescriptor(value, key) !== undefined);
}

function arrayLength(value: unknown, maximum = Infinity): number | undefined {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, "length");
  const length: unknown = descriptor && "value" in descriptor ? descriptor.value : undefined;
  return typeof length === "number" && Number.isSafeInteger(length) && length >= 0 && length <= maximum
    ? length : undefined;
}

function isDataArray(value: unknown, maximum = Infinity): value is unknown[] {
  const length = arrayLength(value, maximum);
  if (length === undefined || Reflect.ownKeys(value as object).length !== length + 1) return false;
  for (let index = 0; index < length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor) || descriptor.value === undefined) return false;
  }
  return true;
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function fieldKey(value: unknown): value is string {
  return nonempty(value) && !prototypeKey(value);
}

function nullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function spend(budget: ByteBudget, bytes: number): boolean {
  if (bytes > budget.remaining) return false;
  budget.remaining -= bytes;
  return true;
}

/** Count JSON escapes and UTF-8 without allocating an encoded or serialized string. */
function stringBytes(value: string, budget: ByteBudget): boolean {
  if (!spend(budget, 2)) return false;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    let bytes: number;
    if (code === 0x22 || code === 0x5c) bytes = 2;
    else if (code < 0x20) bytes = [8, 9, 10, 12, 13].includes(code) ? 2 : 6;
    else if (code < 0x80) bytes = 1;
    else if (code < 0x800) bytes = 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) { bytes = 4; index++; }
      else bytes = 6;
    } else if (code >= 0xdc00 && code <= 0xdfff) bytes = 6;
    else bytes = 3;
    if (!spend(budget, bytes)) return false;
  }
  return true;
}

/**
 * First pass measures safe data only; the second pass makes a detached copy.
 * Eight is the deepest node in this schema (a blocked detail's rule index),
 * so unknown deep structures cannot exhaust the stack before shape validation.
 */
function walkJSON(value: unknown, budget: ByteBudget, copy: boolean, ancestors: Set<object>, depth = 0): unknown {
  if (depth > 8) return INVALID;
  if (value === null) return spend(budget, 4) ? null : INVALID;
  if (typeof value === "string") return stringBytes(value, budget) ? value : INVALID;
  if (typeof value === "number") return Number.isFinite(value) && spend(budget, String(value).length) ? value : INVALID;
  if (typeof value === "boolean") return spend(budget, value ? 4 : 5) ? value : INVALID;
  if (typeof value !== "object" || ancestors.has(value)) return INVALID;
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      // Even null/one-digit array items need at least one byte plus separators.
      const length = arrayLength(value, budget.remaining);
      if (length === undefined || !spend(budget, 2 + Math.max(0, length - 1)) || !isDataArray(value, length)) return INVALID;
      const result: unknown[] | undefined = copy ? [] : undefined;
      for (let index = 0; index < length; index++) {
        const item = walkJSON(own(value, String(index)), budget, copy, ancestors, depth + 1);
        if (item === INVALID) return INVALID;
        if (result) result.push(item);
      }
      return result ?? null;
    }
    if (!isRecord(value)) return INVALID;
    const keys = Reflect.ownKeys(value);
    if (keys.length > budget.remaining || !spend(budget, 2 + Math.max(0, keys.length - 1))) return INVALID;
    const result: DataRecord | undefined = copy ? Object.create(Object.getPrototypeOf(value)) as DataRecord : undefined;
    for (const key of keys) {
      if (typeof key !== "string" || prototypeKey(key) || !stringBytes(key, budget) || !spend(budget, 1)) return INVALID;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return INVALID;
      const item = walkJSON(descriptor.value, budget, copy, ancestors, depth + 1);
      if (item === INVALID) return INVALID;
      if (result) Object.defineProperty(result, key, { value: item, enumerable: true, configurable: true, writable: true });
    }
    return result ?? null;
  } finally {
    ancestors.delete(value);
  }
}

function scope(value: unknown): value is FeeCalculationStateScope {
  return value === "tax-contract" || value === "gov-contract" || value === "gov-settlement";
}

function validTarget(value: unknown, selectedScope: FeeCalculationStateScope): value is DataRecord {
  if (!shape(value, ["area", "containerKey", "tierId"]) || !nonempty(own(value, "tierId"))) return false;
  return selectedScope === "gov-settlement"
    ? own(value, "area") === "settlement" && own(value, "containerKey") === "정산정보"
    : own(value, "area") === "contract" && own(value, "containerKey") === "계약정보_차수";
}

function sameTarget(left: object, right: object): boolean {
  return own(left, "area") === own(right, "area") &&
    own(left, "containerKey") === own(right, "containerKey") && own(left, "tierId") === own(right, "tierId");
}

function stringList(value: unknown, keys = false): value is string[] {
  if (!isDataArray(value)) return false;
  const seen = new Set<string>();
  const length = own(value, "length") as number;
  for (let index = 0; index < length; index++) {
    const item = own(value, String(index));
    if (!nonempty(item) || (keys && prototypeKey(item)) || seen.has(item)) return false;
    seen.add(item);
  }
  return true;
}

function readContext(value: unknown): FeeCalculationStateValidationContext | undefined {
  if (!shape(value, ["owner", "targets", "maxBytes"])) return undefined;
  const maxBytes = own(value, "maxBytes");
  if (typeof maxBytes !== "number" || !Number.isSafeInteger(maxBytes) || maxBytes <= 0) return undefined;
  const owner = own(value, "owner");
  if (!shape(owner, ["sourceTable", "entryId"], ["version"]) ||
    !nonempty(own(owner, "sourceTable")) || !nonempty(own(owner, "entryId")) ||
    (own(owner, "version") !== undefined && !nonempty(own(owner, "version")))) return undefined;
  const targets = own(value, "targets");
  if (!isDataArray(targets)) return undefined;
  const identities = new Map<FeeCalculationStateScope, Map<string, Set<string>>>();
  const length = own(targets, "length") as number;
  for (let index = 0; index < length; index++) {
    const bounds = own(targets, String(index));
    if (!shape(bounds, ["scope", "target", "fieldKeys", "ruleIds"])) return undefined;
    const selectedScope = own(bounds, "scope");
    const target = own(bounds, "target");
    if (!scope(selectedScope) || !validTarget(target, selectedScope) ||
      !stringList(own(bounds, "fieldKeys"), true) || !stringList(own(bounds, "ruleIds"))) return undefined;
    const container = own(target, "containerKey") as string;
    const tier = own(target, "tierId") as string;
    const containers = identities.get(selectedScope) ?? new Map<string, Set<string>>();
    const tiers = containers.get(container) ?? new Set<string>();
    if (tiers.has(tier)) return undefined;
    tiers.add(tier);
    containers.set(container, tiers);
    identities.set(selectedScope, containers);
  }
  return value as unknown as FeeCalculationStateValidationContext;
}

function members(value: object): Set<string> {
  const result = new Set<string>();
  const length = own(value, "length") as number;
  for (let index = 0; index < length; index++) result.add(own(value, String(index)) as string);
  return result;
}

function dictionary(value: unknown, keys: Set<string>, exact: boolean): value is DataRecord {
  if (!isRecord(value)) return false;
  const names = Reflect.ownKeys(value);
  if (exact ? names.length !== keys.size : names.length > keys.size) return false;
  return names.every(key => typeof key === "string" && keys.has(key));
}

function ruleIndices(value: unknown): boolean {
  if (!isDataArray(value)) return false;
  const length = own(value, "length") as number;
  for (let index = 0; index < length; index++) {
    const item = own(value, String(index));
    if (typeof item !== "number" || !Number.isSafeInteger(item) || item < 0) return false;
  }
  return true;
}

function formulaBlock(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (own(value, "kind") === "conflict") {
    return shape(value, ["kind", "from", "ruleIdx"]) && fieldKey(own(value, "from")) && ruleIndices(own(value, "ruleIdx"));
  }
  if (own(value, "kind") !== "missing" || !shape(value, ["kind", "from", "keys"]) || !fieldKey(own(value, "from"))) return false;
  const keys = own(value, "keys");
  if (!isDataArray(keys)) return false;
  const length = own(keys, "length") as number;
  for (let index = 0; index < length; index++) if (!fieldKey(own(keys, String(index)))) return false;
  return true;
}

function validEntry(value: unknown, context: FeeCalculationStateValidationContext, usedTargets: Set<number>): boolean {
  if (!shape(value, ["version", "scope", "policyVersion", "definitionVersion", "definitionSetVersion", "owner", "target", "inputSnapshotHash", "amountSource", "result", "fields"], ["contextPolicyVersion"]) || own(value, "version") !== 1) return false;
  const selectedScope = own(value, "scope");
  if (!scope(selectedScope)) return false;
  for (const key of ["policyVersion", "definitionVersion", "definitionSetVersion", "inputSnapshotHash"]) if (!nonempty(own(value, key))) return false;
  if (own(value, "contextPolicyVersion") !== undefined && !nonempty(own(value, "contextPolicyVersion"))) return false;
  const owner = own(value, "owner");
  const currentOwner = own(context, "owner") as object;
  if (!shape(owner, ["sourceTable", "entryId", "version"]) || !nonempty(own(owner, "version")) ||
    own(owner, "sourceTable") !== own(currentOwner, "sourceTable") || own(owner, "entryId") !== own(currentOwner, "entryId")) return false;
  const target = own(value, "target");
  if (!validTarget(target, selectedScope)) return false;
  const targets = own(context, "targets") as object;
  const targetCount = own(targets, "length") as number;
  let selectedBounds: DataRecord | undefined;
  for (let index = 0; index < targetCount; index++) {
    const bounds = own(targets, String(index)) as DataRecord;
    if (own(bounds, "scope") === selectedScope && sameTarget(target, own(bounds, "target") as object)) {
      if (usedTargets.has(index)) return false;
      usedTargets.add(index);
      selectedBounds = bounds;
      break;
    }
  }
  if (!selectedBounds) return false;
  const amount = own(value, "amountSource");
  if (!shape(amount, ["sourceTable", "entryId", "containerKey", "tierId", "fieldKey", "amountEventVersion"]) ||
    own(amount, "sourceTable") !== own(currentOwner, "sourceTable") || own(amount, "entryId") !== own(currentOwner, "entryId") ||
    own(amount, "containerKey") !== own(target, "containerKey") || own(amount, "tierId") !== own(target, "tierId") ||
    !fieldKey(own(amount, "fieldKey")) || (own(amount, "amountEventVersion") !== null && !nonempty(own(amount, "amountEventVersion")))) return false;
  const result = own(value, "result");
  if (!shape(result, ["status", "matchedRuleIds", "details"], ["reason"])) return false;
  const status = own(result, "status");
  if (status !== "calculated" && status !== "blocked" && status !== "unmatched") return false;
  const reason = own(result, "reason");
  if (reason !== undefined && (typeof reason !== "string" || !REASONS.has(reason))) return false;
  const matched = own(result, "matchedRuleIds");
  const allowedRules = members(own(selectedBounds, "ruleIds") as object);
  if (!isDataArray(matched, allowedRules.size) || !stringList(matched)) return false;
  const matchedCount = own(matched, "length") as number;
  for (let index = 0; index < matchedCount; index++) if (!allowedRules.has(own(matched, String(index)) as string)) return false;
  const allowedFields = members(own(selectedBounds, "fieldKeys") as object);
  const fields = own(value, "fields");
  const details = own(result, "details");
  if (!dictionary(fields, allowedFields, true) || !dictionary(details, allowedFields, false)) return false;
  for (const key of allowedFields) {
    const field = own(fields, key);
    if (!shape(field, ["value", "source", "automaticValue"])) return false;
    const display = own(field, "value");
    const automatic = own(field, "automaticValue");
    const source = own(field, "source");
    if ((!nullableNumber(display) && typeof display !== "string") || !nullableNumber(automatic) ||
      (source !== "automatic" && source !== "manual" && source !== "finalized" && source !== "unverified-historical") ||
      (source === "automatic" && display !== automatic) || (status !== "calculated" && automatic !== null)) return false;
  }
  for (const key of Reflect.ownKeys(details)) {
    const detail = own(details, key as string);
    if (!shape(detail, ["value"], ["blocked", "ruleIdx"]) || !nullableNumber(own(detail, "value")) ||
      (status === "unmatched" && own(detail, "value") !== null)) return false;
    const blocked = own(detail, "blocked");
    if (blocked !== undefined && (own(detail, "value") !== null || !formulaBlock(blocked))) return false;
    const indices = own(detail, "ruleIdx");
    if (indices !== undefined && !ruleIndices(indices)) return false;
  }
  return true;
}

/**
 * Validate stored data against caller-supplied current bounds. This does not
 * establish permission, snapshot freshness, definition activation or VAT basis.
 */
export function validateFeeCalculationStateEnvelope(value: unknown, context: unknown): FeeCalculationStateValidationResult {
  const invalid: FeeCalculationStateValidationResult = { ok: false, reason: "fee-calculation-state-invalid" };
  try {
    const bounds = readContext(context);
    if (!bounds || !shape(value, ["version", "entries"]) || own(value, "version") !== 1) return invalid;
    const targetCount = own(own(bounds, "targets") as object, "length") as number;
    if (arrayLength(own(value, "entries"), targetCount) === undefined) return invalid;
    const maxBytes = own(bounds, "maxBytes") as number;
    if (walkJSON(value, { remaining: maxBytes }, false, new Set()) === INVALID) return invalid;
    const sanitized = walkJSON(value, { remaining: maxBytes }, true, new Set());
    if (!shape(sanitized, ["version", "entries"]) || own(sanitized, "version") !== 1) return invalid;
    const entries = own(sanitized, "entries");
    if (!isDataArray(entries, targetCount)) return invalid;
    const usedTargets = new Set<number>();
    const length = own(entries, "length") as number;
    for (let index = 0; index < length; index++) if (!validEntry(own(entries, String(index)), bounds, usedTargets)) return invalid;
    return { ok: true, value: sanitized as unknown as FeeCalculationStateEnvelopeV1 };
  } catch {
    // Reflection failures (including hostile proxies) never expose exception text.
    return invalid;
  }
}
