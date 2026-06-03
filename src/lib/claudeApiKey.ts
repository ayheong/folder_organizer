const LEGACY_STORAGE_KEY = "folder_organizer_anthropic_api_key";

/** Remove a key saved by older app versions. */
export function clear_legacy_claude_api_key_storage(): void {
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
  }
}

export function has_claude_api_key(user_key: string): boolean {
  if (user_key.trim()) return true;
  return Boolean(import.meta.env.VITE_ANTHROPIC_API_KEY?.trim());
}
