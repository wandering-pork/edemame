/**
 * Keyboard shortcut labels in the user's platform's terms: "⌘ J" on a Mac,
 * "Ctrl J" elsewhere. Edie's toggle listens for either modifier, so this
 * only affects what's shown.
 */
export function isMacPlatform(platform: string | undefined): boolean {
  return !!platform && /mac|iphone|ipad|ipod/i.test(platform);
}

export function shortcutLabel(key: string, platform: string | undefined = typeof navigator !== 'undefined' ? navigator.platform : undefined): string {
  return `${isMacPlatform(platform) ? '⌘' : 'Ctrl'} ${key.toUpperCase()}`;
}
