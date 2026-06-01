import {
  ROOT_TREE_KEY,
  TREE_LINE_REVEAL_DURATION_MS,
  TREE_LINE_REVEAL_STAGGER_MS,
} from "../constants";
import type { TreeNode } from "../types";

/** Matches visible rows in TerminalPanel for the current collapse state. */
export function count_visible_terminal_tree_lines(
  folderContents: TreeNode[],
  collapsedKeys: Set<string>,
  rootTreeLabel: string,
): number {
  if (!rootTreeLabel) return 0;

  let count = 1;
  if (folderContents.length === 0 || collapsedKeys.has(ROOT_TREE_KEY)) {
    return count;
  }

  function walk(nodes: TreeNode[], path_prefix: string) {
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index]!;
      const key = `${path_prefix}:${index}:${node.name}`;
      count += 1;
      const has_children =
        node.isDirectory && node.children !== undefined && node.children.length > 0;
      if (has_children && !collapsedKeys.has(key)) {
        walk(node.children!, `${key}/`);
      }
    }
  }

  walk(folderContents, "");
  return count;
}

export function tree_reveal_animation_ms(line_count: number): number {
  if (line_count <= 0) return 0;
  return (
    (line_count - 1) * TREE_LINE_REVEAL_STAGGER_MS + TREE_LINE_REVEAL_DURATION_MS + 40
  );
}
