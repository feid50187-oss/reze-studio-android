export const STORAGE_VERSION = "1"

export function storageKey(name: string): string {
  return `reze-studio.${name}.${STORAGE_VERSION}`
}
