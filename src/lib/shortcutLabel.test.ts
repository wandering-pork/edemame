import { describe, expect, it } from 'vitest';
import { isMacPlatform, shortcutLabel } from './shortcutLabel';

describe('shortcutLabel', () => {
  it('uses ⌘ on Apple platforms', () => {
    expect(shortcutLabel('j', 'MacIntel')).toBe('⌘ J');
    expect(shortcutLabel('j', 'iPad')).toBe('⌘ J');
  });

  it('uses Ctrl elsewhere, including when the platform is unknown', () => {
    expect(shortcutLabel('j', 'Win32')).toBe('Ctrl J');
    expect(shortcutLabel('j', 'Linux x86_64')).toBe('Ctrl J');
    expect(shortcutLabel('j', '')).toBe('Ctrl J');
    expect(isMacPlatform(undefined)).toBe(false);
  });
});
