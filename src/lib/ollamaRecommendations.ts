export type OllamaPullRecommendation = {
  /** `ollama pull` tag, e.g. `llama3.1:8b` */
  tag: string;
  title: string;
  approx_size_gb: number;
  /** Short GPU/RAM guidance (default Ollama quantisation). */
  recommended_specs: string;
};

/** Consumer-friendly pulls for JSON folder-organize prompts. */
export const OLLAMA_PULL_RECOMMENDATIONS: OllamaPullRecommendation[] = [
  {
    tag: "llama3.1:8b",
    title: "Llama 3.1 8B",
    approx_size_gb: 5,
    recommended_specs: "8 GB GPU (RTX 4060), 16 GB RAM",
  },
  {
    tag: "qwen2.5:14b",
    title: "Qwen 2.5 14B",
    approx_size_gb: 9,
    recommended_specs: "12 GB GPU (RTX 4070), 16 GB RAM",
  },
  {
    tag: "qwen2.5:32b",
    title: "Qwen 2.5 32B",
    approx_size_gb: 20,
    recommended_specs: "24 GB GPU (RTX 4090), 32 GB RAM",
  },
];

export function get_primary_ollama_pull_recommendation(): OllamaPullRecommendation {
  return OLLAMA_PULL_RECOMMENDATIONS[0];
}

/** True if this exact tag (or same base + :latest) is already installed. */
export function is_ollama_tag_installed(installed: string[], tag: string): boolean {
  const [base, variant] = tag.includes(":") ? tag.split(":", 2) : [tag, "latest"];
  return installed.some((name) => {
    if (name === tag) return true;
    if (!name.includes(":")) return name === base;
    const [installed_base, installed_variant] = name.split(":", 2);
    if (installed_base !== base) return false;
    return installed_variant === variant || installed_variant === "latest";
  });
}

export function format_ollama_pull_command(tag: string): string {
  return `ollama pull ${tag}`;
}

export function format_ollama_recommendation_specs(rec: OllamaPullRecommendation): string {
  return `~${rec.approx_size_gb} GB download. Recommended: ${rec.recommended_specs}.`;
}
