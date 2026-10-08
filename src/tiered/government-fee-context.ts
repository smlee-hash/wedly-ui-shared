/**
 * Read-only government fee scope/linkage contract, v3 (2026-10-08).
 * Callers select the business policy and adapter from trusted server context;
 * this resolver cannot establish that trust from an HTTP payload. A ready result
 * is not an authorization token: recheck the owner/version/current containers
 * in the save transaction. Dates, rates, VAT units and stored values are untouched.
 */

export type GovernmentFeeSourceTable = "PolicyFundEntry" | "FreeSubsidyEntry";
export type GovernmentFeeArea = "contract" | "settlement";
export type GovernmentFeeContainerKey = "계약정보_차수" | "정산정보";
export type GovernmentFeeAdapter =
  | "gov-panel"
  | "gov-settlement"
  | "gov-partner-fee"
  | "gov-contract-formula"
  | "gov-settlement-formula";

export interface GovernmentFeeOwnerIdentity {
  readonly sourceTable: GovernmentFeeSourceTable;
  readonly entryId: string;
  /** The actual server snapshot/CAS version, not a display or row identifier. */
  readonly version: string;
}

export interface GovernmentFeeOwner extends GovernmentFeeOwnerIdentity {
  readonly data: Readonly<Record<string, unknown>>;
}

export type GovernmentFeeDefinition =
  | {
      readonly area: "contract";
      readonly sourceKeys: readonly (
        | "policy-fund-contract-tiered-fields"
        | "policy-fund-contract-tiered-fields-custom-erp"
      )[];
      readonly version: string;
    }
  | {
      readonly area: "settlement";
      readonly sourceKeys: readonly (
        | "policy-fund-settlement-fields"
        | "policy-fund-settlement-fields-custom-erp"
      )[];
      readonly version: string;
    };

export type GovernmentFeeTarget = GovernmentFeeOwnerIdentity &
  (
    | {
        readonly area: "contract";
        readonly containerKey: "계약정보_차수";
        readonly tierId: string;
      }
    | {
        readonly area: "settlement";
        readonly containerKey: "정산정보";
        readonly tierId: string;
      }
  );

/** Adapter-validated evidence for an existing tier with no stored id. */
export interface GovernmentFeeProjectedIdentity extends GovernmentFeeOwnerIdentity {
  readonly containerKey: GovernmentFeeContainerKey;
  readonly index: number;
  readonly identity: string;
}

/** Valid affirmative inputs. Other business policies are also accepted as unknown. */
export type GovernmentFeeContextInput = {
  readonly businessPolicy: "government-subsidy";
  readonly owner: GovernmentFeeOwner;
  readonly projectedIdentities?: readonly GovernmentFeeProjectedIdentity[];
} &
  (
    | {
        readonly adapter: "gov-panel" | "gov-partner-fee" | "gov-contract-formula";
        readonly definition: Extract<GovernmentFeeDefinition, { area: "contract" }>;
        readonly target: Extract<GovernmentFeeTarget, { area: "contract" }>;
      }
    | {
        readonly adapter:
          | "gov-panel"
          | "gov-settlement"
          | "gov-partner-fee"
          | "gov-settlement-formula";
        readonly definition: Extract<GovernmentFeeDefinition, { area: "settlement" }>;
        readonly target: Extract<GovernmentFeeTarget, { area: "settlement" }>;
      }
  );

export type GovernmentFeeBlockedReason =
  | "context-invalid"
  | "contract-link-missing"
  | "contract-link-ambiguous"
  | "invalid-contract-context";

const POLICY_VERSION = "government-fee-scope-linkage-v3" as const;

export type GovernmentFeeReadyContext = {
  readonly status: "ready";
  readonly businessPolicy: "government-subsidy";
  readonly policyVersion: typeof POLICY_VERSION;
  readonly owner: GovernmentFeeOwnerIdentity;
  readonly definitionVersion: string;
  /** A detached copy of the actual tier, including its original date fields. */
  readonly contract: Readonly<Record<string, unknown>>;
} &
  (
    | {
        readonly linkage: "current-contract";
        readonly target: Extract<GovernmentFeeTarget, { area: "contract" }>;
      }
    | {
        readonly linkage: "unique-owner-contract";
        readonly target: Extract<GovernmentFeeTarget, { area: "settlement" }>;
      }
  );

export type GovernmentFeeContextResult =
  | { readonly status: "not-applicable" }
  | { readonly status: "blocked"; readonly reason: GovernmentFeeBlockedReason }
  | GovernmentFeeReadyContext;

type DataRecord = Record<string, unknown>;
type IndexedTier = { readonly identity: string; readonly data: DataRecord };
type ProjectionMap = Map<GovernmentFeeContainerKey, Map<number, string>>;
const INVALID = Symbol("invalid-government-fee-data");

function blocked(reason: GovernmentFeeBlockedReason): GovernmentFeeContextResult {
  return { status: "blocked", reason };
}

function isRecord(value: unknown): value is DataRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** Do not treat inherited properties or accessors as adapter evidence. */
function own(record: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (!descriptor) return undefined;
  return "value" in descriptor ? descriptor.value : INVALID;
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function readIdentity(value: unknown): GovernmentFeeOwnerIdentity | undefined {
  if (!isRecord(value)) return undefined;
  const sourceTable = own(value, "sourceTable");
  const entryId = own(value, "entryId");
  const version = own(value, "version");
  if (
    (sourceTable !== "PolicyFundEntry" && sourceTable !== "FreeSubsidyEntry") ||
    !nonempty(entryId) ||
    !nonempty(version)
  ) return undefined;
  return { sourceTable, entryId, version };
}

function sameOwner(left: GovernmentFeeOwnerIdentity, right: GovernmentFeeOwnerIdentity): boolean {
  return left.sourceTable === right.sourceTable && left.entryId === right.entryId && left.version === right.version;
}

function inactive(record: DataRecord): boolean {
  return ["_deletedAt", "_mergedInto"].some(key => {
    const value = own(record, key);
    return value !== undefined && value !== null && value !== false && value !== "";
  });
}

/** Copy JSON-like snapshot data without invoking getters or retaining aliases. */
function copyData(value: unknown, ancestors = new Set<object>()): unknown {
  if (value === null || value === undefined || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "object" || ancestors.has(value)) throw new Error("Invalid snapshot data");
  ancestors.add(value);
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some(key => typeof key !== "string")) throw new Error("Invalid snapshot keys");
    if (Array.isArray(value)) {
      const length = value.length;
      if (keys.length !== length + 1) throw new Error("Invalid snapshot array");
      const result: unknown[] = [];
      for (let index = 0; index < length; index++) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !("value" in descriptor)) throw new Error("Invalid snapshot array item");
        result.push(copyData(descriptor.value, ancestors));
      }
      return result;
    }
    if (!isRecord(value)) throw new Error("Invalid snapshot object");
    const result: DataRecord = {};
    for (const key of keys) {
      const descriptor = descriptors[key as string];
      if (!("value" in descriptor)) throw new Error("Invalid snapshot property");
      Object.defineProperty(result, key, {
        value: copyData(descriptor.value, ancestors),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    return result;
  } finally {
    ancestors.delete(value);
  }
}

function validAdapter(adapter: unknown, area: GovernmentFeeArea): boolean {
  if (adapter === "gov-panel" || adapter === "gov-partner-fee") return true;
  return area === "contract"
    ? adapter === "gov-contract-formula"
    : adapter === "gov-settlement" || adapter === "gov-settlement-formula";
}

function definitionVersion(value: unknown, area: GovernmentFeeArea): string | undefined {
  if (!isRecord(value) || own(value, "area") !== area) return undefined;
  const version = own(value, "version");
  if (!nonempty(version)) return undefined;
  const sourceKeys = copyData(own(value, "sourceKeys"));
  if (!Array.isArray(sourceKeys) || sourceKeys.length < 1 || sourceKeys.length > 2) return undefined;
  const base = area === "contract" ? "policy-fund-contract-tiered-fields" : "policy-fund-settlement-fields";
  const allowed = new Set([base, `${base}-custom-erp`]);
  return sourceKeys.includes(base) && new Set(sourceKeys).size === sourceKeys.length && sourceKeys.every(key => allowed.has(key))
    ? version
    : undefined;
}

function projections(value: unknown, owner: GovernmentFeeOwnerIdentity): ProjectionMap | undefined {
  const result: ProjectionMap = new Map();
  if (value === undefined) return result;
  try {
    const proofs = copyData(value);
    if (!Array.isArray(proofs)) return undefined;
    for (const proof of proofs) {
      const identity = readIdentity(proof);
      if (!identity || !sameOwner(identity, owner) || !isRecord(proof)) return undefined;
      const containerKey = own(proof, "containerKey");
      const index = own(proof, "index");
      const projectedId = own(proof, "identity");
      if (
        (containerKey !== "계약정보_차수" && containerKey !== "정산정보") ||
        typeof index !== "number" || !Number.isSafeInteger(index) || index < 0 ||
        !nonempty(projectedId)
      ) return undefined;
      const entries = result.get(containerKey) ?? new Map<number, string>();
      if (entries.has(index) || Array.from(entries.values()).includes(projectedId)) return undefined;
      entries.set(index, projectedId);
      result.set(containerKey, entries);
    }
    return result;
  } catch {
    return undefined;
  }
}

/** Validate every tier; never discard malformed/deleted tiers to make a unique link. */
function readContainer(data: DataRecord, key: GovernmentFeeContainerKey, proofs?: Map<number, string>): IndexedTier[] | undefined {
  try {
    const raw = own(data, key);
    const parsed: unknown = typeof raw === "string" ? JSON.parse(raw) : raw === undefined ? [] : raw;
    const tiers = copyData(parsed);
    if (!Array.isArray(tiers)) return undefined;
    const result: IndexedTier[] = [];
    const identities = new Set<string>();
    for (let index = 0; index < tiers.length; index++) {
      const tier: unknown = tiers[index];
      if (!isRecord(tier) || inactive(tier)) return undefined;
      const hasId = Object.prototype.hasOwnProperty.call(tier, "id");
      const storedId = own(tier, "id");
      const proof = proofs?.get(index);
      // A proof supplies an absent id only; it cannot repair an empty/invalid id.
      if (hasId && (proof !== undefined || !nonempty(storedId))) return undefined;
      const identity = hasId ? storedId : proof;
      if (!nonempty(identity) || identities.has(identity)) return undefined;
      identities.add(identity);
      result.push({ identity, data: tier });
    }
    if (proofs && Array.from(proofs.keys()).some(index => index >= tiers.length)) return undefined;
    return result;
  } catch {
    return undefined;
  }
}

/** No raw-domain, ID-prefix, refund-link, representative-date or cross-owner fallback. */
export function resolveGovernmentFeeContext(input: unknown): GovernmentFeeContextResult {
  try {
    return resolveContext(input);
  } catch {
    // Unknown inputs (including throwing proxies) must not escape as exceptions.
    return blocked("context-invalid");
  }
}

function resolveContext(input: unknown): GovernmentFeeContextResult {
  if (!isRecord(input)) return blocked("context-invalid");
  const businessPolicy = own(input, "businessPolicy");
  if (!nonempty(businessPolicy)) return blocked("context-invalid");
  if (businessPolicy !== "government-subsidy") return { status: "not-applicable" };

  const ownerInput = own(input, "owner");
  const targetInput = own(input, "target");
  const owner = readIdentity(ownerInput);
  const targetOwner = readIdentity(targetInput);
  if (!owner || !targetOwner || !sameOwner(owner, targetOwner) || !isRecord(ownerInput) || !isRecord(targetInput)) {
    return blocked("context-invalid");
  }
  const data = own(ownerInput, "data");
  const area = own(targetInput, "area");
  const containerKey = own(targetInput, "containerKey");
  const tierId = own(targetInput, "tierId");
  if (
    !isRecord(data) || (area !== "contract" && area !== "settlement") || !nonempty(tierId) ||
    containerKey !== (area === "contract" ? "계약정보_차수" : "정산정보") ||
    !validAdapter(own(input, "adapter"), area)
  ) return blocked("context-invalid");
  const loadedVersion = definitionVersion(own(input, "definition"), area);
  if (!loadedVersion) return blocked("context-invalid");
  if (inactive(ownerInput) || inactive(data) || inactive(targetInput)) return blocked("invalid-contract-context");

  const proofs = projections(own(input, "projectedIdentities"), owner);
  if (!proofs) return blocked("invalid-contract-context");
  const contracts = readContainer(data, "계약정보_차수", proofs.get("계약정보_차수"));
  if (!contracts) return blocked("invalid-contract-context");
  // Any supplied proof must correspond to an actual absent-id tier, even if its
  // container is not the current calculation target.
  const settlements = area === "settlement" || proofs.has("정산정보")
    ? readContainer(data, "정산정보", proofs.get("정산정보"))
    : undefined;
  if ((area === "settlement" || proofs.has("정산정보")) && !settlements) return blocked("invalid-contract-context");

  const common = {
    status: "ready" as const,
    businessPolicy: "government-subsidy" as const,
    policyVersion: POLICY_VERSION,
    owner,
    definitionVersion: loadedVersion,
  };
  if (area === "contract") {
    const current = contracts.find(tier => tier.identity === tierId);
    if (!current) return blocked("invalid-contract-context");
    return {
      ...common,
      target: { ...targetOwner, area, containerKey: "계약정보_차수", tierId },
      contract: current.data,
      linkage: "current-contract",
    };
  }
  if (!settlements?.some(tier => tier.identity === tierId)) return blocked("invalid-contract-context");
  if (contracts.length === 0) return blocked("contract-link-missing");
  if (contracts.length !== 1) return blocked("contract-link-ambiguous");
  return {
    ...common,
    target: { ...targetOwner, area, containerKey: "정산정보", tierId },
    contract: contracts[0].data,
    linkage: "unique-owner-contract",
  };
}
