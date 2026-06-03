export type TreeNode = {
  name: string;
  isDirectory: boolean;
  isFile: boolean;
  isSymlink: boolean;
  children?: TreeNode[];
  previewSourcePath?: string;
};

export type Change = {
  type: "move" | "delete";
  from: string;
  to?: string;
};

export type OrganizeOllamaTiming = {
  load_ms: number;
  prompt_eval_ms: number;
  prompt_tokens: number;
  prompt_tokens_per_sec?: number;
  eval_ms: number;
  output_tokens: number;
  tokens_per_sec?: number;
  total_ms: number;
};

export type OrganizeTiming = {
  host: "claude" | "ollama";
  model?: string;
  file_count: number;
  prompt_chars: number;
  wall_ms: number;
  ollama?: OrganizeOllamaTiming;
};

export type OrganizeResult = {
  changes: Change[];
};
