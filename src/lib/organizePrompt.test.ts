import { describe, expect, it } from "vitest";
import {
  build_organize_prompt,
  dedupe_changes_by_from,
  filter_disallowed_deletes,
  user_disallows_deletes,
} from "./organizePrompt";
import type { Change } from "../types";

describe("user_disallows_deletes", () => {
  it("detects never-delete preferences", () => {
    expect(user_disallows_deletes("never delete anything")).toBe(true);
    expect(user_disallows_deletes("Don't delete old backups")).toBe(true);
  });

  it("allows deletes when preference is silent", () => {
    expect(user_disallows_deletes("")).toBe(false);
    expect(user_disallows_deletes("group PDFs by year")).toBe(false);
  });
});

describe("filter_disallowed_deletes", () => {
  it("strips delete proposals when user forbids deletes", () => {
    const changes: Change[] = [
      { type: "move", from: "a.txt", to: "docs/a.txt" },
      { type: "delete", from: "junk.tmp" },
    ];
    const filtered = filter_disallowed_deletes(changes, "never delete");
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.type).toBe("move");
  });
});

describe("dedupe_changes_by_from", () => {
  it("keeps the last change per source path", () => {
    const changes: Change[] = [
      { type: "move", from: "a.txt", to: "docs/a.txt" },
      { type: "delete", from: "a.txt" },
    ];
    expect(dedupe_changes_by_from(changes)).toEqual([
      { type: "delete", from: "a.txt" },
    ]);
  });
});

describe("build_organize_prompt", () => {
  it("omits delete schema when deletes are disallowed", () => {
    const prompt = build_organize_prompt(["a.txt"], [], "never delete");
    expect(prompt).not.toContain('"delete"');
    expect(prompt).toContain("Do NOT propose delete");
  });

  it("includes delete schema when deletes are allowed", () => {
    const prompt = build_organize_prompt(["a.txt"], [], "");
    expect(prompt).toContain('"delete"');
  });

  it("only allows move and delete in the schema", () => {
    const prompt = build_organize_prompt(["a.txt"], [], "");
    expect(prompt).not.toContain('"rename"');
    expect(prompt).toContain('"move"');
    expect(prompt).toContain("Keep each file's original filename");
  });
});
