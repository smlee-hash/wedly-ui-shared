// @wedly/ui-shared/ui — WEDLY 디자인 시스템 부품 (2026-08-23 확정 시안 반영본)
//
// 값(색·글꼴·간격)의 정본은 전역 스킬 `wedly-design-system` 이다. 여기엔 모양만 있다.
// 쓰는 앱은 자기 globals.css 에 WEDLY 토큰(bg-wedly-accent 등)을 정의해야 한다.
// Tailwind 스캔 등록은 `@wedly/ui-shared/styles.css` 한 줄이 이미 맡는다.
//
// ★부품 하나만 쓸 때도 이 묶음을 부르면 나머지가 딸려 들어온다. 자잘한 도구
//  (클래스 합치기·좌표 계산)는 전용 통로(`@wedly/ui-shared/ui/cn` 등)로 부른다.

export { cn, WEDLY_TEXT_TIERS } from "./cn";
export { computeAnchoredPosition } from "./anchoredPosition";
export type { AnchorRect, ViewportSize, AnchoredPosition } from "./anchoredPosition";
export { useAnchoredPosition } from "./useAnchoredPosition";

export { Accordion } from "./Accordion";
export { ActionMenu } from "./ActionMenu";
export { Avatar } from "./Avatar";
export { Breadcrumb } from "./Breadcrumb";
export { ButtonGroup } from "./ButtonGroup";
export { Carousel } from "./Carousel";
export { Checkbox } from "./Checkbox";
export { Combobox } from "./Combobox";
export { CopyButton } from "./CopyButton";
export { DescriptionList } from "./DescriptionList";
export { Divider } from "./Divider";
export { EmptyState } from "./EmptyState";
export { FileUploadField } from "./FileUploadField";
export { IconButton } from "./IconButton";
export { Kbd } from "./Kbd";
export { MiniCalendar } from "./MiniCalendar";
export { NotificationBadge } from "./NotificationBadge";
export { NumberInput } from "./NumberInput";
export { Pagination } from "./Pagination";
export { ProgressBar } from "./ProgressBar";
export { RadioGroup } from "./Radio";
export { Rating } from "./Rating";
export { SearchField } from "./SearchField";
export { SegmentedControl } from "./SegmentedControl";
export { Skeleton } from "./Skeleton";
export { Slider } from "./Slider";
export { Spinner } from "./Spinner";
export { StatCard } from "./StatCard";
export { StatusBox } from "./StatusBox";
export { Stepper } from "./Stepper";
export { Table } from "./Table";
export type { TableColumn } from "./Table";
export { TagInput } from "./TagInput";
export { Textarea } from "./Textarea";
export { TextLink } from "./TextLink";
export { TimeField } from "./TimeField";
export { Timeline } from "./Timeline";
export { Toast } from "./Toast";
export type { ToastTone } from "./Toast";
export { Tooltip } from "./Tooltip";
export { TreeView } from "./TreeView";
export type { TreeNode } from "./TreeView";
export { VisuallyHidden } from "./VisuallyHidden";
