import { describe, expect, it } from "vitest";
import {
  derive_apply_changes,
  initial_pending_deletes_from_changes,
} from "./previewLayout";
import type { Change, TreeNode } from "../types";

const folder_tree: TreeNode[] = [
  {
    name: "misc",
    isDirectory: true,
    isFile: false,
    isSymlink: false,
    children: [
      {
        name: "photo.jpg",
        isDirectory: false,
        isFile: true,
        isSymlink: false,
      },
    ],
  },
  {
    name: "downloads",
    isDirectory: true,
    isFile: false,
    isSymlink: false,
    children: [],
  },
];

describe("derive_apply_changes", () => {
  it("resolves folder-only to paths for apply", () => {
    const changes: Change[] = [
      { type: "move", from: "misc/photo.jpg", to: "downloads" },
    ];
    const apply = derive_apply_changes(changes, new Map(), folder_tree, new Set());
    expect(apply).toHaveLength(1);
    expect(apply[0]).toMatchObject({
      from: "misc/photo.jpg",
      to: "downloads/photo.jpg",
    });
  });

  it("emits delete when path is in pendingDeletes", () => {
    const changes: Change[] = [{ type: "delete", from: "misc/photo.jpg" }];
    const without_mark = derive_apply_changes(changes, new Map(), folder_tree, new Set());
    expect(without_mark).toHaveLength(0);

    const pending = initial_pending_deletes_from_changes(changes);
    const with_mark = derive_apply_changes(changes, new Map(), folder_tree, pending);
    expect(with_mark).toEqual([{ type: "delete", from: "misc/photo.jpg" }]);
  });

  it("skips no-op moves when destination equals source", () => {
    const changes: Change[] = [
      { type: "move", from: "misc/photo.jpg", to: "misc/photo.jpg" },
    ];
    const apply = derive_apply_changes(changes, new Map(), folder_tree, new Set());
    expect(apply).toHaveLength(0);
  });
});
