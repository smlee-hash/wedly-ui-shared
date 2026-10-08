import { describe, expect, it } from "vitest";
import { resolveGovernmentFeeContext } from "./government-fee-context";

const contract = { id: "c1", label: "1차", 계약일: "2026-07-31", 착수일: "2026-08-03", 계약금: 1_000_000 };
const settlement = { id: "s1", label: "1차", 수금일: "2026-10-08", 성공보수총액: 800_000 };
const ownerId = { sourceTable: "PolicyFundEntry", entryId: "policy-42-test", version: "snapshot-v1" };
const input = (area: "contract" | "settlement" = "settlement") => ({
  businessPolicy: "government-subsidy", adapter: area === "contract" ? "gov-contract-formula" : "gov-settlement-formula",
  definition: { area, sourceKeys: area === "contract" ? ["policy-fund-contract-tiered-fields", "policy-fund-contract-tiered-fields-custom-erp"] : ["policy-fund-settlement-fields", "policy-fund-settlement-fields-custom-erp"], version: "actual-def-digest" },
  owner: { ...ownerId, data: { domain: "policy-fund", "06계약일": "2099-01-01", 계약정보_차수: [contract], 정산정보: [settlement] } },
  target: { ...ownerId, area, containerKey: area === "contract" ? "계약정보_차수" : "정산정보", tierId: area === "contract" ? "c1" : "s1" },
});
const resolve = (value: unknown) => resolveGovernmentFeeContext(value);
const blocked = (value: unknown, reason: string) => expect(resolve(value)).toMatchObject({ status: "blocked", reason });

describe("정부지원금 실제 소유자·업무 문맥", () => {
  it.each(["policy-fund", "government-subsidy", "free-subsidy", "other-technical-name"])("신뢰한 정부업무 문맥에서는 raw domain %s로 누락하지 않는다", domain => {
    const x = input(); x.owner.data.domain = domain;
    expect(resolve(x)).toMatchObject({ status: "ready", businessPolicy: "government-subsidy", owner: ownerId, definitionVersion: "actual-def-digest", linkage: "unique-owner-contract", contract });
  });
  it.each(["policy-fund", "tax-amendment", "labor-subsidy"])("원래 다른 업무 %s는 기존 계산을 유지한다", businessPolicy => {
    expect(resolve({ ...input(), businessPolicy })).toEqual({ status: "not-applicable" });
  });
  it("계약 계산은 다른 계약 수와 무관하게 현재 계약을 읽는다", () => {
    const x = input("contract"); x.owner.data.계약정보_차수.push({ ...contract, id: "c2", 착수일: "2026-09-01" });
    expect(resolve(x)).toMatchObject({ status: "ready", linkage: "current-contract", contract });
  });
  it("같은 owner 유일계약에 정산 여러 개를 연결하되 원본과 정산값은 바꾸지 않는다", () => {
    const x = input(); x.owner.data.정산정보.push({ ...settlement, id: "s2", 성공보수총액: 300_000 });
    const before = JSON.stringify(x);
    for (const tierId of ["s1", "s2"]) expect(resolve({ ...x, target: { ...x.target, tierId } })).toMatchObject({ status: "ready", contract, target: { tierId } });
    expect(JSON.stringify(x)).toBe(before);
  });
  it("FreeSubsidyEntry의 같은 업무·실제 정의도 적용한다", () => {
    const x = input(); x.owner.sourceTable = x.target.sourceTable = "FreeSubsidyEntry";
    expect(resolve(x)).toMatchObject({ status: "ready", owner: { sourceTable: "FreeSubsidyEntry" } });
  });
  it.each(["sourceTable", "entryId", "version"])("target %s가 owner와 다르면 다른 행으로 대신하지 않는다", key => {
    const x = input(); blocked({ ...x, target: { ...x.target, [key]: "different" } }, "context-invalid");
  });
  it.each(["owner", "target", "definition", "adapter"])("정부업무의 필수문맥 %s 누락을 일반식으로 넘기지 않는다", key => {
    const x: Record<string, unknown> = input(); delete x[key]; blocked(x, "context-invalid");
  });
  it("HTTP 임의 scope 및 정의 출처로 적용하지 않는다", () => {
    blocked({ ...input(), adapter: "query-government-subsidy" }, "context-invalid");
    const x = input(); x.definition.sourceKeys = ["hive-contract-tiered-fields"]; blocked(x, "context-invalid");
  });
  it("정의 버전·area와 실제 컨테이너를 확인한다", () => {
    let x = input(); x.definition.version = ""; blocked(x, "context-invalid");
    x = input(); x.definition.area = "contract"; blocked(x, "context-invalid");
    x = input(); x.target.containerKey = "계약정보_차수"; blocked(x, "context-invalid");
  });
  it.each(["_deletedAt", "_mergedInto"])("살아 있지 않은 소유 행 %s는 옛 값으로 계산하지 않는다", key => {
    const x = input(); blocked({ ...x, owner: { ...x.owner, data: { ...x.owner.data, [key]: "other" } } }, "invalid-contract-context");
  });
  it("계약이 없으면 대표 flat 날짜나 정산 환불 키로 연결하지 않는다", () => {
    const x = input(); x.owner.data.계약정보_차수 = [];
    blocked(x, "contract-link-missing");
    blocked({ ...x, owner: { ...x.owner, data: { ...x.owner.data, 정산정보: [{ ...settlement, _contractTierId: "c1" }] } } }, "contract-link-missing");
  });
  it("날짜·금액이 같아도 계약이 둘이면 최신 또는 환불 키를 고르지 않는다", () => {
    const x = input(); x.owner.data.계약정보_차수.push({ ...contract, id: "c2" });
    blocked(x, "contract-link-ambiguous");
    blocked({ ...x, owner: { ...x.owner, data: { ...x.owner.data, 정산정보: [{ ...settlement, _contractTierId: "c1" }] } } }, "contract-link-ambiguous");
  });
  it.each(["{", {}, [null], [contract, null], [contract, { ...contract }], [contract, { ...contract, id: "c2", _deletedAt: "yesterday" }]].map(tiers => ({ tiers })))("깨진/중복/삭제 차수를 버려 하나로 만들지 않는다 $tiers", ({ tiers }) => {
    const x = input(); blocked({ ...x, owner: { ...x.owner, data: { ...x.owner.data, 계약정보_차수: tiers } } }, "invalid-contract-context");
  });
  it("컨테이너 JSON을 동일하게 엄격히 읽는다", () => {
    const x = input(); expect(resolve({ ...x, owner: { ...x.owner, data: { ...x.owner.data, 계약정보_차수: JSON.stringify([contract]), 정산정보: JSON.stringify([settlement]) } } })).toMatchObject({ status: "ready", contract });
  });
  it.each([[{ ...settlement, id: "other" }], [settlement, settlement], [null]].map(tiers => ({ tiers })))("현재 정산차수 존재·고유성 검증 $tiers", ({ tiers }) => {
    const x = input(); blocked({ ...x, owner: { ...x.owner, data: { ...x.owner.data, 정산정보: tiers } } }, "invalid-contract-context");
  });
  it("계산 뒤 계약이 추가되면 과거 유일 연결을 재사용하지 않는다", () => {
    const x = input(); expect(resolve(x)).toMatchObject({ status: "ready" });
    x.owner.version = x.target.version = "snapshot-v2"; x.owner.data.계약정보_차수.push({ ...contract, id: "c2" });
    blocked(x, "contract-link-ambiguous");
  });
  it("id 없는 옛 차수는 검증된 동일 owner/container/version projected 증거가 필요하다", () => {
    const x = input(); const old = { ...contract } as Record<string, unknown>; delete old.id;
    const owner = { ...x.owner, data: { ...x.owner.data, 계약정보_차수: [old] } };
    blocked({ ...x, owner }, "invalid-contract-context");
    const projectedIdentities = [{ ...ownerId, containerKey: "계약정보_차수", index: 0, identity: "projection-c1" }];
    expect(resolve({ ...x, owner, projectedIdentities })).toMatchObject({ status: "ready", contract: old });
    blocked({ ...x, owner, projectedIdentities: [{ ...projectedIdentities[0], version: "stale" }] }, "invalid-contract-context");
    expect(old).not.toHaveProperty("id");
  });
});
