"use client";

// 통합화면 분야(섹션)별 차수 탭 — 공용 부품에 ERP 정산 칸/설정 주소만 주입하는 얇은 래퍼.
//  - 정산(settlement): 공용 SectionSettlementTab 그대로 사용(단일 원본).
//  - 계약/환불(contract/refund): 공용 SectionSettlementTab이 아직 kind 미지원이라, 같은 분야별 통로
//    (/api/unified-collab/section-settlement/{section}/fields?kind=...)로 직접 조립한다.
//    합계카드는 비우고 비율 자동계산은 끈다(분야 계약/환불엔 공통 의미 없음) → 경정청구 부품 오염 없음.
//    ※ Phase 2에서 공용 부품 SectionSettlementTab에 kind를 승격하면 이 분기는 제거 예정.
import { SectionSettlementTab as Shared, SettlementInfoTab as SharedSettlementInfoTab } from "@wedly/detail-modal-shared";

export default function SectionSettlementTab({
  section,
  rawValue,
  onSave,
  isAdmin = false,
  kind = "settlement",
  sectionSettlementBase,
}: {
  section: string;
  rawValue: unknown;
  onSave: (jsonValue: string) => void;
  isAdmin?: boolean;
  kind?: "settlement" | "contract" | "refund";
  sectionSettlementBase: string;
}) {
  if (kind === "settlement") {
    return (
      <Shared
        section={section}
        rawValue={rawValue}
        onSave={onSave}
        isAdmin={isAdmin}
        settlementApiBase={sectionSettlementBase}
      />
    );
  }
  const base = `${sectionSettlementBase}/${encodeURIComponent(section)}`;
  return (
    <SharedSettlementInfoTab
      rawValue={rawValue}
      onSave={onSave}
      isAdmin={isAdmin}
      allowStructureEdit
      storagePrefix={kind}
      fieldsApiPath={`${base}/fields?kind=${kind}`}
      configApiPath={`${base}/config`}
      ratioBaseKey="__uc_none_base"
      ratioFeeKey="__uc_none_fee"
      ratioBaseLabel="기준"
      ratioFeeLabel="수수료"
      defaultScoreCards={[]}
    />
  );
}
