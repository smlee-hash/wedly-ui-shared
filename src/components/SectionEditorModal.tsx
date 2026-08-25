"use client";

/**
 * 상세 모달의 하위 섹션을 추가하거나 삭제할 때 쓰는 작은 모달.
 *   - mode="add" : 라벨 입력 + 종류 선택 → onConfirm({ id, label, kind }) 호출
 *   - mode="delete" : 삭제 확인 + onConfirm 호출
 *
 * 도메인 의존성 0 — props 만 받음. 모달 디자인은 AGENTS.md §6-1 위들리 표준 패턴.
 */

import { useEffect, useRef, useState } from "react";
import { cn } from "../lib/cn";

export type SectionKind = "fields" | "settlement" | "files" | "tiered-contract" | "tiered-refund" | "meetings";

export type SectionEditorAddPayload = {
  id: string;
  label: string;
  kind: SectionKind;
};

const KIND_OPTIONS: Array<{ value: SectionKind; label: string; description: string }> = [
  { value: "fields", label: "일반 (컬럼 모음)", description: "기본정보·기타 같은 일반 정보 섹션. 컬럼을 하나씩 추가해서 채움" },
  // 사용자 요구 2026-05-25: 정산·계약·환불 세 종류를 "차수 카드" 하나로 통일.
  // 내부 종류 식별은 settlement 로 두되, 사용자가 만든 섹션의 라벨로 의미 구분(어드민이 자유롭게 이름 정함).
  { value: "settlement", label: "차수 카드", description: "회차별로 카드를 늘려가며 정보를 쌓는 섹션 (정산·계약·환불 등 모든 차수 형식)" },
  { value: "files", label: "파일", description: "파일 첨부 전용 섹션" },
  { value: "meetings", label: "미팅", description: "미팅 회차 카드 전용 섹션" },
];

/** 라벨에서 영문·숫자만 뽑아 id 후보로 — 한글 라벨이면 임의 short id 생성 */
function slugifyLabel(label: string): string {
  const ascii = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (ascii) return ascii;
  // 한글 / 기호만 → 임의 id (충돌 방지: 시간 기반 + 짧은 random)
  // 같은 초에 두 번 만들어도 random 으로 분기.
  let rand = "";
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const arr = new Uint8Array(3);
    crypto.getRandomValues(arr);
    rand = Array.from(arr).map((b) => b.toString(36).padStart(2, "0")).join("").slice(0, 4);
  } else {
    rand = Math.floor(Math.random() * 1e6).toString(36).slice(0, 4);
  }
  return `sec-${Date.now().toString(36).slice(-4)}-${rand}`;
}

export function SectionEditorAddModal({
  open,
  existingIds,
  onClose,
  onConfirm,
}: {
  open: boolean;
  existingIds: string[];
  onClose: () => void;
  onConfirm: (payload: SectionEditorAddPayload) => void;
}) {
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<SectionKind>("fields");
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setLabel("");
      setKind("fields");
      setErr(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  if (!open) return null;

  const handleConfirm = () => {
    const trimmed = label.trim();
    if (!trimmed) {
      setErr("섹션 이름을 입력해 주세요.");
      return;
    }
    if (trimmed.length > 30) {
      setErr("섹션 이름은 30자 이내로 입력해 주세요.");
      return;
    }
    // id 후보 만들기 + 중복 방지
    let id = slugifyLabel(trimmed);
    if (existingIds.includes(id)) {
      let i = 2;
      while (existingIds.includes(`${id}-${i}`)) i++;
      id = `${id}-${i}`;
    }
    onConfirm({ id, label: trimmed, kind });
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-wedly-bd">
        <div className="px-5 pt-5 pb-3 border-b border-wedly-bd/60">
          <h3 className="text-wedly-sub font-bold text-wedly-navy">새 섹션 추가</h3>
          <p className="mt-1 text-[12px] text-wedly-muted">상세 정보 패널 안에 새 하위 섹션을 만듭니다.</p>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-[12px] font-semibold text-wedly-t2 mb-1.5">섹션 이름</label>
            <input
              ref={inputRef}
              type="text"
              value={label}
              onChange={(e) => { setLabel(e.target.value); if (err) setErr(null); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); handleConfirm(); }
                if (e.key === "Escape") onClose();
              }}
              placeholder="예: 미팅정보 / 자료실 / 거래 이력"
              className={cn(
                "w-full px-3 py-2 text-[15px] sm:text-[13px] border rounded-lg bg-white text-wedly-t1 placeholder:text-wedly-muted focus:outline-none transition-colors",
                err
                  ? "border-wedly-red focus:border-wedly-red focus:ring-2 focus:ring-wedly-red/20"
                  : "border-wedly-bd focus:border-wedly-accent focus:ring-2 focus:ring-wedly-accent/30 hover:border-wedly-accent/50"
              )}
            />
            {err && <p className="mt-1 text-[11px] text-wedly-red">{err}</p>}
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-wedly-t2 mb-1.5">섹션 종류</label>
            <div className="space-y-1.5">
              {KIND_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={cn(
                    "flex items-start gap-2 p-2 rounded-lg border cursor-pointer transition-colors",
                    kind === opt.value
                      ? "border-wedly-accent bg-wedly-bg-blue/30"
                      : "border-wedly-bd hover:bg-wedly-bg-gray"
                  )}
                >
                  <input
                    type="radio"
                    name="section-kind"
                    value={opt.value}
                    checked={kind === opt.value}
                    onChange={() => setKind(opt.value)}
                    className="mt-0.5 accent-wedly-accent"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-wedly-t1">{opt.label}</div>
                    <div className="text-[11px] text-wedly-muted mt-0.5">{opt.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="px-5 py-3 bg-wedly-bg-gray/50 border-t border-wedly-bd/60 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-[13px] font-medium text-wedly-t2 bg-white border border-wedly-bd rounded-lg hover:bg-wedly-bg-gray transition-colors"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="px-4 py-2 text-[13px] font-bold text-white bg-wedly-accent rounded-lg hover:brightness-110 transition-colors"
          >
            섹션 만들기
          </button>
        </div>
      </div>
    </div>
  );
}

export function SectionEditorDeleteConfirm({
  open,
  sectionLabel,
  hasContent,
  otherSectionHidden = false,
  onClose,
  onConfirm,
}: {
  open: boolean;
  sectionLabel: string;
  /** 이 섹션에 컬럼이 들어 있는지 — true 면 사용자에게 더 강한 경고 */
  hasContent: boolean;
  /** 현재 "기타" 섹션이 숨김 상태인지 — true 면 옮겨진 컬럼을 못 본다는 추가 안내 */
  otherSectionHidden?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-wedly-bd">
        <div className="px-5 pt-5 pb-3 border-b border-wedly-bd/60">
          <h3 className="text-wedly-sub font-bold text-wedly-navy">섹션 삭제</h3>
        </div>
        <div className="px-5 py-4 text-[13px] text-wedly-t2 space-y-2">
          <p>
            <span className="font-semibold text-wedly-t1">&apos;{sectionLabel}&apos;</span> 섹션을 삭제하시겠습니까?
          </p>
          {hasContent && (
            <p className="text-[12px] text-wedly-t1 bg-wedly-bg-yellow/50 border border-wedly-orange/30 rounded-lg p-2">
              이 섹션 안 컬럼들은 자동으로 &apos;기타&apos; 섹션으로 옮겨집니다.
              {otherSectionHidden && (
                <span className="block mt-1 text-wedly-red font-medium">
                  ⚠️ 현재 기타 섹션이 숨김 상태입니다. 옮겨진 컬럼을 보려면 섹션 편집 메뉴에서 &apos;기타 섹션 노출&apos; 을 켜세요.
                </span>
              )}
            </p>
          )}
          <p className="text-[12px] text-wedly-muted">삭제 후 다시 만들 수 있습니다.</p>
        </div>
        <div className="px-5 py-3 bg-wedly-bg-gray/50 border-t border-wedly-bd/60 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-[13px] font-medium text-wedly-t2 bg-white border border-wedly-bd rounded-lg hover:bg-wedly-bg-gray transition-colors"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 text-[13px] font-bold text-white bg-wedly-red rounded-lg hover:brightness-110 transition-colors"
          >
            삭제
          </button>
        </div>
      </div>
    </div>
  );
}
