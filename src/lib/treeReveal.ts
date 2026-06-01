import type { CSSProperties } from "react";
import { TREE_LINE_REVEAL_STAGGER_MS } from "../constants";

export function next_tree_reveal_style(
  isTreeRevealing: boolean,
  line_index: { current: number },
): CSSProperties | undefined {
  if (!isTreeRevealing) return undefined;
  const index = line_index.current;
  line_index.current += 1;
  return { animationDelay: `${index * TREE_LINE_REVEAL_STAGGER_MS}ms` };
}

export function with_tree_reveal_class(isTreeRevealing: boolean, base_class: string): string {
  return isTreeRevealing ? `${base_class} terminal-tree-line--reveal` : base_class;
}
