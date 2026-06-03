import { dirname, join, normalize } from "@tauri-apps/api/path";
import { exists, mkdir, remove, rename as fs_rename } from "@tauri-apps/plugin-fs";
import {
  build_path_index,
  flatten_tree_to_file_paths,
  list_directory_paths,
  normalize_changes_against_index,
  normalize_slashes,
} from "./folderPaths";
import type { Change, TreeNode } from "../types";

type ApplyPathContext = {
  files: string[];
  directories: string[];
};

export function apply_path_context_from_tree(folderContents: TreeNode[]) {
  return {
    files: flatten_tree_to_file_paths(folderContents),
    directories: list_directory_paths(folderContents),
  };
}

type ApplyItemResult = {
  change: Change;
  status: "applied" | "failed" | "skipped";
  error?: string;
};

export type ApplyOutcomeCounts = {
  movedApplied: number;
  deletedApplied: number;
  movedFailed: number;
  deletedFailed: number;
  skipped: number;
};

export type ApplyChangesResult = {
  results: ApplyItemResult[];
  outcomes: ApplyOutcomeCounts;
};

export function total_applied(outcomes: ApplyOutcomeCounts): number {
  return outcomes.movedApplied + outcomes.deletedApplied;
}

export function total_failed(outcomes: ApplyOutcomeCounts): number {
  return outcomes.movedFailed + outcomes.deletedFailed;
}

function count_apply_outcomes(results: ApplyItemResult[]): ApplyOutcomeCounts {
  const counts: ApplyOutcomeCounts = {
    movedApplied: 0,
    deletedApplied: 0,
    movedFailed: 0,
    deletedFailed: 0,
    skipped: 0,
  };

  for (const result of results) {
    const is_delete = result.change.type === "delete";
    if (result.status === "applied") {
      if (is_delete) counts.deletedApplied += 1;
      else counts.movedApplied += 1;
    } else if (result.status === "failed") {
      if (is_delete) counts.deletedFailed += 1;
      else counts.movedFailed += 1;
    } else if (result.status === "skipped") {
      counts.skipped += 1;
    }
  }

  return counts;
}

export class ApplyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApplyValidationError";
  }
}

function is_safe_relative_path(path: string): boolean {
  const normalized = normalize_slashes(path.trim());
  if (!normalized || normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) {
    return false;
  }
  return !normalized.split("/").some((segment) => segment === ".." || segment === ".");
}

async function resolve_under_root(root: string, relative_path: string): Promise<string> {
  if (!is_safe_relative_path(relative_path)) {
    throw new ApplyValidationError(`Unsafe path: ${relative_path}`);
  }
  const segments = relative_path.replace(/\\/g, "/").split("/");
  let absolute = root;
  for (const segment of segments) {
    absolute = await join(absolute, segment);
  }
  const normalized_root = await normalize(root);
  const normalized_absolute = await normalize(absolute);
  const root_prefix =
    normalized_root.endsWith("/") || normalized_root.endsWith("\\")
      ? normalized_root
      : `${normalized_root}/`;
  if (
    normalized_absolute !== normalized_root &&
    !normalized_absolute.startsWith(root_prefix) &&
    !normalized_absolute.startsWith(`${normalized_root}\\`)
  ) {
    throw new ApplyValidationError(`Path escapes folder root: ${relative_path}`);
  }
  return normalized_absolute;
}

function is_move(change: Change): boolean {
  return change.type === "move";
}

async function validate_changes(
  root: string,
  changes: Change[],
): Promise<void> {
  if (changes.length === 0) {
    throw new ApplyValidationError("No changes selected.");
  }

  const from_paths = new Set<string>();
  const to_paths = new Set<string>();

  for (const change of changes) {
    if (!change.from?.trim()) {
      throw new ApplyValidationError("Change missing source path.");
    }
    if (!is_safe_relative_path(change.from)) {
      throw new ApplyValidationError(`Invalid source path: ${change.from}`);
    }

    if (from_paths.has(change.from)) {
      throw new ApplyValidationError(`Duplicate source path: ${change.from}`);
    }
    from_paths.add(change.from);

    if (change.type === "delete") {
      continue;
    }

    if (change.type !== "move") {
      throw new ApplyValidationError(`Unsupported change type: ${change.type}`);
    }

    if (!change.to?.trim()) {
      throw new ApplyValidationError(`Missing destination for ${change.from}`);
    }
    if (!is_safe_relative_path(change.to)) {
      throw new ApplyValidationError(`Invalid destination path: ${change.to}`);
    }
    if (to_paths.has(change.to)) {
      throw new ApplyValidationError(`Duplicate destination path: ${change.to}`);
    }
    to_paths.add(change.to);
  }

  for (const change of changes) {
    const from_abs = await resolve_under_root(root, change.from);
    if (!(await exists(from_abs))) {
      throw new ApplyValidationError(`Source not found: ${change.from}`);
    }

    if (!is_move(change) || !change.to) continue;

    const to_abs = await resolve_under_root(root, change.to);
    if (!(await exists(to_abs))) continue;

    const other_change_moves_from_target = changes.some(
      (other) => is_move(other) && other.from === change.to,
    );
    const same_path = change.from === change.to;

    if (!other_change_moves_from_target && !same_path) {
      throw new ApplyValidationError(`Destination already exists: ${change.to}`);
    }
  }
}

function order_move_changes(changes: Change[]): Change[] {
  const remaining = changes.filter(is_move);
  const ordered: Change[] = [];

  while (remaining.length > 0) {
    const ready = remaining.filter(
      (change) => !remaining.some((other) => other !== change && other.to === change.from),
    );

    if (ready.length === 0) {
      ordered.push(...remaining);
      break;
    }

    for (const change of ready) {
      ordered.push(change);
      const index = remaining.indexOf(change);
      remaining.splice(index, 1);
    }
  }

  return ordered;
}

async function ensure_parent_dirs(root: string, relative_paths: string[]): Promise<void> {
  const parent_dirs = new Set<string>();
  for (const relative_path of relative_paths) {
    const parent = await dirname(relative_path);
    if (parent && parent !== "." && parent !== "/") {
      parent_dirs.add(parent);
    }
  }

  for (const parent of parent_dirs) {
    const parent_abs = await resolve_under_root(root, parent);
    await mkdir(parent_abs, { recursive: true });
  }
}

async function break_move_cycle(
  root: string,
  change: Change,
  current_from: string,
): Promise<string> {
  const temp_relative = `.folder_organizer_tmp/${crypto.randomUUID()}_${change.from.split("/").pop() ?? "item"}`;
  const temp_abs = await resolve_under_root(root, temp_relative);
  await mkdir(await dirname(temp_abs), { recursive: true });
  await fs_rename(current_from, temp_abs);
  return temp_abs;
}

async function apply_move_change(
  root: string,
  change: Change,
  current_paths: Map<string, string>,
  pending_from_paths: Set<string>,
): Promise<void> {
  const from_abs = current_paths.get(change.from) ?? (await resolve_under_root(root, change.from));
  const to_abs = await resolve_under_root(root, change.to!);

  let source_abs = from_abs;
  const dest_exists = await exists(to_abs);
  const dest_will_be_moved_later = change.to ? pending_from_paths.has(change.to) : false;

  if (dest_exists && dest_will_be_moved_later && to_abs !== from_abs) {
    source_abs = await break_move_cycle(root, change, source_abs);
  } else if (dest_exists && to_abs !== from_abs) {
    throw new Error(`Destination already exists: ${change.to}`);
  }

  await mkdir(await dirname(to_abs), { recursive: true });
  await fs_rename(source_abs, to_abs);
  current_paths.set(change.from, to_abs);
  pending_from_paths.delete(change.from);
}

export async function apply_changes(
  root: string,
  changes: Change[],
  known_paths?: ApplyPathContext,
): Promise<ApplyChangesResult> {
  let resolved_changes = changes;
  const file_paths = known_paths?.files;
  const directory_paths = known_paths?.directories ?? [];
  if (file_paths && file_paths.length > 0) {
    const path_index = build_path_index(file_paths);
    const { changes: normalized, unresolved } = normalize_changes_against_index(
      changes,
      path_index,
      directory_paths,
    );
    if (unresolved.length > 0) {
      throw new ApplyValidationError(
        `Could not resolve path(s): ${unresolved.join(", ")}. Re-scan the folder and propose changes again.`,
      );
    }
    resolved_changes = normalized;
  }

  await validate_changes(root, resolved_changes);

  const results: ApplyItemResult[] = [];
  const moves = order_move_changes(resolved_changes);
  const deletes = resolved_changes.filter((change) => change.type === "delete");

  const move_destinations = moves
    .map((change) => change.to)
    .filter((path): path is string => Boolean(path));

  try {
    await ensure_parent_dirs(root, move_destinations);
  } catch (error) {
    throw new ApplyValidationError(
      error instanceof Error ? error.message : "Failed to create destination folders.",
    );
  }

  const current_paths = new Map<string, string>();
  const failed_sources = new Set<string>();
  const pending_from_paths = new Set(moves.map((change) => change.from));

  for (const change of moves) {
    if (failed_sources.has(change.from)) {
      results.push({
        change,
        status: "skipped",
        error: "Source unavailable due to an earlier failure.",
      });
      continue;
    }

    try {
      await apply_move_change(root, change, current_paths, pending_from_paths);
      results.push({ change, status: "applied" });
    } catch (error) {
      failed_sources.add(change.from);
      pending_from_paths.delete(change.from);
      results.push({
        change,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  for (const change of deletes) {
    if (failed_sources.has(change.from)) {
      results.push({
        change,
        status: "skipped",
        error: "Source unavailable due to an earlier failure.",
      });
      continue;
    }

    try {
      const from_abs =
        current_paths.get(change.from) ?? (await resolve_under_root(root, change.from));  
      if (!(await exists(from_abs))) {
        results.push({
          change,
          status: "failed",
          error: "Source not found.",
        });
        continue;
      }
      await remove(from_abs);
      results.push({ change, status: "applied" });
    } catch (error) {
      results.push({
        change,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { results, outcomes: count_apply_outcomes(results) };
}
