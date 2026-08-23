"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "./cn";

/**
 * 나무형 목록 (2026-08-23 신설) — 접었다 펴는 계층 구조(분류·폴더).
 * 아이콘 없이 세로 안내선(border-l)으로 들여쓴다.
 */
export type TreeNode = { id: string; label: string; children?: TreeNode[] };

function TreeItem({ node, depth }: { node: TreeNode; depth: number }) {
  const [open, setOpen] = useState(depth === 0);
  const hasChildren = (node.children?.length ?? 0) > 0;
  return (
    <li role="none">
      <button
        type="button"
        role="treeitem"
        aria-level={depth + 1}
        aria-selected="false"
        aria-expanded={hasChildren ? open : undefined}
        onClick={() => hasChildren && setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left text-wedly-sub text-wedly-t1 break-keep hover:bg-wedly-bg-gray",
          !hasChildren && "cursor-default hover:bg-transparent",
        )}
      >
        {hasChildren ? (
          <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-wedly-muted transition-transform", open && "rotate-90")} aria-hidden="true" />
        ) : (
          <span className="w-3.5 shrink-0" aria-hidden="true" />
        )}
        {node.label}
      </button>
      {hasChildren && open && (
        <ul role="group" className="border-l border-wedly-bd pl-4">
          {node.children!.map((child) => (
            <TreeItem key={child.id} node={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function TreeView({ nodes, className }: { nodes: TreeNode[]; className?: string }) {
  return (
    <ul role="tree" className={cn("min-w-0", className)}>
      {nodes.map((node) => (
        <TreeItem key={node.id} node={node} depth={0} />
      ))}
    </ul>
  );
}
