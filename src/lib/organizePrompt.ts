import type { Change } from "../types";

const NEVER_DELETE_PATTERNS = [
  /never\s+delete/i,
  /don't\s+delete/i,
  /do\s+not\s+delete/i,
  /no\s+deletes?/i,
  /don't\s+remove/i,
  /do\s+not\s+remove/i,
  /don't\s+trash/i,
  /do\s+not\s+trash/i,
];

export function user_disallows_deletes(preferences: string): boolean {
  const text = preferences.trim();
  if (!text) return false;
  return NEVER_DELETE_PATTERNS.some((pattern) => pattern.test(text));
}

export function filter_disallowed_deletes(
  changes: Change[],
  preferences: string,
): Change[] {
  if (!user_disallows_deletes(preferences)) return changes;
  return changes.filter((change) => change.type !== "delete");
}

export function dedupe_changes_by_from(changes: Change[]): Change[] {
  const by_from = new Map<string, Change>();
  for (const change of changes) {
    const key = change.from.replace(/\\/g, "/");
    if (by_from.has(key)) {
      console.warn(`Duplicate organize proposal for "${key}", keeping the last one`);
    }
    by_from.set(key, change);
  }
  return [...by_from.values()];
}

export function build_organize_prompt(
  file_paths: string[],
  directory_paths: string[],
  user_preferences: string,
): string {
  const file_lines = file_paths.map((path) => `- ${path}`).join("\n");
  const dir_lines =
    directory_paths.length > 0
      ? directory_paths.map((path) => `- ${path}/`).join("\n")
      : "- (none — all files are in the root)";

  const preferences_block = user_preferences.trim() ? user_preferences.trim() : "- (none)";
  const no_deletes = user_disallows_deletes(user_preferences);

  const schema = no_deletes
    ? '{"changes":[{"type":"move","from":"<exact file path>","to":"<folder or folder/file>"}]}'
    : '{"changes":[{"type":"move","from":"<exact file path>","to":"<folder or folder/file>"},{"type":"delete","from":"<exact file path>"}]}';

  const example = no_deletes
    ? `{"changes":[
  {"type":"move","from":"misc/IMG_001.jpg","to":"photos"},
  {"type":"move","from":"draft-notes.txt","to":"documents"}
]}`
    : `{"changes":[
  {"type":"move","from":"misc/IMG_001.jpg","to":"photos"},
  {"type":"move","from":"draft-notes.txt","to":"documents"},
  {"type":"delete","from":"temp/old-backup.zip"}
]}`;

  const change_types = no_deletes
    ? `- move: file goes into a folder — use existing folders when they fit, or propose clear new folder names in "to"`
    : `- move: file goes into a folder — use existing folders when they fit, or propose clear new folder names in "to"
- delete: only obvious junk (duplicates, stale temp files, empty placeholders) — omit "to"`;

  const delete_rule = no_deletes
    ? "11. Do NOT propose delete changes. The user forbids deleting files."
    : "";

  return `You are a file organization assistant. Propose a practical plan to organize this folder.

## Output
Return ONLY valid JSON. No markdown fences, no explanation, no trailing text.

Schema:
${schema}

Example (illustrative paths only):
${example}

## Change types
${change_types}

## Rules
1. Every "from" MUST match a path in the file list below exactly — copy it character-for-character.
2. Use forward slashes only (e.g. documents/report.pdf).
3. Propose changes for FILES only. Do not move directories; new folders appear in "to" paths automatically.
4. Keep each file's original filename — only change which folder it lives in. For "to", prefer an existing directory path (e.g. "photos") or "folder/original-filename".
5. Skip files that are already well placed or clearly intentional (e.g. README.md at root).
6. Skip system or hidden files (desktop.ini, .DS_Store, Thumbs.db).
7. Use lowercase, hyphenated names for new folders only (e.g. tax-documents).
8. Prefer fewer, meaningful moves over moving everything.
9. Follow the user preferences below when proposing changes. If they name paths, folders, or patterns to leave alone, do not propose changes for matching files.
10. Do not use ".." or absolute paths.
${delete_rule}

## User preferences
${preferences_block}

## Existing directories
${dir_lines}

## Files (authoritative "from" paths)
${file_lines}`;
}
