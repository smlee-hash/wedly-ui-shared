import { describe, expect, it } from "vitest";
import { validateFeeCalculationStateEnvelope } from "./fee-calculation-state";

const target = { area: "contract", containerKey: "계약정보_차수", tierId: "tier-a" } as const;
const owner = { sourceTable: "PolicyFundEntry", entryId: "row-a", version: "input-v1" };
const context = {
  owner: { sourceTable: owner.sourceTable, entryId: owner.entryId },
  targets: [{ scope: "gov-contract", target, fieldKeys: ["fee"], ruleIds: ["gov-1", "gov-2"] }],
  maxBytes: 150 * 1024,
} as const;
type Fixture = {
  [key: string]: unknown;
  scope: string;
  owner: { sourceTable: string; entryId: string; version: string };
  target: { area: string; containerKey: string; tierId: string };
  amountSource: { sourceTable: string; entryId: string; containerKey: string; tierId: string; fieldKey: string; amountEventVersion: string | null };
  result: { status: string; reason?: string; matchedRuleIds: string[]; details: Record<string, { value: unknown; ruleIdx?: number[]; blocked?: unknown }> };
  fields: Record<string, { value: unknown; source: string; automaticValue: unknown }>;
};
function state(): Fixture {
  return { version: 1, scope: "gov-contract", policyVersion: "policy-v1", definitionVersion: "defs-v1", definitionSetVersion: "set-v1", contextPolicyVersion: "government-fee-scope-linkage-v3",
    owner: { ...owner }, target: { ...target }, inputSnapshotHash: "input-sha",
    amountSource: { sourceTable: owner.sourceTable, entryId: owner.entryId, containerKey: target.containerKey, tierId: target.tierId, fieldKey: "계약금", amountEventVersion: "amount-v1" },
    result: { status: "calculated", matchedRuleIds: ["gov-1", "gov-2"], details: { fee: { value: 100, ruleIdx: [0, 1] } } },
    fields: { fee: { value: 100, source: "automatic", automaticValue: 100 } },
  };
}
const wrap = (entry: unknown = state()) => ({ version: 1, entries: [entry] });
const validate = (value: unknown, ctx: unknown = context) => validateFeeCalculationStateEnvelope(value, ctx);
function blocked(value: number | string | null, source = "manual") {
  const s = state();
  s.result = { status: "blocked", reason: "fee-rule-blocked", matchedRuleIds: [], details: { fee: { value: null, blocked: { kind: "missing", from: "fee", keys: ["착수일"] } } } };
  s.fields.fee = { value, source, automaticValue: null };
  return s;
}

describe("same owner persisted fee state, checked against current target bounds", () => {
  it("roundtrips detailed rule matches without folding into a scalar", () => {
    const original = wrap(); const result = validate(JSON.parse(JSON.stringify(original)));
    expect(result.ok).toBe(true); if (!result.ok) return;
    expect(result.value).toEqual(original);
    expect(result.value.entries[0].result.matchedRuleIds).toEqual(["gov-1", "gov-2"]);
    expect(result.value.entries[0].result.details.fee.ruleIdx).toEqual([0,1]);
  });
  it("returns a detached result without mutating the input", () => {
    const original = wrap(); const result = validate(original); expect(result.ok).toBe(true);
    if (result.ok) { (original.entries[0] as Fixture).fields.fee.value = 999; expect(result.value.entries[0].fields.fee.value).toBe(100); }
  });
  it.each([0,"0","",null,120])("preserves own manual value %j separately from blocked automatic alternative", value => {
    const result = validate(wrap(blocked(value))); expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.entries[0].fields.fee).toEqual({value,source:"manual",automaticValue:null});
  });
  it.each(["finalized","unverified-historical"])("keeps %s provenance and original string", source => {
    const result = validate(wrap(blocked(" 1,234 ",source))); expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.entries[0].fields.fee.value).toBe(" 1,234 ");
  });
  it("keeps unmatched automatic blank separate from calculated zero", () => {
    const s=blocked(null,"automatic"); s.result={status:"unmatched",reason:"fee-rule-unmatched",matchedRuleIds:[],details:{}};
    expect(validate(wrap(s)).ok).toBe(true);
    const zero=state(); zero.fields.fee={value:0,source:"automatic",automaticValue:0};zero.result.details.fee.value=0;
    expect(validate(wrap(zero)).ok).toBe(true);
  });
  it("does not require input CAS version to equal later result-write version", () => {
    expect(validate(wrap(),{...context,owner:{...context.owner,version:"after-result-write"}}).ok).toBe(true);
  });
  it("retains absent historic amount-event evidence as null, not a generated event", () => {
    const s=blocked(null,"automatic");s.amountSource.amountEventVersion=null;
    const r=validate(wrap(s));expect(r.ok).toBe(true);if(r.ok)expect(r.value.entries[0].amountSource.amountEventVersion).toBeNull();
  });
  it("supports settlement only with its actual revenue target", () => {
    const s=state(); s.scope="gov-settlement";s.target={area:"settlement",containerKey:"정산정보",tierId:"settlement-a"};
    s.amountSource={...s.amountSource,containerKey:"정산정보",tierId:"settlement-a",fieldKey:"매출"};
    const ctx={...context,targets:[{...context.targets[0],scope:s.scope,target:s.target}]};
    expect(validate(wrap(s),ctx).ok).toBe(true);
    s.amountSource.containerKey="계약정보_차수";s.amountSource.tierId="tier-a";expect(validate(wrap(s),ctx).ok).toBe(false);
  });
  it("accepts an empty envelope for zero actual targets", () => expect(validate({version:1,entries:[]},{...context,targets:[]}).ok).toBe(true));
  it("accepts JSON-compatible null-prototype dictionaries", () => {
    const s=state();s.fields=Object.assign(Object.create(null),s.fields);expect(validate(wrap(s)).ok).toBe(true);
  });
  it.each([
    ["foreign owner",(s:Fixture)=>{s.owner.entryId="row-b";}],
    ["foreign amount owner",(s:Fixture)=>{s.amountSource.entryId="row-b";}],
    ["foreign target",(s:Fixture)=>{s.target.tierId="tier-b";}],
    ["wrong scope",(s:Fixture)=>{s.scope="tax-contract";}],
    ["unknown field",(s:Fixture)=>{s.fields.hidden=s.fields.fee;}],
    ["missing selected field",(s:Fixture)=>{delete s.fields.fee;}],
    ["hidden detail",(s:Fixture)=>{s.result.details.hidden={value:999};}],
    ["unknown matched row",(s:Fixture)=>{s.result.matchedRuleIds=["invented"];}],
    ["duplicate matched rows",(s:Fixture)=>{s.result.matchedRuleIds=["gov-1","gov-1"];}],
    ["unknown reason",(s:Fixture)=>{s.result.reason="secret SQL stack";}],
    ["nonfinite number",(s:Fixture)=>{s.fields.fee.value=Infinity;}],
    ["object value",(s:Fixture)=>{s.fields.fee.value={secret:1};}],
    ["detail NaN",(s:Fixture)=>{s.result.details.fee.value=NaN;}],
    ["negative rule index",(s:Fixture)=>{s.result.details.fee.ruleIdx=[-1];}],
    ["unknown source",(s:Fixture)=>{s.fields.fee.source="guessed";}],
    ["missing definition version",(s:Fixture)=>{s.definitionVersion="";}],
    ["stored raw payload",(s:Fixture)=>{s.raw={secret:1};}],
    ["Date detail",(s:Fixture)=>{Object.assign(s.result,{details:new Date()});}],
    ["Map fields",(s:Fixture)=>{Object.assign(s,{fields:new Map()});}],
  ] as const)("rejects %s",(_name,mutate)=>{const s=state();mutate(s);expect(validate(wrap(s)).ok).toBe(false);});
  it("does not trust a nonnull automatic alternative under blocked status",()=>{const s=blocked(0);s.fields.fee.automaticValue=42;expect(validate(wrap(s)).ok).toBe(false);});
  it("does not allow automatic stale display when blocked",()=>{expect(validate(wrap(blocked(333,"automatic"))).ok).toBe(false);});
  it("does not substitute calculated display from unrelated automatic amount",()=>{const s=state();s.fields.fee.value=999;expect(validate(wrap(s)).ok).toBe(false);});
  it("requires blocked details to preserve null",()=>{const s=blocked(0);s.result.details.fee.value=123;expect(validate(wrap(s)).ok).toBe(false);});
  it("rejects duplicate target entries",()=>{expect(validate({version:1,entries:[state(),state()]}).ok).toBe(false);});
  it("rejects prototype keys even in parsed JSON",()=>{const s=state();s.fields=JSON.parse('{"__proto__":{"value":1,"source":"manual","automaticValue":null}}');expect(validate(wrap(s)).ok).toBe(false);});
  it("rejects getter values without invoking them",()=>{let calls=0;const s=state();Object.defineProperty(s.fields.fee,"value",{enumerable:true,get(){calls++;return 100;}});expect(validate(wrap(s)).ok).toBe(false);expect(calls).toBe(0);});
  it("rejects cycles without throwing",()=>{const s=state();s.fields.fee.value=s;expect(()=>validate(wrap(s))).not.toThrow();expect(validate(wrap(s)).ok).toBe(false);});
  it("enforces the caller's current payload bound before copying",()=>{const s=blocked("가".repeat(100));expect(validate(wrap(s),{...context,maxBytes:200}).ok).toBe(false);});
  it.each([null,[],new Date(),new Map(),{version:2,entries:[]},{version:1,entries:""}])("rejects malformed envelope %j",value=>expect(validate(value).ok).toBe(false));
  it("rejects missing trusted bounds",()=>expect(validateFeeCalculationStateEnvelope(wrap(),undefined).ok).toBe(false));
});

it("전체 자동합계가 blocked여도 알려진 다른 칸의 상세 결과를 지우지 않는다",()=>{
  const s=blocked(0);s.fields={fee:{value:0,source:"manual",automaticValue:null},other:{value:null,source:"automatic",automaticValue:null}};
  s.result.details={fee:{value:0,ruleIdx:[0]},other:{value:null,blocked:{kind:"missing",from:"other",keys:["착수일"]}}};
  const r=validate(wrap(s),{...context,targets:[{...context.targets[0],fieldKeys:["fee","other"]}]});
  expect(r.ok).toBe(true);if(r.ok){expect(r.value.entries[0].result.details.fee.value).toBe(0);expect(r.value.entries[0].fields.fee.automaticValue).toBeNull();expect(r.value.entries[0].fields.other.automaticValue).toBeNull();}
});
it("중복식별자는scope/container/tier세값으로구별한다",()=>{
  const a=state();const b={...state(),scope:"tax-contract"};
  const ctx={...context,targets:[context.targets[0],{...context.targets[0],scope:"tax-contract"}]};
  expect(validate({version:1,entries:[a,b]},ctx).ok).toBe(true);
});
it("정확히표현할수없는ruleIdx는저장근거로허용하지않는다",()=>{
  const s=state();s.result.details.fee.ruleIdx=[Number.MAX_SAFE_INTEGER+1];expect(validate(wrap(s)).ok).toBe(false);
});
