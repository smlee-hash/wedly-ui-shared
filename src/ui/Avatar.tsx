import { cn } from "./cn";

/**
 * 아바타 (2026-08-23 신설) — 사람=원형, 조직/봇=둥근 사각(깃허브식 이원).
 * 사진이 없으면 이름 첫 글자 + 이름 기반 고정 색(의미색 5종 순환).
 */
const SIZE = { sm: "h-6 w-6 text-wedly-label", md: "h-8 w-8 text-wedly-label", lg: "h-10 w-10 text-wedly-sub" } as const;
const PALETTE = ["bg-wedly-accent", "bg-wedly-purple", "bg-wedly-teal", "bg-wedly-green", "bg-wedly-pink"] as const;

function colorOf(name: string): string {
  // 32비트로 누적하고 마지막에 한 번만 나머지 — 매 단계 나머지는 분포가 쏠린다(적대적 리뷰 실측)
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

export function Avatar({
  name,
  src,
  size = "md",
  shape = "person",
  className,
}: {
  name: string;
  src?: string;
  size?: keyof typeof SIZE;
  shape?: "person" | "org";
  className?: string;
}) {
  const radius = shape === "person" ? "rounded-full" : "rounded-md";
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name} className={cn("shrink-0 object-cover", SIZE[size], radius, className)} />;
  }
  const first = [...name.trim()][0] ?? "?";
  return (
    <span
      aria-label={name || "이름 없음"}
      className={cn("inline-flex shrink-0 items-center justify-center font-semibold text-white", SIZE[size], radius, colorOf(name), className)}
    >
      {first}
    </span>
  );
}
