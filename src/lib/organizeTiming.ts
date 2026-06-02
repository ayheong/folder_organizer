import type { OrganizeTiming } from "../types";

export function ns_to_ms(ns: number | undefined): number | undefined {
  if (ns == null || !Number.isFinite(ns)) return undefined;
  return ns / 1_000_000;
}

export function format_duration_ms(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return rem > 0 ? `${min}m ${rem}s` : `${min}m`;
}

export function format_organize_timing_summary(timing: OrganizeTiming): string {
  const parts = [`${format_duration_ms(timing.wall_ms)} total`];
  if (timing.ollama) {
    const { output_tokens, tokens_per_sec, load_ms, total_ms } = timing.ollama;
    if (load_ms >= 500) parts.push(`${format_duration_ms(load_ms)} load`);
    if (output_tokens > 0 && tokens_per_sec != null) {
      parts.push(`${output_tokens} out @ ${tokens_per_sec.toFixed(1)} tok/s`);
    } else if (total_ms != null) {
      parts.push(`model ${format_duration_ms(total_ms)}`);
    }
  }
  return parts.join(" · ");
}

export function log_organize_timing(timing: OrganizeTiming): void {
  const label = timing.model
    ? `${timing.host} · ${timing.model}`
    : timing.host;
  console.group(`[Neatnet] Organize timing · ${label} · ${timing.file_count} files`);
  console.log(`Wall clock: ${format_duration_ms(timing.wall_ms)}`);
  console.log(`Prompt size: ${timing.prompt_chars.toLocaleString()} chars`);
  if (timing.ollama) {
    const o = timing.ollama;
    if (o.load_ms >= 100) console.log(`Model load: ${format_duration_ms(o.load_ms)}`);
    if (o.prompt_tokens > 0) {
      const rate =
        o.prompt_tokens_per_sec != null
          ? ` (${o.prompt_tokens_per_sec.toFixed(1)} tok/s)`
          : "";
      console.log(
        `Prompt: ${o.prompt_tokens} tokens in ${format_duration_ms(o.prompt_eval_ms)}${rate}`,
      );
    }
    if (o.output_tokens > 0) {
      const rate =
        o.tokens_per_sec != null ? ` (${o.tokens_per_sec.toFixed(1)} tok/s)` : "";
      console.log(
        `Output: ${o.output_tokens} tokens in ${format_duration_ms(o.eval_ms)}${rate}`,
      );
    }
    console.log(`Ollama total_duration: ${format_duration_ms(o.total_ms)}`);
  }
  console.groupEnd();
}
