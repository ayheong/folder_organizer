import type { ApplyChangesResult, ApplyOutcomeCounts } from "./applyChanges";
import { total_applied, total_failed } from "./applyChanges";
import { COPY } from "../copy";
import type { Change } from "../types";

function file_count_label(count: number): string {
  return count === 1 ? "1 file" : `${count} files`;
}

function outcome_success_phrase(moved: number, deleted: number): string {
  const parts: string[] = [];
  if (moved > 0) {
    parts.push(
      `${file_count_label(moved)} ${moved === 1 ? "was" : "were"} moved`,
    );
  }
  if (deleted > 0) {
    parts.push(`${file_count_label(deleted)} ${deleted === 1 ? "was" : "were"} deleted`);
  }
  return parts.join(", ");
}

function apply_success_message(outcomes: ApplyOutcomeCounts): string {
  const phrase = outcome_success_phrase(
    outcomes.movedApplied,
    outcomes.deletedApplied,
  );
  return phrase ? `All set — ${phrase}.` : "All set.";
}

function apply_partial_message(outcomes: ApplyOutcomeCounts): string {
  const phrase = outcome_success_phrase(
    outcomes.movedApplied,
    outcomes.deletedApplied,
  );
  const failed = total_failed(outcomes);
  const failed_noun = failed === 1 ? "change" : "changes";
  return phrase
    ? `All set — ${phrase}. ${failed} ${failed_noun} couldn't be applied.`
    : `No changes applied; ${failed} ${failed_noun} failed.`;
}

function apply_all_failed_message(outcomes: ApplyOutcomeCounts): string {
  const failed = total_failed(outcomes);
  const noun = failed === 1 ? "change" : "changes";
  return `Couldn't apply ${failed} ${noun}. Try again or adjust the preview.`;
}

export function build_apply_confirm_message(changes: Change[]): string {
  const move_count = changes.filter((change) => change.type !== "delete").length;
  const delete_count = changes.filter((change) => change.type === "delete").length;
  if (move_count > 0) {
    return (
      COPY.confirm.movesBody(move_count) +
      (delete_count > 0 ? COPY.confirm.deleteNote(delete_count) : "")
    );
  }
  return COPY.confirm.deletesOnlyBody(delete_count);
}

export function format_apply_report_message(report: ApplyChangesResult): string {
  const { outcomes } = report;
  const failed = total_failed(outcomes);
  const applied = total_applied(outcomes);

  let message = "";
  if (failed === 0) {
    message = apply_success_message(outcomes);
  } else if (applied === 0) {
    message = apply_all_failed_message(outcomes);
  } else {
    message = apply_partial_message(outcomes);
  }

  if (outcomes.skipped > 0) {
    const skipped_noun = outcomes.skipped === 1 ? "change" : "changes";
    message += ` ${outcomes.skipped} ${skipped_noun} skipped.`;
  }

  const first_failed = report.results.find((result) => result.status === "failed");
  if (first_failed?.error) {
    message += ` ${first_failed.error}`;
  }

  return message;
}
